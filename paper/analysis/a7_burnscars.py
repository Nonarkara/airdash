"""A7 — Where the fields burn, over three seasons (2024-2026).

Source: Tam Roy Pao (HII + Kasetsart University), monthly burn-scar area in rai
(1 rai = 1,600 m2) by province and crop, stored in `burn_area`."""
import collections, json
from common import *

RAI_KM2 = 0.0016

def gini(xs):
    xs = sorted(x for x in xs if x >= 0); n = len(xs); s = sum(xs)
    if n == 0 or s == 0: return float('nan')
    return (2 * sum((i + 1) * x for i, x in enumerate(xs)) / (n * s)) - (n + 1) / n

def run():
    db = live(); res = {}
    # the burn-scar table prefixes codes with 'TH' (TH50); every other table uses '50'
    rows = [(r[0].replace('TH', '', 1), *r[1:]) for r in db.execute(
        "select province_code, yyyymm, province_en, paddy_rai, cane_rai, corn_rai, mixed_rai, total_rai from burn_area")]
    months = sorted({r[1] for r in rows}); res['months'] = months
    res['provinces'] = len({r[0] for r in rows}); res['rows'] = len(rows)
    tot = lambda rs: sum(r[7] or 0 for r in rs)
    res['total_km2'] = tot(rows) * RAI_KM2
    # like-for-like Jan-Apr in each year
    ja = {y: [r for r in rows if r[1].startswith(str(y)) and 1 <= int(r[1][4:]) <= 4] for y in (2024, 2025, 2026)}
    res['jan_apr_km2'] = {str(y): tot(v) * RAI_KM2 for y, v in ja.items()}
    res['jan_apr_months'] = {str(y): sorted({r[1] for r in v}) for y, v in ja.items()}
    res['by_month_km2'] = {m: tot([r for r in rows if r[1] == m]) * RAI_KM2 for m in months}
    # crop mix over Jan-Apr
    crops = ('paddy', 'cane', 'corn', 'mixed')
    res['crop_mix_jan_apr'] = {}
    for y, v in ja.items():
        t = tot(v)
        res['crop_mix_jan_apr'][str(y)] = {c: sum((r[3 + i] or 0) for r in v) / t for i, c in enumerate(crops)} if t else None
    # concentration by province (Jan-Apr totals)
    prov = {}
    for y, v in ja.items():
        d = collections.defaultdict(float)
        for r in v: d[(r[0], r[2])] += r[7] or 0
        prov[y] = d
    res['concentration'] = {}
    for y, d in prov.items():
        vals = sorted(d.values(), reverse=True); t = sum(vals)
        res['concentration'][str(y)] = {'provinces_with_burning': len(vals), 'top5_share': sum(vals[:5]) / t, 'top10_share': sum(vals[:10]) / t,
                                        'gini': gini(vals), 'top5': [[k[1], d[k] * RAI_KM2] for k in sorted(d, key=d.get, reverse=True)[:5]]}
    # rank stability across seasons (same provinces)
    def rho(a, b):
        ks = sorted(set(prov[a]) & set(prov[b]))
        return spearman([prov[a][k] for k in ks], [prov[b][k] for k in ks]), len(ks)
    res['rank_stability'] = {f'{a}_vs_{b}': dict(zip(('rho', 'n'), rho(a, b))) for a, b in ((2024, 2025), (2025, 2026), (2024, 2026))}
    # bootstrap CI for 2024 vs 2026 rho over provinces
    ks = sorted(set(prov[2024]) & set(prov[2026])); g = [[(prov[2024][k], prov[2026][k])] for k in ks]
    f = lambda gs: spearman([x[0] for gg in gs for x in gg], [x[1] for gg in gs for x in gg])
    res['rank_stability_ci_2024_2026'] = cluster_bootstrap_ci(g, f, reps=1000)
    # persistence of the top 10
    top = {y: set(sorted(prov[y], key=prov[y].get, reverse=True)[:10]) for y in prov}
    res['province_totals_km2'] = {str(y): {k[1]: v * RAI_KM2 for k, v in d.items()} for y, d in prov.items()}
    res['top10_overlap'] = {'2024_2025': len(top[2024] & top[2025]), '2025_2026': len(top[2025] & top[2026]), 'all_three': len(top[2024] & top[2025] & top[2026])}
    res['top10_all_three'] = sorted(k[1] for k in (top[2024] & top[2025] & top[2026]))
    # upper north share
    un = lambda y: sum(v for (c, n), v in prov[y].items() if c in UPPER_NORTH) / sum(prov[y].values())
    res['upper_north_share_jan_apr'] = {str(y): un(y) for y in prov}
    # monthly peak month
    res['peak_month'] = max(res['by_month_km2'], key=res['by_month_km2'].get)
    res['upper_north_provinces_present'] = sorted({r[2] for r in rows if r[0] in UPPER_NORTH})
    res['upper_north_km2_jan_apr'] = {str(y): sum((r[7] or 0) for r in ja[y] if r[0] in UPPER_NORTH) * RAI_KM2 for y in ja}
    # crop mix in the upper north vs elsewhere (Jan-Apr, all years)
    for tag, sel in (('upper_north', lambda c: c in UPPER_NORTH), ('elsewhere', lambda c: c not in UPPER_NORTH)):
        rr = [r for y in ja for r in ja[y] if sel(r[0])]; t = sum((r[7] or 0) for r in rr)
        res['crop_mix_' + tag] = {c: sum((r[3 + i] or 0) for r in rr) / t for i, c in enumerate(crops)} if t else None
    # the same 2024-2026 comparison, month by month (Jan..Apr)
    res['month_matrix_km2'] = {m: {str(y): sum((r[7] or 0) for r in rows if r[1] == f'{y}{m:02d}') * RAI_KM2 for y in (2024, 2025, 2026)} for m in (1, 2, 3, 4)}
    return res

if __name__ == '__main__':
    r = run(); save('a7_burnscars.json', r); print(json.dumps(r, indent=1, default=str)[:4500])
