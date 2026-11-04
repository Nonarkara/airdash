"""A6 — Airport visibility (METAR) against the nearest ground PM2.5.

Koschmieder: extinction beta = 3.912 / V. METAR caps V at 10 km (9999 m), so
every clear hour is a ceiling value that carries no information on beta."""
import collections, json, math
from common import *

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

def run():
    db = live(); res = {}
    ap = {r[0]: (r[1], r[2], r[3]) for r in db.execute("select station_key, lat, lng, name_en from stations where source='metar'")}
    pcd = {r[0]: (r[1], r[2]) for r in db.execute("select station_key, lat, lng from stations where source='air4thai' and lat is not null")}
    near = {}
    for a, (la, lo, _) in ap.items():
        c = sorted(((km((la, lo), pcd[s]), s) for s in pcd), key=lambda x: x[0])
        if c and c[0][0] <= 25: near[a] = c[0]
    res['airports_in_station_table'] = len(ap)
    vis = collections.defaultdict(dict)
    for st, t, v in db.execute("select station_key, obs_time, value from readings indexed by idx_readings_metric_cover where source='metar' and metric='vis_km' and obs_time < '2026-11-04T00:00'"):
        vis[st][t[:13]] = v
    res['airports'] = sum(1 for v in vis.values() if v)           # airports that reported in the window
    res['airports_with_pcd_station_within_25km'] = sum(1 for a in vis if vis[a] and a in near)
    res['metar_hours'] = sum(len(v) for v in vis.values())
    allv = [v for d in vis.values() for v in d.values()]
    res['metar_first'] = min(t for d in vis.values() for t in d); res['metar_last'] = max(t for d in vis.values() for t in d)
    res['share_at_ceiling_ge9_9'] = sum(1 for v in allv if v >= 9.9) / len(allv)
    res['share_below_5km'] = sum(1 for v in allv if v < 5) / len(allv)
    res['aerosol_attributed_hours'] = db.execute("select count(*) from readings indexed by idx_readings_metric_cover where source='metar' and metric='aerosol_vis_km'").fetchone()[0]
    # PM2.5 hourly at the nearest PCD station
    pm = {}
    for s in {n[1] for n in near.values()}:
        pm[s] = {t[:13]: v for t, v in db.execute("select obs_time, value from readings indexed by idx_readings_metric_cover where source='air4thai' and metric='pm25' and station_key=? and obs_time >= '2026-10-01'", (s,))} if False else {}
    for st, t, v in db.execute("select station_key, obs_time, value from readings indexed by idx_readings_metric_cover where source='air4thai' and metric='pm25' and obs_time >= ? and obs_time < '2026-11-04T00:00'", (res['metar_first'],)):
        if st in {n[1] for n in near.values()} and 0 <= v < FAULT_UG: pm.setdefault(st, {})[t[:13]] = v
    pairs = []
    for a, (d, s) in near.items():
        for h, v in vis.get(a, {}).items():
            p = pm.get(s, {}).get(h)
            if p is not None: pairs.append((a, v, p))
    res['pairs'] = len(pairs); res['pair_airports'] = len({p[0] for p in pairs})
    res['pair_pm25_median'] = quantile([p[2] for p in pairs], .5); res['pair_pm25_max'] = max(p[2] for p in pairs)
    nc = [p for p in pairs if p[1] < 9.9]
    res['pairs_below_ceiling'] = len(nc)
    byc = collections.defaultdict(list)
    for a, v, p in nc: byc[a].append((v, p))
    groups = list(byc.values())
    rho = lambda gs: spearman([x[0] for g in gs for x in g], [x[1] for g in gs for x in g])
    res['spearman_vis_vs_pm25_below_ceiling'] = {'rho': rho(groups), 'ci_cluster_bootstrap_by_airport': cluster_bootstrap_ci(groups, rho, reps=400), 'airports': len(groups)}
    # P(vis < 10 km) by PM2.5 band, all hours
    res['p_reduced_by_band'] = []
    for lo, hi in [(0, 10), (10, 15), (15, 25), (25, 37.5), (37.5, 500)]:
        sel = [p for p in pairs if lo <= p[2] < hi]
        k = sum(1 for p in sel if p[1] < 9.9)
        res['p_reduced_by_band'].append({'lo': lo, 'hi': hi, 'n': len(sel), 'reduced': k, 'share': k / len(sel) if sel else None, 'ci': wilson(k, len(sel)) if sel else None})
    # cluster-robust shares (airport = the independent unit) and dominance of the largest airport
    byair = collections.defaultdict(list)
    for a_, v_, p_ in pairs: byair[a_].append((v_, p_))
    res['p_reduced_by_band_cluster'] = []
    for lo, hi in [(0, 10), (10, 15), (15, 25), (25, 37.5), (37.5, 500)]:
        gs = [[1 if v < 9.9 else 0 for v, p in g if lo <= p < hi] for g in byair.values()]
        gs = [g for g in gs if g]
        share = lambda g_: sum(sum(x) for x in g_) / max(1, sum(len(x) for x in g_))
        top = max(gs, key=len) if gs else []
        tot = sum(len(g) for g in gs)
        res['p_reduced_by_band_cluster'].append({'lo': lo, 'hi': hi, 'airports': len(gs), 'hours': tot, 'share': share(gs),
            'ci': cluster_bootstrap_ci(gs, share, reps=1000) if len(gs) > 3 else None, 'largest_airport_hour_share': len(top) / tot if tot else None})
        # leave the largest airport out
        rest = [g for g in gs if g is not top]
        res['p_reduced_by_band_cluster'][-1]['share_without_largest'] = share(rest) if rest else None
    # fog/precip vs aerosol causes among reduced-visibility hours
    res['causes'] = dict(collections.Counter(json.loads(m or '{}').get('cause') for (m,) in db.execute("select meta_json from stations where source='metar'")))
    return res

if __name__ == '__main__':
    r = run(); save('a6_visibility.json', r); print(json.dumps(r, indent=1, default=str))
