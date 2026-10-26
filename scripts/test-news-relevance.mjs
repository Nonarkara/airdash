import assert from 'node:assert/strict'
import { isAirHeadline, isFireHeadline, relevantNewsRow } from '../server/newsRelevance.js'
for(const title of ['เผาแล้ว นักเรียนหญิง ม.3 เสียชีวิตสลด แม่ช็อกทำใจไม่ได้ หลังรู้ข่าวเศร้า','งานฌาปนกิจ เผาศพเชียงใหม่','คนร้ายเผารถกลางเมือง','ร้านไก่เผาเปิดใหม่']){
 assert.equal(isAirHeadline(title),false,title)
 assert.equal(isFireHeadline(title),false,title)
 assert.equal(relevantNewsRow({feed:'khaosod',title}),false,title)
}
for(const title of ['เชียงใหม่เผาป่า พบจุดความร้อน','เผาตอซังหลังเก็บเกี่ยว','Indonesia agricultural burning','Myanmar WILDFIRE spreads','เกษตรกรเผาอ้อยในกาญจนบุรี','เผานาหลังเก็บเกี่ยว','เผาข้าวโพดบนดอย','เผาซังในทุ่ง','เผาเศษวัสดุการเกษตร','Indonesia peat fires']){
 assert.equal(isAirHeadline(title),true,title);assert.equal(isFireHeadline(title),true,title)
}
assert.equal(isAirHeadline('ค่าฝุ่น PM2.5 กรุงเทพฯ ลดลง'),true)
assert.equal(isFireHeadline('ค่าฝุ่น PM2.5 กรุงเทพฯ ลดลง'),false,'pollution alone does not establish fire origin')
assert.equal(isAirHeadline('งานเผาศพทำให้คุณภาพอากาศแย่'),true,'genuine pollution reporting remains eligible')
assert.equal(isFireHeadline('งานเผาศพทำให้คุณภาพอากาศแย่'),false,'pollution report is not open-burning attribution')
assert.equal(relevantNewsRow({feed:'gnews_air',title:'An official report'}),true,'curated air search is preserved')
console.log('PASS unrelated cremation/cooking/crime rejected at intake and archive use; actual haze/open burning retained; pollution is not fire attribution')
