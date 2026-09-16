'use strict';
/* Núcleo: catálogos, estado, geometría, línea de visión y luces */
const CELL=50, FT=5;
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
const ftPx=ft=>ft/FT*CELL;
const pxFt=px=>px/CELL*FT;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ---------- Catálogos ---------- */
const WALL_TYPES={
  wall:{name:'Muro',icon:'brick-wall',sight:1,light:1,move:1,color:'#6FB8A8',desc:'Bloquea vista, luz y paso'},
  door:{name:'Puerta',icon:'door-closed',sight:1,light:1,move:1,color:'#F0B35A',door:1,desc:'Como un muro mientras está cerrada'},
  window:{name:'Ventana',icon:'window-wall',sight:0,light:0,move:1,color:'#8EC5E8',dash:[10,6],desc:'Deja pasar vista y luz, no el paso'},
  veil:{name:'Velo',icon:'cloud-fog',sight:1,light:1,move:0,color:'#B79BD8',dash:[3,5],desc:'Follaje, humo o cortinas: tapa la vista, se puede cruzar'},
  cover:{name:'Maleza',icon:'trees',sight:0,light:0,move:0,hide:1,color:'#9ED3A6',dash:[6,4],desc:'Hierba alta, niebla baja: el fondo y la luz se ven, pero oculta a las fichas y objetos que haya detrás; se puede cruzar'},
  barrier:{name:'Barrera',icon:'fence',sight:0,light:0,move:1,color:'#A7AFAF',dash:[2,8],desc:'Invisible: solo frena el movimiento'},
  portal:{name:'Portal',icon:'log-in',sight:1,light:1,move:1,color:'#E8A0BF',portal:1,desc:'Puerta a otra escena: un clic junto a él lleva al personaje allí'}
};
const LIGHT_PRESETS={
  candle:{name:'Vela',icon:'candle',bright:5,dim:5,color:'#FFC878',intensity:.9,anim:'flicker'},
  torch:{name:'Antorcha',icon:'torch',bright:20,dim:20,color:'#FFA652',intensity:1,anim:'flicker'},
  lantern:{name:'Farol',icon:'lantern',bright:30,dim:30,color:'#FFD28F',intensity:1,anim:'soft'},
  bullseye:{name:'Linterna sorda',icon:'flashlight',bright:60,dim:60,color:'#FFE6B8',intensity:1,anim:'none',angle:60},
  campfire:{name:'Hoguera',icon:'flame-kindling',bright:20,dim:20,color:'#FF8F3F',intensity:1,anim:'flicker'},
  brazier:{name:'Brasero',icon:'brazier',bright:10,dim:15,color:'#FF7A35',intensity:.95,anim:'flicker'},
  magic:{name:'Luz mágica',icon:'wand-sparkles',bright:20,dim:20,color:'#DDE8FF',intensity:1,anim:'none'},
  crystal:{name:'Cristal arcano',icon:'gem',bright:10,dim:20,color:'#A98BFF',intensity:.9,anim:'pulse'},
  moon:{name:'Rayo de luna',icon:'moon-star',bright:5,dim:15,color:'#9DBBFF',intensity:.8,anim:'none'},
  daylight:{name:'Luz diurna',icon:'sun',bright:60,dim:60,color:'#FFF1D0',intensity:1,anim:'none'},
  window:{name:'Luz de ventana',icon:'sunrise',bright:10,dim:20,color:'#FFE9C2',intensity:.85,anim:'none',angle:120},
  darkness:{name:'Oscuridad mágica',icon:'circle-off',bright:15,dim:0,color:'#000000',intensity:1,anim:'none',darkness:true}
};
const TOKEN_LIGHTS=['none','candle','torch','lantern','bullseye','magic','crystal'];
const ENVS={
  interior:{name:'Interior',icon:'brick-wall',desc:'Oscuro. Solo ven las luces y la visión en la oscuridad.',ambient:0,dark:'#0B0E11'},
  day:{name:'Exterior de día',icon:'sun',desc:'Todo lo que esté a la vista se ve.',ambient:1,dark:'#0E1316'},
  dusk:{name:'Atardecer',icon:'sunset',desc:'Se ve a la vista, en penumbra.',ambient:.55,dark:'#1A1220'},
  night:{name:'Noche',icon:'moon',desc:'Luna tenue: se intuye el terreno; las criaturas, solo con luz.',ambient:.18,dark:'#081026'}
};
const LAYERS=[
  {id:'map',name:'Tablero'},{id:'props',name:'Objetos'},{id:'zones',name:'Zonas interiores'},{id:'plans',name:'Planos'},
  {id:'tokens',name:'Fichas'},{id:'lights',name:'Luces'},{id:'walls',name:'Muros y puertas'}
];
const LAYER_OF={asset:'map',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls'};
const COLL={asset:'assets',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls'};

/* ---------- Estado ---------- */
const S={};
const IMG=new Map();      // id de imagen -> HTMLImageElement
function blankState(){return{
  version:2,name:'Escena nueva',cols:32,rows:22,env:'interior',ambient:0,darkColor:ENVS.interior.dark,
  fog:true,grid:true,snap:true,animate:!reduceMotion,plansReleased:false,sharedVision:true,playersDoors:true,
  layers:Object.fromEntries(LAYERS.map(l=>[l.id,{visible:true,locked:false}])),
  walls:[],lights:[],tokens:[],assets:[],plans:[],zones:[],nextId:1
}}
Object.assign(S,blankState());
const UI={role:'player',realRole:'player',me:null,board:null,scene:null,scenes:[],where:{},tool:'select',wallType:'wall',wallShape:'chain',zoneShape:'poly',zpoly:null,arc:null,curve:null,libCat:'all',upCat:'board',lightPreset:'torch',planShape:'line',viewAs:'party',preview:true,
  cam:{x:800,y:550,zoom:.8},selected:[],act:null,chain:null,hover:null,space:false,pointers:new Map(),pinch:null,tab:'scene'};
let _lastId=0;
const nid=()=>{let v=Date.now()*1000+Math.floor(Math.random()*1000);if(v<=_lastId)v=_lastId+1;_lastId=v;return v};
const byId=id=>{for(const k of Object.values(COLL)){const o=S[k].find(x=>x.id===id);if(o)return o}return null};
const selObjs=()=>UI.selected.map(byId).filter(Boolean);
const isSel=o=>UI.selected.includes(o.id);
const layerKey=o=>o.type==='asset'?(o.kind==='prop'?'props':'map'):LAYER_OF[o.type];
const layerState=o=>S.layers[layerKey(o)]||{visible:true,locked:false};
const isGM=()=>UI.role==='gm';
const myId=()=>UI.me?UI.me.id:null;
const ownsToken=t=>!!t&&t.type==='token'&&t.owner!=null&&t.owner===myId();
const ownsPlan=o=>!!o&&o.type==='plan'&&o.owner!=null&&o.owner===myId();
// en la vista de jugador, el director sigue pudiendo mover a los personajes
const canControl=t=>ownsToken(t)||(UI.realRole==='gm'&&!!t&&t.type==='token'&&t.kind==='player');
const PLAYER_TOOLS=['select','pan','ruler','plan'];
/* Ajuste a la cuadrícula por tipo de objeto (preferencia de este navegador).
   El interruptor general de la escena manda sobre todos; Alt lo ignora al vuelo. */
const SNAP_DEFAULTS={tokens:true,walls:true,moveWalls:false,lights:false,props:false,zones:false};
const SNAP_LABELS={tokens:'Fichas',walls:'Puntos al dibujar muros',moveWalls:'Al mover muros y barreras',lights:'Luces',props:'Objetos',zones:'Zonas interiores'};
const PREFS=(()=>{let saved={};try{saved=JSON.parse(localStorage.getItem('jav.cuadricula')||'{}')}catch(e){}return Object.assign({},SNAP_DEFAULTS,saved)})();
function savePrefs(){try{localStorage.setItem('jav.cuadricula',JSON.stringify(PREFS))}catch(e){}}
const snapOn=(kind,e)=>!!(S.snap&&PREFS[kind]&&!(e&&e.altKey));
const r1=v=>Math.round(v*10)/10;
const fine=p=>({x:r1(p.x),y:r1(p.y)});
function tidyCoords(o){if(o.a){o.a=fine(o.a);o.b=fine(o.b)}else if(Number.isFinite(o.x)){o.x=r1(o.x);o.y=r1(o.y)}if(o.pts)o.pts=o.pts.map(fine)}
const halfSnap=p=>({x:Math.round(p.x/(CELL/2))*CELL/2,y:Math.round(p.y/(CELL/2))*CELL/2});

/* ---------- Geometría ---------- */
function pointSegDist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy))}
function segCross(p1,p2,p3,p4){
  const d=(p2.x-p1.x)*(p4.y-p3.y)-(p2.y-p1.y)*(p4.x-p3.x);if(Math.abs(d)<1e-9)return false;
  const t=((p3.x-p1.x)*(p4.y-p3.y)-(p3.y-p1.y)*(p4.x-p3.x))/d;
  const u=((p3.x-p1.x)*(p2.y-p1.y)-(p3.y-p1.y)*(p2.x-p1.x))/d;
  return t>1e-6&&t<=1&&u>=-1e-6&&u<=1+1e-6;
}
function pointInPoly(poly,p){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
const sceneW=()=>S.cols*CELL, sceneH=()=>S.rows*CELL; // área de referencia; la cuadrícula es infinita
function contentBounds(){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const add=(x,y)=>{if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y};
  for(const w of S.walls){add(w.a.x,w.a.y);add(w.b.x,w.b.y)}
  for(const o of[...S.tokens,...S.lights])add(o.x,o.y);
  for(const a of S.assets){add(a.x-a.w/2,a.y-a.h/2);add(a.x+a.w/2,a.y+a.h/2)}
  for(const z of S.zones){add(z.x,z.y);add(z.x+z.w,z.y+z.h)}
  if(x0===Infinity)return{x:0,y:0,w:sceneW(),h:sceneH()};
  return{x:x0,y:y0,w:Math.max(CELL,x1-x0),h:Math.max(CELL,y1-y0)};
}
function zoneBBox(z){if(!z.pts||!z.pts.length)return;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const q of z.pts){x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)}z.x=x0;z.y=y0;z.w=x1-x0;z.h=y1-y0}
function zoneContains(z,p){return z.pts&&z.pts.length>2?(inRect(p,z)&&pointInPoly(z.pts,p)):inRect(p,z)}
function traceZone(c,z){if(z.pts&&z.pts.length>2)tracePoly(c,z.pts);else{c.beginPath();c.rect(z.x,z.y,z.w,z.h)}}
function translateObj(o,dx,dy){if(o.a){o.a={x:o.a.x+dx,y:o.a.y+dy};o.b={x:o.b.x+dx,y:o.b.y+dy};return}o.x+=dx;o.y+=dy;if(o.pts)o.pts=o.pts.map(q=>({x:q.x+dx,y:q.y+dy}))}
const inRect=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
const normRect=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)});
// kind: 'sight' (vista del fondo), 'light', 'move' o 'hide' (lo que esconde fichas y objetos: muros y maleza)
function blocks(w,kind){const t=WALL_TYPES[w.kind]||WALL_TYPES.wall;if(t.door&&w.open)return false;if(kind==='hide')return !!(t.hide||t.sight);return !!t[kind]}
function angDiff(a,b){let d=(a-b)%360;if(d>180)d-=360;if(d<-180)d+=360;return Math.abs(d)}
function inCone(src,p){if(!src.angle||src.angle>=360)return true;const ang=Math.atan2(p.y-src.y,p.x-src.x)*180/Math.PI;return angDiff(ang,src.rot||0)<=src.angle/2}

