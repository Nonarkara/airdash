"""Figure 4 — does it stay up, and how long is the wait? Reliability and the three clocks."""
import json, os, datetime as dt
import numpy as np
from figstyle import *
D = os.path.join(os.path.dirname(__file__), '..', 'data')
L = lambda n: json.load(open(os.path.join(D, n)))

def ecdf_panel(ax, xs, qs, color, unit_label, med, p95, xlim, fmt):
    ax.step(xs, qs, where='post', color=color, lw=1.1)
    for v, lab, y in ((med, 'median', 0.5), (p95, '95%', 0.95)):
        ax.plot([v, v], [0, y], color=color, lw=0.5, ls=(0, (2, 1.5))); ax.plot([xlim[0], v], [y, y], color=color, lw=0.5, ls=(0, (2, 1.5)))
        ax.text(v, y - 0.04, f'{lab}: {fmt(v)}', ha='left', va='top', fontsize=6.3, color=color, fontweight='medium', bbox=dict(fc='white', ec='none', pad=0.6))
    ax.set_ylim(0, 1.02); ax.set_xlabel(unit_label); ax.set_yticks([0, .25, .5, .75, 1]); ax.set_yticklabels(['0', '', '50%', '', '100%'])

def build():
    a2, a3 = L('a2_reliability.json'), L('a3_latency.json')
    fig = plt.figure(figsize=(W2, 3.05))
    gs = fig.add_gridspec(2, 3, height_ratios=[1.0, 1.25], hspace=0.62, wspace=0.28)
    ax = fig.add_subplot(gs[0, :]); panel(ax, 'a', dx=-0.045, dy=0.95)
    d0 = dt.date(2026, 7, 17); days = [d0 + dt.timedelta(days=i) for i in range(110)]
    f = a2['pm25_feed_fresh_share_by_day']; y = np.array([f.get(d.isoformat(), np.nan) for d in days])
    ax.bar(range(110), y * 24, color=[BLUE if v >= 0.9 else VERMIL for v in y], width=0.85, lw=0)
    ax.set_xlim(-0.5, 109.5); ax.set_ylim(0, 24); ax.set_yticks([0, 12, 24]); ax.set_ylabel('hours of the day\nwith fresh PM2.5', fontsize=6.4, linespacing=0.75)
    for k, g in enumerate(a2['collector_gaps_gt6h'], 1):
        s = dt.datetime.fromisoformat(g['start']).replace(tzinfo=None) + dt.timedelta(hours=7)
        x = (s - dt.datetime.combine(d0, dt.time())).total_seconds() / 86400
        ax.text(x, 24.6, str(k), ha='center', va='bottom', fontsize=6.4, color=BLUE, fontweight='semibold')
    ticks = [dt.date(2026, 8, 1), dt.date(2026, 9, 1), dt.date(2026, 10, 1), dt.date(2026, 11, 1)]
    ax.set_xticks([(t - d0).days for t in ticks]); ax.set_xticklabels([t.strftime('%-d %b') for t in ticks])
    ax.text(109.5, 27.5, f"fresh = newest successful pull no older than 2 h · {100*a2['pm25_feed_fresh_share_2h']:.1f}% of the time · numbers = outages over 6 h", ha='right', va='bottom', fontsize=6.2, color=GREY)
    # latency ECDFs
    q = np.array(a3['pcd_lag_ecdf']); ax1 = fig.add_subplot(gs[1, 0]); panel(ax1, 'b', dx=-0.16, dy=1.04)
    ecdf_panel(ax1, q[:, 1], q[:, 0], BLUE, 'minutes from the hour on the stamp\nto first seen by us', a3['pcd_lag_min']['median'], a3['pcd_lag_min']['p95'], (0, 75), lambda v: f'{v:.0f} min')
    ax1.set_xlim(0, 75); ax1.set_title('PCD hourly reading', fontsize=6.8, loc='left', pad=3)
    dl = np.sort(np.array(a3['alert_to_telegram_delays'])); ax2 = fig.add_subplot(gs[1, 1]); panel(ax2, 'c', dx=-0.16, dy=1.04)
    dl = np.clip(dl, 0.01, None); qs = np.arange(1, len(dl) + 1) / len(dl)
    ecdf_panel(ax2, dl, qs, VERMIL, 'minutes from alert to Telegram batch', a3['alert_to_telegram']['median_min'], a3['alert_to_telegram']['p95_min'], (0.01, 40), lambda v: f'{v*60:.0f} s' if v < 1 else f'{v:.0f} min')
    ax2.set_xscale('log'); ax2.set_xlim(0.01, 40); ax2.set_xticks([0.02, 0.1, 1, 10]); ax2.set_xticklabels(['1 s', '6 s', '1 min', '10 min']); ax2.set_title('alert, then push', fontsize=6.8, loc='left', pad=3)
    ax2.set_yticklabels([])
    fq = np.array(a3['firms_lag_ecdf']); ax3 = fig.add_subplot(gs[1, 2]); panel(ax3, 'd', dx=-0.16, dy=1.04)
    ecdf_panel(ax3, fq[:, 1] / 60, fq[:, 0], PURPLE, 'hours from satellite pass to first seen', a3['firms_lag_min']['median'] / 60, a3['firms_lag_min']['p95'] / 60, (0, 30), lambda v: f'{v:.1f} h')
    ax3.set_xlim(0, 30); ax3.set_title('VIIRS fire detection', fontsize=6.8, loc='left', pad=3); ax3.set_yticklabels([])
    save(fig, 'fig4_reliability')

if __name__ == '__main__': build()
