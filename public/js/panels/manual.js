// User manual — every control in Mission Control, what it does, where it is.
//
// Ported from FloodDash 2026-09-01, where a user could not tell what
// several controls did and found one that appeared to do nothing. The
// same reasoning applies here: PM2.5 decisions (send the kids to school?
// run outside? wear the N95?) are health decisions, and nobody should
// have to guess which button answers them.
//
// Rule for this file: every entry describes a control that ACTUALLY
// EXISTS and was verified working. Delete a control, delete its row —
// a manual that lists a phantom button sends people hunting for nothing.
import { store, on } from '../state.js?v=2.4.18'
import { escapeHtml } from '../fmt.js?v=2.4.18'

function tr(th, en) { return store.lang === 'th' ? th : en }

function sectionQuickStart() {
  const steps = [
    {
      n: '1',
      th: 'อ่าน "ดัชนีอันตราย" แถบบนสุด — บอกว่าอากาศตอนนี้อันตรายแค่ไหน และจังหวัดไหนแย่ที่สุด',
      en: 'Read the DANGER INDEX at the top — how bad the air is right now, and which province has it worst.',
    },
    {
      n: '2',
      th: 'เลือกจังหวัดของคุณจากช่องเลือกพื้นที่ หรือเปิดแท็บ "พื้นที่ฉัน" — จะได้ค่า PM2.5 ตอนนี้ คำแนะนำว่าออกไปข้างนอกได้ไหม และควรใส่หน้ากากแบบไหน',
      en: 'Pick your province in the area selector, or open MY AREA — you get the current PM2.5, whether it is safe to go outside, and which mask to wear.',
    },
    {
      n: '3',
      th: 'ค่า PM2.5 เกิน 37.5 µg/m³ = เริ่มมีผลต่อสุขภาพ · เกิน 75 = ทุกคนควรงดกิจกรรมกลางแจ้ง · เด็ก ผู้สูงอายุ และคนเป็นโรคทางเดินหายใจ ต้องระวังตั้งแต่ค่าต่ำกว่านั้น',
      en: 'Above 37.5 µg/m³ PM2.5 health effects begin; above 75 everyone should avoid outdoor activity. Children, elderly and people with respiratory conditions should take care well below those numbers.',
    },
  ]
  return `
    <section class="rp-section man-quick">
      <h2>${tr('ถ้ามีเวลา 30 วินาที อ่านแค่นี้', 'If you only have 30 seconds')}</h2>
      <ol class="man-quick-list">
        ${steps.map((s) => `<li><span class="man-quick-n">${s.n}</span><span>${escapeHtml(tr(s.th, s.en))}</span></li>`).join('')}
      </ol>
    </section>`
}

