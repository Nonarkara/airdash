// Knowledge-chunking contract.
//
// The defect this exists for: chunkMarkdown used to emit whole H2 sections
// regardless of size, while the embedder cut at 4000 chars. A 10 KB section was
// therefore stored whole but embedded in part — so rag.js could return a
// citation whose text the retrieval had never actually seen. The text was in
// the database and invisible to the product.
//
// Asserted here, against the real knowledge/ corpus:
//   1. no chunk exceeds EMBED_LIMIT           (the citation/vector agreement)
//   2. the embedder and the chunker share one limit constant
//   3. every character of every source file survives chunking (nothing dropped)
//   4. doc_keys are unique per file (re-chunking cannot collide with itself)
//   5. no chunk is titled with a template placeholder
//   6. pruning is scoped to a file's own prefix and cannot touch `lib:` chunks
//
// Run: node scripts/test-knowledge-chunking.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMBED_LIMIT, chunkMarkdown } from '../server/knowledge.js'
import { CONFIG } from '../server/config.js'

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`PASS ${name}`) } else { fail += 1; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// The corpus must be non-empty or every check below is vacuously true. This is
// the failure mode where `.every()` over an empty array passes by construction.
const files = readdirSync(CONFIG.knowledgeDir).filter((f) => f.endsWith('.md'))
check('knowledge corpus is non-empty', files.length > 0, `found ${files.length}`)
if (files.length === 0) { console.log('\ncannot continue with an empty corpus'); process.exit(1) }

const src = new Map(files.map((f) => [f, readFileSync(join(CONFIG.knowledgeDir, f), 'utf8')]))

// 1 + 3 + 4 + 5, per file.
let oversized = 0
let droppedFiles = 0
let dupKeyFiles = 0
let placeholderTitles = 0

for (const [file, text] of src) {
  const chunks = chunkMarkdown(file, text)
  check(`${file}: produces at least one chunk`, chunks.length > 0)

  for (const c of chunks) {
    if (c.content.length > EMBED_LIMIT) {
      oversized += 1
      console.log(`     oversized: ${c.doc_key} is ${c.content.length} chars (limit ${EMBED_LIMIT}) — "${c.title}"`)
    }
    if (/^<.*>\$|<operator>|<domain>|<date>/.test(c.title)) {
      placeholderTitles += 1
      console.log(`     placeholder title: "${c.title}"`)
    }
  }

  // 3. Losslessness. Every non-blank source line must appear verbatim in some
  //    chunk. This is the check that catches a heading being dropped by a size
  //    floor — the exact bug that deleted the only copy of "9. How to operate /
  //    วิธีใช้งาน" in paper.md.
  const joined = chunks.map((c) => c.content).join('\n')
  const srcLines = text.split('\n').filter((l) => l.trim() !== '')
  const missing = srcLines.filter((l) => !joined.includes(l.trim()))
  if (missing.length) {
    droppedFiles += 1
    console.log(`     ${file}: ${missing.length} source line(s) absent from every chunk — e.g. ${JSON.stringify(missing[0].slice(0, 60))}`)
  }
  const lastWords = text.trim().split(/\s+/).slice(-12).filter(Boolean)
  check(`${file}: the closing words survive to the final chunk`,
    lastWords.every((w) => chunks.some((c) => c.content.includes(w))))

  // 4. Unique doc_keys.
  const keys = new Set(chunks.map((c) => c.doc_key))
  if (keys.size !== chunks.length) {
    dupKeyFiles += 1
    console.log(`     ${file}: ${chunks.length} chunks but ${keys.size} unique doc_keys`)
  }
}

check('no chunk exceeds EMBED_LIMIT', oversized === 0, `${oversized} oversized chunk(es)`)
check('chunking loses no source line', droppedFiles === 0, `${droppedFiles} file(s) lost content`)
check('doc_keys are unique within every file', dupKeyFiles === 0, `${dupKeyFiles} file(s) with duplicate keys`)
check('no chunk is titled with a template placeholder', placeholderTitles === 0, `${placeholderTitles} placeholder title(s)`)

// 2. One boundary, one constant. A second literal here is the original bug.
//    Scoped to the knowledge path: indexLibraryEmbeddings truncates *before*
//    storing, so stored and embedded agree there and 3500 is correct for it.
const knSrc = readFileSync(new URL('../server/knowledge.js', import.meta.url), 'utf8')
const knowledgePath = knSrc.slice(
  knSrc.indexOf('export async function indexKnowledge'),
  knSrc.indexOf('export async function indexLibraryEmbeddings'))
const literals = knowledgePath.match(/\.slice\(0,\s*[\dA-Z_]+\s*\)/g) ?? []
check('the knowledge embedder slices with EMBED_LIMIT, not a second literal',
  literals.length > 0 && literals.every((s) => s.includes('EMBED_LIMIT')),
  literals.join(' '))
// The boundary must be declared once. Counting a bare `4000` anywhere in the
// file also counts the comment that documents the bug, which proves nothing —
// so count declarations, and count bare numbers in code only.
const codeOnly = knSrc.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n')
check('EMBED_LIMIT is declared exactly once',
  (knSrc.match(/const EMBED_LIMIT\s*=/g) ?? []).length === 1,
  (knSrc.match(/const EMBED_LIMIT\s*=/g) ?? []).join(' '))
check('no bare 4000 remains in executable code besides the declaration',
  codeOnly.split('\n').filter((l) => /\b4000\b/.test(l) && !/const EMBED_LIMIT\s*=/.test(l)).length === 0,
  codeOnly.split('\n').filter((l) => /\b4000\b/.test(l) && !/const EMBED_LIMIT\s*=/.test(l)).join(' | '))
check('EMBED_LIMIT is exported for the guard to read', EMBED_LIMIT > 0)

// 6. The prune query must be scoped to a single file's own prefix, and library
//    chunks live under `lib:` so they can never match. Assert against the real
//    LIKE pattern the code uses.
const pruneLine = knSrc.match(/doc_key LIKE \?[^)]*\[\s*`([^`]+)`\s*\]/)
check('the prune query is scoped to one file prefix', pruneLine?.[1] === '${file}#%', pruneLine?.[1] ?? 'pattern not found')
check("library chunk keys are not reachable by the prune pattern",
  !pruneLine?.[1].includes('lib') && chunkMarkdown('lib:sec01:th', '# x\n\n' + 'a'.repeat(200))[0].doc_key.startsWith('lib:'))

// A chunk that used to be silently truncated must now be split, not cut. Build
// the exact shape of the failure: one H2 section far over the limit, no H3s and
// no heading inside it. No leading `# ` preamble — that would be its own
// section with its own title and make every count below wrong.
const big = `## One enormous section\n\n` + Array.from({ length: 120 }, (_, i) => `paragraph ${i} ${'x'.repeat(80)}`).join('\n\n')
const bigChunks = chunkMarkdown('big.md', big)
check('an oversized H2 section is split into several chunks', bigChunks.length > 1, `${bigChunks.length} chunk(s)`)
check('every piece of the oversized section is within the limit',
  bigChunks.every((c) => c.content.length <= EMBED_LIMIT),
  `max ${Math.max(...bigChunks.map((c) => c.content.length))}`)
