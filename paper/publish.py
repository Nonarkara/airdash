#!/usr/bin/env python3
"""Publish the built preprint to the site: public/paper/{pdf, supplement zip, manifest.json}.

    python3 paper/build.py && python3 paper/publish.py

The manifest records page count, bytes and sha256 so scripts/test-preprint.mjs can prove the
files the web tab points at are the files that were built."""
import hashlib, json, os, re, subprocess, sys, zipfile, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PUB = os.path.join(ROOT, 'public', 'paper')
SLUG = 'nobody-owns-the-haze'
VERSION = 'v2'
os.makedirs(PUB, exist_ok=True)

pdf_src = os.path.join(os.environ.get('AIRDASH_PAPER_BUILD_DIR', os.path.join(HERE, 'build')), 'main.pdf')
pdf_dst = os.path.join(PUB, f'{SLUG}-{VERSION}.pdf')
info = subprocess.run(['pdfinfo', pdf_src], capture_output=True, text=True, check=True).stdout
pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M).group(1))
open(pdf_dst, 'wb').write(open(pdf_src, 'rb').read())

zip_dst = os.path.join(PUB, f'{SLUG}-{VERSION}-supplement.zip')
with zipfile.ZipFile(zip_dst, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('README.txt', f"""Corrected preprint {VERSION}, 4 November 2026. Not peer reviewed; all-author approval pending.
Rebuild PDF: extract this archive, then run python3 build.py (Python 3, pdflatex required).
Frozen JSON summaries, selected extracts, reference metadata, preamble and figure PDFs are included.
The provided figures allow PDF rebuilding without Matplotlib or the original fonts.
Figure regeneration additionally requires the repository public/fonts assets and Python plotting dependencies.
Full statistical extraction is NOT independently reproducible from this archive: scripts still need
unreleased live/archive databases and operational logs. Do not run analysis/run_all.py expecting a frozen replay.
Version 2 withdraws invalid daily alert rates and simulated delivery latency; see CORRECTIONS.md.
""")
    for sub, exts in (('data', ('.json', '.txt')), ('analysis', ('.py', '.mjs')), ('refs', ('.json', '.jsonl', '.py', '.md')), ('src', ('.tex', '.in')), ('figures', ('.pdf',))):
        for folder, dirs, files in os.walk(os.path.join(HERE, sub)):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('cr', '__pycache__')]
            for f in sorted(files):
                if f.endswith(exts) and not f.startswith('.'):
                    path = os.path.join(folder, f)
                    z.write(path, os.path.relpath(path, HERE))
    for f in ('build.py', 'publish.py', 'CORRECTIONS.md'):
        z.write(os.path.join(HERE, f), f)

sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
manifest = {'slug': SLUG, 'version': VERSION, 'date': '2026-11-04', 'status': 'corrected draft; all-author approval pending; not peer reviewed', 'pages': pages,
            'pdf': {'file': os.path.basename(pdf_dst), 'bytes': os.path.getsize(pdf_dst), 'sha256': sha(pdf_dst)},
            'supplement': {'file': os.path.basename(zip_dst), 'bytes': os.path.getsize(zip_dst), 'sha256': sha(zip_dst)}}
json.dump(manifest, open(os.path.join(PUB, 'manifest.json'), 'w'), indent=1)
print(json.dumps(manifest, indent=1))
