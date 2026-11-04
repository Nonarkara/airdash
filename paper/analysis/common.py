"""Shared helpers for the paper's analysis. Everything reads the live and
archive databases READ-ONLY; nothing here writes to either."""
import math, sqlite3, statistics, random, collections, datetime as dt, json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIVE = os.path.join(ROOT, 'data', 'airdash.db')
ARCHIVE = '/Volumes/Data/dash-archive/dash-archive.db'
OUT = os.path.join(ROOT, 'paper', 'data')
INPUTS = os.path.join(OUT, 'inputs')   # frozen extracts the scripts below read (committed, so figures rebuild without the live DB)

# Thresholds used throughout (sources in the manuscript's references).
WHO_24H = 15.0       # WHO 2021 air quality guideline, 24-h PM2.5
THAI_24H = 37.5      # Thai national 24-h PM2.5 standard since 2023-01-01
VERY_UNHEALTHY = 75.0
FAULT_UG = 500.0     # readings at or above this are instrument faults, not air
MIN_HOURS = 18       # a station-day needs >= 18 of 24 hourly values
# DATA CUTOFF: every analysis stops at midnight Bangkok, 3/4 November 2026, so a
# rerun reproduces the numbers in the manuscript instead of chasing new rows.
CUT_LOCAL = '2026-11-04T00:00'   # for obs_time columns (Bangkok local)
CUT_UTC = '2026-11-03T17:00'     # the same instant for ts / started_at / frame times (UTC)
CUT_DATE = '2026-11-03'          # last included calendar day

UPPER_NORTH = {'50', '57', '52', '51', '58', '55', '56', '54'}  # Chiang Mai, Chiang Rai, Lampang, Lamphun, Mae Hong Son, Nan, Phayao, Phrae

def live():
    return sqlite3.connect(f'file:{LIVE}?mode=ro', uri=True)

def archive():
    return sqlite3.connect(f'file:{ARCHIVE}?mode=ro', uri=True)

def wilson(k, n, z=1.959964):
    """Wilson score interval for a binomial proportion (Wilson 1927)."""
    if n == 0:
        return (float('nan'), float('nan'))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)

def quantile(xs, q):
    xs = sorted(xs)
    if not xs:
        return float('nan')
    i = (len(xs) - 1) * q
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)

def rank(xs):
    """Average ranks (ties share the mean rank)."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        m = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = m
        i = j + 1
    return r

def pearson(x, y):
    n = len(x)
    if n < 3:
        return float('nan')
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx == 0 or syy == 0:
        return float('nan')
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / math.sqrt(sxx * syy)

def spearman(x, y):
    return pearson(rank(x), rank(y))

def cluster_bootstrap_ci(groups, stat, reps=2000, seed=11):
    """Percentile CI for `stat(list_of_groups)` resampling whole clusters
    (cameras, stations, provinces) — the unit of independence."""
    rng = random.Random(seed)
    vals = []
    n = len(groups)
    for _ in range(reps):
        s = [groups[rng.randrange(n)] for _ in range(n)]
        v = stat(s)
        if v == v:
            vals.append(v)
    return (quantile(vals, 0.025), quantile(vals, 0.975))

def local_day(obs_time):
    return obs_time[:10]

def save(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False, sort_keys=True)
