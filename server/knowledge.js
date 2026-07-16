// Boot-time knowledge indexing: read knowledge/*.md, chunk on H2 headings,
// embed changed chunks via nomic-embed-text (with its required task prefix),
// store vectors as BLOBs. Skips silently when Ollama is down; retried on the
// next boot or by the daily timer in index.js.
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CONFIG } from './config.js'
import { log } from './util.js'

function chunkMarkdown(name, text) {
  const sections = text.split(/\n(?=## )/)
  return sections
    .map((body, i) => {
      const title = body.match(/^#{1,2} (.+)$/m)?.[1]?.trim() ?? name
      return { doc_key: `${name}#${i}`, title, content: body.trim() }
    })
    .filter((c) => c.content.length > 40)
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

  // Also embed the Flood Library (bible) chunks so the chat's RAG retrieval
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
  let pending = 0, indexed = 0

  for (const file of files) {
    const text = await readFile(join(CONFIG.knowledgeDir, file), 'utf8')
    for (const chunk of chunkMarkdown(file, text)) {
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
  }

  if (!status.reachable || !status.hasEmbed) {
    if (pending > 0) log('info', 'knowledge chunks stored; embedding deferred (LLM API not configured)', { pending })
    return { indexed: 0, pending }
  }

  const toEmbed = db.all('SELECT doc_key, content FROM rag_docs WHERE embedding IS NULL')
  for (const row of toEmbed) {
    try {
      const [vec] = await rag.embed([`search_document: ${row.content.slice(0, 4000)}`])
      const buf = Buffer.from(new Float32Array(vec).buffer)
      db.run('UPDATE rag_docs SET embedding = ? WHERE doc_key = ?', buf, row.doc_key)
      indexed += 1
    } catch (err) {
      log('error', 'embed failed', { doc: row.doc_key, error: String(err) })
      break // Ollama likely went away; retry next cycle
    }
  }
  if (indexed > 0) log('info', 'knowledge indexed', { indexed })
  return { indexed, pending }
}

/**
 * Embed Flood Library chunks (both languages) into rag_docs so the local-LLM
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
