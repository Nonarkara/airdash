"""Figure 5 — where the fire is: burning fields are concentrated and persistent; the fires seen from Thailand are mostly not Thai."""
import json, os, datetime as dt
import numpy as np
from figstyle import *
D = os.path.join(os.path.dirname(__file__), '..', 'data')
L = lambda n: json.load(open(os.path.join(D, n)))

def build():
    a7, a8 = L('a7_burnscars.json'), L('a8_fire_transport.json')
    fig = plt.figure(figsize=(W2, 2.55))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.0, 1.15, 1.0], wspace=0.42)
    # (a) concentration: cumulative share of burn-scar area by province rank
    ax = fig.add_subplot(gs[0]); panel(ax, 'a', dx=-0.13)
    cols = {'2024': '#8FB8C9', '2025': BLUE, '2026': TEAL}
    for y, d in a7['province_totals_km2'].items():
        v = np.array(sorted(d.values(), reverse=True)); c = np.cumsum(v) / v.sum()
        ax.plot(np.arange(1, len(v) + 1), 100 * c, color=cols[y], lw=1.1, label=f"Jan–Apr {y}  ({v.sum():,.0f} km$^2$)")
    ax.axvline(10, color=GREY, lw=0.5, ls=(0, (2, 2)))
    t = a7['concentration']; rs = a7['rank_stability']
    ax.text(14, 52, f"top 10 provinces hold\n{100*min(c['top10_share'] for c in t.values()):.0f}–{100*max(c['top10_share'] for c in t.values()):.0f}% of the area;\nthe same provinces every year\n(rank correlation {min(v['rho'] for v in rs.values()):.2f}–{max(v['rho'] for v in rs.values()):.2f})", fontsize=6.4, va='top', linespacing=0.78)
    ax.set_xlim(1, 62); ax.set_ylim(0, 102); ax.set_xlabel('provinces, ranked by burned area'); ax.set_ylabel('cumulative share of burn scars (%)')
    ax.legend(loc='lower right', fontsize=6.0, handlelength=1.2, borderaxespad=0.2)
    # (b) detections per day inside / outside Thailand
    ax = fig.add_subplot(gs[1]); panel(ax, 'b', dx=-0.14)
    days = list(a8['by_day']); ins = np.array([a8['by_day'][d]['inside'] for d in days]); out = np.array([a8['by_day'][d]['outside'] for d in days])
    x = np.arange(len(days)); ax.bar(x - 0.2, out, width=0.4, color='#9AA4AD', lw=0, label='outside Thailand'); ax.bar(x + 0.2, ins, width=0.4, color=VERMIL, lw=0, label='inside Thailand')
    ax.set_yscale('log'); ax.set_ylim(8, 1.2e5); ax.set_xlim(-0.8, len(days) - 0.2)
    ax.set_xticks([0, 5, 10, 13]); ax.set_xticklabels([dt.date.fromisoformat(days[i]).strftime('%-d %b') for i in (0, 5, 10, 13)])
    ax.set_ylabel('VIIRS detections per day'); ax.legend(loc='lower left', bbox_to_anchor=(0.0, 1.0), ncol=2, fontsize=6.3, handlelength=1, columnspacing=1.0, borderaxespad=0.2)
    i22 = days.index('2026-10-22')
    ax.annotate(f"22 Oct: {out[i22]:,} outside,\n{ins[i22]} inside", xy=(i22, out[i22]), xytext=(i22 + 1.6, out[i22] * 1.15), fontsize=6.2, va='center', arrowprops=dict(arrowstyle='-', lw=0.4), linespacing=0.74)
    # (c) foreign share of upwind fire power, top provinces
    ax = fig.add_subplot(gs[2]); panel(ax, 'c', dx=-0.23)
    top = sorted(a8['top_provinces_by_upwind'], key=lambda r: -(r['mean_foreign_share'] or 0))
    names = [r['province'] for r in top]; fs = np.array([r['mean_foreign_share'] or 0 for r in top])
    y = np.arange(len(top))[::-1]
    ax.barh(y, 100 * fs, color=VERMIL, height=0.62, lw=0); ax.barh(y, 100 * (1 - fs), left=100 * fs, color='#C9CED3', height=0.62, lw=0)
    ax.set_yticks(y); ax.set_yticklabels(names, fontsize=6.3); ax.set_xlim(0, 100); ax.set_xlabel('unweighted cell proxy share (%)')
    ax.text(0, len(top) - 0.35, 'outside Thailand', color=VERMIL, fontsize=6.3, fontweight='medium', va='bottom'); ax.text(100, len(top) - 0.35, 'inside', color=GREY, fontsize=6.3, ha='right', va='bottom')
    ax.set_title('top ten by weighted source index', fontsize=6.6, loc='left', pad=12)
    save(fig, 'fig5_geography')

if __name__ == '__main__': build()