/* ---------- Línea de visión con caché ---------- */
let wallVer=0;const segCache={};const losCache=new Map();
function touchWalls(){wallVer++;losCache.clear();for(const k in segCache)delete segCache[k]}
function segments(kind){
  if(segCache[kind])return segCache[kind];
  const raw=[];
  for(const w of S.walls){if(!blocks(w,kind)||dist(w.a,w.b)<.5)continue;raw.push([[w.a.x,w.a.y],[w.b.x,w.b.y]])}
  let big=2e5;for(const w of S.walls)big=Math.max(big,Math.abs(w.a.x)*2,Math.abs(w.a.y)*2,Math.abs(w.b.x)*2,Math.abs(w.b.y)*2);
  const x0=-big,y0=-big,x1=big,y1=big;
  raw.push([[x0,y0],[x1,y0]],[[x1,y0],[x1,y1]],[[x1,y1],[x0,y1]],[[x0,y1],[x0,y0]]);
  let segs;try{segs=VisibilityPolygon.breakIntersections(raw)}catch(e){segs=raw}
  segs=segs.filter(s=>Math.hypot(s[0][0]-s[1][0],s[0][1]-s[1][1])>1e-4);
  return segCache[kind]=segs;
}
function los(o,kind){
  let x=o.x,y=o.y;
  const key=kind+':'+x.toFixed(2)+','+y.toFixed(2);
  const hit=losCache.get(key);if(hit)return hit;
  const segs=segments(kind);
  for(let n=0;n<4;n++){let on=false;for(const s of segs){if(pointSegDist({x,y},{x:s[0][0],y:s[0][1]},{x:s[1][0],y:s[1][1]})<.02){on=true;break}}if(!on)break;x+=.137;y+=.071}
  let poly=[];
  try{poly=VisibilityPolygon.compute([x,y],segs).map(q=>({x:q[0],y:q[1]}))}catch(e){poly=[]}
  if(losCache.size>600)losCache.clear();
  losCache.set(key,poly);return poly;
}
function tracePoly(ctx,poly){ctx.beginPath();if(!poly.length)return;ctx.moveTo(poly[0].x,poly[0].y);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x,poly[i].y);ctx.closePath()}

