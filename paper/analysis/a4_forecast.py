"""A4 — Is the forecast any good, and does the correction help?

CAMS province forecasts (via Open-Meteo) vs. the PCD ground record.
Truth  = mean over a province's stations of their station-day means (>= 18 h).
Lead k = target day D, forecast issued on local day D-k (first issue before noon).
Correction replays the production rule (server/forecastBias.js) OUT OF SAMPLE:
the ratio for a forecast issued on day I uses only observations through I-1.
Baseline = persistence (yesterday's observed province mean)."""
import collections, json, datetime as dt, re
from common import *

CLAMP = (0.5, 3.0); WINDOW = 14; MIN_PAIRS = 5
D0 = dt.date(2026, 8, 7); D1 = dt.date(2026, 11, 3)

def day(s): return dt.date.fromisoformat(s)
def correct(v, ratio, cams_mean):
    return v * ratio if (not cams_mean > 0 or v <= cams_mean) else v + (ratio - 1) * cams_mean

def load_obs():
    meta = json.load(open(os.path.join(INPUTS, 'station_meta.json')))
    sd = json.load(open(os.path.join(INPUTS, 'station_daily.json')))
    byp = collections.defaultdict(lambda: collections.defaultdict(list))
    for s, d, v in sd:
        p = meta.get(s, [None])[0]
        if p: byp[p][d].append(v)
    mean = {(p, day(d)): sum(v) / len(v) for p, dd in byp.items() for d, v in dd.items()}
    mx = {(p, day(d)): max(v) for p, dd in byp.items() for d, v in dd.items()}
    return mean, mx

def load_fc():
    db = live(); fc = {}
    rows = db.execute("select station_key, obs_time, metric, value from readings indexed by idx_readings_metric_cover "
                      "where source='openmeteo_aq' and metric in ('pm25_fc_24h','pm25_fc_48h','pm25_fc_72h') and obs_time >= '2026-08-05' and obs_time < '2026-11-04T00:00'").fetchall()
    first = {}
    for p, t, m, v in rows:
        d, h = day(t[:10]), int(t[11:13])
        if h > 11: continue
        k = (p, d)
        if k not in first or t < first[k]: first[k] = t
    for p, t, m, v in rows:
        k = (p, day(t[:10]))
        if first.get(k) == t:
            fc.setdefault(k, {})[{'pm25_fc_24h': 0, 'pm25_fc_48h': 1, 'pm25_fc_72h': 2}[m]] = v
    return fc

