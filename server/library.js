// The Flood Library — boot-time ingest of the bible (corpus/bible/secNN.{en,th}.md)
// and knowledge notes (knowledge/*.md) into searchable, pre-rendered HTML chunks.
// Mirrors knowledge.js's hash-guarded, idempotent ingest pattern but renders
// markdown to safe HTML and serves TOC/doc/search reads for the frontend.
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Bump when renderMarkdown changes so ingest re-renders unchanged content.
const RENDER_VERSION = 'r2'
import { join } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'

const TABLES = `
CREATE TABLE IF NOT EXISTS library_docs (
  key        TEXT NOT NULL,
  lang       TEXT NOT NULL,
  section    TEXT NOT NULL,
  ord        INTEGER NOT NULL,
  title_th   TEXT,
  title_en   TEXT,
  html       TEXT NOT NULL,
  plain      TEXT NOT NULL,
  content_hash TEXT,
  PRIMARY KEY (key, lang)
);
CREATE INDEX IF NOT EXISTS idx_library_section ON library_docs(section, ord);

CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
  key UNINDEXED, lang UNINDEXED, title, plain, tokenize='trigram'
);
`

const BIBLE_SECTIONS = Array.from({ length: 11 }, (_, i) => String(i).padStart(2, '0'))

// ---------- markdown -> safe HTML ----------

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripFootnotes(s) {
  return s.replace(/\[\^\d+\^?\]/g, '')
}

/** Inline markdown: bold, italic, code, links. Operates on already-escaped text. */
function renderInline(text) {
  let out = stripFootnotes(text)
  // Inline LaTeX $...$ → styled equation span. Only when the content looks like
  // math (contains \ ^ _ { }) so currency amounts ("$45/month") are untouched.
  out = out.replace(/\$([^$\n]*[\\^_{}][^$\n]*)\$/g, '<code class="eq-inline">$1</code>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
    const safe = /^(https?:|mailto:)/i.test(url) || url.startsWith('/') || url.startsWith('#')
    return safe ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : `${label} (${url})`
  })
  return out
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** Render one markdown chunk (already HTML-escaped) to HTML. Returns { html, plain }. */
function renderMarkdown(escaped) {
  const lines = escaped.split('\n')
  const html = []
  const plainParts = []
  let i = 0

  const flushParagraph = (buf) => {
    if (!buf.length) return
    const text = buf.join(' ').trim()
    if (!text) return
    html.push(`<p>${renderInline(text)}</p>`)
    plainParts.push(stripFootnotes(text))
  }

  while (i < lines.length) {
    const line = lines[i]

    // Display equation $$...$$ → styled block (no math engine; honest monospace).
    if (line.trim().startsWith('$$')) {
      const eq = []
      let cur = line.trim()
      if (cur.length > 2 && cur.endsWith('$$')) {
        eq.push(cur.slice(2, -2).trim())
        i += 1
      } else {
        eq.push(cur.replace(/^\$\$/, '').trim())
        i += 1
        while (i < lines.length && !lines[i].trim().endsWith('$$')) { eq.push(lines[i]); i += 1 }
        if (i < lines.length) { eq.push(lines[i].trim().replace(/\$\$$/, '').trim()); i += 1 }
      }
      const body = eq.filter(Boolean).join('\n')
      html.push(`<div class="eq"><code>${body}</code></div>`)
      plainParts.push(body)
      continue
    }

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const code = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i += 1 }
      i += 1 // skip closing fence
      html.push(`<pre><code>${code.join('\n')}</code></pre>`)
      plainParts.push(code.join(' '))
      continue
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const text = stripFootnotes(heading[2]).trim()
      html.push(`<h${level}>${renderInline(text)}</h${level}>`)
      plainParts.push(text)
      i += 1
      continue
    }

    // Table: header row + separator row
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(line)
      i += 2
      const bodyRows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitTableRow(lines[i]))
        i += 1
      }
      const thead = headerCells.map((c) => `<th>${renderInline(c)}</th>`).join('')
      const tbody = bodyRows
        .map((row) => `<tr>${row.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('')
      html.push(`<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`)
      plainParts.push([headerCells.join(' '), ...bodyRows.map((r) => r.join(' '))].join(' '))
      continue
    }

    // Lists (unordered or ordered)
    const isUl = /^\s*[-*]\s+/.test(line)
    const isOl = /^\s*\d+\.\s+/.test(line)
    if (isUl || isOl) {
      const items = []
      while (i < lines.length && (isUl ? /^\s*[-*]\s+/.test(lines[i]) : /^\s*\d+\.\s+/.test(lines[i]))) {
        const item = lines[i].replace(isUl ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/, '').trim()
        items.push(item)
        i += 1
      }
      const tag = isUl ? 'ul' : 'ol'
      html.push(`<${tag}>${items.map((it) => `<li>${renderInline(it)}</li>`).join('')}</${tag}>`)
      plainParts.push(items.map(stripFootnotes).join(' '))
      continue
    }

    // Blank line
    if (line.trim() === '') { i += 1; continue }

    // Paragraph: accumulate consecutive plain lines
    const buf = []
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i])
      && !/^```/.test(lines[i].trim()) && !lines[i].trim().startsWith('$$')
      && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
      buf.push(lines[i])
      i += 1
    }
    flushParagraph(buf)
  }

  const plain = plainParts.join(' ').replace(/\s+/g, ' ').trim()
  return { html: html.join('\n'), plain }
}

