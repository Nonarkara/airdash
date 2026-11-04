"""Merge the verified reference ledger (entries.jsonl) with Crossref records into refs.json.

entries.jsonl: one verified entry per line (key, type, doi|url, 'supports' = what the source says).
Crossref JSON (cr/<doi with / -> _>.json) fills authors/title/journal/volume/pages for DOI entries.
Nothing is invented: an entry without a title after the merge is dropped and reported."""
import json, os, sys, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else HERE
out, dropped = {}, []
for line in open(os.path.join(SRC, 'entries.jsonl')):
    e = json.loads(line)
    if not e.get('verified'): dropped.append((e['key'], 'unverified')); continue
    doi = e.get('doi')
    if doi and not e.get('title'):
        p = os.path.join(SRC, 'cr', doi.replace('/', '_').lower() + '.json')
        p2 = os.path.join(SRC, 'cr', doi.replace('/', '_') + '.json')
        p = p if os.path.exists(p) else p2
        if not os.path.exists(p):   # not in the agent's cache: ask Crossref directly (public, read-only)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            req = urllib.request.Request('https://api.crossref.org/works/' + urllib.parse.quote(doi), headers={'User-Agent': 'AirDash-paper/1.0 (mailto:nonsmartcity@gmail.com)'})
            try: open(p, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
            except Exception as ex: dropped.append((e['key'], f'crossref fetch failed: {ex}')); continue
        if os.path.exists(p):
            m = json.load(open(p))['message']
            e['title'] = ' '.join((m.get('title') or [''])[0].split())
            ini = lambda g: ' '.join(p[0] + '.' for p in g.replace('-', ' ').replace('.', ' ').split() if p)
            e['authors'] = [f"{a['family']}, {ini(a.get('given', ''))}".strip(', ') if 'family' in a else a.get('name', '') for a in m.get('author', [])] or e.get('authors')
            e['year'] = (m.get('issued', {}).get('date-parts') or [[None]])[0][0]
            e['container'] = (m.get('container-title') or [''])[0]
            e['volume'] = m.get('volume'); e['issue'] = m.get('issue')
            e['pages'] = m.get('page') or m.get('article-number')
    if not e.get('title') or not e.get('authors'):
        dropped.append((e['key'], 'incomplete')); continue
    def fix_author(a):
        a = a.replace(' (ed.)', '')
        if ',' in a or ' ' not in a or a.endswith('et al.'): return a
        parts = a.split(); fam = parts[-1]
        if len(parts) > 3: return a            # an organisation name, leave as written
        return fam + ', ' + ' '.join(p[0] + '.' for p in parts[:-1])
    if e.get('doi'): e['authors'] = [fix_author(a) for a in e['authors']]
    else: e['authors'] = [a.replace(' (ed.)', '') for a in e['authors']]
    if e['key'] == 'tamroypao': e['authors'] = ['Tam Roy Pao project (site hosted by the Hydro-Informatics Institute)']
    if e['key'] == 'tan2005athp': e.pop('pages', None)   # pages came from a search snippet, not the journal record
    if len(e['authors']) > 6: e['authors'] = e['authors'][:6] + ['et al.']
    out[e['key']] = {k: e[k] for k in ('type', 'authors', 'year', 'title', 'container', 'volume', 'issue', 'pages', 'doi', 'url', 'accessed', 'supports') if e.get(k) not in (None, '')}
import re
def clean(v):
    if isinstance(v, str):
        v = re.sub(r'[\u0E00-\u0E7F]+', '', v); v = re.sub(r'\(\s*\)', '', v); return ' '.join(v.split())
    return [clean(x) for x in v] if isinstance(v, list) else v
out = {k: {f: clean(x) for f, x in r.items()} for k, r in out.items()}
json.dump(out, open(os.path.join(HERE, 'refs.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'references written;', 'dropped:', dropped)
