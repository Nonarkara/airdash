// Age the actual acquisition receipt as well as the successful download.
export function fireView(fires, now = Date.now()) {
  const fresh = (time, max) => { const age = now-Date.parse(time); return Number.isFinite(age)&&age>=-300000&&age<=max }
  const available = !!fires?.available && fires.feeds_current>0 && fresh(fires.checked_at,12*3600000) && fresh(fires.latest_acquisition_at,12*3600000) && fresh(fires.evaluated_at,30*60000)
  const cells = available ? (fires.cells??[]).filter(c=>Number.isFinite(c.detections)&&c.detections>0&&fresh(c.last_observed_at,48*3600000)) : []
  return { available, cells, detections: cells.reduce((n,c)=>n+c.detections,0), partial:!!fires?.counts_partial || (fires?.feeds_current??0)<(fires?.feeds_expected??3) }
}
export function fireOpacity(n) { return n>20?.8:n>5?.65:n>1?.5:.35 }
