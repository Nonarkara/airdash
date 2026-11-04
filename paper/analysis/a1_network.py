"""A1 — The ground network: who reports, how completely, how clean, how high.

Window: 2026-07-17 00:00 to 2026-11-03 23:00, Bangkok time (110 full days).
Hourly station values come from `readings` (raw, since ~6 Aug) and from
`readings_hourly` (the roll-up that retention writes for older hours)."""
import collections, datetime as dt, json, os
from common import *

START = dt.datetime(2026, 7, 17, 0)
END = dt.datetime(2026, 11, 3, 23)
HOURS = int((END - START).total_seconds() // 3600) + 1
DAYS = HOURS // 24

def hour_key(t):
    return t.strftime('%Y-%m-%dT%H')

def load(db, metric, source='air4thai'):
    """station -> {hourkey: value}; raw wins over the roll-up when both exist."""
    out = collections.defaultdict(dict)
    for st, h, v in db.execute(
        "select station_key, hour, v_avg from readings_hourly where source=? and metric=? and hour >= ? and hour <= ?",
        (source, metric, hour_key(START), hour_key(END))):
        out[st][h] = v
    for st, t, v in db.execute(
        "select station_key, obs_time, value from readings indexed by idx_readings_metric_cover "
        "where metric=? and source=? and obs_time >= ? and obs_time <= ?",
        (metric, source, hour_key(START), hour_key(END) + ':59')):
        out[st][t[:13]] = v
    return out

def run():
    db = live()
    pm25, pm10 = load(db, 'pm25'), load(db, 'pm10')
    meta = {r[0]: r[1:] for r in db.execute(
        "select station_key, province_code, province_en, name_en, lat, lng from stations where source='air4thai'")}
    res = {'window': {'start': START.isoformat(), 'end': END.isoformat(), 'days': DAYS, 'hours': HOURS}}

    # --- who reports
    res['stations_pm25'] = len(pm25)
    res['stations_pm10'] = len(pm10)
    res['stations_both'] = len(set(pm25) & set(pm10))
    prov25 = {meta[s][0] for s in pm25 if s in meta and meta[s][0]}
    prov10 = {meta[s][0] for s in pm10 if s in meta and meta[s][0]}
    res['provinces_with_pm25_station'] = len(prov25)
    res['provinces_with_pm10_station'] = len(prov10)

    # --- quality control
    faults = collections.Counter()
    nvals = 0
    clean25 = {}
    for s, d in pm25.items():
        c = {}
        for h, v in d.items():
            nvals += 1
            if v is None or v < 0:
                faults['negative_or_null'] += 1
            elif v >= FAULT_UG:
                faults['fault_ge_500'] += 1
                faults['station:' + s] += 1
            else:
                c[h] = v
        clean25[s] = c
    res['pm25_values_total'] = nvals
    res['pm25_fault_values'] = faults['fault_ge_500']
    res['pm25_fault_share'] = faults['fault_ge_500'] / nvals
    res['pm25_fault_stations'] = sum(1 for k in faults if k.startswith('station:'))
    res['pm25_fault_by_station'] = {k[8:]: v for k, v in faults.most_common() if k.startswith('station:')}
    # what the worst faults would have done to the national maximum
    raw_max = max(v for d in pm25.values() for v in d.values())
    res['pm25_raw_max'] = raw_max
    res['pm25_clean_max'] = max(v for d in clean25.values() for v in d.values())

    # --- completeness. An hour is 'feed-alive' when >= 100 stations reported: the
    # PCD feed was up AND our collector was up. Completeness conditional on
    # feed-alive hours isolates station reliability from collection outages.
    per_hour = collections.Counter(h for c in clean25.values() for h in c)
    alive = {h for h, n in per_hour.items() if n >= 100}
    res['feed_alive_hours'] = len(alive)
    res['feed_alive_share'] = len(alive) / HOURS
    comp_all = {s: len(c) / HOURS for s, c in clean25.items()}
    res['completeness_unconditional_median'] = quantile(sorted(comp_all.values()), .5)
    comp = {s: len([h for h in c if h in alive]) / max(1, len(alive)) for s, c in clean25.items()}
    cv = sorted(comp.values())
    res['completeness'] = {'median': quantile(cv, .5), 'q25': quantile(cv, .25), 'q75': quantile(cv, .75),
                           'min': cv[0], 'max': cv[-1],
                           'n_lt_50pct': sum(1 for x in cv if x < .5), 'n_ge_90pct': sum(1 for x in cv if x >= .9)}
    res['completeness_by_station'] = {s: round(v, 4) for s, v in comp.items()}

    # --- daily station means (>= 18 valid hours)
    daily = {}  # (station, day) -> mean
    for s, c in clean25.items():
        byday = collections.defaultdict(list)
        for h, v in c.items():
            byday[h[:10]].append(v)
        for d, vs in byday.items():
            if len(vs) >= MIN_HOURS:
                daily[(s, d)] = sum(vs) / len(vs)
    res['station_days'] = len(daily)
    # scratch copy for the other analyses (derived, not committed)
    os.makedirs(INPUTS, exist_ok=True)
    json.dump([[s_, d_, round(v_, 3)] for (s_, d_), v_ in sorted(daily.items())], open(os.path.join(INPUTS, 'station_daily.json'), 'w'))
    json.dump({k: list(v) for k, v in meta.items()}, open(os.path.join(INPUTS, 'station_meta.json'), 'w'))
    vals = list(daily.values())
    res['daily_mean'] = {'median': quantile(vals, .5), 'q90': quantile(vals, .9), 'q99': quantile(vals, .99), 'max': max(vals)}
    for name, thr in (('gt_who15', WHO_24H), ('gt_thai37_5', THAI_24H), ('gt_75', VERY_UNHEALTHY)):
        k = sum(1 for v in vals if v > thr)
        lo, hi = wilson(k, len(vals))
        res['exceed_' + name] = {'k': k, 'n': len(vals), 'share': k / len(vals), 'ci': [lo, hi]}
    # --- corroboration: an exceeding station-day is 'isolated' when at least two
    # other stations within 50 km reported that day and their median is below
    # half of its value. Isolated spikes are the signature of a sensor fault.
    import math as _m
    def km(a, b):
        la1, lo1, la2, lo2 = map(_m.radians, (a[0], a[1], b[0], b[1]))
        h = _m.sin((la2 - la1) / 2) ** 2 + _m.cos(la1) * _m.cos(la2) * _m.sin((lo2 - lo1) / 2) ** 2
        return 2 * 6371 * _m.asin(_m.sqrt(h))
    pos = {s: (meta[s][3], meta[s][4]) for s in meta if meta[s][3] is not None}
    byday = collections.defaultdict(dict)
    for (s, d), v in daily.items():
        byday[d][s] = v
    iso = []
    for (s, d), v in daily.items():
        if v <= THAI_24H or s not in pos:
            continue
        nb = [byday[d][o] for o in byday[d] if o != s and o in pos and km(pos[s], pos[o]) <= 50]
        isolated = len(nb) >= 2 and statistics.median(nb) < 0.5 * v
        iso.append({'station': s, 'day': d, 'pm25': round(v, 1), 'neighbors': len(nb),
                    'neighbor_median': round(statistics.median(nb), 1) if nb else None, 'isolated': isolated})
    res['exceed_37_5_detail'] = iso
    res['exceed_37_5_isolated'] = sum(1 for x in iso if x['isolated'])
    res['exceed_37_5_corroborated'] = sum(1 for x in iso if not x['isolated'] and x['neighbors'] >= 2)
    res['exceed_37_5_unverifiable'] = sum(1 for x in iso if x['neighbors'] < 2)
    # --- Thai AQI categories (anchors 15 / 25 / 37.5 / 75) and the same air under other labels
    cats = collections.Counter()
    for v in vals:
        cats['excellent_le15' if v <= 15 else 'good_15_25' if v <= 25 else 'moderate_25_37_5' if v <= 37.5 else 'affects_37_5_75' if v <= 75 else 'worse_gt75'] += 1
    res['thai_aqi_category_counts'] = dict(cats)
    # US EPA 24-h PM2.5 NAAQS (35 ug/m3) as a third reading of the same air
    k35 = sum(1 for v in vals if v > 35.0)
    res['exceed_gt_us35'] = {'k': k35, 'n': len(vals), 'share': k35 / len(vals)}
    # stations ever above thresholds
    st_over = collections.defaultdict(lambda: [0, 0])
    for (s, d), v in daily.items():
        st_over[s][0] += 1
        st_over[s][1] += v > THAI_24H
    res['stations_with_any_gt37_5'] = sum(1 for a, b in st_over.values() if b > 0)
    res['stations_with_daily_data'] = len(st_over)
    # by month
    bym = collections.defaultdict(lambda: [0, 0, 0, 0])
    for (s, d), v in daily.items():
        m = d[:7]
        bym[m][0] += 1
        bym[m][1] += v > WHO_24H
        bym[m][2] += v > THAI_24H
        bym[m][3] += v
    res['by_month'] = {m: {'station_days': a, 'gt15': b, 'gt37_5': c, 'mean': s / a} for m, (a, b, c, s) in sorted(bym.items())}
    # top station-days
    top = sorted(daily.items(), key=lambda kv: -kv[1])[:12]
    res['top_station_days'] = [{'station': s, 'day': d, 'pm25': round(v, 1),
                                'name': meta.get(s, [None] * 4)[2], 'province': meta.get(s, [None] * 4)[1]} for (s, d), v in top]

    # --- province-day maxima for the season heat map (max over stations of daily mean)
    pmax = collections.defaultdict(dict)
    for (s, d), v in daily.items():
        p = meta.get(s, [None])[0]
        if p:
            pmax[p][d] = max(pmax[p].get(d, 0), v)
    res['province_day_max_n'] = sum(len(v) for v in pmax.values())
    save('a1_province_day_max.json', {p: d for p, d in pmax.items()})
    # how many provinces exceed 37.5 on the worst day
    worst = collections.Counter()
    for p, dd in pmax.items():
        for d, v in dd.items():
            if v > THAI_24H:
                worst[d] += 1
    res['worst_day_provinces_gt37_5'] = worst.most_common(5)
    res['province_days_gt37_5'] = sum(worst.values())

    # --- PM10 and particle size
    ratios, ratios_hi = [], []
    for s in set(clean25) & set(pm10):
        for h, v in pm10[s].items():
            p25 = clean25[s].get(h)
            if p25 is not None and 0 < v < FAULT_UG and v >= p25 * 0.8:  # PM10 >= PM2.5 physically (allow 20% noise)
                ratios.append(p25 / v)
                if p25 >= 25:
                    ratios_hi.append(p25 / v)
    res['pm25_to_pm10_ratio'] = {'n': len(ratios), 'median': quantile(ratios, .5), 'q25': quantile(ratios, .25), 'q75': quantile(ratios, .75),
                                 'n_pm25_ge25': len(ratios_hi), 'median_pm25_ge25': quantile(ratios_hi, .5) if ratios_hi else None}
    # share of ground PM2.5 stations without a PM10 sibling
    res['share_pm25_stations_without_pm10'] = 1 - len(set(pm25) & set(pm10)) / len(pm25)

    # --- regional split
    reg = collections.defaultdict(list)
    for (s, d), v in daily.items():
        p = meta.get(s, [None])[0]
        if p:
            reg['upper_north' if p in UPPER_NORTH else 'rest'].append(v)
    res['by_region'] = {k: {'n': len(v), 'median': quantile(v, .5), 'q90': quantile(v, .9),
                            'share_gt37_5': sum(1 for x in v if x > THAI_24H) / len(v)} for k, v in reg.items()}
    return res

if __name__ == '__main__':
    r = run()
    save('a1_network.json', r)
    import json
    print(json.dumps({k: v for k, v in r.items() if k not in ('completeness_by_station', 'pm25_fault_by_station')}, indent=1, default=str)[:6000])
