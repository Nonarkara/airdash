// A bounded numerical interpolation, replacing additive colour blobs.
// Fresh source points only; no inferred values beyond 30 km of a point or
// where fewer than three points lie within 60 km. Gaps remain transparent.
import { createPollutionField } from './pollution-field.js?v=2.4.105'
export function createPm25HeatmapLayer(){
 const layer=createPollutionField({pane:'heatmap'})
 const set=layer.setData.bind(layer)
 const fresh=s=>{const t=Date.parse(`${s.pm25_time?.replace(' ','T')}+07:00`),age=Date.now()-t;return Number.isFinite(age)&&age>=-300000&&age<=90*60000}
 layer.setData=stations=>set((stations??[]).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&Number.isFinite(s.pm25)&&fresh(s)))
 return layer
}