/** Render a raw (unescaped) markdown chunk to { html, plain }. */
function renderChunk(rawMarkdown) {
  return renderMarkdown(escapeHtml(rawMarkdown))
}

// ---------- chunking (mirrors knowledge.js) ----------

function chunkMarkdown(text) {
  const sections = text.split(/\n(?=## )/)
  return sections
    .map((body, i) => ({ ord: i, raw: body.trim(), heading: body.match(/^#{1,2} (.+)$/m)?.[1]?.trim() ?? null }))
    // ord 0 carries the section's `# ` title — keep it even when it is only the
    // title line (e.g. bible/sec00), or the section vanishes from the TOC.
    .filter((c) => c.ord === 0 ? c.raw.length > 0 : c.raw.length > 40)
}

// ---------- FTS sync ----------

function writeFts(db, { key, lang, title, plain }) {
  db.run('DELETE FROM library_fts WHERE key = ? AND lang = ?', key, lang)
  db.run('INSERT INTO library_fts (key, lang, title, plain) VALUES (?,?,?,?)', key, lang, title ?? '', plain)
}

function upsertDoc(db, row) {
  const existing = db.get('SELECT content_hash FROM library_docs WHERE key = ? AND lang = ?', row.key, row.lang)
  if (existing?.content_hash === row.content_hash) return false

  db.run(
    `INSERT INTO library_docs (key, lang, section, ord, title_th, title_en, html, plain, content_hash)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(key, lang) DO UPDATE SET
       section=excluded.section, ord=excluded.ord,
       title_th=excluded.title_th, title_en=excluded.title_en,
       html=excluded.html, plain=excluded.plain, content_hash=excluded.content_hash`,
    row.key, row.lang, row.section, row.ord, row.title_th ?? null, row.title_en ?? null,
    row.html, row.plain, row.content_hash,
  )
  writeFts(db, { key: row.key, lang: row.lang, title: row.title_th ?? row.title_en, plain: row.plain })
  return true
}

// ---------- ingest: bible ----------

async function ingestBible(db) {
  let ingested = 0
  for (const nn of BIBLE_SECTIONS) {
    for (const lang of ['en', 'th']) {
      const path = join(CONFIG.root, 'corpus', 'bible', `sec${nn}.${lang}.md`)
      let text
      try { text = await readFile(path, 'utf8') } catch { continue }

      const section = `bible/sec${nn}`
      for (const chunk of chunkMarkdown(text)) {
        const key = `${section}#${chunk.ord}`
        const hash = createHash('sha256').update(RENDER_VERSION + chunk.raw).digest('hex')
        const { html, plain } = renderChunk(chunk.raw)
        const row = {
          key, lang, section, ord: chunk.ord,
          title_th: lang === 'th' ? chunk.heading : null,
          title_en: lang === 'en' ? chunk.heading : null,
          html, plain, content_hash: hash,
        }
        if (upsertDoc(db, row)) ingested += 1
      }
    }
  }
  return ingested
}

// ---------- ingest: knowledge ----------

function splitBilingualTitle(heading) {
  if (!heading) return { th: null, en: null }
  const parts = heading.split('/').map((s) => s.trim())
  if (parts.length >= 2) return { th: parts[0], en: parts.slice(1).join('/').trim() }
  return { th: heading, en: heading }
}

async function ingestKnowledge(db) {
  let ingested = 0
  let files = []
  try {
    files = (await readdir(CONFIG.knowledgeDir)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  } catch {
    return 0
  }

  for (const file of files) {
    const text = await readFile(join(CONFIG.knowledgeDir, file), 'utf8')
    const section = `knowledge/${file.replace(/\.md$/, '')}`
    for (const chunk of chunkMarkdown(text)) {
      const key = `${section}#${chunk.ord}`
      const hash = createHash('sha256').update(RENDER_VERSION + chunk.raw).digest('hex')
      const { html, plain } = renderChunk(chunk.raw)
      const { th, en } = splitBilingualTitle(chunk.heading)
      const row = {
        key, lang: 'both', section, ord: chunk.ord,
        title_th: th, title_en: en,
        html, plain, content_hash: hash,
      }
      if (upsertDoc(db, row)) ingested += 1
    }
  }
  return ingested
}

// ---------- public: ingest ----------

export async function ingestLibrary(db) {
  db.exec(TABLES)
  const bibleCount = await ingestBible(db)
  const knowledgeCount = await ingestKnowledge(db)
  const ingested = bibleCount + knowledgeCount
  const docs = db.get('SELECT COUNT(*) AS n FROM library_docs').n
  if (ingested > 0) log('info', 'library ingested', { ingested, docs })
  return { ingested, docs }
}

// ---------- public: TOC ----------

function sectionSortKey(section) {
  const bibleMatch = section.match(/^bible\/sec(\d+)$/)
  if (bibleMatch) return [0, Number(bibleMatch[1]), section]
  return [1, 0, section]
}

export function libraryToc(db, lang) {
  const rows = db.all(
    `SELECT section, MIN(ord) AS min_ord, COUNT(*) AS n,
            MAX(title_th) AS title_th, MAX(title_en) AS title_en
     FROM library_docs
     WHERE ord = 0
     GROUP BY section`,
  )
  // ord=0 rows may be split across lang variants (en/th) for bible sections;
  // re-aggregate title_th/title_en per section from all lang rows at ord 0.
  const zeroRows = db.all(`SELECT section, lang, title_th, title_en FROM library_docs WHERE ord = 0`)
  const titleBySection = new Map()
  for (const r of zeroRows) {
    const cur = titleBySection.get(r.section) ?? { title_th: null, title_en: null }
    titleBySection.set(r.section, {
      title_th: cur.title_th ?? r.title_th,
      title_en: cur.title_en ?? r.title_en,
    })
  }
  const countBySection = db.all(`SELECT section, COUNT(DISTINCT ord) AS n FROM library_docs GROUP BY section`)
  const nBySection = new Map(countBySection.map((r) => [r.section, r.n]))

  const sections = rows
    .map((r) => {
      const t = titleBySection.get(r.section) ?? {}
      return {
        section: r.section,
        title_th: t.title_th ?? null,
        title_en: t.title_en ?? null,
        n: nBySection.get(r.section) ?? r.n,
      }
    })
    .sort((a, b) => {
      const ka = sectionSortKey(a.section)
      const kb = sectionSortKey(b.section)
      if (ka[0] !== kb[0]) return ka[0] - kb[0]
      if (ka[1] !== kb[1]) return ka[1] - kb[1]
      return ka[2].localeCompare(kb[2])
    })

  return { sections }
}

// ---------- public: doc ----------

function tocOrder(db) {
  return libraryToc(db, 'th').sections.map((s) => s.section)
}

export function libraryDoc(db, { key, lang }) {
  const order = tocOrder(db)
  if (!order.includes(key)) return null

  const preferred = db.all(
    `SELECT * FROM library_docs WHERE section = ? AND lang = ? ORDER BY ord`, key, lang)
  const both = db.all(
    `SELECT * FROM library_docs WHERE section = ? AND lang = 'both' ORDER BY ord`, key)
  const other = db.all(
    `SELECT * FROM library_docs WHERE section = ? AND lang = ? ORDER BY ord`,
    key, lang === 'en' ? 'th' : 'en')

  // Merge by ord, preferring requested lang, then 'both', then the other lang.
  const byOrd = new Map()
  for (const r of other) byOrd.set(r.ord, r)
  for (const r of both) byOrd.set(r.ord, r)
  for (const r of preferred) byOrd.set(r.ord, r)
  const chunks = [...byOrd.values()].sort((a, b) => a.ord - b.ord)
  if (chunks.length === 0) return null

  const html = chunks.map((c) => c.html).join('\n')
  const title = chunks
    .map((c) => (lang === 'th' ? c.title_th ?? c.title_en : c.title_en ?? c.title_th))
    .find((t) => t) ?? key

  const idx = order.indexOf(key)
  const prev = idx > 0 ? order[idx - 1] : null
  const next = idx < order.length - 1 ? order[idx + 1] : null

  return { key, lang, title, html, prev, next }
}

// ---------- public: search ----------

function ftsQuote(q) {
  return `"${q.replace(/"/g, '""')}"`
}

export function searchLibrary(db, { q, lang, limit = 20 }) {
  const query = (q ?? '').trim()
  if (query.length < 3) return { q: query, lang, results: [], error: 'query too short (min 3 chars)' }

  const match = ftsQuote(query)
  const rows = db.all(
    `SELECT f.key AS key, f.lang AS lang,
            snippet(library_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet,
            d.section AS section, d.title_th AS title_th, d.title_en AS title_en
     FROM library_fts f
     JOIN library_docs d ON d.key = f.key AND d.lang = f.lang
     WHERE library_fts MATCH ? AND f.lang IN (?, 'both')
     ORDER BY rank
     LIMIT ?`,
    match, lang, limit,
  )

  const results = rows.map((r) => ({
    section: r.section,
    section_title: lang === 'th' ? r.title_th ?? r.title_en : r.title_en ?? r.title_th,
    key: r.key,
    title: lang === 'th' ? r.title_th ?? r.title_en : r.title_en ?? r.title_th,
    snippet: r.snippet,
  }))

  return { q: query, lang, results }
}
