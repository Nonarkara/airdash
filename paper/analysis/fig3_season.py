"""Figure 3 — the 110-day record: highest station-day mean per province, with outages marked."""
import json, os, collections, datetime as dt
import numpy as np
from figstyle import *
from matplotlib.colors import Normalize
D = os.path.join(os.path.dirname(__file__), '..', 'data')
INPUTS = os.path.join(D, 'inputs')
L = lambda n: json.load(open(os.path.join(D, n)))
UPPER_NORTH = {'50', '57', '52', '51', '58', '55', '56', '54'}

def build():
    pdm = L('a1_province_day_max.json'); a2 = L('a2_reliability.json')
    meta = json.load(open(os.path.join(INPUTS, 'station_meta.json')))
    lat, name = collections.defaultdict(list), {}
    for v in meta.values():
        if v[0] and v[3] is not None: lat[v[0]].append(v[3]); name[v[0]] = v[1]
    provs = sorted(pdm, key=lambda p: -sum(lat[p]) / len(lat[p]))
    d0 = dt.date(2026, 7, 17); days = [d0 + dt.timedelta(days=i) for i in range(110)]
    M = np.full((len(provs), len(days)), np.nan)
    for i, p in enumerate(provs):
        for j, d in enumerate(days):
            v = pdm[p].get(d.isoformat())
            if v is not None: M[i, j] = v
    fig = plt.figure(figsize=(W2, 3.75))
    gs = fig.add_gridspec(2, 2, height_ratios=[0.62, 3.0], width_ratios=[1, 0.012], hspace=0.07, wspace=0.015)
    ax0 = fig.add_subplot(gs[0, 0]); ax = fig.add_subplot(gs[1, 0]); cax = fig.add_subplot(gs[1, 1])
    x = np.arange(len(days))
    n25 = np.nansum(M > 25, axis=0); n375 = np.nansum(M > 37.5, axis=0)
    ax0.bar(x, n25, color='#B7BEC6', width=0.9, lw=0, label='above 25'); ax0.bar(x, n375, color=VERMIL, width=0.9, lw=0, label='above 37.5')
    ax0.set_xlim(-0.5, len(days) - 0.5); ax0.set_xticks([]); ax0.set_ylabel('provinces', fontsize=6.6); ax0.spines['bottom'].set_visible(False)
    ax0.legend(loc='lower left', bbox_to_anchor=(0.0, 1.0), fontsize=6.4, ncol=2, handlelength=1, columnspacing=1.2, borderaxespad=0.1)
    ax0.set_ylim(0, max(n25.max(), 4) + 1); panel(ax0, 'a', dx=-0.075, dy=0.9)
    cm = plt.get_cmap('magma_r').copy(); cm.set_bad('#F0F1F3')
    im = ax.imshow(np.ma.masked_invalid(M), aspect='auto', cmap=cm, norm=Normalize(0, 50), interpolation='nearest', extent=(-0.5, len(days) - 0.5, len(provs) - 0.5, -0.5))
    # outages (collector gaps > 6 h) as light bands on both panels
    for k, g in enumerate(a2['collector_gaps_gt6h'], 1):
        s = dt.datetime.fromisoformat(g['start']).replace(tzinfo=None) + dt.timedelta(hours=7); e = dt.datetime.fromisoformat(g['end']).replace(tzinfo=None) + dt.timedelta(hours=7)
        xs = (s - dt.datetime.combine(d0, dt.time())).total_seconds() / 86400 - 0.5; xe = (e - dt.datetime.combine(d0, dt.time())).total_seconds() / 86400 - 0.5
        for a in (ax0, ax): a.axvspan(xs, xe, color=BLUE, alpha=0.28, lw=0)
        ax0.text((xs + xe) / 2, ax0.get_ylim()[1] * 0.98, str(k), ha='center', va='top', fontsize=6.2, color=BLUE, fontweight='semibold')
    ticks = [dt.date(2026, 8, 1), dt.date(2026, 9, 1), dt.date(2026, 10, 1), dt.date(2026, 11, 1)]
    ax.set_xticks([(t - d0).days for t in ticks]); ax.set_xticklabels([t.strftime('%-d %b') for t in ticks])
    lab = {'Chiang Rai': 0, 'Chiang Mai': 0, 'Khon Kaen': 0, 'Bangkok': 0, 'Rayong': 0, 'Songkhla': 0}
    ax.set_yticks([]); 
    for i, p in enumerate(provs):
        if name[p] in lab: ax.text(-1.6, i, name[p], ha='right', va='center', fontsize=6.0)
        if p in UPPER_NORTH: ax.plot([-1.0, -1.0], [i - .5, i + .5], color=VERMIL, lw=1.6, solid_capstyle='butt', clip_on=False)
    ax.set_ylabel('74 provinces, north to south', labelpad=34, fontsize=6.4)
    ax.set_xlim(-0.5, len(days) - 0.5); ax.spines['left'].set_visible(False)
    cb = fig.colorbar(im, cax=cax); cb.set_label('µg m$^{-3}$ (daily mean, highest station in the province)', fontsize=6.2); cb.ax.tick_params(labelsize=6, length=2); cb.outline.set_linewidth(0.4)
    cb.set_ticks([0, 15, 25, 37.5, 50]); cb.set_ticklabels(['0', '15', '25', '37.5', '≥50'])
    panel(ax, 'b', dx=-0.075, dy=1.0)
    save(fig, 'fig3_season')

if __name__ == '__main__': build()
