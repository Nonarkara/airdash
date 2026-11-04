"""A9 — Three official answers to one question, and who monitors where.

PCD ground stations vs GISTDA satellite-ground fusion vs CAMS model, per
province-day. Plus the distribution of PCD stations across provinces."""
import collections, datetime as dt, json, math
from common import *
import a1_network as a1

def cat(v):  # Thai AQI (2023) PM2.5 categories on 24-h means
    return 0 if v <= 15 else 1 if v <= 25 else 2 if v <= 37.5 else 3 if v <= 75 else 4

def kappa(pairs):
    n = len(pairs)
    po = sum(1 for a, b in pairs if a == b) / n
    ca, cb = collections.Counter(a for a, _ in pairs), collections.Counter(b for _, b in pairs)
    pe = sum(ca[k] * cb[k] for k in ca) / (n * n)
    return (po - pe) / (1 - pe) if pe < 1 else float('nan')

def run():
    db = live(); res = {}
    meta = json.load(open(os.path.join(INPUTS, 'station_meta.json')))
    sd = json.load(open(os.path.join(INPUTS, 'station_daily.json')))
    pcd = collections.defaultdict(lambda: collections.defaultdict(list))
    for s, d, v in sd:
        pc = meta.get(s, [None])[0]
        if pc: pcd[pc][d].append(v)
    pcd = {pc: {d: sum(v) / len(v) for d, v in dd.items()} for pc, dd in pcd.items()}
    # GISTDA hourly per province -> daily mean (>= 18 h)
    prov_of = {r[0]: r[1] for r in db.execute("select station_key, province_code from stations where source='gistda_pm25'")}
    g = a1.load(db, 'pm25', source='gistda_pm25')
    gd = {}
    for st, hrs in g.items():
        pc = prov_of.get(st)
        if not pc: continue
        by = collections.defaultdict(list)
        for h, v in hrs.items():
            if v is not None and 0 <= v < FAULT_UG: by[h[:10]].append(v)
        for d, vs in by.items():
            if len(vs) >= a1.MIN_HOURS: gd[(pc, d)] = sum(vs) / len(vs)
    pairs = [(pc, d, v, gd[(pc, d)]) for pc, dd in pcd.items() for d, v in dd.items() if (pc, d) in gd]
    res['gistda_provinces'] = len({pc for pc, _ in gd}); res['gistda_province_days'] = len(gd)
    res['pcd_province_days'] = sum(len(v) for v in pcd.values())
    res['paired_province_days'] = len(pairs); res['paired_provinces'] = len({p[0] for p in pairs})
    diff = [b - a for _, _, a, b in pairs]
    sd_ = statistics.pstdev(diff); md = sum(diff) / len(diff)
    res['pcd_vs_gistda'] = {'mean_diff_gistda_minus_pcd': md, 'sd': sd_, 'loa': [md - 1.96 * sd_, md + 1.96 * sd_],
                            'mae': sum(abs(x) for x in diff) / len(diff), 'rho': spearman([p[2] for p in pairs], [p[3] for p in pairs]),
                            'pcd_median': quantile([p[2] for p in pairs], .5), 'gistda_median': quantile([p[3] for p in pairs], .5)}
    byp = collections.defaultdict(list)
    for pc, d, a, b in pairs: byp[pc].append((a, b))
    groups = list(byp.values())
    res['pcd_vs_gistda']['rho_ci_cluster'] = cluster_bootstrap_ci(groups, lambda gs: spearman([x[0] for g_ in gs for x in g_], [x[1] for g_ in gs for x in g_]), reps=400)
    json.dump([[round(a, 2), round(b, 2)] for _, _, a, b in pairs], open(os.path.join(INPUTS, 'a9_pairs.json'), 'w'))
    cp = [(cat(a), cat(b)) for _, _, a, b in pairs]
    res['category_agreement'] = {'same_category': sum(1 for a, b in cp if a == b) / len(cp), 'kappa': kappa(cp),
                                  'cross_tab': {f'{a}->{b}': c for (a, b), c in sorted(collections.Counter(cp).items())},
                                  'gistda_higher': sum(1 for a, b in cp if b > a) / len(cp), 'gistda_lower': sum(1 for a, b in cp if b < a) / len(cp)}
    # same air, different alarms: share of province-days above 25 and above 37.5 by each product
    for T in (25.0, 37.5):
        res[f'above_{T}'] = {'pcd': sum(1 for p in pairs if p[2] > T), 'gistda': sum(1 for p in pairs if p[3] > T),
                             'both': sum(1 for p in pairs if p[2] > T and p[3] > T), 'n': len(pairs)}
    # CAMS (raw, lead 0, from A4's pairs) vs both: compute MAE between products on shared province-days
    a4 = json.load(open(os.path.join(OUT, 'a4_forecast.json')))
    res['cams_pooled_ratio_obs_over_cams'] = a4['pooled_ratio_obs_over_cams']
    # ---- the network: stations per province
    cnt = collections.Counter(v[0] for v in meta.values() if v[0])
    res['stations_per_province'] = {'provinces_with_station': len(cnt), 'median': quantile(list(cnt.values()), .5), 'max': max(cnt.values()),
                                    'max_province': cnt.most_common(1)[0][0], 'with_exactly_1': sum(1 for v in cnt.values() if v == 1),
                                    'bangkok_share': cnt.get('10', 0) / sum(cnt.values()), 'bangkok_count': cnt.get('10', 0), 'total': sum(cnt.values())}
    provs = [r[0] for r in db.execute("select distinct station_key from stations where source='openmeteo_aq'")]
    res['provinces_total'] = len(provs); res['provinces_without_station'] = sorted(set(provs) - set(cnt))
    res['upper_north_stations'] = {pc: cnt.get(pc, 0) for pc in sorted(UPPER_NORTH)}
    # stations in the 3 busiest provinces vs. the rest
    top3 = sum(v for _, v in cnt.most_common(3)); res['top3_province_station_share'] = top3 / sum(cnt.values())
    # stations with PM10 per province
    pm10 = {s for s in a1.load(db, 'pm10') if s in meta}
    res['provinces_with_pm10'] = len({meta[s][0] for s in pm10 if meta[s][0]})
    # adapter code census
    cat_ = json.load(open(os.path.join(OUT, 'catalog.json')))
    res['adapter_lines'] = cat_['adapter_lines']
    return res

if __name__ == '__main__':
    import statistics
    r = run(); save('a9_coordination.json', r)
    print(json.dumps({k: v for k, v in r.items() if k != 'adapter_lines'}, indent=1, default=str)[:4500])
