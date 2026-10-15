// Visual interpolation only, not a dispersion model or regulatory AQI.
const stops=[[0,[44,151,174]],[15,[104,185,160]],[25,[203,215,92]],[37.5,[240,173,54]],[75,[207,75,53]],[150,[129,62,131]],[300,[71,38,86]]]
export function concentrationColor(value){
 if(!Number.isFinite(value)||value<0)return null
 const high=stops.findIndex(s=>s[0]>=value)
 if(high===0)return stops[0][1]
 if(high<0)return stops.at(-1)[1]
 const [a,ca]=stops[high-1],[b,cb]=stops[high],t=(value-a)/(b-a)
 return ca.map((v,i)=>Math.round(v+(cb[i]-v)*t))
}
export function interpolatePm(lat,lng,points,{radiusKm=60,nearestKm=30,minPoints=3}={}){
 const near=[];const cos=Math.cos(lat*Math.PI/180)
 for(const p of points){if(!Number.isFinite(p.pm25)||p.pm25<0||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))continue
  const d2=((lat-p.lat)*111.2)**2+((lng-p.lng)*111.2*cos)**2
  if(d2<=radiusKm**2)near.push({d2,value:p.pm25})
 }
 near.sort((a,b)=>a.d2-b.d2)
 if(near.length<minPoints||near[0].d2>nearestKm**2)return null
 if(near[0].d2<.01)return {value:near[0].value,alpha:1}
 let sum=0,weight=0
 for(const p of near.slice(0,4)){const w=1/Math.max(.01,p.d2);sum+=p.value*w;weight+=w}
 return {value:sum/weight,alpha:Math.min(1,(nearestKm-Math.sqrt(near[0].d2))/(nearestKm*.3))}
}
export function createPollutionField(options={}){
 const Field=L.Layer.extend({
  initialize(){this.points=[];this.settings={pane:'overlayPane',radiusKm:60,nearestKm:30,minPoints:3,...options}},
  onAdd(map){this.map=map;this.canvas=L.DomUtil.create('canvas','pollution-field-canvas');this.canvas.style.cssText='position:absolute;pointer-events:none;opacity:.68';(map.getPane(this.settings.pane)??map.getPane('overlayPane')).appendChild(this.canvas);map.on('moveend zoomend resize',this.draw,this);this.draw()},
  onRemove(map){map.off('moveend zoomend resize',this.draw,this);this.canvas.remove();this.map=null},
  setData(points,settings={}){this.points=points??[];Object.assign(this.settings,settings);if(this.map)this.draw();return this},
  draw(){const map=this.map;if(!map)return
   const size=map.getSize(),step=Math.max(8,Math.ceil(Math.sqrt(size.x*size.y/18000))),w=Math.ceil(size.x/step),h=Math.ceil(size.y/step)
   this.canvas.width=size.x;this.canvas.height=size.y;L.DomUtil.setPosition(this.canvas,map.containerPointToLayerPoint([0,0]))
   const small=document.createElement('canvas');small.width=w;small.height=h;const ctx=small.getContext('2d'),img=ctx.createImageData(w,h)
   if(this.points.length)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const ll=map.containerPointToLatLng([(x+.5)*step,(y+.5)*step]),sample=interpolatePm(ll.lat,ll.lng,this.points,this.settings)
    if(!sample)continue;const rgb=concentrationColor(sample.value),i=(y*w+x)*4
    img.data[i]=rgb[0];img.data[i+1]=rgb[1];img.data[i+2]=rgb[2];img.data[i+3]=Math.round(220*sample.alpha)
   }
   ctx.putImageData(img,0,0);const out=this.canvas.getContext('2d');out.imageSmoothingEnabled=true;out.drawImage(small,0,0,size.x,size.y)
  },
 })
 return new Field()
}