const ZONES = () => [
  {
    id: 'top', icon: '⬆',
    title_th: 'แถบบนสุด', title_en: 'Top bar',
    where_th: 'ขอบบนของหน้าจอ', where_en: 'Across the top of the screen',
    rows: [
      { key: 'AIR·DASH', name_th: 'โลโก้', name_en: 'Logo',
        th: 'กดเพื่อกลับไปมุมมองทั้งประเทศ',
        en: 'Click to return to the whole-Thailand view.' },
      { key: 'ดัชนีอันตราย', name_th: 'ดัชนีอันตราย', name_en: 'Danger index',
        th: 'สรุประดับอันตรายของอากาศทั้งประเทศตอนนี้ พร้อมจังหวัดที่ค่าฝุ่นสูงสุด และคำแนะนำว่าควรทำอะไร',
        en: 'The nationwide air-danger level right now, the worst province, and what to do about it.' },
      { key: '💬', name_th: 'ถาม AI', name_en: 'Ask AI',
        th: 'ถามเป็นภาษาไทยหรืออังกฤษ เช่น "เชียงใหม่วันนี้ออกไปวิ่งได้ไหม" ระบบตอบจากค่าที่วัดได้จริง ไม่ใช่การเดา',
        en: 'Ask in Thai or English ("can I run outside in Chiang Mai today?"). Answers come from measured values, not guesses.' },
      { key: '🔍', name_th: 'ช่องค้นหา', name_en: 'Search',
        th: 'ค้นหาจังหวัดหรือสถานีตรวจวัดที่ต้องการดู',
        en: 'Find a province or a specific monitoring station.' },
      { key: 'ทั้งประเทศ ▾', name_th: 'เลือกพื้นที่', name_en: 'Area selector',
        th: 'เจาะดูเฉพาะจังหวัดหรือภาคที่สนใจ · ปุ่ม "← ทั้งประเทศ" พากลับมุมมองรวม',
        en: 'Zoom the whole dashboard into one province or region. "← All Thailand" brings the overview back.' },
      { key: 'ไทย / EN', name_th: 'สลับภาษา', name_en: 'Language',
        th: 'สลับทั้งระบบระหว่างภาษาไทยกับอังกฤษ',
        en: 'Switches the whole dashboard between Thai and English.' },
      { key: 'ง่าย / เต็ม', name_th: 'โหมดการแสดงผล', name_en: 'View mode',
        th: '"ง่าย" = เห็นเฉพาะสิ่งที่ประชาชนต้องใช้ · "เต็ม" = เปิดเครื่องมือวิเคราะห์ทั้งหมด',
        en: 'EASY shows only what a citizen needs. FULL unlocks every analysis tool.' },
      { key: '⊞', name_th: 'เทียบพื้นที่', name_en: 'Compare areas',
        th: 'วางหลายจังหวัดเทียบกันข้าง ๆ เพื่อดูว่าที่ไหนอากาศดีกว่ากัน',
        en: 'Put several provinces side by side to see where the air is better.' },
      { key: '🌊', name_th: 'ไปที่ FloodDash', name_en: 'Open FloodDash',
        th: 'ไปยังระบบเฝ้าระวังน้ำท่วมที่ใช้โครงสร้างข้อมูลเดียวกัน (เปิดแท็บใหม่)',
        en: 'Opens the sister flood-watch dashboard, which shares this data backbone, in a new tab.' },
      { key: 'ⓘ', name_th: 'เกี่ยวกับ', name_en: 'About',
        th: 'เปิดหน้านี้ — ที่มาโครงการ คู่มือใช้งาน และเอกสารวิจัย',
        en: 'Opens this overlay — project background, this manual, and the research paper.' },
    ],
  },
  {
    id: 'map', icon: '🗺',
    title_th: 'ปุ่มบนแผนที่', title_en: 'Map controls',
    where_th: 'มุมบนขวาของแผนที่', where_en: 'Top-right of the map',
    rows: [
      { key: '▦', name_th: 'ชั้นข้อมูล', name_en: 'Layers',
        th: 'เปิด/ปิดสิ่งที่วาดบนแผนที่: พื้นแผนที่ (ถนน/ดาวเทียม/ภูมิประเทศ) · จากอวกาศ (หมอกควัน AOD, ฝนดาวเทียม GSMaP, เมฆ Himawari, ภาพจริง MODIS) · ภาคพื้น (สถานี Air4Thai, ฮีทแมป PM2.5, ฝนสะสม 24 ชม., ข่าวไฟป่า, ชั้นความเสี่ยงจังหวัด, อาคารเสี่ยง)',
        en: 'Turn map layers on and off: basemaps (road / satellite / terrain), space layers (AOD haze, GSMaP rain, Himawari cloud, MODIS true colour) and ground layers (Air4Thai stations, PM2.5 heatmap, 24 h rain, wildfire news, province risk, at-risk buildings).' },
      { key: 'หมอกควัน', name_th: 'ชั้นหมอกควัน (AOD)', name_en: 'Haze layer (AOD)',
        th: 'ความหนาของละอองลอยที่ดาวเทียมมองเห็นจากอวกาศ — เห็นหมอกควันข้ามพรมแดนที่สถานีภาคพื้นยังจับไม่ได้',
        en: 'Aerosol thickness as seen from orbit — it reveals cross-border haze before ground stations register it.' },
      { key: 'ฝนสะสม', name_th: 'ฝนล้างฝุ่น', name_en: 'Rain washout',
        th: 'ฝน 24 ชม. ที่ผ่านมา ฝนคือกลไกธรรมชาติที่ล้างฝุ่นออกจากอากาศได้ดีที่สุด',
        en: 'The last 24 hours of rain — the most effective natural mechanism for washing dust out of the air.' },
      { key: '＋ ／ －', name_th: 'ซูมเข้า/ออก', name_en: 'Zoom',
        th: 'ขยายหรือย่อแผนที่ (ใช้สองนิ้วบนมือถือได้)',
        en: 'Zoom the map in or out; pinch works on a phone.' },
    ],
  },
  {
    id: 'right', icon: '➡',
    title_th: 'แถบขวา — แท็บทั้งหมด', title_en: 'Right rail — every tab',
    where_th: 'ด้านขวาบนจอคอมพิวเตอร์ · บนมือถืออยู่แถวปุ่มด้านล่าง', where_en: 'Right side on desktop; the bottom button row on a phone',
    rows: [
      { key: '👤', name_th: 'พื้นที่ฉัน (MY AREA)', name_en: 'MY AREA',
        th: 'แท็บสำคัญที่สุดสำหรับประชาชน: ค่า PM2.5 ตอนนี้ในพื้นที่คุณ แปลเป็นคำแนะนำจริง — ออกกำลังกายกลางแจ้งได้ไหม ต้องใส่หน้ากากแบบไหน เด็กไปโรงเรียนได้ไหม',
        en: 'The tab that matters most: your area\'s current PM2.5 turned into real advice — is outdoor exercise safe, which mask to wear, is it safe to send children to school.' },
      { key: '📊', name_th: 'ภาพรวม (OVERVIEW)', name_en: 'OVERVIEW',
        th: 'สรุปทั้งประเทศ: แนวโน้มฝุ่น จำนวนสถานีในแต่ละระดับ',
        en: 'The national roll-up: dust trend and how many stations sit in each band.' },
      { key: '🔔', name_th: 'เตือน (ALERTS)', name_en: 'ALERTS',
        th: 'เหตุการณ์ที่ระบบตรวจพบล่าสุด เรียงตามเวลา',
        en: 'Everything the system has flagged recently, newest first.' },
      { key: '💬', name_th: 'ถาม AI (ASK)', name_en: 'ASK',
        th: 'ถามเป็นประโยคปกติ ตอบจากตัวเลขจริงในฐานข้อมูล ถ้าไม่มีข้อมูลจะบอกตรง ๆ',
        en: 'Ask in plain language; answers are grounded in the database. If the data is missing, it says so.' },
      { key: '🌧', name_th: 'ฝนล้างฝุ่น (WASHOUT)', name_en: 'WASHOUT',
        th: 'ฝนที่กำลังมาและผลต่อการล้างฝุ่น — ตอบว่า "อีกนานไหมกว่าอากาศจะดีขึ้น"',
        en: 'Incoming rain and its dust-clearing effect — answers "how long until the air improves?"' },
      { key: '📈', name_th: 'ประวัติ (HISTORY)', name_en: 'HISTORY',
        th: 'ย้อนดูค่าที่ผ่านมาของสถานีใด ๆ เพื่อดูว่าวันนี้แย่ผิดปกติหรือเป็นปกติของฤดู',
        en: 'Replay any station\'s past readings to judge whether today is unusual or just the season.' },
      { key: '🚦', name_th: 'สัญญาณ (SIGNALS)', name_en: 'SIGNALS',
        th: 'สิ่งที่ข้อมูลกำลังบอก และคุณภาพของเซ็นเซอร์แต่ละตัว',
        en: 'What the data is currently saying, plus the health of each sensor.' },
      { key: '🗄', name_th: 'แหล่งข้อมูล (DATA)', name_en: 'DATA',
        th: 'ทุกแหล่งที่ระบบดึงมา อัปเดตล่าสุดเมื่อไหร่ และดาวน์โหลด CSV ได้ฟรี',
        en: 'Every source, when each last updated, and a free CSV download.' },
      { key: '📥', name_th: 'ข้อมูลเข้า (TAP)', name_en: 'TAP',
        th: 'ดูข้อมูลดิบที่กำลังไหลเข้าระบบแบบสด ๆ เพื่อความโปร่งใส',
        en: 'Watch raw data flowing in live — transparency by inspection.' },
      { key: '📰', name_th: 'ข่าว (NEWS)', name_en: 'NEWS',
        th: 'ข่าวไฟป่าและมลพิษที่ระบบกรองมาแล้ว ใช้ยืนยันกับตัวเลขเซ็นเซอร์',
        en: 'Filtered wildfire and pollution news, used to cross-check the sensors.' },
      { key: '📚', name_th: 'ห้องสมุด (LIBRARY)', name_en: 'LIBRARY',
        th: 'เอกสารความรู้เรื่องฝุ่นและสุขภาพที่ระบบใช้อ้างอิง',
        en: 'The knowledge documents on dust and health that the system reasons from.' },
    ],
  },
  {
    id: 'story', icon: '📖',
    title_th: 'หน้าเรื่องเล่า (AIR·STORY)', title_en: 'The story page (AIR·STORY)',
    where_th: 'ปุ่ม "🌬 หน้าแรก" · หรือที่ air.nonarkara.org', where_en: 'The "home" button, or air.nonarkara.org',
    rows: [
      { key: '🚬', name_th: 'เทียบเป็นจำนวนบุหรี่', name_en: 'Cigarette equivalent',
        th: 'แปลงค่าฝุ่นที่คุณหายใจวันนี้เป็น "สูบบุหรี่กี่มวน" (กฎ Berkeley Earth: PM2.5 22 µg/m³ ตลอดวัน ≈ 1 มวน) เพื่อให้เข้าใจง่ายโดยไม่ต้องรู้หน่วยวัด',
        en: 'Converts the dust you breathed today into cigarettes (Berkeley Earth\'s rule: a day at 22 µg/m³ ≈ one cigarette) so the number means something without knowing the units.' },
      { key: '👤', name_th: 'เลือกตัวตนของคุณ', name_en: 'Pick who you are',
        th: 'เด็ก ผู้ใหญ่ นักกีฬา หรือผู้สูงอายุ — แต่ละคนหายใจไม่เท่ากัน ระบบคำนวณผลเฉพาะตัวให้',
        en: 'Child, adult, athlete or elderly — each breathes a different volume, so the system computes your own exposure.' },
    ],
  },
]