/* ---------- Fuentes de luz y visión ---------- */
const tokenRadius=t=>(t.size||1)*CELL/2*.86;
function tokenLight(t){const L=t.light;if(!L||!L.on||L.preset==='none'||(L.bright+L.dim)<=0)return null;const P=displayPos(t);return{x:P.x,y:P.y,bright:L.bright,dim:L.dim,color:L.color,intensity:L.intensity??1,anim:L.anim,angle:L.angle||360,rot:L.rot||0,darkness:false,seed:t.id,owner:t}}
let frame={};
function lightSources(){
  if(frame.sources)return frame.sources;
  const out=[];
  for(const l of S.lights){if(!l.on)continue;const P=displayPos(l);out.push({x:P.x,y:P.y,bright:l.bright,dim:l.dim,color:l.color,intensity:l.intensity??1,anim:l.anim,angle:l.angle||360,rot:l.rot||0,darkness:!!l.darkness,seed:l.id})}
  for(const t of S.tokens){if(t.hidden&&!isGM())continue;const s=tokenLight(t);if(s)out.push(s)}
  return frame.sources=out;
}
function animFactor(src,t){
  if(!S.animate||!src.anim||src.anim==='none')return{r:1,i:1};
  const s=src.seed*1.713;
  if(src.anim==='flicker'){const n=Math.sin(t*5.1+s)*.55+Math.sin(t*9.7+s*2)*.3+Math.sin(t*17.3+s*3)*.15;return{r:1+n*.018,i:1+n*.08}}
  if(src.anim==='soft'){const n=Math.sin(t*2.7+s)*.6+Math.sin(t*5.3+s)*.4;return{r:1+n*.008,i:1+n*.04}}
  if(src.anim==='pulse'){const n=Math.sin(t*1.7+s);return{r:1+n*.05,i:.86+n*.14}}
  return{r:1,i:1};
}
const hasAnimated=()=>S.animate&&lightSources().some(s=>s.anim&&s.anim!=='none');
function inZone(p){return S.zones.some(z=>zoneContains(z,p))}
function lightAt(p){
  let level=0,magic=false;
  if(S.ambient>0&&!inZone(p))level+=S.ambient;
  for(const s of lightSources()){
    const rD=ftPx(s.bright+s.dim),d=dist(s,p);
    if(d>rD||!inCone(s,p))continue;
    const poly=los(s,'light');if(poly.length<3||!pointInPoly(poly,p))continue;
    if(s.darkness){magic=true;continue}
    level+=(d<=ftPx(s.bright)?1:.5)*s.intensity;
  }
  return{level:magic?0:level,magic};
}
function viewers(){
  let party=S.tokens.filter(t=>t.kind==='player'&&t.vision!==false&&!t.hidden);
  if(UI.realRole!=='gm'&&S.sharedVision===false&&UI.me){const mine=party.filter(t=>t.owner===UI.me.id);if(mine.length)party=mine}
  if(UI.viewAs!=='party'){const one=party.find(t=>t.id===UI.viewAs);if(one)return[one]}
  return party;
}
function canSee(v,p,kind='sight'){
  const poly=los(v,kind);if(poly.length<3||!pointInPoly(poly,p))return false;
  const d=dist(v,p);
  const L=lightAt(p);if(L.magic)return false;
  if(L.level>.25)return true;
  return v.darkvision>0&&d<=ftPx(v.darkvision);
}
function visibleToPlayers(t){
  if(t.hidden)return false;
  if(t.kind==='player')return true;
  frame.vis=frame.vis||new Map();
  if(frame.vis.has(t.id))return frame.vis.get(t.id);
  const vs=viewers(),r=tokenRadius(t)*.55;
  const pts=[{x:t.x,y:t.y},{x:t.x+r,y:t.y},{x:t.x-r,y:t.y},{x:t.x,y:t.y+r},{x:t.x,y:t.y-r}];
  const ok=vs.some(v=>pts.some(p=>canSee(v,p,'hide')));
  frame.vis.set(t.id,ok);return ok;
}
/* Un objeto queda escondido para los jugadores sólo si hay maleza en la escena y ningún personaje lo alcanza a ver */
function propVisibleToPlayers(a){
  if(!S.walls.some(w=>w.kind==='cover'))return true;
  frame.pvis=frame.pvis||new Map();
  if(frame.pvis.has(a.id))return frame.pvis.get(a.id);
  const hw=(a.w||CELL)/2*.6,hh=(a.h||CELL)/2*.6;
  const pts=[{x:a.x,y:a.y},{x:a.x+hw,y:a.y},{x:a.x-hw,y:a.y},{x:a.x,y:a.y+hh},{x:a.x,y:a.y-hh}];
  const ok=viewers().some(v=>pts.some(p=>canSee(v,p,'hide')));
  frame.pvis.set(a.id,ok);return ok;
}
function doorVisibleToPlayers(w){
  const m={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};
  const len=dist(w.a,w.b)||1,nx=-(w.b.y-w.a.y)/len,ny=(w.b.x-w.a.x)/len;
  return viewers().some(v=>{const side=Math.sign((v.x-m.x)*nx+(v.y-m.y)*ny)||1;const q={x:m.x+nx*side*3,y:m.y+ny*side*3};const poly=los(v,'sight');return poly.length>2&&pointInPoly(poly,q)})
}

