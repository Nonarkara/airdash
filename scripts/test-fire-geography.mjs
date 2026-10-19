import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pointInThailand } from '../server/geo/pointInThailand.js'
const features=JSON.parse(readFileSync('public/geo/province-boundaries.geojson','utf8')).features
function inRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<xj+(y-yj)*(xi-xj)/(yi-yj))inside=!inside}return inside}
function reference(lat,lng){for(const f of features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;if(polygons.some(p=>inRing(lng,lat,p[0])))return f.properties.pro_en}return null}
// Compare the accelerated path to the original all-polygons ray cast near
// borders as well as far outside Thailand. Fixed seed makes failures repeat.
let seed=17
for(let i=0;i<160;i++){seed=(seed*1664525+1013904223)>>>0;const lat=-11+seed/2**32*40;seed=(seed*1664525+1013904223)>>>0;const lng=92+seed/2**32*50;assert.equal(pointInThailand(lat,lng).province_en,reference(lat,lng))}
for(const [lat,lng] of [[13.75,100.5],[18.79,98.98],[6.5,101.5],[20,96],[-2,113],[-6.2,106.8],[NaN,100]])assert.equal(pointInThailand(lat,lng).province_en,reference(lat,lng))
console.log('PASS province bounding-box acceleration matches original exact polygon classification at 167 regional points')
