"""A10 — Alert quality, ENSO context, and what the system is made of."""
import collections, datetime as dt, json, math, os, subprocess, statistics
from common import *
import a1_network as a1

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

def alerts():
    db = live(); res = {}
    with open(os.path.join(INPUTS, 'station_meta.json')) as f:
        meta = json.load(f)
    pos = {s: (m[3], m[4]) for s, m in meta.items() if m[3] is not None}
    with open(os.path.join(INPUTS, 'station_daily.json')) as f:
        sd = {(s, d): v for s, d, v in json.load(f)}
    allrows = db.execute("select ts, station_key, severity, value, source from alerts where rule='pm25_level' and ts >= '2026-07-16T17:00' and ts < '2026-11-03T17:00' order by ts").fetchall()
    res['alert_rules_all'] = dict(collections.Counter(r[0] for r in db.execute("select rule from alerts where ts >= '2026-07-16T17:00' and ts < '2026-11-03T17:00'").fetchall()))
    res['pm25_level_by_source'] = dict(collections.Counter(r[4] for r in allrows))
    pd_ = collections.Counter(r[0][:10] for r in allrows)
    res['alerts_per_day'] = {'median': quantile(list(pd_.values()), .5), 'max': max(pd_.values()), 'days_with_alerts': len(pd_)}
    res['alert_value_median'] = quantile([r[3] for r in allrows], .5)
    for src, loader in (('air4thai', None), ('gistda_pm25', 'gistda_pm25')):
        rows = [r for r in allrows if r[4] == src]
        hourly = a1.load(db, 'pm25', source=src)
        out = {'alerts': len(rows), 'units_alerted': len({r[1] for r in rows})}
        bys = collections.Counter(r[1] for r in rows)
        out['top5_share'] = sum(c for _, c in bys.most_common(5)) / max(1, len(rows))
        out['top5'] = [{'key': k, 'name': (meta.get(k) or [0, 0, k])[2], 'alerts': c} for k, c in bys.most_common(5)]
        persist = corro = has_nb = dhit = daily_n = n = 0
        for ts, st, sev, val, _ in rows:
            t = dt.datetime.fromisoformat(ts.replace('Z', '+00:00')) + dt.timedelta(hours=7)
            h0 = t.replace(minute=0, second=0, microsecond=0, tzinfo=None)
            hs = [(h0 + dt.timedelta(hours=i)).strftime('%Y-%m-%dT%H') for i in range(6)]
            vals = [hourly.get(st, {}).get(h) for h in hs]
            if sum(v is not None for v in vals) < 4: continue
            n += 1
            persist += sum(1 for v in vals if v is not None and v >= 37.5) >= 3
            if src == 'air4thai':
                nb = [s_ for s_ in pos if s_ != st and st in pos and km(pos[st], pos[s_]) <= 50 and hourly.get(s_, {}).get(hs[0]) is not None]
                if len(nb) >= 2:
                    has_nb += 1; corro += any(hourly[s_][hs[0]] >= 25 for s_ in nb)
            dv = sd.get((st, h0.strftime('%Y-%m-%d'))) if src == 'air4thai' else None
            if dv is None and src == 'gistda_pm25':
                dd_ = [v for h, v in hourly.get(st, {}).items() if h[:10] == h0.strftime('%Y-%m-%d')]
                dv = sum(dd_) / len(dd_) if len(dd_) >= a1.MIN_HOURS else None
            if dv is not None:
                daily_n += 1
                dhit += int(dv > 37.5)
        out['evaluable'] = n
        out['persistent_ge3h_of_6'] = {'k': persist, 'n': n, 'share': persist / n if n else None, 'ci': wilson(persist, n) if n else None}
        out['corroborated_by_neighbor_ge25'] = {'k': corro, 'n': has_nb, 'share': corro / has_nb if has_nb else None, 'ci': wilson(corro, has_nb) if has_nb else None}
        out['day_mean_gt37_5'] = {'k': dhit, 'n': daily_n, 'missing': n - daily_n, 'share': dhit / daily_n if daily_n else None, 'ci': wilson(dhit, daily_n) if daily_n else None, 'target': 'same calendar day; includes time before alert'}
        res[src] = out
    return res

def enso():
    d = {}
    for line in open(os.path.join(INPUTS, 'oni.txt')).read().split('\n')[1:]:
        p = line.split()
        if len(p) == 4: d[(p[0], int(p[1]))] = float(p[3])
    seasons = {str(y): {s: d.get((s, y)) for s in ('DJF', 'JFM', 'FMA', 'MAM')} for y in (2024, 2025, 2026)}
    latest = max((y, s) for (s, y) in d if y == max(yy for _, yy in d))
    order = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ']
    ly = max(y for _, y in d); ls = max((s for (s, y) in d if y == ly), key=order.index)
    return {'seasons': seasons, 'latest': {'season': ls, 'year': ly, 'anom': d[(ls, ly)]},
            'jjas2026': {s: d.get((s, 2026)) for s in ('MJJ', 'JJA', 'JAS', 'ASO')},
            'rank_of_latest_among_all_ASO': sorted(d[('ASO', y)] for (s, y) in d if s == 'ASO').index(d[('ASO', 2026)]) + 1,
            'n_ASO_years': sum(1 for (s, y) in d if s == 'ASO'),
            'max_ASO': max((d[('ASO', y)], y) for (s, y) in d if s == 'ASO')}

def system():
    def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True, cwd=ROOT).stdout.strip()
    res = {}
    res['first_commit'] = sh("git log --reverse --format=%ad --date=short | head -1")
    res['commits'] = int(sh("git rev-list --count HEAD"))
    res['authors'] = sh("git log --format=%an | sort | uniq -c | sort -rn | head -6").split('\n')
    cnt = lambda pat: int(sh(f"git ls-files '{pat}' | xargs cat 2>/dev/null | wc -l") or 0)
    res['loc_server'] = cnt('server/*.js') + cnt('server/**/*.js')
    res['loc_frontend_js'] = cnt('public/js/*.js') + cnt('public/js/**/*.js')
    res['loc_css'] = cnt('public/css/*.css')
    res['loc_tests'] = cnt('scripts/test-*.mjs')
    res['test_files'] = int(sh("git ls-files 'scripts/test-*.mjs' | wc -l"))
    res['npm_dependencies'] = len(json.load(open(os.path.join(ROOT, 'package.json'))).get('dependencies', {}))
    res['db_mb'] = round(os.path.getsize(LIVE) / 1e6)
    res['api_routes'] = int(sh("grep -c \"^    'GET /api\" server/api.js"))
    return res

if __name__ == '__main__':
    r = {'alerts': alerts(), 'enso': enso(), 'system': system()}
    save('a10_alerts_enso_system.json', r)
    print(json.dumps(r, indent=1, default=str)[:4200])