/* ---------- Movimiento con colisión ---------- */
function moveBlocked(from,to,r){
  for(const w of S.walls){
    if(!blocks(w,'move'))continue;
    if(segCross(from,to,w.a,w.b))return true;
    const dt=pointSegDist(to,w.a,w.b);
    if(dt<r&&dt<pointSegDist(from,w.a,w.b)-.01)return true;
  }
  return false;
}
function tryMove(t,target){
  const r=tokenRadius(t)*.8,cur={x:t.x,y:t.y};
  if(!moveBlocked(cur,target,r))return target;
  const a={x:target.x,y:cur.y};if(!moveBlocked(cur,a,r))return a;
  const b={x:cur.x,y:target.y};if(!moveBlocked(cur,b,r))return b;
  return cur;
}
function snapToken(t,p){const s=t.size||1;if(s%2===1)return{x:Math.floor(p.x/CELL)*CELL+CELL/2,y:Math.floor(p.y/CELL)*CELL+CELL/2};return{x:Math.round(p.x/CELL)*CELL,y:Math.round(p.y/CELL)*CELL}}
const snapCell=p=>({x:Math.floor(p.x/CELL)*CELL+CELL/2,y:Math.floor(p.y/CELL)*CELL+CELL/2});
const snapVertex=p=>({x:Math.round(p.x/CELL)*CELL,y:Math.round(p.y/CELL)*CELL});
function snapWallPoint(p,e,ignore){
  const tol=12/UI.cam.zoom;let best=null,bd=tol;
  for(const w of S.walls){if(ignore&&ignore.has(w))continue;for(const q of[w.a,w.b]){const d=dist(p,q);if(d<bd){bd=d;best={x:q.x,y:q.y}}}}
  if(best)return best;
  if(snapOn('walls',e))return snapVertex(p);
  return{x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10};
}

