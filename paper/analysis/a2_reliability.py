"""A2 — Does the collector stay up, and how stale does the data get?

Source: `ingest_runs` in the long-term archive (airdash system), the append-only
record of every scheduled pull since 2026-07-16. Window = A1's 110 days."""
import collections, datetime as dt, json
from common import *

W0 = dt.datetime(2026, 7, 16, 17, 0, tzinfo=dt.timezone.utc)    # 2026-07-17 00:00 Bangkok
W1 = dt.datetime(2026, 11, 3, 17, 0, tzinfo=dt.timezone.utc)    # 2026-11-04 00:00 Bangkok

def parse(t):
    return dt.datetime.fromisoformat(t.replace('Z', '+00:00'))

def errclass(e):
    e = (e or '').lower()
    if 'timeout' in e or 'aborted' in e: return 'timeout'
    if '429' in e or 'rate' in e or 'quota' in e: return 'rate_limit'
    if '5' in e[:30] and ('http 5' in e or ' 50' in e or '502' in e or '503' in e): return 'http_5xx'
    if 'parse' in e or 'json' in e or 'unexpected' in e: return 'parse'
    if 'enoent' in e or 'econn' in e or 'fetch failed' in e or 'curl' in e or 'command failed' in e: return 'network'
    return 'other'

def run():
    a = archive()
    rows = a.execute("select source, started_at, dur_ms, ok, rows_new, error from ingest_runs where system='airdash' order by started_at").fetchall()
    rows = [(s, parse(t), d, ok, rn, e) for s, t, d, ok, rn, e in rows]
    rows = [r for r in rows if W0 <= r[1] < W1]
    res = {'runs_total': len(rows)}
    # ---- per source
    by = collections.defaultdict(list)
    for r in rows: by[r[0]].append(r)
    per = {}
    for s, rs in by.items():
        ok = [r for r in rs if r[3] == 1]
        durs = sorted(r[2] for r in rs if r[2] is not None)
        errs = collections.Counter(errclass(r[5]) for r in rs if r[3] != 1)
        per[s] = {'runs': len(rs), 'ok': len(ok), 'success': len(ok) / len(rs),
                  'success_ci': wilson(len(ok), len(rs)),
                  'dur_median_s': quantile(durs, .5) / 1000 if durs else None, 'dur_p95_s': quantile(durs, .95) / 1000 if durs else None,
                  'rows_new_total': sum(r[4] or 0 for r in rs), 'errors': dict(errs),
                  'runs_with_zero_new_rows': sum(1 for r in ok if not r[4])}
    res['per_source'] = per
    res['sources'] = len(per)
    tot_ok = sum(p['ok'] for p in per.values())
    res['success_overall'] = tot_ok / len(rows)
    res['failed_runs'] = len(rows) - tot_ok
    # ---- staleness of the PM2.5 feed: age of the newest successful air4thai pull
    def stale_episodes(source, max_age_h, step_min=5):
        oks = sorted(r[1] for r in by[source] if r[3] == 1)
        t, i, last = W0, 0, None
        eps, cur = [], None
        age_samples = []
        while t < W1:
            while i < len(oks) and oks[i] <= t:
                last = oks[i]; i += 1
            age = (t - last).total_seconds() / 3600 if last else float('inf')
            age_samples.append(age)
            if age > max_age_h:
                if cur is None: cur = [t, t]
                cur[1] = t
            elif cur is not None:
                eps.append(cur); cur = None
            t += dt.timedelta(minutes=step_min)
        if cur: eps.append(cur)
        fresh = sum(1 for a in age_samples if a <= max_age_h) / len(age_samples)
        # per-day (Bangkok) share of 5-minute samples at which the feed was fresh
        daily = collections.defaultdict(lambda: [0, 0])
        tt = W0
        for a in age_samples:
            k = (tt + dt.timedelta(hours=7)).strftime('%Y-%m-%d'); daily[k][0] += a <= max_age_h; daily[k][1] += 1
            tt += dt.timedelta(minutes=step_min)
        stale_episodes.daily = {k: v[0] / v[1] for k, v in sorted(daily.items())}
        return fresh, [{'start': e[0].isoformat(), 'end': e[1].isoformat(), 'hours': round((e[1] - e[0]).total_seconds() / 3600 + step_min / 60, 2)} for e in eps], age_samples
    fresh, eps, ages = stale_episodes('air4thai', 2.0)
    res['pm25_feed_fresh_share_2h'] = fresh
    res['pm25_feed_fresh_share_by_day'] = stale_episodes.daily
    res['pm25_feed_stale_episodes'] = eps
    res['pm25_feed_stale_hours'] = sum(e['hours'] for e in eps)
    res['pm25_feed_age_p50_min'] = quantile(ages, .5) * 60
    res['pm25_feed_age_p95_min'] = quantile(ages, .95) * 60
    # ---- whole-collector gaps: no run of ANY source for > 30 min
    allt = sorted(r[1] for r in rows)
    gaps = []
    for x, y in zip(allt, allt[1:]):
        g = (y - x).total_seconds() / 60
        if g > 30:
            gaps.append({'start': x.isoformat(), 'end': y.isoformat(), 'minutes': round(g, 1)})
    res['collector_gaps_gt30min'] = gaps
    res['collector_gap_hours'] = sum(g['minutes'] for g in gaps) / 60
    big = [g for g in gaps if g['minutes'] > 360]
    res['collector_gaps_gt6h'] = big
    res['collector_gaps_gt6h_hours'] = sum(g['minutes'] for g in big) / 60
    # silent success: runs reported ok that delivered nothing, per source
    res['sources_zero_rows_all_ok'] = sorted(k for k, p in per.items() if p['ok'] > 100 and p['rows_new_total'] == 0)
    span_h = (W1 - W0).total_seconds() / 3600
    res['window_hours'] = span_h
    res['collector_up_share'] = 1 - res['collector_gap_hours'] / span_h
    # daily count of successful pm25 pulls (for the reliability figure)
    byday = collections.Counter(r[1].astimezone(dt.timezone(dt.timedelta(hours=7))).strftime('%Y-%m-%d') for r in by['air4thai'] if r[3] == 1)
    res['air4thai_ok_pulls_by_day'] = dict(sorted(byday.items()))
    return res

if __name__ == '__main__':
    r = run()
    save('a2_reliability.json', r)
    print('sources', r['sources'], 'runs', r['runs_total'], 'success', round(r['success_overall'], 4), 'failed', r['failed_runs'])
    print('pm25 feed fresh(<=2h):', round(r['pm25_feed_fresh_share_2h'], 4), 'stale hours', r['pm25_feed_stale_hours'], 'p50/p95 age min', round(r['pm25_feed_age_p50_min']), round(r['pm25_feed_age_p95_min']))
    print('collector up share', round(r['collector_up_share'], 4), 'gap hours', round(r['collector_gap_hours'], 1))
    for g in r['collector_gaps_gt30min']: print('  gap', g)
    for e in r['pm25_feed_stale_episodes']: print('  stale', e)
    for s, p in sorted(r['per_source'].items(), key=lambda kv: kv[1]['success']):
        print(f"  {s:20} runs={p['runs']:5} succ={p['success']:.3f} med={p['dur_median_s']} p95={p['dur_p95_s']} errs={p['errors']}")