def run():
    obs, obs_max = load_obs(); fc = load_fc()
    days = [D0 + dt.timedelta(days=i) for i in range((D1 - D0).days + 1)]
    provs = sorted({p for p, _ in obs})
    # ratio table: for issue day I, province ratio from lead-0 pairs in [I-14, I-1]
    def ratio_for(p, I):
        pr, nat_o, nat_c = [], 0.0, 0.0; nn = 0
        for T in (I - dt.timedelta(days=i) for i in range(1, WINDOW + 1)):
            for q in provs:
                f = fc.get((q, T), {}).get(0); o = obs.get((q, T))
                if f is not None and o is not None and f > 0:
                    nat_o += o; nat_c += f; nn += 1
                    if q == p: pr.append((o, f))
        if len(pr) >= MIN_PAIRS:
            so, sc = sum(o for o, _ in pr), sum(f for _, f in pr)
            return min(CLAMP[1], max(CLAMP[0], so / sc)), sc / len(pr), 'province'
        if nn >= MIN_PAIRS:
            return min(CLAMP[1], max(CLAMP[0], nat_o / nat_c)), nat_c / nn, 'national'
        return 1.0, 0.0, 'none'
    rc = {}
    pairs = {k: [] for k in (0, 1, 2)}
    for p in provs:
        for D in days:
            o = obs.get((p, D))
            if o is None: continue
            for k in (0, 1, 2):
                I = D - dt.timedelta(days=k)
                f = fc.get((p, I), {}).get(k)
                if f is None: continue
                key = (p, I)
                if key not in rc: rc[key] = ratio_for(p, I)
                r, cm, scope = rc[key]
                pers = obs.get((p, I - dt.timedelta(days=1)))
                if pers is None: continue
                pairs[k].append({'p': p, 'D': D, 'obs': o, 'obs_max': obs_max[(p, D)], 'raw': f, 'cor': correct(f, r, cm), 'pers': pers, 'scope': scope})
    json.dump([[round(r['obs'], 2), round(r['raw'], 2), round(r['cor'], 2), round(r['pers'], 2)] for r in pairs[0]], open(os.path.join(INPUTS, 'a4_pairs_lead0.json'), 'w'))
    res = {'window': [D0.isoformat(), D1.isoformat()], 'provinces': len(provs)}
    def metrics(rows, field):
        e = [r[field] - r['obs'] for r in rows]; n = len(e)
        return {'n': n, 'bias': sum(e) / n, 'mae': sum(abs(x) for x in e) / n, 'rmse': (sum(x * x for x in e) / n) ** .5,
                'rho': spearman([r[field] for r in rows], [r['obs'] for r in rows])}
    res['leads'] = {}
    for k, rows in pairs.items():
        out = {'n_pairs': len(rows), 'obs_mean': sum(r['obs'] for r in rows) / len(rows)}
        for f in ('raw', 'cor', 'pers'): out[f] = metrics(rows, f)
        # paired MAE difference (corrected - raw), clustered by province
        byp = collections.defaultdict(list)
        for r in rows: byp[r['p']].append(abs(r['cor'] - r['obs']) - abs(r['raw'] - r['obs']))
        groups = list(byp.values())
        stat = lambda gs: sum(sum(g) for g in gs) / sum(len(g) for g in gs)
        out['mae_diff_cor_minus_raw'] = {'mean': stat(groups), 'ci': cluster_bootstrap_ci(groups, stat, reps=1000)}
        byp2 = collections.defaultdict(list)
        for r in rows: byp2[r['p']].append(abs(r['cor'] - r['obs']) - abs(r['pers'] - r['obs']))
        g2 = list(byp2.values())
        out['mae_diff_cor_minus_persistence'] = {'mean': stat(g2), 'ci': cluster_bootstrap_ci(g2, stat, reps=1000)}
        res['leads'][k] = out
        # event contingency
        ev = {}
        for T in (25.0, 37.5):
            tab = {}
            for f in ('raw', 'cor', 'pers'):
                a = sum(1 for r in rows if r['obs'] > T and r[f] > T)       # hits
                b = sum(1 for r in rows if r['obs'] <= T and r[f] > T)      # false alarms
                c = sum(1 for r in rows if r['obs'] > T and r[f] <= T)      # misses
                d = sum(1 for r in rows if r['obs'] <= T and r[f] <= T)
                tab[f] = {'hits': a, 'false_alarms': b, 'misses': c, 'correct_negatives': d,
                          'pod': a / (a + c) if a + c else None, 'pod_ci': wilson(a, a + c) if a + c else None,
                          'far': b / (a + b) if a + b else None, 'far_ci': wilson(b, a + b) if a + b else None,
                          'csi': a / (a + b + c) if a + b + c else None}
            tab['events_observed'] = sum(1 for r in rows if r['obs'] > T)
            ev[str(T)] = tab
        out['events'] = ev
    # scope usage + ratio distribution
    res['ratio_scope_counts'] = dict(collections.Counter(v[2] for v in rc.values()))
    rr = [v[0] for v in rc.values() if v[2] == 'province']
    res['province_ratio'] = {'n': len(rr), 'median': quantile(rr, .5), 'q10': quantile(rr, .1), 'q90': quantile(rr, .9),
                              'share_at_cap_3': sum(1 for x in rr if x >= 2.999) / len(rr), 'share_at_floor_0_5': sum(1 for x in rr if x <= 0.501) / len(rr)}
    nat = [v[0] for v in rc.values() if v[2] == 'national']
    res['national_ratio_median'] = quantile(nat, .5) if nat else None
    # province-level raw bias ratio over the whole window (obs / raw CAMS lead 0)
    byp = collections.defaultdict(lambda: [0.0, 0.0, 0])
    for r in pairs[0]:
        byp[r['p']][0] += r['obs']; byp[r['p']][1] += r['raw']; byp[r['p']][2] += 1
    res['province_bias_ratio_whole_window'] = {p: {'ratio': v[0] / v[1], 'n': v[2]} for p, v in byp.items() if v[1] > 0 and v[2] >= 20}
    allo = sum(v[0] for v in byp.values()); allc = sum(v[1] for v in byp.values())
    res['pooled_ratio_obs_over_cams'] = allo / allc
    # ---- the warnings the system actually sent
    db = live()
    pe = {r[1]: r[0] for r in db.execute("select station_key, province_en from stations where source='openmeteo_aq'")}
    en2code = pe   # already {province_en: province_code}
    warns = []
    for ts, prov, val, msg in db.execute("select ts, province_en, value, message_en from alerts where rule='pm25_forecast' and ts < '2026-11-03T17:00' order by ts"):
        t = dt.datetime.fromisoformat(ts.replace('Z', '+00:00')) + dt.timedelta(hours=7)
        lead = 2 if 'day after' in (msg or '') else 1
        D = t.date() + dt.timedelta(days=lead)
        code = en2code.get(prov)
        o, om = obs.get((code, D)), obs_max.get((code, D))
        warns.append({'ts': ts, 'province': prov, 'code': code, 'forecast': val, 'target_day': D.isoformat(), 'lead_days': lead,
                      'obs_province_mean': o, 'obs_station_max': om,
                      'hit_mean_gt37_5': None if o is None else o > 37.5, 'hit_max_gt37_5': None if om is None else om > 37.5,
                      'hit_mean_gt25': None if o is None else o > 25, 'hit_max_gt25': None if om is None else om > 25})
    res['warnings'] = warns
    ev = [w for w in warns if w['obs_station_max'] is not None]
    res['warnings_summary'] = {'sent': len(warns), 'evaluable': len(ev),
        'hit_station_max_gt37_5': sum(1 for w in ev if w['hit_max_gt37_5']), 'hit_province_mean_gt37_5': sum(1 for w in ev if w['hit_mean_gt37_5']),
        'hit_station_max_gt25': sum(1 for w in ev if w['hit_max_gt25']), 'hit_province_mean_gt25': sum(1 for w in ev if w['hit_mean_gt25']),
        'provinces': len({w['province'] for w in warns}), 'first': warns[0]['ts'] if warns else None, 'last': warns[-1]['ts'] if warns else None}
    # unique province-target-days: repeated alerts for one target day are not independent trials
    uniq = {}
    for w in warns:
        k = (w['code'], w['target_day'])
        if k not in uniq or w['forecast'] > uniq[k]['forecast']: uniq[k] = w
    ue = [w for w in uniq.values() if w['obs_station_max'] is not None]
    res['warnings_unique'] = {'province_days': len(uniq), 'evaluable': len(ue), 'distinct_target_days': len({w['target_day'] for w in ue}),
        'any_station_gt37_5': sum(1 for w in ue if w['hit_max_gt37_5']), 'province_mean_gt37_5': sum(1 for w in ue if w['hit_mean_gt37_5']),
        'any_station_gt25': sum(1 for w in ue if w['hit_max_gt25']), 'province_mean_gt25': sum(1 for w in ue if w['hit_mean_gt25']),
        'wilson_any_station_gt37_5': wilson(sum(1 for w in ue if w['hit_max_gt37_5']), len(ue)),
        'median_forecast': quantile([w['forecast'] for w in ue], .5), 'median_observed_station_max': quantile([w['obs_station_max'] for w in ue], .5),
        'median_observed_province_mean': quantile([w['obs_province_mean'] for w in ue], .5)}
    return res