function rotPt(p,c,deg){const a=deg*Math.PI/180,co=Math.cos(a),si=Math.sin(a);const dx=p.x-c.x,dy=p.y-c.y;return{x:c.x+dx*co-dy*si,y:c.y+dx*si+dy*co}}
function ellipsePoints(cx,cy,rx,ry,rot,n){const pts=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push(rotPt({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry},{x:cx,y:cy},rot||0))}return pts.map(q=>({x:Math.round(q.x*10)/10,y:Math.round(q.y*10)/10}))}
function curvePoints(a,c,b,n){const pts=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;pts.push({x:Math.round((u*u*a.x+2*u*t*c.x+t*t*b.x)*10)/10,y:Math.round((u*u*a.y+2*u*t*c.y+t*t*b.y)*10)/10})}return pts}
const segCount=len=>clamp(Math.round(len/(CELL*.45)),10,64);
function assetCorners(o){const c={x:o.x,y:o.y};return[{k:'nw',x:o.x-o.w/2,y:o.y-o.h/2},{k:'ne',x:o.x+o.w/2,y:o.y-o.h/2},{k:'se',x:o.x+o.w/2,y:o.y+o.h/2},{k:'sw',x:o.x-o.w/2,y:o.y+o.h/2}].map(h=>Object.assign(rotPt(h,c,o.rot||0),{k:h.k}))}
function rotHandle(o){return rotPt({x:o.x,y:o.y-o.h/2-28/UI.cam.zoom},{x:o.x,y:o.y},o.rot||0)}
function inAsset(p,o){const q=rotPt(p,{x:o.x,y:o.y},-(o.rot||0));return Math.abs(q.x-o.x)<=o.w/2&&Math.abs(q.y-o.y)<=o.h/2}

function arcPoints(c,p1,p2,ccw){
  const r=dist(c,p1);const a0=Math.atan2(p1.y-c.y,p1.x-c.x);let a1=Math.atan2(p2.y-c.y,p2.x-c.x);
  let sweep=a1-a0;while(sweep<=0)sweep+=Math.PI*2;if(ccw)sweep-=Math.PI*2;
  const n=clamp(Math.round(Math.abs(sweep)*r/(CELL*.45)),3,64),pts=[];
  for(let i=0;i<=n;i++){const a=a0+sweep*i/n;pts.push({x:Math.round((c.x+Math.cos(a)*r)*10)/10,y:Math.round((c.y+Math.sin(a)*r)*10)/10})}
  return pts;
}
function snapZonePoint(p,e){const tol=12/UI.cam.zoom;let best=null,bd=tol;for(const w of S.walls)for(const q of[w.a,w.b]){const d=dist(p,q);if(d<bd){bd=d;best={x:q.x,y:q.y}}}if(best)return best;return snapOn('zones',e)?snapVertex(p):{x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10}}
