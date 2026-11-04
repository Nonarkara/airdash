"""Figure 1 — the chain from a burning field to a phone, with the measured clock.
Drawn in inch coordinates (1 unit = 1 in) so type sizes are literal."""
import json, os
from figstyle import *
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
D = os.path.join(os.path.dirname(__file__), '..', 'data')
L = lambda n: json.load(open(os.path.join(D, n)))

def build():
    a1, a2, a3, a8, a9 = L('a1_network.json'), L('a2_reliability.json'), L('a3_latency.json'), L('a8_fire_transport.json'), L('a9_coordination.json')
    H = 3.05
    fig, ax = plt.subplots(figsize=(W2, H - 0.30)); ax.set_xlim(0, W2); ax.set_ylim(0.30, H); ax.axis('off')
    bw, gap, x0 = 1.20, 0.20, 0.06
    xs = [x0 + i * (bw + gap) for i in range(5)]
    top, bh = 2.62, 1.30                      # box top, box height
    heads = ['1  The fire', '2  Observe', '3  Collect', '4  Judge', '5  Warn']
    who = ['farmers and forests\nacross the region', 'PCD, GISTDA, NASA,\nNOAA, airports, CCTV', 'AirDash', 'AirDash', 'AirDash']
    nums = [f"{100*(1-a8['cell_days_inside_share']):.0f}% of fire cell-days\nin the mainland box,\n21 Oct to 3 Nov, were\noutside Thailand",
            f"{a1['stations_pm25']} PM2.5 stations in\n74 of 77 provinces;\nPM10 in only {a1['provinces_with_pm10_station']}",
            f"{a2['runs_total']:,} pulls from\n{a2['sources']} sources, {100*a2['success_overall']:.1f}%\nok; collector up\n{100*a2['collector_up_share']:.1f}% of 110 days",
            f"Air Watch Score\nfor 77 provinces,\nbanded at 15, 25,\n37.5 and 75 (24 h)",
            f"alert to Telegram:\nmedian {a3['alert_to_telegram']['median_min']*60:.0f} s,\np95 {a3['alert_to_telegram']['p95_min']:.0f} min;\n1 or 2 test chats"]
    # the border and the scope of what was built
    bx = xs[1] - gap / 2
    ax.add_patch(Rectangle((bx, 0.36), W2 - bx, top + 0.34 - 0.36, fc='#EAF1F3', ec='none', zorder=0))
    ax.plot([bx, bx], [0.36, top + 0.44], color=VERMIL, lw=0.9, ls=(0, (3, 2)), zorder=1)
    ax.text(bx - 0.04, top + 0.40, 'border', ha='right', va='top', fontsize=6.6, color=VERMIL, fontweight='medium')
    ax.text(bx + 0.05, top + 0.40, 'built and measured in this work', ha='left', va='top', fontsize=6.6, color=TEAL, fontweight='medium')
    for i, x in enumerate(xs):
        ax.add_patch(FancyBboxPatch((x, top - bh), bw, bh, boxstyle='round,pad=0,rounding_size=0.04', fc=PAPER, ec=INK, lw=0.55, zorder=3))
        ax.text(x + 0.08, top - 0.09, heads[i], fontsize=8.2, fontweight='semibold', va='top', zorder=4)
        ax.text(x + 0.08, top - 0.33, who[i], fontsize=6.4, color=(TEAL if i >= 2 else GREY), fontweight=('medium' if i >= 2 else 'normal'), va='top', linespacing=0.72, zorder=4)
        ax.text(x + 0.08, top - 0.68, nums[i], fontsize=6.6, va='top', linespacing=0.74, zorder=4)
        if i < 4:
            ax.add_patch(FancyArrowPatch((x + bw + 0.015, top - 0.2), (xs[i + 1] - 0.015, top - 0.2), arrowstyle='-|>', mutation_scale=6, lw=0.7, color=INK, zorder=5))
    # the clock: one PCD reading, hour on the stamp -> phone
    y0 = 0.62; bar = 0.19; xa = xs[1]; xb = W2 - 0.06; tot = a3['pm25_chain_total_min']['p95'] + 4
    sx = lambda m: xa + (xb - xa) * m / tot
    ax.text(xa, y0 + 0.50, 'One PM2.5 reading: from the hour on its stamp to Telegram (hops combined by simulation)', fontsize=6.9, fontweight='medium')
    m1 = a3['pcd_lag_min']['median']; m2 = a3['alert_to_telegram']['median_min']
    t50, t95 = a3['pm25_chain_total_min']['median'], a3['pm25_chain_total_min']['p95']
    ax.add_patch(Rectangle((sx(0), y0), sx(m1) - sx(0), bar, fc=BLUE, ec='none'))
    ax.add_patch(Rectangle((sx(m1), y0), 0.03, bar, fc=VERMIL, ec='none'))
    ax.text(sx(m1 / 2), y0 + bar / 2, f"{m1:.0f} min  PCD publishes, we poll", ha='center', va='center', fontsize=6.4, color='white', fontweight='medium')
    ax.annotate(f"{m2*60:.0f} s  alert handed to Telegram", xy=(sx(m1) + 0.015, y0 + bar * 0.5), xytext=(sx(m1) + 0.30, y0 + bar * 0.5), fontsize=6.4, color=VERMIL, va='center', arrowprops=dict(arrowstyle='-', lw=0.5, color=VERMIL, shrinkA=0, shrinkB=0))
    for t, lab, ha in ((t50, f'median {t50:.0f} min', 'right'), (t95, f'95% within {t95:.0f} min', 'right')):
        ax.plot([sx(t), sx(t)], [y0 - 0.06, y0 + bar + 0.05], color=INK, lw=0.7)
        ax.text(sx(t) - 0.04 if ha == 'right' else sx(t) + 0.04, y0 - 0.09, lab, ha=ha, va='top', fontsize=6.4, fontweight='medium')
    ax.text(x0 + 0.02, 1.08, f"Satellite fires reach us\n{a3['firms_lag_min']['median']/60:.1f} h after the pass\n(median), set largely by\nour own 6-hour polling.", fontsize=6.4, color=GREY, va='top', linespacing=0.74)
    save(fig, 'fig1_chain')

if __name__ == '__main__': build()
