// FAQ extraction — run daily (or manually) to cluster recent chat_logs
// into FAQ candidates. Run with:
//   node scripts/faq-extract.mjs [--days=7] [--similarity=0.85] [--min-cluster=3]
//
// Prereq: the server has been running long enough for chat_logs to
// accumulate AND Ollama is reachable (so we can embed the messages).
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
process.chdir(join(__dirname, '..'))

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))

const { CONFIG } = await import('../server/config.js')
const { openDb } = await import('../server/db.js')
const { createRag } = await import('../server/rag.js')
const { createRisk } = await import('../server/risk.js')
const { createWetness } = await import('../server/wetness.js')
const { createFaq } = await import('../server/faq.js')

const db = openDb()
const wetness = createWetness(db)
const riskEngine = createRisk(db, wetness)
const rag = createRag({ db, riskEngine, wetness })
const faq = createFaq({ db, rag })

const out = await faq.clusterRecent({
  days: Number(args.days) || 7,
  similarity: Number(args.similarity) || 0.85,
  minClusterSize: Number(args['min-cluster']) || 3,
})

if (out.ok) {
  const pending = db.all('SELECT id, lang, count, example_msg FROM chat_faq WHERE approved = 0 ORDER BY count DESC LIMIT 20')
  console.log(`OK · ${out.candidates ?? 0} new candidates`)
  console.log(`Pending approval: ${pending.length}`)
  for (const p of pending) {
    console.log(`  [${p.id}] (${p.lang}) ×${p.count} — ${(p.example_msg || '').slice(0, 60)}`)
  }
} else {
  console.error('cluster pass failed:', out)
  process.exit(1)
}