if __name__ == '__main__':
    r = run(); save('a4_forecast.json', r)
    print('pooled ratio obs/cams', round(r['pooled_ratio_obs_over_cams'], 3), 'scope', r['ratio_scope_counts'], 'province ratio', {k: (round(v, 3) if isinstance(v, float) else v) for k, v in r['province_ratio'].items()})
    for k, o in r['leads'].items():
        print('lead', k, 'n', o['n_pairs'], 'obs mean', round(o['obs_mean'], 2))
        for f in ('raw', 'cor', 'pers'):
            m = o[f]; print(f"   {f:5} bias={m['bias']:+.2f} mae={m['mae']:.2f} rmse={m['rmse']:.2f} rho={m['rho']:.2f}")
        print('   dMAE cor-raw', o['mae_diff_cor_minus_raw'], ' cor-pers', o['mae_diff_cor_minus_persistence'])
        for T, tab in o['events'].items():
            print('   T', T, 'events', tab['events_observed'], {f: (tab[f]['hits'], tab[f]['false_alarms'], tab[f]['misses']) for f in ('raw', 'cor', 'pers')})
    print(json.dumps(r['warnings_summary'], indent=1))
    for w in r['warnings']: print(w['ts'][:10], w['province'], w['forecast'], w['target_day'], 'obs_mean', None if w['obs_province_mean'] is None else round(w['obs_province_mean'], 1), 'max', None if w['obs_station_max'] is None else round(w['obs_station_max'], 1))
