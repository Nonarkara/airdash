#!/usr/bin/env node
// Translation validator for the Flood Bible (EN <-> TH).
//
// For each of the 11 section pairs corpus/bible/secNN.en.md / secNN.th.md it
// asserts structural + numeric parity so a chunk-by-chunk bilingual reader can
// trust that translations line up:
//   - ## heading count matches (chunk boundaries used by the ingest are `## `)
//   - fenced-code-block line count matches (``` lines)
//   - table-row count matches (lines starting with `|`)
//   - the MULTISET of numbers matches (every Arabic-numeral run, incl. footnote
//     markers like [^687^], must appear the same number of times in both files)
//
// Numbers embedded in Thai text must stay Arabic numerals — Thai digits (๐-๙)
// are flagged as an error because they break the multiset comparison and the
// house style.
//
// Exit code 0 = all pairs pass; 1 = at least one failure. Findings are printed
// per section so a failing section can be handed back to a translator verbatim.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BIBLE_DIR = fileURLToPath(new URL('../corpus/bible/', import.meta.url))
const SECTIONS = Array.from({ length: 11 }, (_, i) => String(i).padStart(2, '0'))

const THAI_DIGITS = /[๐-๙]/g

/** All Arabic-numeral runs, as a sorted multiset (array), for order-independent compare. */
function numberMultiset(text) {
  return (text.match(/\d+/g) ?? []).slice().sort()
}

function countHeadings(text) {
  return (text.match(/^## /gm) ?? []).length
}

function countFenceLines(text) {
  return (text.match(/^```/gm) ?? []).length
}

function countTableRows(text) {
  return (text.match(/^\|/gm) ?? []).length
}

/** Compare two sorted multisets; return {ok, onlyEn, onlyTh} where only* are diffs. */
function diffMultiset(a, b) {
  const counts = new Map()
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1)
  for (const x of b) counts.set(x, (counts.get(x) ?? 0) - 1)
  const onlyEn = []
  const onlyTh = []
  for (const [val, n] of counts) {
    if (n > 0) for (let i = 0; i < n; i++) onlyEn.push(val)
    else if (n < 0) for (let i = 0; i < -n; i++) onlyTh.push(val)
  }
  return { ok: onlyEn.length === 0 && onlyTh.length === 0, onlyEn, onlyTh }
}

async function validateSection(nn) {
  const findings = []
  let en, th
  try {
    en = await readFile(`${BIBLE_DIR}sec${nn}.en.md`, 'utf8')
  } catch {
    return { nn, ok: false, findings: [`missing corpus/bible/sec${nn}.en.md`] }
  }
  try {
    th = await readFile(`${BIBLE_DIR}sec${nn}.th.md`, 'utf8')
  } catch {
    return { nn, ok: false, findings: [`missing corpus/bible/sec${nn}.th.md`] }
  }

  const enH = countHeadings(en), thH = countHeadings(th)
  if (enH !== thH) findings.push(`## heading count: EN=${enH} TH=${thH}`)

  const enF = countFenceLines(en), thF = countFenceLines(th)
  if (enF !== thF) findings.push(`code-fence lines (\`\`\`): EN=${enF} TH=${thF}`)

  const enT = countTableRows(en), thT = countTableRows(th)
  if (enT !== thT) findings.push(`table rows (|...): EN=${enT} TH=${thT}`)

  const thaiDigits = th.match(THAI_DIGITS)
  if (thaiDigits) {
    findings.push(`Thai digits found (must be Arabic numerals): ${[...new Set(thaiDigits)].join('')} (${thaiDigits.length}×)`)
  }

  const num = diffMultiset(numberMultiset(en), numberMultiset(th))
  if (!num.ok) {
    const cap = (arr) => (arr.length > 20 ? `${arr.slice(0, 20).join(', ')} …(+${arr.length - 20})` : arr.join(', '))
    if (num.onlyEn.length) findings.push(`numbers in EN but not TH: ${cap(num.onlyEn)}`)
    if (num.onlyTh.length) findings.push(`numbers in TH but not EN: ${cap(num.onlyTh)}`)
  }

  return { nn, ok: findings.length === 0, findings }
}

async function main() {
  const results = await Promise.all(SECTIONS.map(validateSection))
  let failed = 0
  for (const r of results) {
    if (r.ok) {
      console.log(`  ok   sec${r.nn}`)
    } else {
      failed += 1
      console.log(`  FAIL sec${r.nn}`)
      for (const f of r.findings) console.log(`         - ${f}`)
    }
  }
  console.log('')
  if (failed === 0) {
    console.log(`All ${SECTIONS.length} section pairs pass.`)
    process.exit(0)
  }
  console.log(`${failed}/${SECTIONS.length} section pair(s) FAILED.`)
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(2) })
