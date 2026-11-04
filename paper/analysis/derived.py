"""Small derived quantities quoted in the text, computed from the analysis outputs
(never typed by hand): sums, complements and counts that no single analysis stores."""
import json, os
from common import OUT, save

def L(n): return json.load(open(os.path.join(OUT, n)))

def run():
    a1, a2, a4, a5, a7, a8, a9, a10 = (L(f) for f in ('a1_network.json', 'a2_reliability.json', 'a4_forecast.json', 'a5_cameras.json', 'a7_burnscars.json',
                                                      'a8_fire_transport.json', 'a9_coordination.json', 'a10_alerts_enso_system.json'))
    ct = a9['category_agreement']['cross_tab']
    off = {k: v for k, v in ct.items() if k.split('->')[0] != k.split('->')[1]}
    cleanest = sum(v for k, v in off.items() if set(k.split('->')) == {'0', '1'})
    tot = sum(ct.values())
    def wkappa(ct, K=4):   # linearly weighted kappa: a one-band miss costs less than a three-band miss
        n = [[ct.get(f'{i}->{j}', 0) for j in range(K)] for i in range(K)]
        N = sum(map(sum, n)); r = [sum(row) for row in n]; c = [sum(n[i][j] for i in range(K)) for j in range(K)]
        w = lambda i, j: abs(i - j) / (K - 1)
        do = sum(w(i, j) * n[i][j] for i in range(K) for j in range(K)) / N
        de = sum(w(i, j) * r[i] * c[j] for i in range(K) for j in range(K)) / N ** 2
        return 1 - do / de
    ps = a2['per_source']; gated = ('imerg', 'dustboy')
    ok_ex = a2['runs_total'] - sum(ps[g]['runs'] for g in gated); good_ex = sum(v['ok'] for k, v in ps.items() if k not in gated)
    top = a1['top_station_days'][0]
    nb = [x for x in a1['exceed_37_5_detail'] if x['station'] == top['station'] and x['day'] == top['day']][0]
    sc = a5['status_counts']; total = sum(sc.values())
    d = {
        'upper_north_stations': sum(a9['upper_north_stations'].values()),
        'category_differ': 1 - a9['category_agreement']['same_category'],
        'outside_thailand_detections': a8['detections'] - a8['inside_thailand'],
        'outside_share': 1 - a8['inside_share'],
        'warned_overcalled': a4['warnings_unique']['evaluable'] - a4['warnings_unique']['any_station_gt37_5'],
        'failed_share': 1 - a2['success_overall'],
        'low_light_share': sc['low-light'] / total,
        'judged_share': (sc['unchanged'] + sc['possible-haze']) / total,
        'frames_total': total,
        'pcd_only_above_37_5': a9['above_37.5']['pcd'],
        'gistda_alert_never_exceeded': a10['alerts']['gistda_pm25']['day_mean_gt37_5']['n'] - a10['alerts']['gistda_pm25']['day_mean_gt37_5']['k'],
        'air4thai_not_exceeded': a10['alerts']['air4thai']['day_mean_gt37_5']['n'] - a10['alerts']['air4thai']['day_mean_gt37_5']['k'],
        'collector_gaps_gt6h_n': len(a2['collector_gaps_gt6h']),
        'longest_gap_h': max(g['minutes'] for g in a2['collector_gaps_gt6h']) / 60,
        'top_station_neighbor_median': nb['neighbor_median'], 'top_station_neighbors': nb['neighbors'],
        'stale_episodes_n': len(a2['pm25_feed_stale_episodes']),
        'burn_2024_over_2025': a7['jan_apr_km2']['2024'] / a7['jan_apr_km2']['2025'],
        'pcd_alone_25': a9['above_25.0']['pcd'] - a9['above_25.0']['both'], 'gistda_alone_25': a9['above_25.0']['gistda'] - a9['above_25.0']['both'],
        'category_differ_n': sum(off.values()), 'category_differ_cleanest_share': cleanest / sum(off.values()),
        'category_differ_cleanest_pct_of_all': cleanest / tot, 'category_kappa_weighted': wkappa(ct),
        'public_streams': L('census.json')['streams'] - 1,
        'success_excl_token_gated': good_ex / ok_ex, 'token_gated_pulls': sum(ps[g]['runs'] for g in gated), 'token_gated_share': sum(ps[g]['runs'] for g in gated) / a2['runs_total'],
        'outside_box_share': 1 - a8['box_share_of_region'],
        'outside_cell_share': 1 - a8['cell_days_inside_share'], 'outside_cell_ci0': 1 - a8['cell_days_inside_ci_day_bootstrap'][1], 'outside_cell_ci1': 1 - a8['cell_days_inside_ci_day_bootstrap'][0],
        'stations_no_daily': a1['stations_pm25'] - a1['stations_with_daily_data'],
        'share_stations_ge90': a1['completeness']['n_ge_90pct'] / a1['stations_with_daily_data'],
        'bangkok_per_other': a9['stations_per_province']['bangkok_count'] / max(1, a9['stations_per_province']['total'] - a9['stations_per_province']['bangkok_count']),
    }
    return d

if __name__ == '__main__':
    r = run(); save('derived.json', r); print(r)
