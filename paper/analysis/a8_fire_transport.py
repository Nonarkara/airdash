"""A8 — Whose fire is upwind? A retrospective replay of the smoke-transport indicator.

Fires: regional_hotspots, VIIRS from three satellites, 2026-10-21..2026-11-03.
Wind:  Open-Meteo dominant 10 m wind-from direction, first issue of each local day.
The indicator is server/smoke.js re-implemented line for line (500 km, +-45 deg,
1/(1+d/150) weights, 0.25-degree cells, two-day look-back)."""
import collections, datetime as dt, json, math
from common import *

RADIUS_KM, SECTOR, DECAY, GRID = 500.0, 45.0, 150.0, 0.25
rad = math.radians
def dist(a, b, c, d):
    dl, dn = rad(c - a), rad(d - b)
    h = math.sin(dl / 2) ** 2 + math.cos(rad(a)) * math.cos(rad(c)) * math.sin(dn / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))
def bearing(a, b, c, d):
    y = math.sin(rad(d - b)) * math.cos(rad(c))
    x = math.cos(rad(a)) * math.sin(rad(c)) - math.sin(rad(a)) * math.cos(rad(c)) * math.cos(rad(d - b))
    return (math.degrees(math.atan2(y, x)) + 360) % 360
def adiff(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d

def grid(fires):
    cells = {}
    for lat, lng, frp, thai in fires:
        k = (math.floor(lat / GRID), math.floor(lng / GRID))
        c = cells.setdefault(k, [0, 0, 0, 0, 0])
        c[0] += lat; c[1] += lng; c[2] += frp if frp and frp > 0 else 1; c[3] += 1; c[4] += thai
    return [(c[0] / c[3], c[1] / c[3], c[2], c[4] / c[3]) for c in cells.values()]

def upwind(prov, cells, wind_from):
    w = fr = thai = 0.0; n = 0
    for lat, lng, frp, ts in cells:
        d = dist(prov[0], prov[1], lat, lng)
        if d > RADIUS_KM: continue
        if d > 15 and adiff(bearing(prov[0], prov[1], lat, lng), wind_from) > SECTOR: continue
        wt = 1 / (1 + d / DECAY)
        w += frp * wt; fr += frp; thai += frp * ts; n += 1
    return w, (thai / fr if fr > 0 else None), n

def run():
    db = live(); res = {}
    allrows = db.execute("select acq_date, lat, lng, frp, in_thailand, satellite from regional_hotspots where acq_date <= '2026-11-03'").fetchall()
    # The detection feed covers lat -11..29, lng 92..142 (widened to Indonesia on 19 Oct). The smoke
    # indicator in production looks only at lat 4..29, lng 92..110 -- mainland Southeast Asia and its
    # neighbours -- and so does this replay. Everything below uses that box.
    rows = [r for r in allrows if 4 <= r[1] <= 29 and 92 <= r[2] <= 110]
    res['region_detections_all'] = len(allrows)
    res['box_detections'] = len(rows)
    res['box_share_of_region'] = len(rows) / len(allrows)
    days = sorted({r[0] for r in rows}); res['days'] = days
    res['detections'] = len(rows); res['inside_thailand'] = sum(r[4] for r in rows)
    res['inside_share'] = res['inside_thailand'] / len(rows)
    res['inside_share_ci_iid_wilson'] = wilson(res['inside_thailand'], len(rows))   # treats detections as independent: optimistic
    res['by_satellite'] = dict(collections.Counter(r[5] for r in rows))
    byd = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for d, la, lo, frp, th, sat in rows:
        b = byd[d]; b[0 if th else 1] += 1; b[2 if th else 3] += (frp or 0)
    res['by_day'] = {d: {'inside': v[0], 'outside': v[1], 'frp_inside_mw': v[2], 'frp_outside_mw': v[3]} for d, v in sorted(byd.items())}
    # unique 0.25-degree cells per day (less sensitive to three satellites seeing one fire)
    cd = collections.defaultdict(set)
    for d, la, lo, frp, th, sat in rows: cd[d].add((math.floor(la / GRID), math.floor(lo / GRID), th))
    res['cells_by_day'] = {d: {'inside': sum(1 for c in s if c[2]), 'outside': sum(1 for c in s if not c[2])} for d, s in sorted(cd.items())}
    tot_in = sum(v['inside'] for v in res['cells_by_day'].values()); tot_out = sum(v['outside'] for v in res['cells_by_day'].values())
    res['cell_days_inside_share'] = tot_in / (tot_in + tot_out)
    res['cell_days_total'] = tot_in + tot_out
    dd = [(v['inside'], v['outside']) for v in res['cells_by_day'].values()]
    share_in = lambda gs: sum(g[0] for g in gs) / sum(g[0] + g[1] for g in gs)
    res['cell_days_inside_ci_day_bootstrap'] = cluster_bootstrap_ci(dd, share_in, reps=2000)
    fin = sum(v['frp_inside_mw'] for v in res['by_day'].values()); fout = sum(v['frp_outside_mw'] for v in res['by_day'].values())
    res['frp_outside_share'] = fout / (fin + fout)
    fd = [(v['frp_inside_mw'], v['frp_outside_mw']) for v in res['by_day'].values()]
    res['frp_outside_ci_day_bootstrap'] = cluster_bootstrap_ci(fd, lambda gs: sum(g[1] for g in gs) / sum(g[0] + g[1] for g in gs), reps=2000)
    # ---- province-day indicator
    prov = {r[0]: (r[1], r[2], r[3]) for r in db.execute("select station_key, lat, lng, province_en from stations where source='openmeteo'")}
    wind = {}
    firsts = {}
    for p, t, v in db.execute("select station_key, obs_time, value from readings indexed by idx_readings_metric_cover where source='openmeteo' and metric='wind_dir_d0' and obs_time >= '2026-10-20' and obs_time < '2026-11-04T00:00'"):
        d, h = t[:10], int(t[11:13])
        if h <= 11 and ((p, d) not in firsts or t < firsts[(p, d)]): firsts[(p, d)] = t; wind[(p, d)] = v
    byday_fires = collections.defaultdict(list)
    for d, la, lo, frp, th, sat in rows: byday_fires[d].append((la, lo, frp, th))
    D = lambda s: dt.date.fromisoformat(s)
    out = []
    for d in days[1:]:
        fires = byday_fires[d] + byday_fires[(D(d) - dt.timedelta(days=1)).isoformat()]
        cells = grid(fires)
        for p, (la, lo, name) in prov.items():
            wf = wind.get((p, d))
            if wf is None: continue
            w, ts, n = upwind((la, lo), cells, wf)
            out.append({'p': p, 'name': name, 'day': d, 'w': w, 'thai_share': ts, 'cells': n})
    res['province_days'] = len(out)
    act = [x for x in out if x['w'] >= 20]      # 'low' level or above
    res['active_province_days'] = len(act)
    res['active_share'] = len(act) / len(out)
    res['active_mostly_foreign'] = sum(1 for x in act if x['thai_share'] is not None and x['thai_share'] < 0.5)
    res['active_all_foreign'] = sum(1 for x in act if x['thai_share'] is not None and x['thai_share'] < 0.05)
    res['active_mostly_foreign_share'] = res['active_mostly_foreign'] / len(act) if act else None
    res['active_mostly_foreign_ci'] = wilson(res['active_mostly_foreign'], len(act)) if act else None
    tw = sum(x['w'] for x in act); res['weighted_foreign_share'] = sum(x['w'] * (1 - (x['thai_share'] or 0)) for x in act) / tw if tw else None
    lv = lambda w: 'high' if w >= 600 else 'moderate' if w >= 150 else 'low' if w >= 20 else 'none'
    res['level_counts'] = dict(collections.Counter(lv(x['w']) for x in out))
    # province ranking by mean upwind weight
    byp = collections.defaultdict(list)
    for x in out: byp[x['name']].append(x)
    rank = sorted(((sum(y['w'] for y in v) / len(v), k, sum(1 for y in v if y['w'] >= 20)) for k, v in byp.items()), reverse=True)
    res['top_provinces_by_upwind'] = [{'province': k, 'mean_mw': m, 'active_days': a, 'mean_foreign_share': (sum(1 - (y['thai_share'] or 0) for y in byp[k] if y['w'] >= 20) / a) if a else None} for m, k, a in rank[:10]]
    # ---- does upwind fire power predict next-day PM2.5? (within-province, exploratory)
    meta = json.load(open(os.path.join(INPUTS, 'station_meta.json')))
    sd = json.load(open(os.path.join(INPUTS, 'station_daily.json')))
    pm = collections.defaultdict(lambda: collections.defaultdict(list))
    for s, d, v in sd:
        pc = meta.get(s, [None])[0]
        if pc: pm[pc][d].append(v)
    pm = {pc: {d: sum(v) / len(v) for d, v in dd.items()} for pc, dd in pm.items()}
    # Pairs per province: (day, log upwind fire power today, PM2.5 tomorrow). Two-way centring: remove each
    # province's own mean (geography) and then each day's mean across provinces (the fortnight-long decline in
    # fire counts and every other shared day effect), so the correlation is about provinces differing on a day.
    def pairs_for(pc):
        out_ = []
        for x in (x for x in out if x['p'] == pc):
            nxt = (D(x['day']) + dt.timedelta(days=1)).isoformat()
            if pc in pm and nxt in pm[pc]: out_.append((x['day'], math.log1p(x['w']), pm[pc][nxt]))
        return out_
    per = {pc: pairs_for(pc) for pc in prov}
    per = {pc: v for pc, v in per.items() if len(v) >= 8}
    prov_centred = {}
    for pc, v in per.items():
        mx = sum(a for _, a, _ in v) / len(v); my = sum(b for _, _, b in v) / len(v)
        prov_centred[pc] = [(d, a - mx, b - my) for d, a, b in v]
    dsum = collections.defaultdict(lambda: [0.0, 0.0, 0])
    for v in prov_centred.values():
        for d, a, b in v: t = dsum[d]; t[0] += a; t[1] += b; t[2] += 1
    dmean = {d: (t[0] / t[2], t[1] / t[2]) for d, t in dsum.items()}
    f = lambda gs: spearman([a for g in gs for a, _ in g], [b for g in gs for _, b in g])
    # Provinces on one day share the wind, the fires and the weather, so the independent unit is the DAY:
    # the interval resamples days (13 of them), not provinces.
    def by_day(sel):
        dd = collections.defaultdict(list)
        for pc, v in prov_centred.items():
            if sel(pc):
                for d, a, b in v: dd[d].append((a - dmean[d][0], b - dmean[d][1]))
        return list(dd.values())
    prov_only = [[(a, b) for _, a, b in v] for v in prov_centred.values()]
    for tag, sel in (('log', lambda c: True), ('upper_north', lambda c: c in UPPER_NORTH), ('rest', lambda c: c not in UPPER_NORTH)):
        gd = by_day(sel)
        r_ = f(gd) if gd else None
        ci = cluster_bootstrap_ci(gd, f, reps=2000) if len(gd) > 3 else None
        n_prov = sum(1 for pc in prov_centred if sel(pc))
        if tag == 'log':
            res['next_day_pm25_vs_upwind_log'] = {'rho_within_province': r_, 'ci_cluster_bootstrap': ci, 'rho_province_centred_only': f(prov_only),
                                                   'provinces': n_prov, 'pairs': sum(len(g) for g in gd), 'days': len(gd)}
        else:
            po = [[(a, b) for _, a, b in v] for pc, v in prov_centred.items() if sel(pc)]
            res['next_day_pm25_vs_upwind_' + tag] = {'rho': r_, 'provinces': n_prov, 'days': len(gd), 'ci': ci, 'rho_province_centred_only': f(po)}
    return res

if __name__ == '__main__':
    r = run(); save('a8_fire_transport.json', r)
    print(json.dumps({k: v for k, v in r.items() if k not in ('by_day', 'cells_by_day')}, indent=1, default=str)[:5000])
    for d, v in r['by_day'].items(): print(d, v['inside'], v['outside'], round(r['cells_by_day'][d]['inside']), r['cells_by_day'][d]['outside'])
