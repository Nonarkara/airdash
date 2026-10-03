// Boot-time knowledge indexing: read knowledge/*.md, chunk on H2 headings,
// embed changed chunks via nomic-embed-text (with its required task prefix),
// store vectors as BLOBs. Skips silently when Ollama is down; retried on the
// next boot or by the daily timer in index.js.
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'

// The embedder below embeds `content.slice(0, EMBED_LIMIT)` — a hard cut. If a
// chunk is longer than that, the vector describes only its head while
// `rag_docs.content` (and therefore the citation shown to a user) still holds
// the whole section. That is the failure mode worth preventing: a reader can be
// shown a passage the retrieval never actually matched. So a chunk never
// exceeds EMBED_LIMIT — long H2 sections are split instead of truncated, and
// nothing is silently dropped.
export const EMBED_LIMIT = 4000

// How eagerly a line may be used as a split point. Splitting at a structural
// boundary keeps each chunk readable on its own; splitting mid-sentence does not.
const BREAK_HEADING = 3
const BREAK_BLANK = 2
const BREAK_ITEM = 1

function breakScore(line) {
  if (/^#{1,6}\s/.test(line)) return BREAK_HEADING
  if (line.trim() === '') return BREAK_BLANK
  // Bullet, ordered list item, or table row. These knowledge notes are dense
  // with tables and long bullet lists whose items are often not separated by a
  // blank line — treating such a block as one unbreakable paragraph is what
  // left a 5 KB section unsplittable.
  if (/^\s*(?:[-*+]\s|\d+\.\s|\|)/.test(line)) return BREAK_ITEM
  return 0
}

/**
 * Pack a section body into chunks of at most EMBED_LIMIT, breaking at the most
 * structural line available and only breaking mid-paragraph when forced.
 *
 * Line-based on purpose: every source line ends up in exactly one chunk, so
 * nothing can be lost. An earlier paragraph-based version dropped a
 * heading-only fragment of 34 chars via a `length > 40` filter, taking the only
 * copy of three words with it.
 *
 * The `while` re-checks after every move. Breaking mid-buffer leaves a tail that
 * may itself already be at the limit; appending the next line to it without
 * re-checking is what produced a 4040-char chunk from a 4000-char budget.
 */
function packSection(body) {
  const lines = body.split('\n')
  const out = []
  let buf = []

  const bufLen = () => buf.reduce((n, l) => n + l.length + 1, 0)
  // Best structural line to break at. It must leave at least one line behind in
  // the emitted chunk (i >= 1) and at least one to carry into the next
  // (i < length - 1). A candidate at index 0 is not "no cut", it is a cut that
  // is unusable — returning it anyway forces a mid-item break.
  const findCut = () => {
    let best = -1
    let bestScore = 0
    for (let i = 1; i < buf.length - 1; i++) {
      const s = breakScore(buf[i])
      if (s > 0 && s >= bestScore) { bestScore = s; best = i }
    }
    return best
  }

  for (const line of lines) {
    while (buf.length && bufLen() + line.length + 1 > EMBED_LIMIT) {
      // Recomputed per break, never cached: the best cut moves as lines are
      // appended, and a stale index cuts a list item in half.
      const cut = findCut()
      if (cut > 0) {
        out.push(buf.slice(0, cut).join('\n'))
        buf = buf.slice(cut)
      } else {
        // No usable structural break: emit what we have rather than cut a
        // sentence in half. This is the only path that can land mid-item.
        out.push(buf.join('\n'))
        buf = []
      }
    }
    buf.push(line)
  }
  if (buf.length) out.push(buf.join('\n'))
  return out
}

export function chunkMarkdown(name, text) {
  const sections = text.split(/\n(?=## )/)
  const chunks = []
  for (const body of sections) {
    const title = body.match(/^#{1,2} (.+)$/m)?.[1]?.trim() ?? name
    for (const piece of packSection(body)) {
      const content = piece.trim()
      // A chunk must carry at least one letter or digit. This drops pure
      // markdown scaffolding (rules, blank, a bare table divider) while keeping
      // a short-but-real heading — a size floor is exactly how a section's own
      // title line got deleted.
      if (!/[\p{L}\p{N}]/u.test(content)) continue
      // Part index is per-file and monotonic, so a re-chunk that produces a
      // different number of pieces cannot collide with a previous layout.
      chunks.push({ doc_key: `${name}#${chunks.length}`, title, content })
    }
  }
  return chunks
}

let libraryEmbedScheduled = false

export async function indexKnowledge(db, rag) {
  // Vectors from different embedding models live in different spaces (and
  // dimensions — nomic was 768-d, bge-m3 is 1024-d): mixing them makes cosine
  // scores meaningless. If the configured model changed since the last index
  // pass, wipe every stored vector so the whole corpus re-embeds cleanly.
  const modelId = CONFIG.llm.embedModel
  if (db.kvGet('embed_model_id') !== modelId) {
    db.run('UPDATE rag_docs SET embedding = NULL')
    db.run('UPDATE chat_faq SET centroid = NULL')
    db.kvSet('embed_model_id', modelId)
    log('info', 'embedding model changed — invalidated all stored vectors', { model: modelId })
  }

  // Also embed the Air Library (bible) chunks so the chat's RAG retrieval
  // covers the full corpus in both languages. Library ingest runs shortly
  // after boot, so the first embedding pass is deferred a few minutes.
  if (!libraryEmbedScheduled) {
    libraryEmbedScheduled = true
    const t = setTimeout(() => indexLibraryEmbeddings(db, rag)
      .catch((e) => log('error', 'library embed failed', { error: String(e) })), 4 * 60_000)
    t.unref()
  } else {
    indexLibraryEmbeddings(db, rag)
      .catch((e) => log('error', 'library embed failed', { error: String(e) }))
  }

  let files = []
  try {
    files = (await readdir(CONFIG.knowledgeDir)).filter((f) => f.endsWith('.md'))
  } catch {
    return { indexed: 0, note: 'no knowledge dir' }
  }

  const status = await rag.probe()
  let pending = 0, indexed = 0, pruned = 0

  for (const file of files) {
    const text = await readFile(join(CONFIG.knowledgeDir, file), 'utf8')
    const live = new Set()
    for (const chunk of chunkMarkdown(file, text)) {
      live.add(chunk.doc_key)
      const hash = createHash('sha256').update(chunk.content).digest('hex')
      const existing = db.get('SELECT content_hash, embedding IS NOT NULL AS has_vec FROM rag_docs WHERE doc_key = ?', chunk.doc_key)
      if (existing?.content_hash === hash && existing?.has_vec) continue

      db.run(
        `INSERT INTO rag_docs (doc_key, title, lang, content, content_hash, updated_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(doc_key) DO UPDATE SET
           title=excluded.title, content=excluded.content,
           content_hash=excluded.content_hash, embedding=NULL, updated_at=excluded.updated_at`,
        chunk.doc_key, chunk.title, 'th+en', chunk.content, hash, new Date().toISOString())
      pending += 1
    }

    // Re-chunking changes the piece count, so the old doc_keys of this file are
    // now orphans. rag.js ranks every embedded row, and nothing else ever
    // removes one — an orphan keeps its vector forever and competes with the
    // current text as a stale duplicate. Library chunks use a `lib:` prefix and
    // are keyed differently, so scoping to this file's own prefix is safe.
    for (const row of db.all('SELECT doc_key FROM rag_docs WHERE doc_key LIKE ?', [`${file}#%`])) {
      if (live.has(row.doc_key)) continue
      db.run('DELETE FROM rag_docs WHERE doc_key = ?', row.doc_key)
      pruned += 1
    }
  }

  if (!status.reachable || !status.hasEmbed) {
    if (pending > 0) log('info', 'knowledge chunks stored; embedding deferred (LLM API not configured)', { pending })
    if (pruned > 0) log('info', 'knowledge stale chunks pruned', { pruned })
    return { indexed: 0, pending, pruned }
  }

  const toEmbed = db.all('SELECT doc_key, content FROM rag_docs WHERE embedding IS NULL')
  for (const row of toEmbed) {
    try {
      // Same constant the chunker sized against. If these two ever disagree
      // again, a chunk can be stored whole and embedded in part, and the user
      // is shown a citation the retrieval never matched.
      const [vec] = await rag.embed([`search_document: ${row.content.slice(0, EMBED_LIMIT)}`])
      const buf = Buffer.from(new Float32Array(vec).buffer)
      db.run('UPDATE rag_docs SET embedding = ? WHERE doc_key = ?', buf, row.doc_key)
      indexed += 1
    } catch (err) {
      log('error', 'embed failed', { doc: row.doc_key, error: String(err) })
      break // Ollama likely went away; retry next cycle
    }
  }
  if (indexed > 0) log('info', 'knowledge indexed', { indexed })
  if (pruned > 0) log('info', 'knowledge stale chunks pruned', { pruned })
  return { indexed, pending, pruned }
}

/**
 * Embed Air Library chunks (both languages) into rag_docs so the local-LLM
 * chat retrieves bible content semantically — Thai questions hit Thai chunks,
 * English questions hit English ones. Hash-guarded and incremental; a full
 * first pass (~800 chunks) takes a few minutes of background nomic calls.
 */
export async function indexLibraryEmbeddings(db, rag) {
  const status = await rag.probe()
  if (!status.reachable || !status.hasEmbed) return { indexed: 0, note: 'embedding API not configured' }

  let rows = []
  try {
    rows = db.all(
      `SELECT key, lang, title_th, title_en, plain, content_hash
       FROM library_docs WHERE length(plain) >= 200`)
  } catch {
    return { indexed: 0, note: 'library not ingested yet' }
  }

  let indexed = 0
  for (const row of rows) {
    const docKey = `lib:${row.key}:${row.lang}`
    const existing = db.get(
      'SELECT content_hash, embedding IS NOT NULL AS has_vec FROM rag_docs WHERE doc_key = ?', docKey)
    if (existing?.content_hash === row.content_hash && existing?.has_vec) continue

    const title = row.lang === 'th' ? (row.title_th ?? row.title_en) : (row.title_en ?? row.title_th)
    const content = `${title}\n${row.plain}`.slice(0, 3500)
    try {
      const [vec] = await rag.embed([`search_document: ${content}`])
      db.run(
        `INSERT INTO rag_docs (doc_key, title, lang, content, content_hash, embedding, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(doc_key) DO UPDATE SET
           title=excluded.title, content=excluded.content, content_hash=excluded.content_hash,
           embedding=excluded.embedding, updated_at=excluded.updated_at`,
        docKey, title, row.lang, content, row.content_hash,
        Buffer.from(new Float32Array(vec).buffer), new Date().toISOString())
      indexed += 1
    } catch (err) {
      log('error', 'library embed failed', { doc: docKey, error: String(err) })
      break // Ollama likely went away; resume on the next daily pass
    }
  }
  if (indexed > 0) log('info', 'library embeddings indexed', { indexed, total: rows.length })
  return { indexed }
}
