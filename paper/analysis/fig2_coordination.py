"""Figure 2 — evidence of fragmentation: where the sensors are, and two official answers."""
import json, os, math
import numpy as np
from figstyle import *
from matplotlib.colors import LogNorm
D = os.path.join(os.path.dirname(__file__), '..', 'data')
INPUTS = os.path.join(D, 'inputs')
L = lambda n: json.load(open(os.path.join(D, n)))
UPPER_NORTH = {'50', '57', '52', '51', '58', '55', '56', '54'}

def build():
    a9 = L('a9_coordination.json')
    meta = json.load(open(os.path.join(INPUTS, 'station_meta.json')))
    import collections
    cnt = collections.Counter(v[0] for v in meta.values() if v[0])
    order = sorted(cnt.items(), key=lambda kv: -kv[1])
    fig = plt.figure(figsize=(W2, 2.45))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.25, 1.05, 0.95], wspace=0.34)
    # (a) stations per province, rank ordered
    ax = fig.add_subplot(gs[0]); panel(ax, 'a')
    vals = [v for _, v in order]; cols = [VERMIL if p in UPPER_NORTH else (TEAL if p == '10' else '#9AA4AD') for p, _ in order]
    ax.bar(range(len(vals)), vals, color=cols, width=0.85, lw=0)
    ax.set_yscale('log'); ax.set_ylim(0.8, 130); ax.set_yticks([1, 2, 5, 10, 20, 50, 100]); ax.set_yticklabels(['1', '2', '5', '10', '20', '50', '100'])
    ax.set_xlim(-1, len(vals)); ax.set_xticks([]); ax.set_xlabel('74 provinces with a PCD PM2.5 station, ranked')
    ax.set_ylabel('stations per province')
    ax.text(1.5, 58, f"Bangkok {a9['stations_per_province']['bangkok_count']} ({100*a9['stations_per_province']['bangkok_share']:.0f}% of the network)", fontsize=6.5, color=TEAL, va='center')
    ax.text(len(vals) - 1, 2.9, f"{a9['stations_per_province']['with_exactly_1']} provinces have exactly one;\n3 have none", ha='right', va='center', fontsize=6.5, color=GREY, linespacing=0.74)
    un = sum(a9['upper_north_stations'].values())
    ax.text(len(vals) - 2, 8.5, f'upper north: 8 provinces,\n{un} stations (orange)', ha='right', va='center', fontsize=6.5, color=VERMIL, linespacing=0.74)
    # (b) PCD vs GISTDA
    pairs = np.array(json.load(open(os.path.join(INPUTS, 'a9_pairs.json'))))
    ax = fig.add_subplot(gs[1]); panel(ax, 'b')
    lim = 55
    h = ax.hist2d(pairs[:, 0], pairs[:, 1], bins=[np.linspace(0, 45, 61)] * 2, cmap='Greys', norm=LogNorm(vmin=1, vmax=200), rasterized=True)
    ax.plot([0, 45], [0, 45], color=VERMIL, lw=0.7)
    for t in (25, 37.5):
        ax.axvline(t, color=GREY, lw=0.4, ls=(0, (2, 2))); ax.axhline(t, color=GREY, lw=0.4, ls=(0, (2, 2)))
    ax.set_xlim(0, 45); ax.set_ylim(0, 45); ax.set_aspect('equal')
    ax.set_xlabel('PCD ground stations, province mean (µg m$^{-3}$)'); ax.set_ylabel('GISTDA satellite fusion (µg m$^{-3}$)')
    p = a9['pcd_vs_gistda']
    ax.text(1.5, 37.0, f"n = {a9['paired_province_days']:,} province-days\n$\\rho$ = {p['rho']:.2f}; GISTDA higher by {p['mean_diff_gistda_minus_pcd']:.1f}\n(limits of agreement {p['loa'][0]:.1f} to +{p['loa'][1]:.1f})", fontsize=6.4, va='top', linespacing=0.74)
    ax.text(25.4, 1.2, '25', fontsize=5.8, color=GREY); ax.text(37.9, 1.2, '37.5', fontsize=5.8, color=GREY)
    # (c) category confusion matrix
    ax = fig.add_subplot(gs[2]); panel(ax, 'c')
    ct = a9['category_agreement']['cross_tab']; M = np.zeros((4, 4))
    for k, v in ct.items():
        a, b = map(int, k.split('->')); M[a, b] = v
    im = ax.imshow(np.where(M > 0, M, np.nan), cmap='Greys', norm=LogNorm(vmin=1, vmax=5000), origin='upper')
    for i in range(4):
        for j in range(4):
            if M[i, j] > 0: ax.text(j, i, f'{int(M[i, j]):,}', ha='center', va='center', fontsize=6.3, color='white' if M[i, j] > 300 else INK)
            if i == j and M[i, j] > 0: ax.add_patch(plt.Rectangle((j - .5, i - .5), 1, 1, fill=False, ec=VERMIL, lw=0.9))
    labs = ['≤15', '15–25', '25–37.5', '37.5–75']
    ax.set_xticks(range(3)); ax.set_xticklabels(labs[:3], fontsize=6); ax.set_xlim(-.5, 2.5); ax.set_yticks(range(4)); ax.set_yticklabels(labs, fontsize=6)
    ax.xaxis.tick_top(); ax.xaxis.set_label_position('top')
    ax.set_xlabel('GISTDA band (µg m$^{-3}$)', fontsize=6.6); ax.set_ylabel('PCD band', fontsize=6.6)
    ax.spines[:].set_visible(False); ax.tick_params(length=0)
    ax.text(1.5, 4.0, f"same band {100*a9['category_agreement']['same_category']:.0f}% · $\\kappa$ = {a9['category_agreement']['kappa']:.2f}", ha='center', va='top', fontsize=6.4)
    save(fig, 'fig2_coordination')

if __name__ == '__main__': build()