function renderZone(z) {
  const rows = z.rows.map((r) => `
    <div class="man-row">
      <div class="man-key">${escapeHtml(r.key)}</div>
      <div class="man-body">
        <div class="man-name">${escapeHtml(tr(r.name_th, r.name_en))}</div>
        <div class="man-what">${escapeHtml(tr(r.th, r.en))}</div>
      </div>
    </div>`).join('')
  return `
    <section class="rp-section man-zone">
      <h2><span class="man-zone-icon">${z.icon}</span> ${escapeHtml(tr(z.title_th, z.title_en))}</h2>
      <div class="man-where">${escapeHtml(tr(z.where_th, z.where_en))}</div>
      ${rows}
    </section>`
}

function paint() {
  const box = document.getElementById('manual-content')
  if (!box) return
  box.innerHTML = `
    <div class="rp-progress-hero">
      <div class="rp-progress-eyebrow">${tr('คู่มือใช้งาน', 'USER MANUAL')}</div>
      <h1 class="rp-progress-title">${tr('ทุกปุ่มในระบบนี้ทำอะไร', 'What every button here does')}</h1>
      <p class="rp-progress-intro">${tr(
        'คู่มือนี้อธิบายปุ่มทุกปุ่มบนหน้าจอ ว่าอยู่ตรงไหนและกดแล้วเกิดอะไรขึ้น เขียนด้วยภาษาปกติ ไม่ใช่ศัพท์เทคนิค',
        'This manual covers every button on screen: where it is and what happens when you press it, in plain language rather than jargon.'
      )}</p>
    </div>
    ${sectionQuickStart()}
    ${ZONES().map(renderZone).join('')}
    <div class="rp-progress-disclaimer">
      ⚠ ${tr(
        'ระบบนี้ช่วยจัดลำดับความสนใจ ไม่ใช่คำวินิจฉัยทางการแพทย์ — หากมีอาการทางเดินหายใจ ให้ปรึกษาแพทย์',
        'This dashboard helps you prioritise attention. It is not medical advice — see a doctor about respiratory symptoms.'
      )}
    </div>`
}

let wired = false

export function initManual() {
  const overlay = document.getElementById('about-overlay')
  if (!overlay || wired) return
  wired = true
  for (const tab of overlay.querySelectorAll('.about-tab')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.aboutPane === 'manual') paint()
    })
  }
  on('lang', () => {
    if (document.querySelector('.about-pane[data-about-pane="manual"]')?.classList.contains('active')) paint()
  })
}