check('the split keeps every paragraph',
  Array.from({ length: 120 }, (_, i) => `paragraph ${i}`).every((p) => bigChunks.some((c) => c.content.includes(p))))
check('all pieces of a split section share one title',
  new Set(bigChunks.map((c) => c.title)).size === 1,
  [...new Set(bigChunks.map((c) => c.title))].join(' / '))

// A dense bullet list with no blank lines between items is one unbreakable
// "paragraph" to a blank-line splitter, and that is what left a real 5 KB
// section in agri-burning.md unsplittable.
const bullets = '## Dense list\n\n' + Array.from({ length: 90 }, (_, i) => `- item ${i} ${'y'.repeat(70)}`).join('\n')
const bulletChunks = chunkMarkdown('bullets.md', bullets)
check('a bullet list with no blank lines is still split', bulletChunks.length > 1, `${bulletChunks.length} chunk(s)`)
check('every bullet list piece is within the limit',
  bulletChunks.every((c) => c.content.length <= EMBED_LIMIT),
  `max ${Math.max(...bulletChunks.map((c) => c.content.length))}`)
check('no bullet is lost by the split',
  Array.from({ length: 90 }, (_, i) => `- item ${i} `).every((p) => bulletChunks.some((c) => c.content.includes(p))))

// Size alone does NOT prove the list break exists: with the list rule removed
// the packer still lands under the limit, it just cuts mid-item. Assert break
// *quality* — a chunk must never begin on a wrapped continuation line. The
// items below genuinely occupy two source lines, which is what a long bullet
// looks like in these notes; a single-line item has nothing to cut through.
//
// The split count is asserted FIRST. A fixture that fits inside the limit never
// splits, and every quality filter over one chunk is vacuously true — the guard
// would pass with the very rule it exists to check removed.
const WRAPPED_ITEMS = 220
const wrapped = '## Wrapped list\n\n' + Array.from({ length: WRAPPED_ITEMS },
  (_, i) => `- item ${i} begins here\n  and continues on this second line`).join('\n')
