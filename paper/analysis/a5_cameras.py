"""A5 — Can public CCTV see haze? A pilot, not a validation.

Frames: `cctv_haze_frames`, daylight samples of public cameras judged against
each camera's OWN clear-day baseline (server/vision/hazeSignal.js).
contrast_loss is a relative index (0-100), never a PM2.5 estimate."""
import collections, json, datetime as dt
from common import *

def run():
    db = live()
    res = {}
    rows = db.execute("select camera_key, camera_source, province_code, obs_time, haze_status, contrast_loss, baseline_samples, pm25, pm25_km, mean_luma "
                      "from cctv_haze_frames where obs_time >= '2026-09-28' and obs_time < '2026-11-03T17:00'").fetchall()
    res['frames'] = len(rows)
    res['cameras'] = len({r[0] for r in rows})
    res['provinces'] = len({r[2] for r in rows if r[2]})
    res['first'] = min(r[3] for r in rows); res['last'] = max(r[3] for r in rows)
    st = collections.Counter(r[4] or 'unlabelled' for r in rows)
    res['status_counts'] = dict(st)
    day_judged = st['unchanged'] + st['possible-haze']
    res['judged_frames'] = day_judged
    res['judged_share_of_daylight'] = day_judged / max(1, len(rows) - st['low-light'] - st.get('unlabelled', 0))
    res['camera_sources'] = dict(collections.Counter(r[1] for r in rows))
    # cameras with enough judged frames to have a baseline
    jc = collections.Counter(r[0] for r in rows if r[4] in ('unchanged', 'possible-haze'))
    res['cameras_with_judged_frames'] = len(jc)
    res['cameras_ge_20_judged'] = sum(1 for v in jc.values() if v >= 20)
    # ---- association with the nearest ground PM2.5 (<= 25 km)
    paired = [(r[0], r[5], r[7], r[8], r[4]) for r in rows if r[4] in ('unchanged', 'possible-haze') and r[5] is not None
              and r[7] is not None and r[8] is not None and r[8] <= 25 and 0 <= r[7] < FAULT_UG]
    res['paired_frames'] = len(paired)
    res['paired_cameras'] = len({p[0] for p in paired})
    res['paired_pm25_range'] = [min(p[2] for p in paired), max(p[2] for p in paired)] if paired else None
    res['paired_pm25_q'] = [quantile([p[2] for p in paired], q) for q in (.05, .25, .5, .75, .95)]
    byc = collections.defaultdict(list)
    for c, cl, pm, km, s in paired: byc[c].append((cl, pm, s))
    groups = list(byc.values())
    rho = lambda gs: spearman([x[0] for g in gs for x in g], [x[1] for g in gs for x in g])
    res['spearman_contrast_loss_vs_pm25'] = {'rho': rho(groups), 'ci_cluster_bootstrap_by_camera': cluster_bootstrap_ci(groups, rho, reps=400)}
    # within-camera association (removes between-camera differences)
    wc = []
    for g in groups:
        if len(g) >= 20 and len({x[1] for x in g}) > 3:
            r_ = spearman([x[0] for x in g], [x[1] for x in g])
            if r_ == r_: wc.append(r_)
    res['within_camera_rho'] = {'cameras': len(wc), 'median': quantile(wc, .5), 'q25': quantile(wc, .25), 'q75': quantile(wc, .75),
                                'share_positive': sum(1 for x in wc if x > 0) / max(1, len(wc))}
    # binned mean contrast loss by PM2.5 band
    bands = [(0, 10), (10, 15), (15, 25), (25, 37.5), (37.5, 500)]
    res['bins'] = []
    for lo, hi in bands:
        xs = [x[0] for g in groups for x in g if lo <= x[1] < hi]
        cams = [[x[0] for x in g if lo <= x[1] < hi] for g in groups]
        cams = [c for c in cams if c]
        m = lambda gs: sum(sum(g) for g in gs) / sum(len(g) for g in gs)
        res['bins'].append({'lo': lo, 'hi': hi, 'n': len(xs), 'cameras': len(cams), 'mean_loss': (sum(xs) / len(xs)) if xs else None,
                            'ci': cluster_bootstrap_ci(cams, m, reps=400) if len(cams) > 3 else None})
    # the flag as a classifier of PM2.5 >= T
    res['flag'] = {}
    for T in (15.0, 25.0, 37.5):
        tp = sum(1 for p in paired if p[4] == 'possible-haze' and p[2] >= T); fn = sum(1 for p in paired if p[4] != 'possible-haze' and p[2] >= T)
        fp = sum(1 for p in paired if p[4] == 'possible-haze' and p[2] < T); tn = sum(1 for p in paired if p[4] != 'possible-haze' and p[2] < T)
        res['flag'][str(T)] = {'tp': tp, 'fn': fn, 'fp': fp, 'tn': tn,
                               'sensitivity': tp / (tp + fn) if tp + fn else None, 'sens_ci': wilson(tp, tp + fn) if tp + fn else None,
                               'specificity': tn / (tn + fp) if tn + fp else None, 'spec_ci': wilson(tn, tn + fp) if tn + fp else None,
                               'ppv': tp / (tp + fp) if tp + fp else None}
    res['possible_haze_frames'] = sum(1 for r in rows if r[4] == 'possible-haze')
    res['possible_haze_cameras'] = len({r[0] for r in rows if r[4] == 'possible-haze'})
    # fog confound: share of possible-haze frames taken when the province RH was >= 90%
    rh = collections.defaultdict(list)
    for p, t, v in db.execute("select station_key, obs_time, value from readings indexed by idx_readings_metric_cover where source='openmeteo' and metric='rh_pct' and obs_time >= '2026-09-28' and obs_time < '2026-11-04T00:00'"):
        rh[p].append((t, v))
    def rh_at(p, tutc):
        tl = (dt.datetime.fromisoformat(tutc.replace('Z', '+00:00')) + dt.timedelta(hours=7)).strftime('%Y-%m-%dT%H:%M')
        best = None
        for t, v in rh.get(p, []):
            if t <= tl and (best is None or t > best[0]): best = (t, v)
        return best[1] if best and (dt.datetime.fromisoformat(tl) - dt.datetime.fromisoformat(best[0])).total_seconds() <= 8 * 3600 else None
    ph = [r for r in rows if r[4] == 'possible-haze' and r[2]]
    vals = [rh_at(r[2], r[3]) for r in ph]
    vals = [v for v in vals if v is not None]
    res['possible_haze_with_rh'] = len(vals)
    res['possible_haze_rh_ge90_share'] = sum(1 for v in vals if v >= 90) / max(1, len(vals))
    un = [r for r in rows if r[4] == 'unchanged' and r[2]][::25]
    uv = [v for v in (rh_at(r[2], r[3]) for r in un) if v is not None]
    res['unchanged_rh_ge90_share'] = sum(1 for v in uv if v >= 90) / max(1, len(uv)); res['unchanged_rh_n'] = len(uv)
    return res

if __name__ == '__main__':
    r = run(); save('a5_cameras.json', r)
    print(json.dumps(r, indent=1, default=str)[:5000])
