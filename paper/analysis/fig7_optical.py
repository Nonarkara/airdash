"""Figure 7 — optical evidence: what cameras and airport visibility can and cannot say about PM2.5."""
import json, os
import numpy as np
from figstyle import *
D = os.path.join(os.path.dirname(__file__), '..', 'data')
L = lambda n: json.load(open(os.path.join(D, n)))
BANDS = ['<10', '10–15', '15–25', '25–37.5', '≥37.5']

def build():
    a5, a6 = L('a5_cameras.json'), L('a6_visibility.json')
    fig = plt.figure(figsize=(W2, 2.35))
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 1.12], wspace=0.42)
    # (a) cameras
    ax = fig.add_subplot(gs[0]); panel(ax, 'a', dx=-0.2)
    b = a5['bins']; x = np.arange(5); m = np.array([r['mean_loss'] for r in b]); lo = np.array([r['ci'][0] for r in b]); hi = np.array([r['ci'][1] for r in b])
    ax.errorbar(x, m, yerr=[m - lo, hi - m], fmt='o-', color=BLUE, ms=3.6, lw=1.0, capsize=2, elinewidth=0.8)
    ax.set_xticks(x); ax.set_xticklabels([f"{bn}\n{r['n']:,}" for bn, r in zip(BANDS, b)], fontsize=5.8, linespacing=0.85); ax.set_xlabel('PM2.5 band (µg m$^{-3}$) and frames'); ax.set_ylabel('camera contrast loss (index points)')
    ax.set_ylim(0, 20); ax.set_xlim(-0.4, 4.4)
    s = a5['spearman_contrast_loss_vs_pm25']
    ax.text(-0.3, 19.4, f"$\\rho$ = {s['rho']:.2f} ({s['ci_cluster_bootstrap_by_camera'][0]:.2f}–{s['ci_cluster_bootstrap_by_camera'][1]:.2f})\n{a5['paired_frames']:,} frames, {a5['paired_cameras']} cameras", fontsize=6.3, va='top', linespacing=0.78)
    # (b) airport visibility
    ax = fig.add_subplot(gs[1]); panel(ax, 'b', dx=-0.2)
    c = a6['p_reduced_by_band_cluster']; m = np.array([100 * r['share'] for r in c])
    ax.plot(x, m, 'o-', color=VERMIL, ms=3.6, lw=1.0)
    for i, r in enumerate(c):
        if r['ci']: ax.plot([i, i], [100 * r['ci'][0], 100 * r['ci'][1]], color=VERMIL, lw=0.8); ax.plot([i - .08, i + .08], [100 * r['ci'][0]] * 2, color=VERMIL, lw=0.8); ax.plot([i - .08, i + .08], [100 * r['ci'][1]] * 2, color=VERMIL, lw=0.8)
    ax.set_xticks(x); ax.set_xticklabels([f"{bn}\n{r['hours']:,}" for bn, r in zip(BANDS, c)], fontsize=5.8, linespacing=0.85); ax.set_xlabel('PM2.5 band (µg m$^{-3}$) and hours'); ax.set_ylabel('hours with visibility under 10 km (%)')
    ax.set_ylim(0, 100); ax.set_xlim(-0.4, 4.4)
    r3 = c[3]
    ax.annotate(f"{100*r3['largest_airport_hour_share']:.0f}% of these hours\nare one airport;\nwithout it: {100*r3['share_without_largest']:.0f}%", xy=(3, 100 * r3['share']), xytext=(0.15, 88), fontsize=6.2, va='top', linespacing=0.78, arrowprops=dict(arrowstyle='-', lw=0.4, color=GREY))
    # (c) camera flag as a detector
    ax = fig.add_subplot(gs[2]); panel(ax, 'c', dx=-0.2)
    T = ['15.0', '25.0', '37.5']; w = 0.26
    for k, (key, lab, col) in enumerate((('sensitivity', 'sensitivity', VERMIL), ('specificity', 'specificity', '#9AA4AD'), ('ppv', 'precision', BLUE))):
        vals = [100 * a5['flag'][t][key] for t in T]
        ax.bar(np.arange(3) + (k - 1) * w, vals, width=w * 0.92, color=col, lw=0, label=lab)
        for i, v in enumerate(vals): ax.text(i + (k - 1) * w, v + 1.5, f'{v:.0f}' if v >= 10 else f'{v:.1f}', ha='center', va='bottom', fontsize=5.8)
    ax.set_xticks(range(3)); ax.set_xticklabels(['≥15', '≥25', '≥37.5'], fontsize=6.4); ax.set_xlabel('PM2.5 at the nearest station (µg m$^{-3}$)')
    ax.set_ylabel('%'); ax.set_ylim(0, 112); ax.legend(loc='upper center', bbox_to_anchor=(0.5, 1.12), ncol=3, fontsize=6.0, handlelength=0.9, columnspacing=0.8)
    save(fig, 'fig7_optical')

if __name__ == '__main__': build()
