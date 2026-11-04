"""Figure 6 — forecast verification: the correction helps, persistence still wins, and the warnings over-called."""
import json, os
import numpy as np
from figstyle import *
from matplotlib.colors import LogNorm
D = os.path.join(os.path.dirname(__file__), '..', 'data')
INPUTS = os.path.join(D, 'inputs')
L = lambda n: json.load(open(os.path.join(D, n)))

def build():
    a4 = L('a4_forecast.json'); P = np.array(json.load(open(os.path.join(INPUTS, 'a4_pairs_lead0.json'))))
    obs, raw, cor = P[:, 0], P[:, 1], P[:, 2]
    fig = plt.figure(figsize=(W2, 2.45))
    gs = fig.add_gridspec(1, 4, width_ratios=[1, 1, 1.28, 1.0], wspace=0.55)
    L0 = a4['leads']['0']
    for k, (fc, lab, key) in enumerate(((raw, 'CAMS as published', 'raw'), (cor, 'CAMS, bias-corrected', 'cor'))):
        ax = fig.add_subplot(gs[k]); panel(ax, 'ab'[k], dx=-0.2)
        ax.hist2d(obs, fc, bins=[np.linspace(0, 50, 51)] * 2, cmap='Greys', norm=LogNorm(vmin=1, vmax=60), rasterized=True)
        ax.plot([0, 50], [0, 50], color=VERMIL, lw=0.7); ax.set_xlim(0, 50); ax.set_ylim(0, 50); ax.set_aspect('equal')
        ax.set_xlabel('observed (µg m$^{-3}$)'); ax.set_ylabel(f'{lab}\n(µg m$^{{-3}}$)', linespacing=0.78)
        m = L0[key]
        ax.text(1.5, 48.5, f"bias {m['bias']:+.1f}\nMAE {m['mae']:.1f}", fontsize=6.4, va='top', linespacing=0.78)
    # (c) paired MAE differences
    ax = fig.add_subplot(gs[2]); panel(ax, 'c', dx=-0.3)
    rows = []
    for lead in ('0', '1', '2'):
        for key, nm, col in (('mae_diff_cor_minus_raw', 'corrected − as published', BLUE), ('mae_diff_cor_minus_persistence', 'corrected − persistence', VERMIL)):
            d = a4['leads'][lead][key]; rows.append((lead, nm, col, d['mean'], d['ci']))
    y = []; pos = 0
    for i, (lead, nm, col, m, ci) in enumerate(rows):
        yy = -(i // 2) * 1.0 - (0.18 if i % 2 == 0 else -0.18); y.append(yy)
        ax.plot(ci, [yy, yy], color=col, lw=1.1); ax.plot([m], [yy], 'o', color=col, ms=3.6)
    ax.axvline(0, color=INK, lw=0.6)
    ax.set_yticks([-0.0, -1.0, -2.0]); ax.set_yticklabels(['today', 'tomorrow', 'day after'], fontsize=6.4); ax.set_ylim(-2.6, 0.55)
    ax.set_xlabel('change in mean absolute error (µg m$^{-3}$)', fontsize=6.6)
    ax.text(-0.5, -2.5, 'better', ha='right', va='center', fontsize=6.2, color=GREY); ax.text(0.5, -2.5, 'worse', ha='left', va='center', fontsize=6.2, color=GREY)
    from matplotlib.lines import Line2D
    ax.legend(handles=[Line2D([0], [0], color=BLUE, marker='o', ms=3.4, lw=1.1, label='corrected minus as published'), Line2D([0], [0], color=VERMIL, marker='o', ms=3.4, lw=1.1, label='corrected minus persistence')],
              loc='lower left', bbox_to_anchor=(-0.05, 1.0), fontsize=6.2, handlelength=1.4, borderaxespad=0.1)
    ax.set_xlim(-3.3, 2.2)
    # (d) the warnings we actually sent
    ax = fig.add_subplot(gs[3]); panel(ax, 'd', dx=-0.26)
    w = [x for x in a4['warnings'] if x['obs_station_max'] is not None]
    seen = {}
    for x in w:
        k = (x['code'], x['target_day'])
        if k not in seen or x['forecast'] > seen[k]['forecast']: seen[k] = x   # the highest value warned for that province-day, as in a4
    pts = np.array([[v['forecast'], v['obs_station_max']] for v in seen.values()])
    ax.axhspan(37.5, 60, xmin=0, xmax=1, color='#F3E3D6', lw=0, zorder=0)
    ax.scatter(pts[:, 0], pts[:, 1], s=14, color=VERMIL, lw=0, zorder=3)
    ax.plot([30, 50], [30, 50], color=GREY, lw=0.6); ax.axhline(37.5, color=GREY, lw=0.5, ls=(0, (2, 2)))
    ax.set_xlim(34, 50); ax.set_ylim(10, 50); ax.set_xlabel('forecast warned on (µg m$^{-3}$)', fontsize=6.6); ax.set_ylabel('highest station that day (µg m$^{-3}$)', fontsize=6.6)
    u = a4['warnings_unique']
    ax.text(34.8, 49, f"{u['any_station_gt37_5']} of {u['evaluable']} warned province-days\nreached 37.5 at any station", fontsize=6.2, va='top', linespacing=0.78)
    save(fig, 'fig6_forecast')

if __name__ == '__main__': build()