const wrappedChunks = chunkMarkdown('wrapped.md', wrapped)
check('the wrapped-list fixture is big enough to actually split', wrappedChunks.length > 1,
  `${wrappedChunks.length} chunk(s) from ${wrapped.length} chars — a fixture under the limit proves nothing`)
const badStarts = wrappedChunks.map((c) => c.content.split('\n')[0]).filter((l) => !/^(##\s|-\s)/.test(l))
check('no chunk starts on a wrapped continuation line', badStarts.length === 0,
  `bad starts: ${JSON.stringify(badStarts.slice(0, 3))}`)
check('the wrapped list still respects the limit',
  wrappedChunks.every((c) => c.content.length <= EMBED_LIMIT),
  `max ${Math.max(...wrappedChunks.map((c) => c.content.length))}`)
check('no wrapped line is lost',
  Array.from({ length: WRAPPED_ITEMS }, (_, i) => `- item ${i} begins here`).every((p) => wrappedChunks.some((c) => c.content.includes(p)))
  && Array.from({ length: WRAPPED_ITEMS }, (_, i) => `  and continues on this second line`).every((p) => wrappedChunks.some((c) => c.content.includes(p))))

// A table row is as unbreakable as a paragraph to a prose splitter.
const table = '## Wide table\n\n' + Array.from({ length: 80 }, (_, i) => `| row ${i} | ${'c'.repeat(70)} |`).join('\n')
const tableChunks = chunkMarkdown('table.md', table)
check('a long markdown table is split without exceeding the limit',
  tableChunks.every((c) => c.content.length <= EMBED_LIMIT) && tableChunks.length > 1,
  `${tableChunks.length} chunk(s)`)

// H3 boundaries are preferred over paragraph boundaries when a section is long,
// so a subsection is not cut across two chunks.
const withH3 = `## Long\n\n${'a'.repeat(2500)}\n\n### Alpha\n\n${'b'.repeat(2500)}\n\n### Beta\n\n${'c'.repeat(2500)}`
const h3Chunks = chunkMarkdown('h3.md', withH3)
check('an H3 heading starts a new chunk when a section is long',
  h3Chunks.some((c) => c.content.includes('### Alpha')) && h3Chunks.some((c) => c.content.includes('### Beta')),
  h3Chunks.map((c) => c.content.slice(0, 14).replace(/\n/g, '\\n')).join(' | '))

// A single unbreakable line longer than the limit is emitted whole rather than
// cut mid-sentence: two fragments would each read as nonsense. It is allowed to
// exceed the limit, and the guard above will name it — the point is that it is
// visible rather than silently truncated.
const oneHuge = `## H\n\n${'z'.repeat(EMBED_LIMIT + 500)}`
const hugeChunks = chunkMarkdown('huge.md', oneHuge)
check('an unbreakable line is not cut mid-sentence',
  hugeChunks.some((c) => c.content.includes('z'.repeat(100))),
  `${hugeChunks.length} chunk(s)`)
check('an unbreakable line is emitted whole so the overflow is visible, not hidden',
  hugeChunks.some((c) => c.content.length > EMBED_LIMIT),
  hugeChunks.map((c) => c.content.length).join(','))

// The regression that started all this: a heading with a short line under it
// must not be dropped by a size floor, or the section loses its only title text.
const shortSection = '## 9. How to operate / วิธีใช้งาน\n\n### 9.1 Run it\n\n```bash\nnpm start\n```'
const shortChunks = chunkMarkdown('paper.md', shortSection)
check('a short section is kept, not dropped by a size floor',
  shortChunks.some((c) => c.content.includes('How to operate') && c.content.includes('วิธีใช้งาน')),
  `${shortChunks.length} chunk(s), contents: ${shortChunks.map((c) => JSON.stringify(c.content.slice(0, 30))).join(' ')}`)
check('that section keeps its own title', shortChunks[0]?.title === '9. How to operate / วิธีใช้งาน', shortChunks[0]?.title)

// Pure markdown scaffolding is dropped — the filter that caused the data loss
// must be narrowed, not removed. A lone H1 line is *kept*: it is the file
// title, and dropping short content is the bug this whole guard exists for.
const noise = '# T\n\n---\n\n## Real\n\nActual prose that must survive.'
const noiseChunks = chunkMarkdown('noise.md', noise)
check('a horizontal rule is dropped as pure scaffolding',
  !noiseChunks.some((c) => /^-+$/.test(c.content.trim())))
check('real prose after scaffolding is kept and titled by its own section',
  noiseChunks.some((c) => c.title === 'Real' && c.content.includes('Actual prose')),
  noiseChunks.map((c) => `${c.title}:${JSON.stringify(c.content.slice(0, 18))}`).join(' '))
check('a lone H1 title line is kept rather than dropped by a size floor',
  noiseChunks.some((c) => c.content.includes('# T')), `${noiseChunks.length} chunk(s)`)

// ── The prune, behaviourally ────────────────────────────────────────────────
// A source-pattern check cannot see a DELETE that has been replaced by a no-op,
// so drive indexKnowledge with a stub db and assert rows actually disappear.
const { indexKnowledge } = await import('../server/knowledge.js')
{
  const deleted = []
  const inserted = []
  // Two rows that indexKnowledge will legitimately not produce, standing in for
  // chunks left over from an older, coarser chunking of a file that still exists.
  const staleRows = [
    { doc_key: 'README.md#999', content_hash: 'x' },
    { doc_key: 'paper.md#999', content_hash: 'x' },
  ]
  const liveNow = new Set()
  for (const f of files) for (const c of chunkMarkdown(f, src.get(f))) liveNow.add(c.doc_key)

  const db = {
    kvGet: () => 'test-embed-model',
    kvSet: () => {},
    get: () => undefined,                       // nothing pre-indexed
    all: (sql) => (String(sql).includes('doc_key LIKE') ? staleRows : []),
    run: (sql, ...args) => {
      if (String(sql).includes('DELETE FROM rag_docs')) deleted.push(args[0])
      if (String(sql).includes('INSERT INTO rag_docs')) inserted.push(args[0])
    },
  }
  const rag = { probe: async () => ({ reachable: false, hasEmbed: false }), embed: async () => [new Array(8).fill(0)] }

  await indexKnowledge(db, rag)

  // The stub answers every per-file LIKE with the same two rows, so the same key
  // is deleted once per file scanned. Compare the *set* of keys, not the count:
  // the count is a property of the stub, not of the prune.
  const deletedSet = new Set(deleted)
  check('a stale chunk of an existing file is actually deleted',
    staleRows.every((r) => deletedSet.has(r.doc_key)), JSON.stringify([...deletedSet]))
  check('nothing outside the known stale set is deleted',
    staleRows.every((r) => deletedSet.has(r.doc_key)) && deletedSet.size === staleRows.length,
    `${deletedSet.size} distinct: ${JSON.stringify([...deletedSet])}`)
  check('only that file\'s own doc_keys are deleted',
    [...deletedSet].every((k) => /^README\.md#|^paper\.md#/.test(k)), JSON.stringify([...deletedSet]))
  check('a live chunk is never deleted', [...deletedSet].every((k) => !liveNow.has(k)))
  check('chunks are still written for every file', inserted.length > 0 && liveNow.size > 0,
    `${inserted.length} inserted`)
  check('no live doc_key is pruned', inserted.every((k) => !deleted.includes(k)))
  check('every live doc_key for every file was written',
    files.every((f) => chunkMarkdown(f, src.get(f)).every((c) => inserted.includes(c.doc_key))),
    `${inserted.length} inserted vs ${liveNow.size} live`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
