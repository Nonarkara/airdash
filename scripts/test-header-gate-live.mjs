// Optional integration gate: requires the same Playwright/Chrome as the width gate.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const fixture = mkdtempSync(join(tmpdir(), 'airdash-gate-launch-'))
const brokenBrowser = join(fixture, 'broken.mjs')
writeFileSync(brokenBrowser, "export const chromium = {launch: async () => {throw new Error('fixture browser unavailable')}}")
const server=createServer((_req,res)=>res.end('<header><div class="national"><div id="national-th">LOADING</div></div><div id="danger-num">–</div></header>'))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}`
const run=env=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/header-width-gate.mjs'],{env:{...process.env,QA_URL:url,QA_READY_TIMEOUT_MS:'500',...env}});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve({code,output}))})
try {
 for(const [name,env] of [['unrendered data',{}],['missing browser dependency',{PLAYWRIGHT_PATH:'/nonexistent/airdash-playwright.mjs'}],['failed browser launch',{PLAYWRIGHT_PATH:brokenBrowser}],['failed navigation',{QA_URL:'invalid URL'}]]) {
  const result=await run(env);assert.equal(result.code,2,result.output);assert.match(result.output,/FATAL/);assert.doesNotMatch(result.output,/ALL WIDTHS OK/);console.log('PASS',name,'cannot certify widths')
 }
 console.log('4 passed, 0 failed')
}finally{await new Promise(resolve=>server.close(resolve));rmSync(fixture,{recursive:true,force:true})}
