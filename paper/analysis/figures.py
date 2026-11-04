"""Build every figure: python3 paper/analysis/figures.py   (needs matplotlib; run run_all.py first)"""
import importlib
for m in ('fig1_chain', 'fig2_coordination', 'fig3_season', 'fig4_reliability', 'fig5_geography', 'fig6_forecast', 'fig7_optical'):
    importlib.import_module(m).build(); print('built', m, flush=True)
