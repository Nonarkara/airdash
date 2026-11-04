"""A3 — The clock from the field to the phone.

Separate timestamp comparisons (notification delivery is not measured):
  1. PCD publication + our poll:   reading obs hour  ->  first time we saw it
  2. Alert -> next logged broadcast proxy:       alert raised     ->  Telegram broadcast sent
  3. Satellite fire availability:  VIIRS acquisition ->  first time we saw it"""
import json, datetime as dt, re, os
from common import *

BKK = dt.timedelta(hours=7)
def utc(t):
    return dt.datetime.fromisoformat(t.replace('Z', '+00:00'))

def run():
    db = live()
    res = {}
    # ---- 1. PCD hourly reading: obs hour -> first seen
    lags = []
    for obs, fetched in db.execute(
        "select obs_time, fetched_at from readings indexed by idx_readings_metric_cover "
        "where metric='pm25' and source='air4thai' and obs_time >= '2026-08-07T00:00' and obs_time < '2026-11-04T00:00'"):
        if len(obs) < 13 or not fetched: continue
        try:
            o = dt.datetime.strptime(obs[:13], '%Y-%m-%dT%H').replace(tzinfo=dt.timezone.utc) - BKK
            f = utc(fetched)
        except ValueError:
            continue
        m = (f - o).total_seconds() / 60
        if -10 <= m <= 24 * 60:       # drop clock noise and multi-day backfills
            lags.append(m)
    # one row per station-hour; the feed publishes all stations together, so the
    # distribution of per-row lags is the distribution we care about.
    res['pcd_lag_min'] = {'n': len(lags), 'p05': quantile(lags, .05), 'p25': quantile(lags, .25), 'median': quantile(lags, .5),
                          'p75': quantile(lags, .75), 'p90': quantile(lags, .9), 'p95': quantile(lags, .95),
                          'share_le_60': sum(1 for x in lags if x <= 60) / len(lags),
                          'share_le_120': sum(1 for x in lags if x <= 120) / len(lags)}
    res['pcd_lag_ecdf'] = [[q, quantile(lags, q)] for q in [i / 100 for i in range(1, 100)]]
    # ---- 2. alert -> Telegram broadcast
    alerts = [(utc(ts), rule, sev) for ts, rule, sev in db.execute(
        "select ts, rule, severity from alerts where severity >= 2 and rule in ('pm25_level','aqi_level','pm25_forecast','pm25_all_clear') and ts >= '2026-09-28T00:00' and ts < '2026-11-03T17:00'")]
    sends = []
    for line in open(os.path.join(ROOT, 'logs', 'out.log'), errors='ignore'):
        if 'Telegram broadcast sent' in line:
            try:
                j = json.loads(line)
                if j['ts'] >= CUT_UTC: continue
                sends.append((utc(j['ts']), j.get('alerts', 0), j.get('chats', 0), j.get('failed', 0)))
            except Exception:
                pass
    sends.sort()
    delays, undelivered = [], 0
    st = [s[0] for s in sends]
    import bisect
    for t, rule, sev in sorted(alerts):
        i = bisect.bisect_left(st, t)
        if i < len(st) and (st[i] - t).total_seconds() <= 3 * 3600:
            delays.append((st[i] - t).total_seconds() / 60)
        else:
            undelivered += 1
    res['alert_to_telegram'] = {'alerts': len(alerts), 'next_broadcast_within_3h': len(delays), 'no_broadcast_within_3h': undelivered,
                                 'broadcasts': len(sends), 'log_start': sends[0][0].isoformat() if sends else None,
                                 'median_min': quantile(delays, .5), 'p90_min': quantile(delays, .9), 'p95_min': quantile(delays, .95),
                                 'max_min': max(delays) if delays else None, 'share_le_5min': sum(1 for d in delays if d <= 5) / max(1, len(delays)),
                                 'share_le_35min': sum(1 for d in delays if d <= 35) / max(1, len(delays))}
    res['alert_to_telegram_delays'] = [round(d, 2) for d in delays]
    res['telegram_chats_reached'] = sorted({s[2] for s in sends})
    # ---- 3. VIIRS hotspots: acquisition -> first seen (regional feed, every 6 h)
    fl = []
    for d, tm, fetched in db.execute("select acq_date, acq_time, fetched_at from regional_hotspots where acq_date <= '2026-11-03'"):
        try:
            a = dt.datetime.strptime(d + ' ' + str(tm).zfill(4), '%Y-%m-%d %H%M').replace(tzinfo=dt.timezone.utc)
            f = utc(fetched)
        except Exception:
            continue
        m = (f - a).total_seconds() / 60
        if 0 <= m <= 72 * 60:
            fl.append(m)
    res['firms_lag_ecdf'] = [[q, quantile(fl, q)] for q in [i / 100 for i in range(1, 100)]]
    res['firms_lag_min'] = {'n': len(fl), 'p05': quantile(fl, .05), 'median': quantile(fl, .5), 'p90': quantile(fl, .9), 'p95': quantile(fl, .95)}
    res['method_correction_v2'] = {'alert_to_telegram': 'Next logged broadcast timing only; no alert membership or recipient success join. Not hand-off or delivery latency.', 'pm25_chain_total_min': 'Withdrawn: independent random pairing does not reconstruct an alert chain.'}
    return res

if __name__ == '__main__':
    r = run(); save('a3_latency.json', r)
    print(json.dumps({k: v for k, v in r.items() if k not in ('pcd_lag_ecdf', 'alert_to_telegram_delays')}, indent=1, default=str))
