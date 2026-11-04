"""Shared figure style: journal-sized, restrained, colour-blind-safe."""
import os, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

FONTS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'fonts')
for f in ('region-face-0-c3143e923e.ttf', 'region-face-1-d6ff7726ec.ttf', 'region-face-2-a63c8d7560.ttf', 'region-face-3-3e49280c15.ttf'):
    fm.fontManager.addfont(os.path.join(FONTS, f))          # Jost 400/500/600/700 (OFL)

INK, GREY, LIGHT, PAPER = '#1B1F23', '#6B7280', '#D5D8DC', '#FFFFFF'
TEAL, ORANGE, BLUE, VERMIL, GREEN, SKY, PURPLE = '#0E4A5E', '#E69F00', '#0072B2', '#D55E00', '#009E73', '#56B4E9', '#CC79A7'
W2, W1 = 6.93, 3.33   # inches: full text width, one column (A4, 17 mm margins, 7 mm gutter)

plt.rcParams.update({
    'font.family': 'Jost', 'font.size': 7.2, 'axes.labelsize': 7.2, 'axes.titlesize': 7.6, 'axes.titleweight': 'medium',
    'xtick.labelsize': 6.6, 'ytick.labelsize': 6.6, 'legend.fontsize': 6.6, 'legend.frameon': False,
    'axes.linewidth': 0.5, 'xtick.major.width': 0.5, 'ytick.major.width': 0.5, 'xtick.major.size': 2.4, 'ytick.major.size': 2.4,
    'xtick.color': INK, 'ytick.color': INK, 'axes.edgecolor': INK, 'axes.labelcolor': INK, 'text.color': INK,
    'axes.spines.top': False, 'axes.spines.right': False, 'axes.grid': False, 'lines.linewidth': 1.0,
    'mathtext.fontset': 'dejavusans', 'mathtext.default': 'regular',
    'figure.dpi': 150, 'savefig.dpi': 300, 'pdf.fonttype': 42, 'ps.fonttype': 42, 'savefig.bbox': 'tight', 'savefig.pad_inches': 0.02,
})

def panel(ax, letter, dx=-0.02, dy=1.02):
    """Bold lowercase panel letter at the top-left of an axes."""
    ax.text(dx, dy, letter, transform=ax.transAxes, fontsize=9, fontweight='bold', va='bottom', ha='right')

def save(fig, name):
    out = os.path.join(os.path.dirname(__file__), '..', 'figures'); os.makedirs(out, exist_ok=True)
    fig.savefig(os.path.join(out, name + '.pdf')); fig.savefig(os.path.join(out, name + '.png'), dpi=200)
    plt.close(fig)
