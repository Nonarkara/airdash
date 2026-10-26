// "เผา" alone also means cremation/cooking/crime reporting. It is not
// evidence of open burning and must not enter haze briefings or attribution.
const AIR = ['pm2.5','pm 2.5','pm10','ฝุ่น','หมอกควัน','ค่าฝุ่น','คุณภาพอากาศ','haze','air quality','smog']
const FIRE = ['ไฟป่า','ไหม้ป่า','จุดความร้อน','เผาป่า','เผาไร่','เผาตอซัง','เผาในที่โล่ง','เผาอ้อย','เผานา','เผาข้าวโพด','เผาซัง','เผาเศษวัสดุการเกษตร','เผาหญ้า','ไฟพรุ','wildfire','hotspot','open burning','agricultural burning','crop burning','stubble burning','sugarcane burning','peat fire','forest fire']
export function isFireHeadline(title) { const text=String(title??'').toLowerCase(); return FIRE.some(k=>text.includes(k)) }
export function isAirHeadline(title) { const text=String(title??'').toLowerCase(); return AIR.some(k=>text.includes(k)) || isFireHeadline(text) }
// Google RSS is already an air-quality search; recheck the general news feed,
// including archived rows. Keep the archive intact; filter its public use.
export function relevantNewsRow(row) { return row.feed !== 'khaosod' || isAirHeadline(row.title) }
