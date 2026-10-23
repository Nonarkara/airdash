// A horizontal fixed-pressure/height scenario, never a smoke arrival model.
export const kmBetween=(a,b)=>{const rad=Math.PI/180,p=(a.lat+b.lat)/2*rad;return Math.hypot((a.lat-b.lat)*111.195,(a.lng-b.lng)*111.195*Math.cos(p))}
export function windAt(data,lat,lng,time,level='surface',now=Date.now()){
 const age=now-Date.parse(data?.fetched_at)
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -11||lat>29||lng<92||lng>142)return null
 if(!data?.available||!Number.isFinite(age)||age< -300000||age>9*3600000||!['surface','aloft'].includes(level))return null
 const hour=Math.floor(time/3600000)*3600000
 const nearby=(data.points??[]).map(p=>({p,d:kmBetween({lat,lng},p)})).filter(x=>x.d<=650).sort((a,b)=>a.d-b.d).slice(0,4)
 if(!nearby.length||nearby[0].d>480)return null
 let east=0,north=0,total=0,rain=0,rainWeight=0,count=0
 for(const {p,d} of nearby){const row=p.hours.find(h=>Date.parse(h.time)===hour),v=row?.[level]
  if(!v||!v.every(Number.isFinite)||v[0]<0||v[0]>500||v[1]<0||v[1]>360)continue
  const w=1/Math.max(1,d*d),towards=(v[1]+180)*Math.PI/180
  east+=Math.sin(towards)*v[0]*w;north+=Math.cos(towards)*v[0]*w;total+=w;count++
  if(Number.isFinite(row.rain_mm)){rain+=row.rain_mm*w;rainWeight+=w}
 }
 if(count<2)return null
 east/=total;north/=total
 return {east,north,speed:Math.hypot(east,north),towards:(Math.atan2(east,north)*180/Math.PI+360)%360,rain:rainWeight?rain/rainWeight:null,samples:count}
}
export function airPath(data,start,time,level='surface',hours=6,now=Date.now()){
 if(!Number.isFinite(start.lat)||!Number.isFinite(start.lng)||start.lat< -11||start.lat>29||start.lng<92||start.lng>142||!Number.isFinite(time)||hours<0||hours>6)return {points:[],complete:false}
 const points=[{...start,time,hours:0}],end=time+hours*3600000;let at=time,pos={...start},distance=0
 while(at<end){const w=windAt(data,pos.lat,pos.lng,at,level,now);if(!w)return {points,complete:false,distance}
  // Bound integration to 15 min and never cross a missing model hour.
  const dt=Math.min(900000,end-at,(Math.floor(at/3600000)+1)*3600000-at,time+(Math.floor((at-time)/3600000)+1)*3600000-at),h=dt/3600000
  const nextLat=pos.lat+w.north*h/111.195,nextLng=pos.lng+w.east*h/(111.195*Math.cos(pos.lat*Math.PI/180))
  if(!Number.isFinite(nextLat)||!Number.isFinite(nextLng)||nextLat< -11||nextLat>29||nextLng<92||nextLng>142)return {points,complete:false,distance}
  distance+=w.speed*h;at+=dt;pos={lat:nextLat,lng:nextLng};points.push({...pos,time:at,hours:(at-time)/3600000,speed:w.speed})
 }
 return {points,complete:true,distance}
}
