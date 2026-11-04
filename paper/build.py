#!/usr/bin/env python3
"""Build the preprint PDF.

    python3 paper/build.py            # render src/main.tex.in -> build/main.tex -> PDF
    python3 paper/build.py --no-pdf   # only render the .tex

Every number in the text is written as {{a4.leads.0.raw.mae|f2}} and filled from
paper/data/*.json at build time; a missing path stops the build, so a figure in
the prose cannot drift from the analysis. Citations are \\citep{key} against
refs.json; the bibliography is numbered in order of first citation."""
import json, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA, SRC = (os.path.join(HERE, d) for d in ('data', 'src'))
BUILD = os.environ.get('AIRDASH_PAPER_BUILD_DIR', os.path.join(HERE, 'build'))

def load_data():
    d = {}
    for f in os.listdir(DATA):
        if f.endswith('.json'):
            d[f[:-5]] = json.load(open(os.path.join(DATA, f)))
    # short aliases (explicit: a1 also has a province-day side file)
    for short, full in (('a1', 'a1_network'), ('a2', 'a2_reliability'), ('a3', 'a3_latency'), ('a4', 'a4_forecast'), ('a5', 'a5_cameras'),
                        ('a6', 'a6_visibility'), ('a7', 'a7_burnscars'), ('a8', 'a8_fire_transport'), ('a9', 'a9_coordination'), ('a10', 'a10_alerts_enso_system')):
        d[short] = d[full]
    return d

def esc(s):
    return s.replace('%', '\\%').replace('&', '\\&').replace('#', '\\#').replace('_', '\\_')

def thousands(n):
    return f'{int(round(n)):,}'

def fmt(value, how):
    if value is None or isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Missing or non-finite manuscript value')
    if how == 'len': return str(len(value))
    neg = isinstance(value, (int, float)) and value < 0
    v = abs(value) if isinstance(value, (int, float)) else value
    sign = '$-$' if neg else ''
    if how in (None, '', 'raw'): return esc(str(value))
    if how == 'int': return sign + thousands(v)
    if how.startswith('f') and how[1:].isdigit(): return sign + f'{v:.{int(how[1:])}f}'
    if how.startswith('pct') and how[3:].isdigit(): return sign + f'{100 * v:.{int(how[3:])}f}\\%'
    if how.startswith('sf') and how[2:].isdigit(): return ('$+$' if not neg else '$-$') + f'{v:.{int(how[2:])}f}'   # signed
    if how.startswith('p') and how[1:].isdigit(): return sign + f'{100 * v:.{int(how[1:])}f}'              # percent, no sign char
    if how == 'min2s': return sign + f'{v * 60:.0f}'
    if how == 'min2h': return sign + f'{v / 60:.1f}'
    raise SystemExit(f'unknown format {how!r}')

def lookup(D, path):
    """Walk a dotted path. Keys may themselves contain dots (e.g. '37.5'), so at each
    step try the shortest key that exists, joining following parts when needed."""
    parts = re.findall(r"[^.\[\]]+", path)
    cur, i = D, 0
    while i < len(parts):
        if isinstance(cur, list):
            cur = cur[int(parts[i])]; i += 1; continue
        for j in range(i, len(parts)):
            key = '.'.join(parts[i:j + 1])
            if isinstance(cur, dict) and key in cur:
                cur = cur[key]; i = j + 1; break
        else:
            raise SystemExit(f'build: no such data path: {path} (stopped at {parts[i]!r})')
    return cur

TOKEN = re.compile(r'\{\{\s*([^}|]+?)\s*(?:\|\s*(\w+)\s*)?\}\}')
RANGE = re.compile(r'\{\{\s*([^}|]+?)\s*\.\.\s*([^}|]+?)\s*\|\s*(\w+)\s*\}\}')   # {{path.ci0 .. path.ci1 | pct1}}

def render(text, D):
    text = RANGE.sub(lambda m: fmt(lookup(D, m.group(1)), m.group(3)) + '--' + fmt(lookup(D, m.group(2)), m.group(3)), text)
    return TOKEN.sub(lambda m: fmt(lookup(D, m.group(1)), m.group(2)), text)

