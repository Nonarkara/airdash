#!/usr/bin/env python3
"""Publish the built preprint to the site: public/paper/{pdf, supplement zip, manifest.json}.

    python3 paper/build.py && python3 paper/publish.py

The manifest records page count, bytes and sha256 so scripts/test-preprint.mjs can prove the
files the web tab points at are the files that were built."""
import hashlib, json, os, re, subprocess, sys, zipfile, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PUB = os.path.join(ROOT, 'public', 'paper')
SLUG = 'nobody-owns-the-haze'
VERSION = 'v1'
os.makedirs(PUB, exist_ok=True)

pdf_src = os.path.join(HERE, 'build', 'main.pdf')
pdf_dst = os.path.join(PUB, f'{SLUG}-{VERSION}.pdf')
info = subprocess.run(['pdfinfo', pdf_src], capture_output=True, text=True, check=True).stdout
pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M).group(1))
open(pdf_dst, 'wb').write(open(pdf_src, 'rb').read())

zip_dst = os.path.join(PUB, f'{SLUG}-{VERSION}-supplement.zip')
with zipfile.ZipFile(zip_dst, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('README.txt', f"""Supplement to 'Nobody owns the haze' ({VERSION}, 4 November 2026).
data/*.json      every number and figure input in the paper (frozen 2026-11-04 00:00 Bangkok time)
analysis/*.py    the scripts that produce data/ from the AirDash database and archive
refs/refs.json   the verified reference list; refs/entries.jsonl records what each source says
Rebuild: python3 paper/build.py   (https://github.com/Nonarkara/airdash, folder paper/)
""")
    for sub, exts in (('data', ('.json',)), ('analysis', ('.py', '.mjs')), ('refs', ('.json', '.jsonl', '.py', '.md'))):
        d = os.path.join(HERE, sub)
        for f in sorted(os.listdir(d)):
            if f.endswith(exts) and not f.startswith('.'): z.write(os.path.join(d, f), f'{sub}/{f}')
    z.write(os.path.join(HERE, 'build.py'), 'build.py')
    z.write(os.path.join(HERE, 'src', 'main.tex.in'), 'src/main.tex.in')

sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
manifest = {'slug': SLUG, 'version': VERSION, 'date': '2026-11-04', 'pages': pages,
            'pdf': {'file': os.path.basename(pdf_dst), 'bytes': os.path.getsize(pdf_dst), 'sha256': sha(pdf_dst)},
            'supplement': {'file': os.path.basename(zip_dst), 'bytes': os.path.getsize(zip_dst), 'sha256': sha(zip_dst)}}
json.dump(manifest, open(os.path.join(PUB, 'manifest.json'), 'w'), indent=1)
print(json.dumps(manifest, indent=1))
