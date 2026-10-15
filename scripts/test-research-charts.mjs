import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const source = readFileSync('public/js/panels/research.js', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
const ctx = vm.createContext({store:{lang:'en'},on(){},escapeHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),console})
vm.runInContext(source, ctx)
let n=0
function check(label, expr, verify){const out=vm.runInContext(expr,ctx);verify(out);n++;console.log('PASS',label)}
const finite=s=>assert.doesNotMatch(s,/NaN|Infinity/)
check('zero regional series has finite geometry', `svgRegionMonths([{region:'North',monthly:[{month:1,avg:0},{month:2,avg:0}]}])`,finite)
check('zero alert series has zero-width bars', `svgAlertLedger([{rule:'pm25',n:0}])`,s=>{finite(s);assert.match(s,/width="0"/);})
check('network faults come from payload', `svgNetwork({total_stations:100,stale:20,flatline:4,outlier:7,mismatch:2})`,s=>assert.match(s,/4 · 7 · 2/))
check('missing stale count stays unknown', `svgNetwork({total_stations:100})`,s=>assert.equal(s,''))
check('invalid network totals rejected', `svgNetwork({total_stations:10,stale:20})`,s=>assert.equal(s,''))
check('no silent stations has no invented segment', `svgNetwork({total_stations:100,stale:0})`,s=>assert.match(s,/width="0"/))
check('diurnal reference uses Thai 24h value', `svgDiurnal(Array.from({length:24},(_,hour)=>({hour,avg:12})),null)`,s=>{finite(s);assert.match(s,/37.5/);assert.doesNotMatch(s,/standard 15/);})
check('empty series stays empty',`svgDiurnal([],null)+svgRegionMonths([])+svgAlertLedger([])`,s=>assert.equal(s,''))
// Run the actual bumper in a disposable checkout; production files stay untouched.
const {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync}=await import('node:fs')
const {tmpdir}=await import('node:os')
const {join}=await import('node:path')
const {execFileSync}=await import('node:child_process')
const root=mkdtempSync(join(tmpdir(),'airdash-bump-'))
try {
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'public/js'),{recursive:true})
  copyFileSync('scripts/bump-version.mjs',join(root,'scripts/bump-version.mjs'))
  writeFileSync(join(root,'public/ops.html'),'?v=2.4.74')
  writeFileSync(join(root,'public/sw.js'),"const CACHE = 'airdash-v90'")
  writeFileSync(join(root,'public/js/boot.js'),"const shell = 'airdash-v90'")
  writeFileSync(join(root,'CHANGELOG.md'),'## [2.4.75] ops\n## [2.4.76] ops\n')
  const out=execFileSync(process.execPath,[join(root,'scripts/bump-version.mjs'),'--dry-run'],{encoding:'utf8'})
  assert.match(out,/2\.4\.74\s+->\s+2\.4\.77/)
  assert.equal(readFileSync(join(root,'public/ops.html'),'utf8'),'?v=2.4.74')
  console.log('PASS bumper skips reserved release numbers without modifying dry-run files')
  n++
  mkdirSync(join(root,'public/css'))
  copyFileSync('scripts/check-bump.mjs',join(root,'scripts/check-bump.mjs'))
  writeFileSync(join(root,'public/js/boot.js'),"import './main.js?v=2.4.75'")
  writeFileSync(join(root,'CHANGELOG.md'),'## [2.4.75] ops\nAsset token stays at 2.4.74.\n')
  assert.throws(()=>execFileSync(process.execPath,['scripts/check-bump.mjs'],{cwd:root,stdio:'pipe'}))
  writeFileSync(join(root,'CHANGELOG.md'),'## [2.4.75] frontend\nAsset token 2.4.75.\n')
  assert.match(execFileSync(process.execPath,['scripts/check-bump.mjs'],{cwd:root,encoding:'utf8'}),/new token/)
  console.log('PASS release guard rejects an ops-only token disclaimer and accepts actual frontend documentation')
  n++
} finally {rmSync(root,{recursive:true,force:true})}

console.log(`${n} passed, 0 failed`)