def bibliography(tex, refs, ledger=None):
    keys = []
    for m in re.finditer(r'\\cite[pt]?\*?(?:\[[^\]]*\])?\{([^}]+)\}', tex):
        for k in (x.strip() for x in m.group(1).split(',')):
            if k not in keys: keys.append(k)
    missing = [k for k in keys if k not in refs]
    if missing: raise SystemExit(f'build: cited but not in refs.json: {missing}')
    if ledger is not None:
        unchecked = [k for k in keys if not ledger.get(k, {}).get('verified')]
        if unchecked: raise SystemExit(f'build: cited references lack ledger verification: {unchecked}')
    items = []
    for k in keys:
        r = refs[k]; items.append(f"\\bibitem{{{k}}} {format_ref(r)}")
    unused = sorted(set(refs) - set(keys))
    return '\\begin{thebibliography}{%d}\n%s\n\\end{thebibliography}\n' % (len(keys), '\n'.join(items)), keys, unused

def names(auth):
    """['Family, A. B.', ...] -> 'Family A B, ...' (Vancouver-style initials, no stops)"""
    out = []
    for a in auth:
        if ',' in a:
            fam, ini = [x.strip() for x in a.split(',', 1)]
            out.append(f"{esc(fam)} {esc(ini.replace('.', '').replace(' ', ''))}")
        else:
            out.append(esc(a))
    if len(out) > 6: out = out[:6] + ['et al.']
    return ', '.join(out)

def format_ref(r):
    a = names(r.get('authors', []))
    year = r.get('year', 'n.d.'); title = esc(r['title'].rstrip('.'))
    cont = esc(r.get('container', '')); vol = r.get('volume'); iss = r.get('issue'); pg = r.get('pages')
    tail = ''
    if r.get('type') in ('article',) or (cont and vol):
        tail = f"\\emph{{{cont}}}" + (f" \\textbf{{{esc(str(vol))}}}" if vol else '') + (f"({esc(str(iss))})" if iss else '') + (f", {esc(str(pg)).replace('--', '--')}" if pg else '')
    elif cont:
        tail = f"{cont}"
    doi = r.get('doi'); url = r.get('url')
    link = f" \\href{{https://doi.org/{doi}}}{{doi:{esc(doi)}}}" if doi else (f" \\url{{{url}}}" if url else '')
    acc = f" (accessed {esc(r['accessed'])})" if r.get('accessed') and not doi else ''
    return f"{a} ({year}) {title}. {tail}{'.' if tail else ''}{link}{acc}".replace(' .', '.').replace('..', '.')

def census_table(D):
    rows = []
    for r in D['census']['rows']:
        rows.append(' & '.join([esc(r['stream']), esc(r['owner']), esc(r['interface']), esc(r['interval']), thousands(r['pulls']), f"{100 * r['success']:.1f}\\%"]) + ' \\\\')
    return '\n'.join(rows)

def main():
    pdf = '--no-pdf' not in sys.argv
    D = load_data()
    refs = json.load(open(os.path.join(HERE, 'refs', 'refs.json'))) if os.path.exists(os.path.join(HERE, 'refs', 'refs.json')) else {}
    src = open(os.path.join(SRC, 'main.tex.in')).read()
    tex = render(src, D).replace('%%TABLE_CENSUS%%', census_table(D))
    ledger = {r['key']: r for r in (json.loads(line) for line in open(os.path.join(HERE, 'refs', 'entries.jsonl')) if line.strip())}
    biblio, keys, unused = bibliography(tex, refs, ledger)
    tex = tex.replace('%%BIBLIOGRAPHY%%', biblio)
    os.makedirs(BUILD, exist_ok=True)
    for f in os.listdir(os.path.join(HERE, 'figures')):
        if f.endswith('.pdf'): shutil.copy(os.path.join(HERE, 'figures', f), os.path.join(BUILD, f))
    shutil.copy(os.path.join(SRC, 'preamble.tex'), os.path.join(BUILD, 'preamble.tex'))
    open(os.path.join(BUILD, 'main.tex'), 'w').write(tex)
    print(f'rendered main.tex: {len(tex):,} chars, {len(keys)} references cited' + (f', {len(unused)} in refs.json unused' if unused else ''))
    if not pdf: return
    for i in range(3):
        r = subprocess.run(['pdflatex', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], cwd=BUILD, capture_output=True, text=True, errors='replace')
        if r.returncode != 0:
            print(r.stdout[-2500:]); raise SystemExit('pdflatex failed')
    log = open(os.path.join(BUILD, 'main.log'), errors='ignore').read()
    print('pages:', re.search(r'Output written on main.pdf \((\d+) page', log).group(1),
          '| overfull boxes:', len(re.findall(r'Overfull', log)), '| underfull:', len(re.findall(r'Underfull', log)),
          '| undefined refs:', len(re.findall(r'undefined', log)))

if __name__ == '__main__':
    main()
