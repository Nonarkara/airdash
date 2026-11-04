"""Run every analysis in order, at the frozen data cutoff, and write paper/data/*.json.

    python3 paper/analysis/run_all.py

Reads data/airdash.db and the long-term archive READ-ONLY. Takes a few minutes
(the archive sits on a spinning USB disk). Needs only the Python standard
library; figures (paper/analysis/figures.py) additionally need matplotlib."""
import subprocess, sys, time, os
here = os.path.dirname(os.path.abspath(__file__))
steps = [
    ('catalog', ['node', os.path.join(here, 'dump_catalog.mjs')]),
    ('a1 network', [sys.executable, os.path.join(here, 'a1_network.py')]),
    ('a2 reliability', [sys.executable, os.path.join(here, 'a2_reliability.py')]),
    ('a3 latency', [sys.executable, os.path.join(here, 'a3_latency.py')]),
    ('a4 forecast', [sys.executable, os.path.join(here, 'a4_forecast.py')]),
    ('a5 cameras', [sys.executable, os.path.join(here, 'a5_cameras.py')]),
    ('a6 visibility', [sys.executable, os.path.join(here, 'a6_visibility.py')]),
    ('a7 burn scars', [sys.executable, os.path.join(here, 'a7_burnscars.py')]),
    ('a8 fire transport', [sys.executable, os.path.join(here, 'a8_fire_transport.py')]),
    ('a9 coordination', [sys.executable, os.path.join(here, 'a9_coordination.py')]),
    ('a10 alerts/enso/system', [sys.executable, os.path.join(here, 'a10_alerts_enso_system.py')]),
    ('census table', [sys.executable, os.path.join(here, 'census.py')]),
    ('derived values', [sys.executable, os.path.join(here, 'derived.py')]),
]
for name, cmd in steps:
    t0 = time.time()
    r = subprocess.run(cmd, cwd=here, capture_output=True, text=True)
    print(f'{name:26} {"ok " if r.returncode == 0 else "FAIL"} {time.time() - t0:6.1f}s', flush=True)
    if r.returncode != 0:
        print(r.stderr[-1500:]); sys.exit(1)
