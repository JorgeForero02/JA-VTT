'use strict';
/* Interacción, paneles y editores */

/* ---------- Historial y guardado ---------- */
const hist={undo:[],redo:[]};
const snapshot=()=>JSON.stringify(S);
function pushUndo(snap){if(UI.realRole!=='gm')return;hist.undo.push(snap||snapshot());if(hist.undo.length>80)hist.undo.shift();hist.redo.length=0;syncUndo()}
function applySnapshot(str){const o=JSON.parse(str);for(const k of Object.keys(S))delete S[k];Object.assign(S,o);touchWalls();UI.selected=UI.selected.filter(id=>byId(id));closePops();changed(true)}
function undo(){if(UI.realRole!=='gm'||!hist.undo.length)return;hist.redo.push(snapshot());applySnapshot(hist.undo.pop());syncUndo();toast('Deshecho')}
function redo(){if(UI.realRole!=='gm'||!hist.redo.length)return;hist.undo.push(snapshot());applySnapshot(hist.redo.pop());syncUndo();toast('Rehecho')}
function syncUndo(){$('#undoBtn').disabled=!hist.undo.length;$('#redoBtn').disabled=!hist.redo.length}
function saveSoon(){} // el servidor guarda cada cambio en SQLite
/* Imágenes que usa la escena (tablero, objetos y retratos): las que van dentro del .json exportado */
function usedImageIds(){const ids=new Set();for(const a of S.assets)if(a.img)ids.add(a.img);for(const t of S.tokens)if(t.img)ids.add(t.img);return [...ids]}
function guessCat(k){const t=S.tokens.find(t=>t.img===k);if(t)return t.kind==='enemy'?'npc':'pc';const a=S.assets.find(a=>a.img===k);return a&&a.kind==='prop'?'prop':'board'}
/* Sube al tablero las imágenes de un archivo exportado y devuelve el cambio de ids */
async function importImages(map){
  const remap={};if(!map)return remap;
  for(const[k,v]of Object.entries(map)){
    if(Store.has(k)){remap[k]=k;continue}
    const data=typeof v==='string'?v:v&&v.data;
    if(typeof data!=='string'||!/^data:image\//.test(data))continue;
    try{const m=await Store.uploadDataUrl(data,{name:(v&&v.name)||'importada',category:v&&CATS[v.category]?v.category:guessCat(k)});remap[k]=m.id}catch(e){}
  }
  return remap;
}
function loadState(o,images){
  const base=blankState();for(const k of Object.keys(S))delete S[k];Object.assign(S,base,o);
  S.layers=Object.assign(base.layers,o.layers||{});
  for(const a of S.assets)if(a.kind!=='prop')a.kind='map';
  touchWalls();resetExplored();UI.selected=[];hist.undo.length=0;hist.redo.length=0;syncUndo();
}
let panelTimer=0;
function changed(walls){if(walls)touchWalls();requestRender();saveSoon();clearTimeout(panelTimer);panelTimer=setTimeout(refreshPanels,30)}

/* ---------- Creación ---------- */
function newLight(p,presetId){
  const P=LIGHT_PRESETS[presetId]||LIGHT_PRESETS.torch;
  return{id:nid(),type:'light',preset:presetId,name:P.name,x:p.x,y:p.y,bright:P.bright,dim:P.dim,color:P.color,intensity:P.intensity,anim:P.anim,angle:P.angle||360,rot:P.angle?-90:0,darkness:!!P.darkness,on:true};
}
function tokenLightFrom(presetId,on){
  if(presetId==='none')return{preset:'none',on:false,bright:0,dim:0,color:'#FFFFFF',intensity:1,anim:'none',angle:360,rot:0};
  const P=LIGHT_PRESETS[presetId];return{preset:presetId,on:on!==false,bright:P.bright,dim:P.dim,color:P.color,intensity:P.intensity,anim:P.anim,angle:P.angle||360,rot:0};
}
function newToken(p,kind,extra){
  const enemy=kind==='enemy';
  const n=S.tokens.filter(t=>t.kind===kind).length+1;
  return Object.assign({id:nid(),type:'token',kind,name:enemy?`Enemigo ${n}`:`Personaje ${n}`,x:p.x,y:p.y,size:1,
    color:enemy?'#D9705F':'#7FB2E5',hidden:enemy,vision:!enemy,sight:0,darkvision:enemy?60:0,
    light:tokenLightFrom(enemy?'none':'torch',!enemy),img:null},extra||{});
}
function addObj(o){S[COLL[o.type]].push(o);return o}
function addWall(a,b,kind,group){if(dist(a,b)<1)return null;const w={id:nid(),type:'wall',kind:kind||'wall',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},open:false,locked:false};if(group)w.group=group;return addObj(w)}
function polyWalls(pts,closed,kind,group){const g=group||nid(),ids=[];const n=closed?pts.length:pts.length-1;for(let i=0;i<n;i++){const w=addWall(pts[i],pts[(i+1)%pts.length],kind,g);if(w)ids.push(w.id)}return ids}
function wallKindForShape(){return UI.wallShape!=='chain'&&(UI.wallType==='door'||UI.wallType==='portal')?'wall':UI.wallType}
function groupIds(o,e){if(o.type==='wall'&&o.group&&!(e&&e.altKey))return S.walls.filter(w=>w.group===o.group).map(w=>w.id);return[o.id]}
/* Zonas de cualquier forma */
function addZone(pts,name){const z={id:nid(),type:'zone',name:name||'Interior',pts:pts.map(q=>({x:q.x,y:q.y})),x:0,y:0,w:0,h:0};zoneBBox(z);return addObj(z)}
function finishZonePoly(){
  const pts=UI.zpoly;UI.zpoly=null;
  if(!pts||pts.length<3){requestRender();toast('Una zona necesita al menos tres puntos');return}
  pushUndo();const z=addZone(pts,'Interior');UI.selected=[z.id];changed();toast('Zona creada. Arrastra sus vértices para ajustarla.');
}
function loopFromWalls(ws){
  if(ws.length<2)return null;
  const key=q=>Math.round(q.x)+','+Math.round(q.y);
  const adj=new Map();const addE=(u,v,q)=>{if(!adj.has(u))adj.set(u,{q,n:[]});adj.get(u).n.push(v)};
  for(const w of ws){const a=key(w.a),b=key(w.b);addE(a,b,w.a);addE(b,a,w.b)}
  const start=[...adj.keys()][0],pts=[];let prev=null,cur=start;const seen=new Set();
  while(cur&&!seen.has(cur)){seen.add(cur);pts.push(adj.get(cur).q);const nx=adj.get(cur).n.find(v=>v!==prev&&!seen.has(v));prev=cur;cur=nx}
  if(pts.length===adj.size&&pts.length>2)return pts;
  const all=[...adj.values()].map(v=>v.q);const cx=all.reduce((s,q)=>s+q.x,0)/all.length,cy=all.reduce((s,q)=>s+q.y,0)/all.length;
  return all.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
}
function zoneFromWalls(ws){const pts=loopFromWalls(ws);if(!pts||pts.length<3){toast('Selecciona una figura de muros cerrada');return}pushUndo();const z=addZone(pts,'Interior');UI.selected=[z.id];changed();toast('Zona interior creada con la forma de los muros')}

/* Física de objetos: muros ligados que siguen al objeto al moverlo, girarlo o escalarlo */
function buildPhysics(o){
  const P=o.physics;if(!P)return;
  S.walls=S.walls.filter(w=>w.group!==P.group);
  if(P.shape==='rect')polyWalls(assetCorners(o),true,P.kind,P.group);
  else{const rx=o.w/2*.92,ry=o.h/2*.92;polyWalls(ellipsePoints(o.x,o.y,rx,ry,o.rot||0,segCount(Math.PI*(rx+ry))),true,P.kind,P.group)}
  touchWalls();
}
function setPhysics(o,shape,kind){
  if(o.physics)S.walls=S.walls.filter(w=>w.group!==o.physics.group);
  o.physics=shape?{group:nid(),shape,kind}:null;
  if(!o.physics)delete o.physics;else buildPhysics(o);
}
function wrapAsset(o,shape,kind){
  pushUndo();setPhysics(o,shape,kind);UI.selected=[o.id];changed(true);
  toast(`${o.name||'El objeto'} ahora tiene ${WALL_TYPES[kind].name.toLowerCase()} ${shape==='rect'?'rectangular':'circular'}`);
}
const physicsWalls=objs=>{const gs=new Set(objs.filter(o=>o.type==='asset'&&o.physics).map(o=>o.physics.group));return gs.size?S.walls.filter(w=>gs.has(w.group)):[]};
function deleteSel(){
  if(!UI.selected.length)return;
  if(!isGM()){
    const ids=new Set(selObjs().filter(o=>ownsPlan(o)||(UI.realRole==='gm'&&o.type==='plan')).map(o=>o.id));
    if(!ids.size)return;
    S.plans=S.plans.filter(o=>!ids.has(o.id));UI.selected=UI.selected.filter(id=>!ids.has(id));closePops();changed();toast('Plano borrado');return;
  }
  pushUndo();const ids=new Set(UI.selected);for(const w of physicsWalls(selObjs()))ids.add(w.id);
  for(const k of Object.values(COLL))S[k]=S[k].filter(o=>!ids.has(o.id));
  UI.selected=[];closePops();changed(true);toast('Eliminado');
}
function duplicateSel(){
  if(!isGM())return;const objs=selObjs().filter(o=>!layerState(o).locked);if(!objs.length)return;
  pushUndo();const out=[];
  const gmap=new Map();
  for(const o of objs){const c=JSON.parse(JSON.stringify(o));c.id=nid();const d=CELL;
    if(c.group){if(!gmap.has(c.group))gmap.set(c.group,nid());c.group=gmap.get(c.group)}
    translateObj(c,d,d);
    if(c.type==='token')c.name=c.name.replace(/\s*\d*$/,'')+' '+(S.tokens.filter(t=>t.kind===c.kind).length+1);
    if(c.type==='asset'&&c.physics){c.physics.group=nid();}
    if(c.type==='wall'&&c.group&&objs.some(x=>x.type==='asset'&&x.physics&&x.physics.group===o.group))continue;
    addObj(c);if(c.type==='asset'&&c.physics)buildPhysics(c);out.push(c.id)}
  UI.selected=out;changed(true);
}
function toggleDoor(w){
  if(!isGM()&&S.playersDoors===false){toast('El director no permite abrir puertas');return}
  if(!isGM()&&w.locked){toast('La puerta está cerrada con llave');return}
  pushUndo();if(isGM()&&w.locked&&!w.open)w.locked=false;w.open=!w.open;changed(true);
}

/* ---------- Detección ---------- */
function hitDoor(p){const tol=px(15);let best=null,bd=tol;for(const w of S.walls){if(w.kind!=='door'&&w.kind!=='portal')continue;if(isGM()&&!S.layers.walls.visible)continue;if(!isGM()&&!doorVisibleToPlayers(w))continue;const m={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};const d=dist(p,m);if(d<bd){bd=d;best=w}}return best}
const usable=o=>{const L=layerState(o);return L.visible&&!L.locked};
function hitTest(p){
  if(!isGM()){
    for(const t of[...S.tokens].reverse())if(canControl(t)&&dist(t,p)<=tokenRadius(t))return t;
    for(const q of[...S.plans].reverse())if((ownsPlan(q)||UI.realRole==='gm')&&planHitDist(p,q)<px(9))return q;
    return null;
  }
  for(const l of[...S.lights].reverse())if(usable(l)&&dist(l,p)<=px(16))return l;
  for(const t of[...S.tokens].reverse())if(usable(t)&&dist(t,p)<=tokenRadius(t))return t;
  let best=null,bd=px(9);
  for(const w of S.walls){if(!usable(w))continue;const d=pointSegDist(p,w.a,w.b);if(d<bd){bd=d;best=w}}
  if(best)return best;
  for(const q of[...S.plans].reverse()){if(usable(q)&&planHitDist(p,q)<px(9))return q}
  for(const z of[...S.zones].reverse())if(usable(z)&&(z.pts?polyEdgeDist(p,z.pts):rectEdgeDist(p,z))<px(9))return z;
  const as=[...S.assets].sort((a,b)=>(a.kind==='prop')-(b.kind==='prop')).reverse();
  for(const a of as)if(usable(a)&&inAsset(p,a))return a;
  return null;
}
function planHitDist(p,q){
  if(q.shape==='cone'&&dist(p,q.a)<dist(q.a,q.b)&&angDiff(Math.atan2(p.y-q.a.y,p.x-q.a.x)*180/Math.PI,Math.atan2(q.b.y-q.a.y,q.b.x-q.a.x)*180/Math.PI)<26)return 0;
  return q.shape==='circle'?Math.abs(dist(p,q.a)-dist(q.a,q.b)):q.shape==='rect'?rectEdgeDist(p,normRect(q.a,q.b)):pointSegDist(p,q.a,q.b);
}
function polyEdgeDist(p,pts){let m=Infinity;for(let i=0;i<pts.length;i++)m=Math.min(m,pointSegDist(p,pts[i],pts[(i+1)%pts.length]));return m}
function rectEdgeDist(p,r){const c=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];let m=Infinity;for(let i=0;i<4;i++)m=Math.min(m,pointSegDist(p,c[i],c[(i+1)%4]));return m}
/* Tiradores para orientar el cono de luz de una ficha (linterna sorda): director o dueño.
   Tres puntos sobre la línea de dirección —junto a la ficha, a media luz y en el extremo—
   para no tener que alejar el zoom cuando la luz llega lejos. */
function tokenAimHandles(t){
  const L=tokenLight(t);if(!L||L.angle>=360)return [];
  const a=(L.rot||0)*Math.PI/180,rr=ftPx(L.bright+L.dim),near=tokenRadius(t)*1.7;
  return [near,Math.max(near+px(14),rr/2),rr].map(r=>({x:t.x+Math.cos(a)*r,y:t.y+Math.sin(a)*r}));
}
function hitHandle(p){
  for(const o of selObjs()){if(o.type==='token'&&canControl(o)&&tokenAimHandles(o).some(h=>dist(p,h)<=px(10)))return{kind:'lightAim',o}}
  if(!isGM())return null;
  for(const o of selObjs()){
    if(!usable(o))continue;
    if(o.type==='light'&&dist(p,lightHandlePos(o))<=px(10))return{kind:'lightRadius',o};
    if(o.type==='wall'){for(const k of['a','b'])if(dist(p,o[k])<=px(9))return{kind:'wallEnd',o,k}}
    if(o.type==='asset'){if(o.kind==='prop'&&dist(p,rotHandle(o))<=px(10))return{kind:'rotate',o};for(const h of assetCorners(o))if(dist(p,h)<=px(9))return{kind:'resize',o,h:h.k}}
    if(o.type==='zone'&&o.pts){for(let i=0;i<o.pts.length;i++)if(dist(p,o.pts[i])<=px(8))return{kind:'zoneVertex',o,i}}
    if(o.type==='zone'&&!o.pts){for(const h of cornerHandles({x:o.x+o.w/2,y:o.y+o.h/2,w:o.w,h:o.h}))if(dist(p,h)<=px(9))return{kind:'zoneResize',o,h:h.k}}
  }
  return null;
}

/* ---------- Puntero ---------- */
function evScreen(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function setTool(t){
  if(!isGM()&&!PLAYER_TOOLS.includes(t)){toast('Solo el Director puede editar la escena');return}
  finishChain();UI.curve=null;UI.arc=null;UI.zpoly=null;UI.tool=t;UI.act=null;
  $$('.tool').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===t)));
  stage.classList.toggle('crosshair',!['select','pan'].includes(t));
  stage.style.cursor=t==='pan'?'grab':'';
  renderSubbar();requestRender();
}
function finishChain(){if(UI.chain){UI.chain=null;requestRender()}}
/* Arrastrar una articulación: se mueven a la vez todos los extremos de muro que coinciden en ese punto */
function startWallEnd(pt,snap){
  const joined=[];for(const w of S.walls)for(const k of['a','b'])if(dist(w[k],pt)<.5&&usable(w))joined.push({w,k});
  UI.act={kind:'wallEnd',joined,snap:snap||snapshot(),ignore:new Set(joined.map(j=>j.w))};
}
function hitWallVertex(p){
  if(!S.layers.walls.visible)return null;
  let best=null,bd=px(9);
  for(const w of S.walls){if(!usable(w))continue;for(const k of['a','b']){const d=dist(p,w[k]);if(d<=bd){bd=d;best=w[k]}}}
  return best;
}
stage.addEventListener('pointerdown',e=>{
  if(is25())return;
  closePops();
  stage.setPointerCapture(e.pointerId);
  UI.pointers.set(e.pointerId,evScreen(e));
  if(UI.pointers.size===2){const[a,b]=[...UI.pointers.values()];UI.pinch={d:dist(a,b),zoom:UI.cam.zoom,mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},cam:{...UI.cam}};UI.act=null;return}
  const sp=evScreen(e),p=toWorld(sp);UI.lastEvent=e;
  if(e.button===1||(e.button===0&&(UI.space||UI.tool==='pan'))){UI.act={kind:'pan',sx:e.clientX,sy:e.clientY};stage.classList.add('panning');return}
  if(e.button!==0)return;
  const gm=isGM();
  if(UI.tool==='select'||(!gm)){const d=hitDoor(p);if(d&&UI.tool!=='ruler'){if(d.kind==='portal')portalClick(d,sp);else toggleDoor(d);return}}
  switch(UI.tool){
    case 'ruler':UI.act={kind:'ruler',a:snapCell(p),b:snapCell(p)};requestRender();return;
    case 'wall':{
      // con la herramienta de muros, pinchar una articulación existente la arrastra en vez de empezar un tramo
      if(!UI.chain&&!UI.curve&&!UI.arc&&UI.wallShape==='chain'){const v=hitWallVertex(p);if(v){startWallEnd(v);return}}
      const q=snapWallPoint(p,e);
      if(UI.wallShape==='rect'){UI.act={kind:'room',a:q,b:q};return}
      if(UI.wallShape==='circle'){const c=snapOn('walls',e)?halfSnap(p):p;UI.act={kind:'wcircle',a:c,b:c};return}
      if(UI.wallShape==='arc'){
        const c=snapOn('walls',e)?halfSnap(p):p;
        if(!UI.arc){UI.arc={c};toast('Ahora haz clic donde empieza el arco');requestRender();return}
        if(!UI.arc.p1){if(dist(p,UI.arc.c)<CELL/4)return;UI.arc.p1=p;toast('Clic donde termina: el arco avanza en sentido horario');requestRender();return}
        const R_=UI.arc;UI.arc=null;pushUndo();UI.selected=polyWalls(arcPoints(R_.c,R_.p1,p,e.shiftKey),false,wallKindForShape());changed(true);return;
      }
      if(UI.wallShape==='curve'){
        if(!UI.curve){UI.curve={a:q};requestRender();return}
        if(!UI.curve.b){if(dist(q,UI.curve.a)<1)return;UI.curve.b=q;requestRender();toast('Mueve el ratón para curvarla y haz clic para fijarla');return}
        const C=UI.curve;UI.curve=null;pushUndo();
        const len=dist(C.a,p)+dist(p,C.b);UI.selected=polyWalls(curvePoints(C.a,p,C.b,clamp(Math.round(len/(CELL*.45)),6,48)),false,wallKindForShape());changed(true);return;
      }
      if(!UI.chain){UI.chain={pts:[q],undo:snapshot(),added:false};requestRender();return}
      const pts=UI.chain.pts,last=pts[pts.length-1];
      if(dist(q,last)<1){finishChain();return}
      if(!UI.chain.added){pushUndo(UI.chain.undo);UI.chain.added=true}
      addWall(last,q,UI.wallType);pts.push(q);
      if(pts.length>2&&dist(q,pts[0])<1){finishChain()}
      changed(true);return;
    }
    case 'zone':{
      if(UI.zoneShape==='poly'){
        const q=snapZonePoint(p,e);
        if(!UI.zpoly){UI.zpoly=[q];requestRender();return}
        if(UI.zpoly.length>2&&dist(q,UI.zpoly[0])<px(12)){finishZonePoly();return}
        if(dist(q,UI.zpoly[UI.zpoly.length-1])<1){finishZonePoly();return}
        UI.zpoly.push(q);requestRender();return;
      }
      if(UI.zoneShape==='circle'){const c=snapOn('zones',e)?halfSnap(p):p;UI.act={kind:'zcircle',a:c,b:c};return}
      const q=snapOn('zones',e)?snapVertex(p):p;UI.act={kind:'zone',a:q,b:q};return}
    case 'light':pushUndo();{const l=addObj(newLight(snapOn('lights',e)?snapCell(p):fine(p),UI.lightPreset));UI.selected=[l.id]}changed(true);return;
    case 'player':case 'enemy':pushUndo();{const t=addObj(newToken(snapOn('tokens',e)?snapCell(p):fine(p),UI.tool));UI.selected=[t.id]}changed();return;
    case 'plan':UI.act={kind:'plan',a:p,b:p};return;
  }
  // seleccionar / mover
  const h=hitHandle(p);
  if(h){
    const snap=snapshot();
    if(h.kind==='wallEnd')startWallEnd(h.o[h.k],snap);
    else UI.act=Object.assign({snap},h,{start:h.o.type==='asset'?{x:h.o.x,y:h.o.y,w:h.o.w,h:h.o.h,rot:h.o.rot||0}:JSON.parse(JSON.stringify(h.o))});
    return;
  }
  const o=hitTest(p);
  if(o){
    const ids=gm?groupIds(o,e):[o.id];
    if(e.shiftKey&&gm){UI.selected=isSel(o)?UI.selected.filter(id=>!ids.includes(id)):[...new Set([...UI.selected,...ids])]}
    else if(!isSel(o)||(e.altKey&&o.group))UI.selected=ids;
    let items=selObjs().filter(x=>gm?usable(x):(canControl(x)||ownsPlan(x)));
    if(gm){const extra=physicsWalls(items).filter(w=>!items.includes(w));items=[...items,...extra]}
    UI.act={kind:'move',origin:p,snap:snapshot(),moved:false,items:items.map(x=>({o:x,x:x.x,y:x.y,a:x.a&&{...x.a},b:x.b&&{...x.b},pts:x.pts&&x.pts.map(q=>({...q}))}))};
    refreshPanels();requestRender();return;
  }
  if(!e.shiftKey)UI.selected=[];
  if(gm)UI.act={kind:'box',a:p,b:p,add:e.shiftKey};
  refreshPanels();requestRender();
});
stage.addEventListener('pointermove',e=>{
  if(is25())return;
  const sp=evScreen(e),p=toWorld(sp);UI.hover=p;UI.lastEvent=e;Net.cursorMoved();
  if(UI.pointers.has(e.pointerId))UI.pointers.set(e.pointerId,sp);
  if(UI.pinch&&UI.pointers.size===2){
    const[a,b]=[...UI.pointers.values()],P=UI.pinch;
    const z=clamp(P.zoom*dist(a,b)/P.d,.15,4),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const anchor={x:(P.mid.x-W/2)/P.zoom+P.cam.x,y:(P.mid.y-H/2)/P.zoom+P.cam.y};
    UI.cam.zoom=z;UI.cam.x=anchor.x-(mid.x-W/2)/z;UI.cam.y=anchor.y-(mid.y-H/2)/z;requestRender();return;
  }
  const A=UI.act;
  if(!A){requestRender();return}
  switch(A.kind){
    case 'pan':UI.cam.x-=(e.clientX-A.sx)/UI.cam.zoom;UI.cam.y-=(e.clientY-A.sy)/UI.cam.zoom;A.sx=e.clientX;A.sy=e.clientY;break;
    case 'ruler':A.b=snapCell(p);break;
    case 'room':A.b=snapWallPoint(p,e);break;
    case 'wcircle':case 'zcircle':A.b=p;break;
    case 'lightAim':{const o=A.o;let ang=Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI;ang=e.altKey?Math.round(ang/15)*15:Math.round(ang);o.light.rot=((ang%360)+360)%360;A.moved=true;break}
    case 'rotate':{const o=A.o;let ang=Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI+90;if(!e.altKey)ang=Math.round(ang/15)*15;o.rot=((ang%360)+360)%360;buildPhysics(o);A.moved=true;break}
    case 'zone':A.b=snapOn('zones',e)?snapVertex(p):p;break;
    case 'plan':case 'box':A.b=p;break;
    case 'lightRadius':{const l=A.o;const d=pxFt(dist(l,p));const total=Math.max(1,Math.round(d/ (e.altKey?1:2.5))*(e.altKey?1:2.5));const ratio=(A.start.bright+A.start.dim)>0?A.start.bright/(A.start.bright+A.start.dim):.5;l.bright=Math.round(total*ratio*10)/10;l.dim=Math.round((total-l.bright)*10)/10;if(l.angle<360)l.rot=Math.round(Math.atan2(p.y-l.y,p.x-l.x)*180/Math.PI);A.moved=true;break}
    case 'wallEnd':{const q=snapWallPoint(p,e,A.ignore);for(const j of A.joined)j.w[j.k]={x:q.x,y:q.y};A.moved=true;touchWalls();break}
    case 'resize':{
      const o=A.o,s=A.start,q=rotPt(p,s,-s.rot);
      const opp={x:A.h.includes('w')?s.x+s.w/2:s.x-s.w/2,y:A.h.includes('n')?s.y+s.h/2:s.y-s.h/2};
      let w=Math.max(20,Math.abs(q.x-opp.x)),h=Math.max(20,Math.abs(q.y-opp.y));
      if(!e.shiftKey){h=w*s.h/s.w;if(h<20){h=20;w=h*s.w/s.h}}
      const sx=A.h.includes('w')?-1:1,sy=A.h.includes('n')?-1:1;
      const mid=rotPt({x:opp.x+sx*w/2,y:opp.y+sy*h/2},s,s.rot);
      o.w=w;o.h=h;o.x=mid.x;o.y=mid.y;buildPhysics(o);A.moved=true;break}
    case 'zoneVertex':{const o=A.o;o.pts[A.i]=snapZonePoint(p,e);zoneBBox(o);A.moved=true;break}
    case 'zoneResize':{const o=A.o,s=A.start;let x1=s.x,y1=s.y,x2=s.x+s.w,y2=s.y+s.h;const q=snapOn('zones',e)?snapVertex(p):p;
      if(A.h.includes('w'))x1=q.x;if(A.h.includes('e'))x2=q.x;if(A.h.includes('n'))y1=q.y;if(A.h.includes('s'))y2=q.y;
      Object.assign(o,normRect({x:x1,y:y1},{x:x2,y:y2}));A.moved=true;break}
    case 'move':{
      const dx=p.x-A.origin.x,dy=p.y-A.origin.y;if(Math.hypot(dx,dy)*UI.cam.zoom<3&&!A.moved)return;A.moved=true;
      let wallsMoved=false;
      for(const it of A.items){const o=it.o;
        if(o.type==='wall'){o.a={x:it.a.x+dx,y:it.a.y+dy};o.b={x:it.b.x+dx,y:it.b.y+dy};wallsMoved=true}
        else if(o.type==='plan'){o.a={x:it.a.x+dx,y:it.a.y+dy};o.b={x:it.b.x+dx,y:it.b.y+dy}}
        else if(o.type==='token'&&!isGM()&&UI.realRole!=='gm'){const n=tryMove(o,{x:it.x+dx,y:it.y+dy});o.x=n.x;o.y=n.y}
        else{o.x=it.x+dx;o.y=it.y+dy;if(it.pts)o.pts=it.pts.map(q=>({x:q.x+dx,y:q.y+dy}))}
      }
      if(wallsMoved)touchWalls();
      break;
    }
  }
  requestRender();
});
function endPointer(e){
  if(is25())return;
  UI.pointers.delete(e.pointerId);
  if(UI.pinch){if(UI.pointers.size<2)UI.pinch=null;return}
  const A=UI.act;UI.act=null;stage.classList.remove('panning');
  if(!A)return;
  const p=toWorld(evScreen(e));
  switch(A.kind){
    case 'ruler':break;
    case 'room':{const r=normRect(A.a,A.b);if(r.w>=CELL/2&&r.h>=CELL/2){pushUndo();const c=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];UI.selected=polyWalls(c,true,wallKindForShape());changed(true);toast('Sala creada. Clic derecho en un tramo para convertirlo en puerta.',2600)}break}
    case 'zcircle':{const r=dist(A.a,A.b);if(r>=CELL/4){pushUndo();const z=addZone(ellipsePoints(A.a.x,A.a.y,r,r,0,segCount(2*Math.PI*r)),'Interior circular');UI.selected=[z.id];changed()}break}
    case 'wcircle':{const r=dist(A.a,A.b);if(r>=CELL/4){pushUndo();UI.selected=polyWalls(ellipsePoints(A.a.x,A.a.y,r,r,0,segCount(2*Math.PI*r)),true,wallKindForShape());changed(true)}break}
    case 'zone':{const r=normRect(A.a,A.b);if(r.w>=CELL/2&&r.h>=CELL/2){pushUndo();const z=addObj(Object.assign({id:nid(),type:'zone',name:'Interior'},r));UI.selected=[z.id];changed();if(S.ambient===0)toast('Las zonas interiores se notan cuando hay luz ambiental (exterior)',2600)}break}
    case 'plan':if(dist(A.a,A.b)*UI.cam.zoom>4){
      pushUndo();const q={id:nid(),type:'plan',shape:UI.planShape,a:A.a,b:A.b};
      if(UI.realRole!=='gm'&&UI.me){q.owner=UI.me.id;q.color=UI.me.color}
      addObj(q);changed();
    }break;
    case 'box':{const r=normRect(A.a,A.b);if(r.w*UI.cam.zoom>3){const inside=o=>{if(!usable(o))return false;if(o.a)return inRect(o.a,r)&&inRect(o.b,r);if(o.type==='zone')return inRect(o,r)&&inRect({x:o.x+o.w,y:o.y+o.h},r);if(o.type==='asset')return false;return inRect(o,r)};const ids=[...S.walls,...S.lights,...S.tokens,...S.plans,...S.zones].filter(inside).map(o=>o.id);UI.selected=A.add?[...new Set([...UI.selected,...ids])]:ids;refreshPanels()}break}
    case 'move':
      if(A.moved){
        if(S.snap&&!e.altKey&&A.items.length){
          const delta=o=>{let s=null;
            if(o.type==='token'){if(snapOn('tokens'))s=snapToken(o,o)}
            else if(o.type==='light'){if(snapOn('lights'))s=snapCell(o)}
            else if(o.type==='asset'&&o.kind==='prop'){if(!snapOn('props'))return null;s=snapCell(o);if(Math.round(o.w/CELL)%2===0)s.x=Math.round(o.x/CELL)*CELL;if(Math.round(o.h/CELL)%2===0)s.y=Math.round(o.y/CELL)*CELL}
            else if(o.type==='zone'){if(snapOn('zones'))s=snapVertex(o)}
            else if(o.type==='wall'){if(!snapOn('moveWalls'))return null;const v=snapVertex(o.a);return{x:v.x-o.a.x,y:v.y-o.a.y}}
            return s?{x:s.x-o.x,y:s.y-o.y}:null};
          const shift=(o,d)=>{if(o.type==='token'&&!isGM()){const t={x:o.x+d.x,y:o.y+d.y};if(!moveBlocked(o,t,tokenRadius(o)*.5)){o.x=t.x;o.y=t.y}}else translateObj(o,d.x,d.y)};
          if(A.items.length===1){const d=delta(A.items[0].o);if(d)shift(A.items[0].o,d)}
          else{let d=null;for(const it of A.items){if(it.o.type==='wall'&&it.o.group!=null&&A.items.some(x=>x.o.type==='asset'&&x.o.physics&&x.o.physics.group===it.o.group))continue;d=delta(it.o);if(d)break}if(d)for(const it of A.items)if(it.o.type!=='plan'&&!(it.o.type==='asset'&&it.o.kind!=='prop'))shift(it.o,d)}
        }
        for(const it of A.items)tidyCoords(it.o);
        for(const it of A.items)if(it.o.type==='asset'&&it.o.physics)buildPhysics(it.o);
        pushUndo(A.snap);changed(true);
      }
      break;
    case 'lightAim':case 'lightRadius':case 'wallEnd':case 'resize':case 'zoneResize':case 'zoneVertex':case 'rotate':if(A.moved){pushUndo(A.snap);changed(true)}break;
  }
  requestRender();
}
stage.addEventListener('pointerup',endPointer);
stage.addEventListener('pointercancel',endPointer);
stage.addEventListener('pointerleave',()=>{UI.hover=null;requestRender()});
stage.addEventListener('dblclick',e=>{
  if(is25())return;
  if(UI.tool==='wall'){finishChain();return}
  if(UI.tool==='zone'){if(UI.zpoly)finishZonePoly();return}
  if(UI.tool!=='select')return;
  const p=toWorld(evScreen(e));const o=hitTest(p);
  if(o&&(isGM()||canControl(o)))openEditor(o,evScreen(e));
});
stage.addEventListener('contextmenu',e=>{
  if(is25())return;
  e.preventDefault();
  if(UI.chain){finishChain();return}
  if(UI.curve||UI.arc){UI.curve=null;UI.arc=null;requestRender();return}
  if(UI.zpoly){finishZonePoly();return}
  const p=toWorld(evScreen(e));const d=hitDoor(p);const o=d||hitTest(p);
  if(!o){if(UI.tool!=='select'&&isGM())setTool('select');return}
  if(!isSel(o))UI.selected=[o.id];refreshPanels();requestRender();
  openContext(o,evScreen(e));
});
stage.addEventListener('wheel',e=>{
  if(is25())return;
  e.preventDefault();
  const sp=evScreen(e),before=toWorld(sp);
  const k=Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015));
  UI.cam.zoom=clamp(UI.cam.zoom*k,.05,4);
  const after=toWorld(sp);UI.cam.x+=before.x-after.x;UI.cam.y+=before.y-after.y;requestRender();
},{passive:false});
// arrastrar luces e imágenes desde las bibliotecas, o archivos desde el escritorio
stage.addEventListener('dragover',e=>{if(is25())return;const t=e.dataTransfer.types;if(isGM()&&(t.includes('text/x-light')||t.includes('text/x-image')||t.includes('Files'))){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
stage.addEventListener('drop',e=>{
  if(is25())return;
  if(!isGM())return;e.preventDefault();
  const p=toWorld(evScreen(e));
  const lid=e.dataTransfer.getData('text/x-light');
  if(lid){pushUndo();const l=addObj(newLight(snapOn('lights',e)?snapCell(p):fine(p),lid));UI.selected=[l.id];changed();toast(`${l.name} colocada`);return}
  const iid=e.dataTransfer.getData('text/x-image');
  if(iid){const m=Store.meta(iid);if(m)placeImage(m,p,e.altKey);return}
  const files=[...e.dataTransfer.files].filter(f=>/^image\//.test(f.type));
  if(files.length)uploadFiles(files,UI.upCat,p);
});

/* ---------- Teclado ---------- */
window.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  if(['input','select','textarea'].includes(tag))return;
  if(tag==='button'&&(e.code==='Space'||e.key==='Enter'))return;
  if(is25()&&e.key!=='Escape')return;
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&k==='y'){e.preventDefault();redo();return}
  if(mod&&k==='d'){e.preventDefault();duplicateSel();return}
  if(mod)return;
  if(e.code==='Space'){UI.space=true;stage.style.cursor='grab';e.preventDefault();return}
  if(k==='enter'&&UI.zpoly){finishZonePoly();return}
  if(k==='escape'){UI.curve=null;UI.arc=null;UI.zpoly=null;if(UI.chain)finishChain();else if(UI.act)UI.act=null;else{UI.selected=[];refreshPanels()}closePops();requestRender();return}
  if(k==='delete'||k==='backspace'){e.preventDefault();deleteSel();return}
  if(k.startsWith('arrow')&&UI.selected.length){
    e.preventDefault();
    const objs=selObjs().filter(o=>isGM()?usable(o):(canControl(o)||ownsPlan(o)));if(!objs.length)return;
    const onlyTokens=objs.every(o=>o.type==='token');
    const d=onlyTokens?(e.shiftKey?CELL*5:CELL):(e.altKey?1:e.shiftKey?CELL:5);
    const dx=k==='arrowleft'?-d:k==='arrowright'?d:0,dy=k==='arrowup'?-d:k==='arrowdown'?d:0;
    if(isGM())pushUndo();let walls=false;
    for(const w of physicsWalls(objs))if(!objs.includes(w))objs.push(w);
    for(const o of objs){if(o.type==='token'&&!isGM()&&UI.realRole!=='gm'){const n=tryMove(o,{x:o.x+dx,y:o.y+dy});o.x=n.x;o.y=n.y}else{translateObj(o,dx,dy);if(o.type==='wall')walls=true}}
    changed(walls);return;
  }
  if((k==='q'||k==='c')&&!e.repeat&&isGM()){UI.wallShape=k==='q'?'rect':'circle';setTool('wall');return}
  const map={v:'select',h:'pan',r:'ruler',w:'wall',z:'zone',l:'light',p:'player',e:'enemy',m:'plan'};
  if(map[k]&&!e.repeat){if(k==='w')UI.wallShape='chain';setTool(map[k])}
});
window.addEventListener('keyup',e=>{if(e.code==='Space'){UI.space=false;stage.style.cursor=UI.tool==='pan'?'grab':''}});

/* ---------- Menú contextual ---------- */
const ctxEl=$('#ctx'),edEl=$('#editor');
for(const el of[ctxEl,edEl,$('#subbar'),$('#selbar')])for(const ev of['pointerdown','wheel','dblclick','contextmenu'])el.addEventListener(ev,e=>e.stopPropagation(),{passive:true});
function closePops(){ctxEl.style.display='none';edEl.style.display='none';edState=null}
function placePop(el,sp,w,h){el.style.display='block';el.style.maxHeight='';const r=el.getBoundingClientRect();const top=clamp(sp.y+8,8,Math.max(8,H-(h||r.height)-8));el.style.left=clamp(sp.x+8,8,W-(w||r.width)-8)+'px';el.style.top=top+'px';if(el===edEl)el.style.maxHeight=(H-top-8)+'px'}
function describe(o){
  if(o.type==='wall'&&o.kind==='portal'){const dst=o.target&&UI.scenes.find(x=>x.id===o.target.scene);return (o.name||'Portal')+(dst?` a ${dst.name}`:' sin destino')}
  if(o.type==='wall')return WALL_TYPES[o.kind].name+(o.kind==='door'?(o.open?' abierta':' cerrada'):'');
  if(o.type==='light')return o.name||'Luz';
  if(o.type==='token')return o.name;
  if(o.type==='zone')return o.name||'Zona interior';
  if(o.type==='plan')return({line:'Línea',circle:'Círculo',rect:'Rectángulo',cone:'Cono'})[o.shape]+' de plano';
  if(o.type==='asset')return o.name||(o.kind==='prop'?'Objeto':'Tablero');
  return 'Elemento';
}
function openContext(o,sp){
  const items=[];const add=(ic,txt,fn,cls)=>items.push({ic,txt,fn,cls});
  const gm=isGM()||UI.realRole==='gm';
  if(o.type==='wall'&&o.kind==='portal'){
    const dst=o.target&&UI.scenes.find(x=>x.id===o.target.scene);
    if(dst){
      if(gm){add('users',`Llevar al grupo a ${dst.name}`,()=>Net.travel(o.id,true));add('eye',`Ir solo yo a ver ${dst.name}`,()=>Net.travel(o.id,false))}
      else if(ownsToken(S.tokens.find(ownsToken)))add('log-in',`Cruzar a ${dst.name}`,()=>portalClick(o,sp));
    }
  }
  if(o.type==='wall'&&o.kind==='door'){
    if(gm||!o.locked)add(o.open?'door-closed':'door-open',o.open?'Cerrar puerta':'Abrir puerta',()=>toggleDoor(o));
    if(gm)add(o.locked?'lock-open':'lock',o.locked?'Quitar llave':'Cerrar con llave',()=>{pushUndo();o.locked=!o.locked;if(o.locked)o.open=false;changed(true)});
  }
  if(!gm){
    if(ownsPlan(o))add('trash-2','Borrar este plano',()=>{UI.selected=[o.id];deleteSel()},'danger');
    if(ownsToken(o)){add('lightbulb',o.light&&o.light.on?'Apagar mi luz':'Encender mi luz',()=>{pushUndo();if(!o.light||o.light.preset==='none')o.light=tokenLightFrom('torch');else o.light.on=!o.light.on;changed()});add('settings-2','Editar mi personaje',()=>openEditor(o,sp))}
  }else{
    add('settings-2','Editar',()=>openEditor(o,sp));
    if(o.type==='wall'){
      if(o.group&&UI.selected.length<2)add('shapes','Seleccionar la figura completa',()=>{UI.selected=groupIds(o);refreshPanels();requestRender()});
      const targets=selObjs().filter(x=>x.type==='wall');const many=targets.length>1;
      const fig=many?targets:(o.group?S.walls.filter(w=>w.group===o.group):[]);
      if(fig.length>2)add('house','Crear zona interior con esta forma',()=>zoneFromWalls(fig));
      for(const[k,T]of Object.entries(WALL_TYPES))if(many||k!==o.kind)add(T.icon,(many?'Convertir todo en ':'Convertir en ')+T.name.toLowerCase(),()=>{pushUndo();for(const w of(many?targets:[o])){w.kind=k;w.open=false}changed(true)});
    }
    if(o.type==='asset'){
      add(o.kind==='prop'?'map':'armchair',o.kind==='prop'?'Usar como tablero':'Usar como objeto',()=>{pushUndo();o.kind=o.kind==='prop'?'map':'prop';if(o.kind==='map')o.rot=0;changed()});
      if(o.kind==='prop'){add('circle-dashed','Contorno circular (bloquea el paso)',()=>wrapAsset(o,'ellipse','barrier'));add('square-dashed','Contorno rectangular (bloquea todo)',()=>wrapAsset(o,'rect','wall'))}
    }
    if(o.type==='light')add(o.on?'lightbulb-off':'lightbulb',o.on?'Apagar':'Encender',()=>{pushUndo();o.on=!o.on;changed()});
    if(o.type==='token'){
      add(o.hidden?'eye':'eye-off',o.hidden?'Mostrar a jugadores':'Ocultar a jugadores',()=>{pushUndo();o.hidden=!o.hidden;changed()});
      if(o.light&&o.light.preset!=='none')add('lightbulb',o.light.on?'Apagar su luz':'Encender su luz',()=>{pushUndo();o.light.on=!o.light.on;changed()});
      if(o.kind==='player')add('scan-eye','Ver como esta ficha',()=>{UI.viewAs=o.id;setRole('player')});
    }
    add('copy','Duplicar',()=>{if(!isSel(o))UI.selected=[o.id];duplicateSel()});
    add('trash-2',UI.selected.length>1&&isSel(o)?`Eliminar ${UI.selected.length} elementos`:'Eliminar',()=>{if(!isSel(o))UI.selected=[o.id];deleteSel()},'danger');
  }
  ctxEl.innerHTML=`<div class="ctxTitle"></div>`;ctxEl.firstChild.textContent=describe(o);
  for(const it of items){const b=document.createElement('button');b.setAttribute('role','menuitem');if(it.cls)b.className=it.cls;b.innerHTML=svgIcon(it.ic);const s=document.createElement('span');s.textContent=it.txt;b.appendChild(s);b.onclick=()=>{ctxEl.style.display='none';it.fn()};ctxEl.appendChild(b)}
  placePop(ctxEl,sp);
}

/* ---------- Editor de propiedades ---------- */
let edState=null;
function openEditor(o,sp){
  closePops();
  edState={o,snap:snapshot(),dirty:false};
  $('#edTitle').textContent=describe(o);
  const body=$('#edBody');body.innerHTML='';
  const touch=(walls)=>{if(!edState.dirty){pushUndo(edState.snap);edState.dirty=true}if(o.type==='asset'&&o.physics){buildPhysics(o);walls=true}changed(walls);$('#edTitle').textContent=describe(o)};
  const field=(label,el)=>{const w=document.createElement('label');w.className='field';const s=document.createElement('span');s.textContent=label;w.append(s,el);body.appendChild(w);return el};
  const num=(label,val,min,max,step,set)=>{const i=document.createElement('input');i.type='number';i.value=val;i.min=min;i.max=max;i.step=step||1;i.oninput=()=>{const v=parseFloat(i.value);if(!isNaN(v)){set(clamp(v,min,max));touch()}};return field(label,i)};
  const text=(label,val,set)=>{const i=document.createElement('input');i.type='text';i.value=val||'';i.oninput=()=>{set(i.value);touch()};return field(label,i)};
  const color=(label,val,set)=>{const i=document.createElement('input');i.type='color';i.value=val;i.oninput=()=>{set(i.value);touch()};return field(label,i)};
  const select=(label,val,opts,set)=>{const s=document.createElement('select');for(const[k,v]of opts){const op=document.createElement('option');op.value=k;op.textContent=v;s.appendChild(op)}s.value=val;s.onchange=()=>{set(s.value);touch(true)};return field(label,s)};
  const range=(label,val,set)=>{const i=document.createElement('input');i.type='range';i.min=0;i.max=100;i.value=Math.round(val*100);i.oninput=()=>{set(+i.value/100);touch()};return field(label,i)};
  const check=(label,val,set)=>{const w=document.createElement('label');w.className='check';const i=document.createElement('input');i.type='checkbox';i.checked=!!val;i.onchange=()=>{set(i.checked);touch(true)};w.append(i,document.createTextNode(label));body.appendChild(w);return i};
  const section=t=>{const d=document.createElement('div');d.className='edSection';d.textContent=t;body.appendChild(d)};
  const note=t=>{const d=document.createElement('div');d.className='edNote';d.textContent=t;body.appendChild(d)};
  const gm=isGM()||UI.realRole==='gm';
  const animOpts=[['none','Fija'],['flicker','Llama'],['soft','Titileo suave'],['pulse','Pulso']];
  const lightFields=(L,isToken)=>{
    const presetOpts=isToken?TOKEN_LIGHTS.map(k=>[k,k==='none'?'Sin luz':LIGHT_PRESETS[k].name]):[...Object.entries(LIGHT_PRESETS).map(([k,v])=>[k,v.name]),['custom','Personalizada']];
    select('Fuente',L.preset,presetOpts,v=>{
      if(isToken){Object.assign(L,tokenLightFrom(v,true))}
      else if(v!=='custom'){const P=LIGHT_PRESETS[v];Object.assign(L,{preset:v,name:P.name,bright:P.bright,dim:P.dim,color:P.color,intensity:P.intensity,anim:P.anim,angle:P.angle||360,darkness:!!P.darkness})}
      else L.preset='custom';
      setTimeout(()=>openEditor(o,sp));
    });
    if(isToken&&L.preset==='none')return;
    if(!gm&&isToken){check('Encendida',L.on,v=>L.on=v);if(L.angle<360){num('Dirección (°)',L.rot||0,-360,360,15,v=>{L.rot=v});note('Con la ficha seleccionada, arrastra cualquiera de los tres puntos del cono para girarla (Alt = pasos de 15°).')}return}
    const custom=()=>{if(!isToken&&L.preset!=='custom')L.preset='custom'};
    num(L.darkness?'Radio (pies)':'Luz brillante (pies)',L.bright,0,300,5,v=>{custom();L.bright=v});
    if(!L.darkness)num('Luz tenue extra (pies)',L.dim,0,300,5,v=>{custom();L.dim=v});
    if(!L.darkness){color('Color',L.color,v=>{custom();L.color=v});range('Intensidad',L.intensity??1,v=>{custom();L.intensity=v});select('Animación',L.anim||'none',animOpts,v=>{custom();L.anim=v})}
    num('Apertura (°)',L.angle||360,10,360,5,v=>{custom();L.angle=v});
    num('Dirección (°)',L.rot||0,-360,360,15,v=>{L.rot=v});
    check('Encendida',L.on,v=>L.on=v);
  };
  if(o.type==='light'){
    text('Nombre',o.name,v=>o.name=v);
    lightFields(o,false);
    note('Arrastra el tirador ámbar del borde para cambiar el alcance.');
  }else if(o.type==='token'){
    if(!gm){
      text('Nombre',o.name,v=>o.name=v);
      color('Color',o.color,v=>o.color=v);
      section('Retrato');
      body.appendChild(portraitPicker(o,()=>{touch();setTimeout(()=>openEditor(o,sp))}));
      note('Solo el director cambia la visión, el tamaño o la visibilidad.');
    }
    if(gm){
      text('Nombre',o.name,v=>o.name=v);
      select('Tipo',o.kind,[['player','Personaje'],['enemy','Enemigo']],v=>o.kind=v);
      select('Controla',o.owner==null?'':String(o.owner),[['','Nadie (solo el director)'],...Net.members.filter(m=>m.role!=='gm').map(m=>[String(m.id),m.name])],v=>o.owner=v?+v:null);
      select('Tamaño',String(o.size||1),[['1','Mediano (1 casilla)'],['2','Grande (2)'],['3','Enorme (3)'],['4','Gargantuesco (4)']],v=>o.size=+v);
      color('Color',o.color,v=>o.color=v);
      section('Retrato');
      body.appendChild(portraitPicker(o,()=>{touch();setTimeout(()=>openEditor(o,sp))}));
      check('Oculta para jugadores',o.hidden,v=>o.hidden=v);
      section('Visión');
      check('Tiene visión propia',o.vision!==false,v=>o.vision=v);
      num('Visión en la oscuridad (pies)',o.darkvision||0,0,300,5,v=>o.darkvision=v);
      note('Dentro de su visión en la oscuridad lo ve todo; más allá, sólo lo que esté iluminado. Los personajes comparten lo que ven; los enemigos no revelan nada.');
    }
    section('Luz que lleva');
    lightFields(o.light||(o.light=tokenLightFrom('none')),true);
  }else if(o.type==='wall'){
    select('Tipo',o.kind,Object.entries(WALL_TYPES).map(([k,v])=>[k,v.name]),v=>{o.kind=v;o.open=false;if(v!=='portal'){delete o.target;delete o.name}setTimeout(()=>openEditor(o,sp))});
    if(o.kind==='portal')portalFields(o,body,text,note,touch);
    note(WALL_TYPES[o.kind].desc);
    if(o.kind==='door'){check('Abierta',o.open,v=>o.open=v);check('Cerrada con llave',o.locked,v=>{o.locked=v;if(v)o.open=false})}
    note(`Longitud: ${Math.round(pxFt(dist(o.a,o.b)))} pies.`);
  }else if(o.type==='zone'){
    text('Nombre',o.name,v=>o.name=v);
    note('Dentro de la zona no llega la luz ambiental. Úsala para casas, cuevas o sótanos en mapas exteriores.');
  }else if(o.type==='asset'){
    const m=Store.meta(o.img);
    if(m){const pv=document.createElement('img');pv.className='edPreview';pv.src=m.thumb;pv.alt='';body.appendChild(pv)}
    text('Nombre',o.name,v=>o.name=v);
    select('Uso',o.kind==='prop'?'prop':'map',[['map','Tablero de fondo'],['prop','Objeto sobre el tablero']],v=>{o.kind=v;if(v==='map')o.rot=0;setTimeout(()=>openEditor(o,sp))});
    num('Ancho (casillas)',+(o.w/CELL).toFixed(2),.25,400,.25,v=>{const r=o.h/o.w;o.w=v*CELL;o.h=o.w*r});
    if(m&&o.kind!=='prop'){num('Píxeles por casilla',Math.round(m.width/(o.w/CELL)*10)/10,5,1000,1,v=>{const x0=o.x-o.w/2,y0=o.y-o.h/2;o.w=m.width/v*CELL;o.h=m.height/v*CELL;o.x=x0+o.w/2;o.y=y0+o.h/2;Store.update(m.id,{ppc:v})})}
    num('Alto (casillas)',+(o.h/CELL).toFixed(2),.25,400,.25,v=>{const r=o.w/o.h;o.h=v*CELL;o.w=o.h*r});
    if(o.kind==='prop')num('Giro (°)',Math.round(o.rot||0),-360,360,15,v=>o.rot=v);
    range('Opacidad',o.opacity??1,v=>o.opacity=Math.max(.05,v));
    note('Las esquinas conservan la proporción; mantén Mayús para deformar.');
    if(o.kind==='prop'){
      section('Física del objeto');
      const P=o.physics;
      note(P?`Tiene ${WALL_TYPES[P.kind].name.toLowerCase()} ${P.shape==='rect'?'rectangular':'circular'} que lo sigue al moverlo, girarlo o escalarlo.`:'Añade un contorno para que bloquee el paso, la vista o la luz. El contorno sigue al objeto.');
      const kindSel=document.createElement('select');for(const[k,T]of Object.entries(WALL_TYPES))if(k!=='door'&&k!=='portal'){const op=document.createElement('option');op.value=k;op.textContent=T.name;kindSel.appendChild(op)}kindSel.value=P?P.kind:'barrier';field('Bloquea como',kindSel);
      note('Barrera: solo el paso (mesas, barriles). Muro: todo (columnas, rocas). Velo: la vista (arbustos).');
      const row=document.createElement('div');row.className='row';row.style.marginTop='8px';
      for(const[shape,lab,ic]of[['ellipse','Circular','circle-dashed'],['rect','Rectangular','square-dashed']]){const b=document.createElement('button');b.className='btn'+(P&&P.shape===shape?' on':'');b.innerHTML=svgIcon(ic);b.append(lab);b.onclick=()=>{wrapAsset(o,shape,kindSel.value);setTimeout(()=>openEditor(o,sp))};row.appendChild(b)}
      body.appendChild(row);
      if(P){kindSel.onchange=()=>{wrapAsset(o,P.shape,kindSel.value);setTimeout(()=>openEditor(o,sp))};const rm=document.createElement('button');rm.className='btn danger';rm.style.marginTop='6px';rm.textContent='Quitar contorno';rm.onclick=()=>{pushUndo();setPhysics(o,null);changed(true);setTimeout(()=>openEditor(o,sp))};body.appendChild(rm)}
    }else{
      note('Los mapas comerciales indican la escala en el nombre, por ejemplo «14x15» o «72 DPI».');
      const b=document.createElement('button');b.className='btn';b.style.marginTop='10px';b.textContent='Alinear la esquina con la cuadrícula';b.onclick=()=>{const c=snapVertex({x:o.x-o.w/2,y:o.y-o.h/2});o.x=c.x+o.w/2;o.y=c.y+o.h/2;touch()};body.appendChild(b);
    }
  }else if(o.type==='plan'){
    select('Forma',o.shape,[['line','Línea'],['circle','Círculo'],['rect','Rectángulo'],['cone','Cono']],v=>o.shape=v);
  }
  hydrate(edEl);
  placePop(edEl,sp,300,Math.min(H-24,520));
}
$('#edClose').onclick=closePops;

/* ---------- Exportar / importar ---------- */
$('#exportBtn').onclick=async()=>{
  toast('Preparando la exportación…');
  const images={};for(const id of usedImageIds()){const d=await Store.dataUrl(id);const m=Store.meta(id);if(d)images[id]={name:m?m.name:'imagen',category:m?m.category:guessCat(id),data:d}}
  const data=JSON.stringify({app:'just-another-vtt',version:3,state:S,images});
  const filename=(S.name||'escena').replace(/[^\w\-áéíóúñ ]+/gi,'').trim().replace(/\s+/g,'-')+'.json';
  let dl=null;
  try{if(window.claude&&window.claude.use)dl=await window.claude.use('downloads')}catch(e){dl=null}
  if(dl){try{await dl.save({filename,data});toast('Escena exportada')}catch(err){if(err&&err.code!=='declined')toast('No se pudo exportar la escena')}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};
$('#importFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const rd=new FileReader();rd.onload=async()=>{try{const o=JSON.parse(rd.result);if(!o.state||!Array.isArray(o.state.walls))throw 0;if(UI.realRole!=='gm')return;toast('Importando imágenes…');const remap=await importImages(o.images);for(const x of[...(o.state.assets||[]),...(o.state.tokens||[])])if(x.img)x.img=remap[x.img]||x.img;const prev=snapshot();const nm=S.name;loadState(Object.assign(o.state,{name:nm}));Net.replaceAll();pushUndo(prev);changed(true);refreshAll();centerView();toast('Escena importada')}catch(err){toast('Ese archivo no es una escena de Just Another VTT')}};rd.readAsText(f)};

/* ---------- Paneles ---------- */
function toast(msg,ms){const t=$('#toast');t.textContent=msg;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',ms||1600)}
function setRole(r){
  if(UI.realRole!=='gm')r='player';
  UI.role=r;finishChain();UI.act=null;closePops();
  if(r==='player'){UI.selected=UI.selected.filter(id=>{const o=byId(id);return o&&(canControl(o)||ownsPlan(o))});if(!PLAYER_TOOLS.includes(UI.tool))setTool('select')}
  $('#roleGm').setAttribute('aria-pressed',String(r==='gm'));$('#rolePlayer').setAttribute('aria-pressed',String(r==='player'));
  const realGm=UI.realRole==='gm';
  $('#roleSeg').style.display=realGm?'':'none';$('#roleBadge').style.display=realGm?'none':'';
  for(const id of['#undoBtn','#redoBtn','#exportBtn','#importBtn'])$(id).style.display=realGm?'':'none';
  $('#sceneName').readOnly=!realGm;
  $$('.playerOnly').forEach(el=>el.style.display=realGm?'none':'');
  $$('.gmOnly').forEach(el=>el.style.display=r==='gm'?'':'none');
  $$('.gmSect').forEach(el=>el.style.display=r==='gm'?'':'none');
  $('#viewAsWrap').style.display=r==='player'?'flex':'none';
  $('#previewBtn').style.display=r==='gm'?'':'none';
  const realGmTabs=UI.realRole==='gm';
  for(const t of['lights','library'])$(`[data-tab="${t}"]`).style.display=r==='gm'?'':'none';
  $('[data-tab="scene"]').style.display=realGmTabs&&r==='gm'?'':'none';
  syncChatTab();
  if(r!=='gm'&&['lights','library','scene'].includes(UI.tab))selectTab('tokens');
  Net.roleChanged();
  frame={};refreshAll();requestRender();
}
$('#roleGm').onclick=()=>setRole('gm');
$('#rolePlayer').onclick=()=>setRole('player');
$('#viewAs').onchange=e=>{UI.viewAs=e.target.value==='party'?'party':+e.target.value;requestRender()};
$('#previewBtn').onclick=()=>{UI.preview=!UI.preview;$('#previewBtn').classList.toggle('on',UI.preview);requestRender()};
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
/* Panel lateral: en pantallas anchas se pliega la columna (y se recuerda); en estrechas se abre como capa */
const narrow=()=>window.matchMedia('(max-width:980px)').matches;
function syncPanelToggle(){const hidden=$('#app').classList.contains('noPanel');const b=$('#panelToggle');b.setAttribute('aria-pressed',String(hidden));b.title=b.ariaLabel=hidden?'Mostrar panel':'Ocultar panel';b.dataset.ic=hidden?'panel-right-open':'panel-right-close';const old=b.querySelector('svg');if(old)old.remove();delete b.dataset.icDone;hydrate(b.parentElement)}
function setPanelHidden(hidden){$('#app').classList.toggle('noPanel',hidden);try{localStorage.setItem('jav.panel',hidden?'oculto':'visible')}catch(e){}syncPanelToggle()}
$('#panelToggle').onclick=()=>{if(narrow())$('#panel').classList.toggle('open');else setPanelHidden(!$('#app').classList.contains('noPanel'))};
setPanelHidden((()=>{try{return localStorage.getItem('jav.panel')==='oculto'}catch(e){return false}})());
$$('.tool').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
/* Chat y dados se apagan para todos; la pestaña sólo existe si queda algo que enseñar */
function syncChatTab(){
  const chat=S.chatEnabled!==false,dice=S.diceEnabled!==false;
  $('[data-tab="chat"]').style.display=chat||dice?'':'none';
  $('#chatForm').style.display=chat?'':'none';
  $('#diceBar').style.display=dice?'':'none';
  $('#chatLog').classList.toggle('noDice',!dice);
  if(!chat&&!dice&&UI.tab==='chat')selectTab('tokens');
}
function selectTab(name){UI.tab=name;$$('.tabs button').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===name)));$$('.tabpane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));if(name==='library')renderLibraryGrid();if(name==='live')renderLive();if(name==='chat')Chat.scrollToEnd()}
$$('.tabs button').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
$('#selbar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.act;
  if(a==='del')deleteSel();else if(a==='dup')duplicateSel();else if(a==='edit'){const o=selObjs()[0];if(o){const r=$('#selbar').getBoundingClientRect(),sr=stage.getBoundingClientRect();openEditor(o,{x:r.left-sr.left,y:r.top-sr.top-330})}}});
let renameTimer=0;
$('#sceneName').oninput=e=>{if(UI.realRole!=='gm')return;S.name=e.target.value;clearTimeout(renameTimer);renameTimer=setTimeout(()=>{const n=e.target.value.trim();if(n){UI.board.name=n;Net.rename(n)}},500)};
function syncBoardName(){if(document.activeElement!==$('#sceneName'))$('#sceneName').value=UI.board?UI.board.name:'';document.title=(UI.board?UI.board.name+', ':'')+'Just Another VTT'}

function renderEnv(){
  const g=$('#envGrid');g.innerHTML='';
  for(const[k,E]of Object.entries(ENVS)){const b=document.createElement('button');b.className='env';b.setAttribute('aria-pressed',String(S.env===k));b.innerHTML=svgIcon(E.icon)+`<b></b><small></small>`;b.querySelector('b').textContent=E.name;b.querySelector('small').textContent=E.desc;
    b.onclick=()=>{pushUndo();S.env=k;S.ambient=E.ambient;S.darkColor=E.dark;changed();renderEnv();if(is25()&&window.D3)window.D3.setEnv(S.env,S.ambient)};g.appendChild(b)}
  $('#ambient').value=Math.round(S.ambient*100);$('#ambientOut').textContent=Math.round(S.ambient*100)+' %';
}
let ambSnap=null;
$('#ambient').addEventListener('pointerdown',()=>ambSnap=snapshot());
$('#ambient').oninput=e=>{S.ambient=+e.target.value/100;$('#ambientOut').textContent=e.target.value+' %';requestRender();if(is25()&&window.D3)window.D3.setEnv(S.env,S.ambient)};
$('#ambient').onchange=()=>{pushUndo(ambSnap||undefined);ambSnap=null;changed();if(is25()&&window.D3)window.D3.setEnv(S.env,S.ambient)};
$('#fogToggle').onchange=e=>{S.fog=e.target.checked;changed()};
$('#fogReset').onclick=()=>{if(UI.realRole!=='gm')return;Net.scene('fogreset');toast('Exploración de esta escena reiniciada para todos')};
$('#gridToggle').onchange=e=>{S.grid=e.target.checked;changed()};
$('#snapToggle').onchange=e=>{S.snap=e.target.checked;changed();renderSnapPrefs()};
function renderSnapPrefs(){
  const box=$('#snapPrefs');if(!box)return;box.innerHTML='';
  for(const[k,label]of Object.entries(SNAP_LABELS)){
    const l=document.createElement('label');l.className='check';const i=document.createElement('input');i.type='checkbox';i.checked=!!PREFS[k];i.disabled=!S.snap;
    i.onchange=()=>{PREFS[k]=i.checked;savePrefs();renderSubbar()};l.append(i,document.createTextNode(label));box.appendChild(l);
  }
  box.classList.toggle('off',!S.snap);
}
$('#animToggle').onchange=e=>{S.animate=e.target.checked;changed()};
$('#sharedVision').onchange=e=>{S.sharedVision=e.target.checked;changed()};
$('#playersDoors').onchange=e=>{S.playersDoors=e.target.checked;changed()};
$('#chatEnabled').onchange=e=>{S.chatEnabled=e.target.checked;changed();syncChatTab()};
$('#diceEnabled').onchange=e=>{S.diceEnabled=e.target.checked;changed();syncChatTab()};
$('#initiativeShown').onchange=e=>{S.initiativeShown=e.target.checked;changed();renderInitiative()};
$('#pickBoard').onclick=()=>{UI.libCat='board';UI.upCat='board';renderUploadCats();selectTab('library')};
$('#centerBtn').onclick=centerView;
$('#zoneToolBtn').onclick=()=>setTool('zone');
function clearScene(){
  if(UI.realRole!=='gm')return;
  const prev=snapshot();
  loadState(Object.assign(blankState(),{name:S.name}));
  pushUndo(prev);Net.replaceAll();refreshAll();centerView();
  toast('Escena vaciada. Puedes deshacerlo.',3000);
}
$('#clearBtn').onclick=clearScene;
$('#allOn').onclick=()=>{pushUndo();S.lights.forEach(l=>l.on=true);changed()};
$('#allOff').onclick=()=>{pushUndo();S.lights.forEach(l=>l.on=false);changed()};
$$('[data-pick]').forEach(b=>b.onclick=()=>setTool(b.dataset.pick));

function renderLibrary(){
  const g=$('#lampGrid');g.innerHTML='';
  for(const[k,P]of Object.entries(LIGHT_PRESETS)){
    const b=document.createElement('button');b.className='lamp';b.draggable=true;b.dataset.preset=k;
    b.setAttribute('aria-pressed',String(UI.lightPreset===k&&UI.tool==='light'));
    b.title=`${P.name}: arrástrala al mapa o elígela y haz clic`;
    b.innerHTML=`<span class="orb${P.darkness?' dark':''}" style="--c:${P.color}">${svgIcon(P.icon)}</span><b></b><small></small>`;
    b.querySelector('b').textContent=P.name;
    b.querySelector('small').textContent=P.darkness?`${P.bright} ft`:(P.angle?`cono ${P.angle}°, ${P.bright}+${P.dim} ft`:`${P.bright} + ${P.dim} ft`);
    b.onclick=()=>{UI.lightPreset=k;setTool('light');renderLibrary();$('#panel').classList.remove('open');toast(`${P.name}: haz clic en el mapa para colocarla`)};
    b.ondragstart=e=>{e.dataTransfer.setData('text/x-light',k);e.dataTransfer.effectAllowed='copy'};
    g.appendChild(b);
  }
}
function itemRow(o,{dot,onToggle,toggleIc,toggleTitle,extra,owner:extraOwner,edit}){
  const row=document.createElement('div');row.className='item'+(isSel(o)?' sel':'');
  const d=document.createElement('span');d.className='dot';d.style.background=dot;row.appendChild(d);
  const n=document.createElement('span');n.className='name';n.textContent=describe(o);n.title='Seleccionar y centrar';
  n.onclick=()=>{UI.selected=[o.id];UI.cam.x=o.x;UI.cam.y=o.y;refreshPanels();requestRender()};row.appendChild(n);
  if(extra)row.appendChild(extra);
  if(onToggle){const b=document.createElement('button');b.className='btn sq ghost';b.title=toggleTitle;b.setAttribute('aria-label',toggleTitle);b.innerHTML=svgIcon(toggleIc);b.onclick=onToggle;row.appendChild(b)}
  if(extraOwner!==undefined){const m=Net.members.find(x=>x.id===extraOwner);const sp=document.createElement('span');sp.className='small muted';sp.textContent=m?m.name:'';if(m)n.after(sp)}
  if(isGM()||edit){const e=document.createElement('button');e.className='btn sq ghost';e.title='Editar';e.setAttribute('aria-label','Editar');e.innerHTML=svgIcon('settings-2');e.onclick=()=>{UI.selected=[o.id];const r=e.getBoundingClientRect(),sr=stage.getBoundingClientRect();openEditor(o,{x:Math.min(r.left-sr.left-310,W-310),y:r.top-sr.top})};row.appendChild(e)}
  return row;
}
function renderLists(){
  const setCount=(id,n)=>{const el=$(id);if(el)el.textContent=n?String(n):''};
  setCount('#lightCount',S.lights.length);
  setCount('#pcCount',S.tokens.filter(t=>t.kind==='player').length);
  setCount('#npcCount',S.tokens.filter(t=>t.kind!=='player').length);
  const ll=$('#lightList');ll.innerHTML='';
  if(!S.lights.length)ll.innerHTML='<div class="empty">Todavía no hay luces. Elige una arriba.</div>';
  for(const l of S.lights)ll.appendChild(itemRow(l,{dot:l.darkness?'#000':(l.on?l.color:'transparent'),toggleIc:l.on?'lightbulb':'lightbulb-off',toggleTitle:l.on?'Apagar':'Encender',onToggle:()=>{pushUndo();l.on=!l.on;changed()}}));
  const pc=$('#pcList'),np=$('#npcList');pc.innerHTML='';np.innerHTML='';
  const pcs=S.tokens.filter(t=>t.kind==='player'),npcs=S.tokens.filter(t=>t.kind!=='player');
  if(!pcs.length)pc.innerHTML='<div class="empty">No hay personajes. Sin ellos, los jugadores no ven nada.</div>';
  if(!npcs.length)np.innerHTML='<div class="empty">No hay enemigos.</div>';
  const mine=S.tokens.filter(ownsToken);
  const mc=$('#myCharList');mc.innerHTML='';
  for(const t of mine)mc.appendChild(itemRow(t,{dot:t.color,edit:true,toggleIc:t.light&&t.light.on?'flame':'lightbulb-off',toggleTitle:t.light&&t.light.on?'Apagar mi luz':'Encender mi luz',onToggle:()=>{if(!t.light||t.light.preset==='none')t.light=tokenLightFrom('torch');else t.light.on=!t.light.on;changed()}}));
  $('#createChar').style.display=mine.length||UI.realRole==='gm'?'none':'';
  if(!mine.length)mc.innerHTML='<div class="empty">Aún no tienes personaje. Crea uno o pide al director que te asigne una ficha.</div>';
  for(const t of pcs)pc.appendChild(itemRow(t,{dot:t.color,owner:t.owner,toggleIc:t.light&&t.light.on?'flame':'lightbulb-off',toggleTitle:t.light&&t.light.on?'Apagar su luz':'Encender su luz',onToggle:isGM()?()=>{pushUndo();if(!t.light||t.light.preset==='none')t.light=tokenLightFrom('torch');else t.light.on=!t.light.on;changed()}:null}));
  for(const t of npcs)np.appendChild(itemRow(t,{dot:t.color,toggleIc:t.hidden?'eye-off':'eye',toggleTitle:t.hidden?'Mostrar a jugadores':'Ocultar a jugadores',onToggle:()=>{pushUndo();t.hidden=!t.hidden;changed()}}));
  const va=$('#viewAs');const cur=String(UI.viewAs);va.innerHTML='<option value="party">Todo el grupo</option>';
  for(const t of pcs){const op=document.createElement('option');op.value=t.id;op.textContent=t.name;va.appendChild(op)}
  va.value=[...va.options].some(o=>o.value===cur)?cur:'party';if(va.value==='party')UI.viewAs='party';
}
function renderLayers(){
  const el=$('#layerList');el.innerHTML='';
  for(const L of[...LAYERS].reverse()){
    const st=S.layers[L.id];const row=document.createElement('div');row.className='item';
    const n=document.createElement('span');n.className='name';n.textContent=L.name;row.appendChild(n);
    const v=document.createElement('button');v.className='btn sq ghost';v.innerHTML=svgIcon(st.visible?'eye':'eye-off');v.title=st.visible?'Ocultar capa':'Mostrar capa';v.setAttribute('aria-label',v.title);v.onclick=()=>{st.visible=!st.visible;changed();renderLayers()};
    const k=document.createElement('button');k.className='btn sq ghost'+(st.locked?' on':'');k.innerHTML=svgIcon(st.locked?'lock':'lock-open');k.title=st.locked?'Desbloquear capa':'Bloquear capa';k.setAttribute('aria-label',k.title);k.onclick=()=>{st.locked=!st.locked;if(st.locked)UI.selected=UI.selected.filter(id=>{const o=byId(id);return o&&layerKey(o)!==L.id});changed();renderLayers()};
    row.append(v,k);el.appendChild(row);
  }
  const lg=$('#wallLegend');if(!lg.childElementCount)for(const T of Object.values(WALL_TYPES)){const i=document.createElement('i');i.style.borderTopColor=T.color;if(T.dash)i.style.borderTopStyle='dashed';const s=document.createElement('span');s.textContent=`${T.name}: ${T.desc.toLowerCase()}`;lg.append(i,s)}
}
function render25Sub(){const bar=$('#subbar');bar.innerHTML='';
  const mk=(ic,title,fn)=>{const b=document.createElement('button');b.className='btn sq ghost';b.dataset.ic=ic;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;bar.appendChild(b)};
  mk('rotate-ccw','Girar a la izquierda (Q)',()=>window.D3.rotate(-1));mk('rotate-cw','Girar a la derecha (E)',()=>window.D3.rotate(1));hydrate(bar)}
function renderSubbar(){
  if(is25()){render25Sub();return}
  const bar=$('#subbar');bar.innerHTML='';
  const chips=document.createElement('div');chips.className='chipbar';
  const hint=t=>{const h=document.createElement('span');h.className='hint';h.textContent=t;chips.appendChild(h)};
  const chip=(ic,txt,pressed,fn,sw)=>{const b=document.createElement('button');b.className='chip';b.setAttribute('aria-pressed',String(pressed));b.innerHTML=svgIcon(ic);const s=document.createElement('span');s.textContent=txt;b.appendChild(s);if(sw){const i=document.createElement('i');i.className='sw';i.style.background=sw;b.appendChild(i)}b.onclick=fn;chips.appendChild(b);return b};
  const t=UI.tool;
  if(t==='wall'){
    for(const[k,n,ic]of[['chain','Tramos','spline'],['rect','Sala','square-dashed'],['circle','Círculo','circle-dashed'],['arc','Arco','rotate-cw'],['curve','Curva','spline-pointer']])chip(ic,n,UI.wallShape===k,()=>{UI.wallShape=k;UI.chain=null;UI.curve=null;renderSubbar();requestRender()});
    bar.appendChild(chips);
    const types=document.createElement('div');types.className='chipbar';
    for(const[k,T]of Object.entries(WALL_TYPES)){if(UI.wallShape!=='chain'&&(k==='door'||k==='portal'))continue;const b=document.createElement('button');b.className='chip';b.setAttribute('aria-pressed',String(wallKindForShape()===k));b.innerHTML=svgIcon(T.icon);const sp=document.createElement('span');sp.textContent=T.name;const i=document.createElement('i');i.className='sw';i.style.background=T.color;b.append(sp,i);b.onclick=()=>{UI.wallType=k;renderSubbar();requestRender()};types.appendChild(b)}
    const h=document.createElement('span');h.className='hint';
    h.textContent={chain:'Clic para encadenar tramos. Doble clic o Esc para terminar.',rect:'Arrastra para crear las cuatro paredes.',circle:'Arrastra desde el centro: columnas, torres, pozos.',arc:'Clic en el centro, en el inicio y en el final. Mayús invierte el sentido.',curve:'Clic en el inicio, clic en el final y un tercer clic para curvar.'}[UI.wallShape];
    types.appendChild(h);bar.appendChild(types);
    bar.appendChild(snapChips([['walls','Puntos en la cuadrícula','Puntos libres'],['moveWalls','Mover por casillas','Mover libre']]));return;
  }else if(t==='light'){
    for(const[k,P]of Object.entries(LIGHT_PRESETS))chip(P.icon,P.name,UI.lightPreset===k,()=>{UI.lightPreset=k;renderSubbar();renderLibrary()});
    hint('Clic en el mapa para colocarla.');
    bar.appendChild(chips);bar.appendChild(snapChips([['lights','Colocar en casillas','Colocación libre']]));return;
  }else if(t==='plan'){
    for(const[k,n,ic]of[['line','Línea','spline'],['circle','Círculo','circle'],['rect','Rectángulo','square'],['cone','Cono','cone']])chip(ic,n,UI.planShape===k,()=>{UI.planShape=k;renderSubbar()});
    if(UI.realRole!=='gm'){
      chip('trash-2','Borrar mis planos',false,()=>{const n=S.plans.filter(ownsPlan).length;if(!n)return;S.plans=S.plans.filter(o=>!ownsPlan(o));changed();toast(n===1?'Plano borrado':`${n} planos borrados`)});
      hint('Arrastra para dibujar tu jugada. La ven el director y el resto del grupo.');
      bar.appendChild(chips);return;
    }
    chip(S.plansReleased?'eye':'eye-off',S.plansReleased?'Visibles para jugadores':'Solo el Director',S.plansReleased,()=>{S.plansReleased=!S.plansReleased;changed();renderSubbar()});
    chip('trash-2','Borrar todos los planos',false,()=>{if(!S.plans.length)return;pushUndo();S.plans=[];changed();toast('Planos borrados')});
    hint('Los planos de los jugadores siempre se ven; los tuyos solo si los publicas.');
  }else if(t==='zone'){
    for(const[k,n,ic]of[['poly','Polígono','shapes'],['rect','Rectángulo','square-dashed'],['circle','Círculo','circle-dashed']])chip(ic,n,UI.zoneShape===k,()=>{UI.zoneShape=k;UI.zpoly=null;renderSubbar();requestRender()});
    hint({poly:'Clic en cada esquina; Intro, doble clic o clic en el primer punto para cerrar.',rect:'Arrastra sobre un edificio o cueva.',circle:'Arrastra desde el centro.'}[UI.zoneShape]+' Con clic derecho en una figura de muros puedes crear la zona con su forma.');
  }
  else if(t==='player'||t==='enemy'){hint(t==='player'?'Clic para colocar un personaje. Lleva antorcha por defecto.':'Clic para colocar un enemigo. Aparece oculto para los jugadores.')}
  else if(t==='ruler'){hint('Arrastra para medir. Distancia en casillas de 5 pies.')}
  else if(t==='pan'){hint('Arrastra para desplazar la vista.')}
  else if(!isGM()){hint('Arrastra a tu personaje. Clic en una puerta para abrirla o en un portal para cruzarlo.')}
  if(chips.childElementCount)bar.appendChild(chips);
}
function snapChips(list){
  const box=document.createElement('div');box.className='chipbar';
  for(const[k,onLabel,offLabel]of list){
    const b=document.createElement('button');b.className='chip';const on=snapOn(k);
    b.setAttribute('aria-pressed',String(on));b.innerHTML=svgIcon(on?'grid-3x3':'move');
    const sp=document.createElement('span');sp.textContent=on?onLabel:offLabel;b.appendChild(sp);
    b.title=S.snap?'Cambia entre ajuste a la cuadrícula y colocación libre. Alt invierte al vuelo.':'La cuadrícula está desactivada en esta escena';
    b.disabled=!S.snap;
    b.onclick=()=>{PREFS[k]=!PREFS[k];savePrefs();renderSubbar();renderSnapPrefs()};box.appendChild(b);
  }
  return box;
}
function renderSelbar(){
  const bar=$('#selbar');const n=UI.selected.length;
  if(!n||!isGM()||UI.act){bar.style.display='none';return}
  bar.style.display='flex';bar.querySelector('.count').textContent=n===1?describe(selObjs()[0]||{type:'asset'}):`${n} elementos`;
}
function refreshPanels(){renderLists();renderSelbar();syncUndo()}
function syncSceneInputs(){
  $('#sharedVision').checked=S.sharedVision!==false;$('#playersDoors').checked=S.playersDoors!==false;
  $('#chatEnabled').checked=S.chatEnabled!==false;$('#diceEnabled').checked=S.diceEnabled!==false;$('#initiativeShown').checked=S.initiativeShown===true;syncChatTab();renderInitiative();
  $('#fogToggle').checked=S.fog;$('#gridToggle').checked=S.grid;$('#snapToggle').checked=S.snap;renderSnapPrefs();$('#animToggle').checked=S.animate;
}
function refreshAll(){
  syncSceneInputs();
  renderEnv();renderLibrary();renderLayers();renderSubbar();refreshPanels();renderUploadCats();renderLibraryGrid();renderLive();
}

/* ---------- Biblioteca de imágenes ---------- */
function renderUploadCats(){
  const box=$('#upCat');box.innerHTML='';
  for(const[k,C]of Object.entries(CATS)){const b=document.createElement('button');b.setAttribute('aria-pressed',String(UI.upCat===k));b.innerHTML=svgIcon(C.icon);const sp=document.createElement('span');sp.textContent=C.one;b.appendChild(sp);b.onclick=()=>{UI.upCat=k;renderUploadCats()};box.appendChild(b)}
  $('#dropHint').textContent=`Se guardarán como ${CATS[UI.upCat].name.toLowerCase()}`;
}
async function uploadFiles(files,cat,at){
  const list=$('#uploads');
  let placed=0;
  for(const f of files){
    const row=document.createElement('div');row.className='upRow';
    const name=document.createElement('span');name.textContent=f.name;const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');bar.appendChild(fill);
    row.append(name,bar);list.appendChild(row);
    try{
      const m=await Store.upload(f,{category:cat,onProgress:v=>fill.style.width=Math.round(v*100)+'%'});
      row.remove();
      if(at){const q={x:at.x+placed*CELL,y:at.y};placeImage(m,q);placed++}
    }catch(err){row.classList.add('err');name.textContent=`${f.name}: ${err.message||'no se pudo subir'}`;setTimeout(()=>row.remove(),5000)}
  }
  UI.libCat=cat;renderLibraryGrid();
}
$('#libFile').onchange=e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)uploadFiles(fs,UI.upCat)};
const dz=$('#dropZone');
dz.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dz.classList.add('over')}});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');const fs=[...e.dataTransfer.files].filter(f=>/^image\//.test(f.type));if(fs.length)uploadFiles(fs,UI.upCat)});
function placeImage(m,at,free){
  if(!isGM())return;
  pushUndo();let o;
  const p=at||{x:UI.cam.x,y:UI.cam.y};
  if(m.category==='board'){
    const boards=S.assets.filter(a=>a.kind==='map');
    const ppc=m.ppc||70,w=m.width/ppc*CELL,h=m.height/ppc*CELL;
    const corner=snapVertex({x:p.x-w/2,y:p.y-h/2});
    const pos={x:corner.x+w/2,y:corner.y+h/2};
    if(!at&&boards.length===1){o=boards[0];Object.assign(o,{name:m.name,img:m.id,w,h},pos);toast('Tablero sustituido. Deshacer recupera el anterior.',2600)}
    else{o=addObj(Object.assign({id:nid(),type:'asset',kind:'map',name:m.name,img:m.id,w,h,rot:0,opacity:1},pos));toast(m.ppc?`Tablero de ${Math.round(m.width/ppc*10)/10} × ${Math.round(m.height/ppc*10)/10} casillas`:'Tablero colocado a 70 px por casilla. Ajusta la escala en su editor si no cuadra.',3200)}
    if(S.layers.map.locked){UI.selected=[];setTool('select');changed();return}
  }else if(m.category==='prop'){
    const k=Math.max(m.width,m.height),w=CELL*2*m.width/k,h=CELL*2*m.height/k;
    const q=snapOn('props')&&!free?snapVertex(p):fine(p);
    o=addObj({id:nid(),type:'asset',kind:'prop',name:m.name,img:m.id,x:q.x,y:q.y,w,h,rot:0,opacity:1});
  }else{
    const kind=m.category==='npc'?'enemy':'player';
    const q=snapOn('tokens')&&!free?snapCell(p):fine(p);
    o=addObj(newToken(q,kind,{img:m.id,name:m.name}));
  }
  UI.selected=[o.id];setTool('select');changed();
  $('#panel').classList.remove('open');
}
function renderLibraryGrid(){
  const grid=$('#thumbGrid'),filt=$('#libFilter');if(!grid)return;
  filt.innerHTML='';
  for(const[k,n]of[['all','Todas'],...Object.entries(CATS).map(([k,C])=>[k,C.name])]){const b=document.createElement('button');b.className='chip';b.setAttribute('aria-pressed',String(UI.libCat===k));b.textContent=n;b.onclick=()=>{UI.libCat=k;renderLibraryGrid()};filt.appendChild(b)}
  const items=Store.list(UI.libCat);grid.innerHTML='';
  if(!items.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1">No hay imágenes en esta categoría. Sube alguna arriba.</div>'}
  for(const m of items){
    const card=document.createElement('div');card.className='thumb';card.draggable=true;card.title=`${m.name}: clic para colocar, arrastra al mapa para elegir el sitio`;
    const im=document.createElement('img');im.src=m.thumb;im.alt='';im.loading='lazy';
    const cap=document.createElement('span');cap.className='cap';cap.textContent=m.name;
    const tag=document.createElement('span');tag.className='tag';tag.textContent=CATS[m.category]?CATS[m.category].one:'';
    const more=document.createElement('button');more.className='more';more.innerHTML=svgIcon('more-horizontal');more.setAttribute('aria-label','Detalles de '+m.name);
    more.onclick=ev=>{ev.stopPropagation();openImageEditor(m.id)};
    card.append(im,tag,cap,more);
    card.onclick=()=>placeImage(m);
    card.ondragstart=e=>{e.dataTransfer.setData('text/x-image',m.id);e.dataTransfer.effectAllowed='copy'};
    grid.appendChild(card);
  }
  const u=Store.usage();
  $('#usageBar').style.width=Math.min(100,u.bytes/u.quota*100).toFixed(1)+'%';
  $('#usageText').textContent=`${u.count} ${u.count===1?'imagen':'imágenes'}, ${fmtBytes(u.bytes)} de ${fmtBytes(u.quota)}`+(Store.persistent?'':' (solo en memoria: este navegador no permite la caché)');
}
function openImageEditor(id){
  const m=Store.meta(id);if(!m)return;
  closePops();edState=null;
  $('#edTitle').textContent=m.name;
  const body=$('#edBody');body.innerHTML='';
  const pv=document.createElement('img');pv.className='edPreview';pv.src=m.thumb;pv.alt='';body.appendChild(pv);
  const field=(label,el)=>{const w=document.createElement('label');w.className='field';const sp=document.createElement('span');sp.textContent=label;w.append(sp,el);body.appendChild(w);return el};
  const nm=document.createElement('input');nm.type='text';nm.value=m.name;nm.onchange=()=>Store.update(id,{name:nm.value.trim()||m.name}).then(()=>$('#edTitle').textContent=nm.value);field('Nombre',nm);
  const cat=document.createElement('select');for(const[k,C]of Object.entries(CATS)){const op=document.createElement('option');op.value=k;op.textContent=C.one;cat.appendChild(op)}cat.value=m.category;cat.onchange=()=>Store.update(id,{category:cat.value});field('Categoría',cat);
  const info=document.createElement('div');info.className='edNote';
  info.textContent=`${m.width} × ${m.height} px, ${fmtBytes(m.size)}. Origen: ${m.origin}. Se usa en ${imageUses(id)} elemento(s) de la escena.`;body.appendChild(info);
  const url=document.createElement('input');url.type='text';url.readOnly=true;url.className='urlField';url.value=Store.publicUrl(id);url.onfocus=()=>url.select();url.setAttribute('aria-label','URL del almacén');body.appendChild(url);
  const note=document.createElement('div');note.className='edNote';note.textContent='URL simulada: el archivo vive en la caché de este navegador. Los demás participantes de una sesión en vivo lo reciben al necesitarlo.';body.appendChild(note);
  const row=document.createElement('div');row.className='row';row.style.marginTop='12px';
  const put=document.createElement('button');put.className='btn primary';put.innerHTML=svgIcon('plus');put.append('Colocar');put.onclick=()=>{closePops();placeImage(Store.meta(id))};row.appendChild(put);
  const tok=selObjs().find(o=>o.type==='token'||o.type==='asset');
  if(tok){const b=document.createElement('button');b.className='btn';b.textContent=tok.type==='token'?'Poner en '+tok.name:'Sustituir imagen';b.onclick=()=>{pushUndo();tok.img=id;changed();closePops()};row.appendChild(b)}
  body.appendChild(row);
  const del=document.createElement('button');del.className='btn danger';del.style.marginTop='8px';del.innerHTML=svgIcon('trash-2');del.append('Borrar del almacén');
  let armed=false;
  del.onclick=async()=>{
    const uses=imageUses(id);
    if(!armed&&uses){armed=true;del.lastChild.textContent=`Se usa en ${uses}. Pulsa otra vez para borrar`;return}
    del.disabled=true;await Store.remove(id);closePops();toast('Imagen borrada del almacén');
  };
  body.appendChild(del);
  const r=$('#panel').getBoundingClientRect(),sr=stage.getBoundingClientRect();
  placePop(edEl,{x:Math.min(W-320,r.left-sr.left-320),y:r.top-sr.top+60},300,480);
}
function portraitPicker(o,done){
  const wrap=document.createElement('div');
  const pref=o.kind==='enemy'?'npc':'pc';
  const items=[...Store.list(pref),...Store.list().filter(m=>m.category!==pref)];
  const grid=document.createElement('div');grid.className='pickGrid';
  const none=document.createElement('button');none.className='pick'+(o.img?'':' on');none.innerHTML=svgIcon('x');none.title='Sin retrato';none.onclick=()=>{o.img=null;done()};grid.appendChild(none);
  for(const m of items.slice(0,23)){const b=document.createElement('button');b.className='pick'+(o.img===m.id?' on':'');b.title=m.name;const im=document.createElement('img');im.src=m.thumb;im.alt=m.name;b.appendChild(im);b.onclick=()=>{o.img=m.id;done()};grid.appendChild(b)}
  wrap.appendChild(grid);
  const up=document.createElement('label');up.className='btn fileBtn';up.style.marginTop='8px';up.innerHTML=svgIcon('image-up');up.append('Subir retrato');
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=async()=>{const f=inp.files[0];if(!f)return;try{const m=await Store.upload(f,{category:pref});o.img=m.id;done()}catch(err){toast(err.message||'No se pudo subir')}};
  up.appendChild(inp);wrap.appendChild(up);
  return wrap;
}

/* ---------- Mesa: participantes e invitaciones ---------- */
function renderLive(){
  const list=$('#peerList');if(!list)return;
  const online=new Set(Net.online.map(u=>u.id));
  const gm=UI.realRole==='gm';
  const count=Net.online.length;
  const oc=$('#onlineCount');if(oc)oc.textContent=Net.members.length?`${count} de ${Net.members.length} en línea`:'';
  const badge=$('#liveBadge');badge.style.display=UI.board?'inline-flex':'none';
  badge.classList.toggle('off',!Net.connected);
  badge.lastChild.textContent=Net.connected?`${count} en línea`:'Sin conexión';
  list.innerHTML='';
  const members=Net.members.length?Net.members:(UI.me?[{id:UI.me.id,name:UI.me.name,color:UI.me.color,role:UI.realRole}]:[]);
  for(const m of members){
    const r=document.createElement('div');r.className='item';
    const d=document.createElement('span');d.className='dot'+(online.has(m.id)?' on':'');d.style.background=m.color;d.title=online.has(m.id)?'En línea':'Desconectado';
    const n=document.createElement('span');n.className='name';n.textContent=m.name+(UI.me&&m.id===UI.me.id?' (tú)':'');
    const where=UI.scenes.find(x=>x.id===UI.where[m.id]);
    const t=document.createElement('span');t.className='small muted';t.textContent=(m.role==='gm'?'Director':'Jugador')+(where?` en ${where.name}`:'');
    r.append(d,n,t);
    if(gm&&m.role!=='gm'&&UI.scenes.length>1){
      const sel=document.createElement('select');sel.className='mini';sel.title=`Llevar a ${m.name} a otra escena`;sel.setAttribute('aria-label',sel.title);
      for(const sc of UI.scenes){const op=document.createElement('option');op.value=sc.id;op.textContent=sc.name;sel.appendChild(op)}
      sel.value=UI.where[m.id]||'';sel.onchange=()=>{Net.scene('send',{id:sel.value,user:m.id});toast(`Llevando a ${m.name}…`)};
      r.appendChild(sel);t.textContent=m.role==='gm'?'Director':'';
    }
    if(gm&&m.role!=='gm'){const x=document.createElement('button');x.className='btn sq ghost danger';x.innerHTML=svgIcon('x');x.title=`Quitar a ${m.name} del tablero`;x.setAttribute('aria-label',x.title);
      let armed=false;x.onclick=async()=>{if(!armed){armed=true;x.classList.add('on');toast(`Pulsa otra vez para quitar a ${m.name}`);setTimeout(()=>{armed=false;x.classList.remove('on')},3000);return}
        try{await apiJson(`/api/boards/${UI.board.id}/members/${m.id}`,{method:'DELETE'});for(const tk of S.tokens)if(tk.owner===m.id)tk.owner=null;changed()}catch(e){toast(e.message)}};r.appendChild(x)}
    list.appendChild(r);
  }
  if(gm&&UI.board){$('#inviteCode').textContent=UI.board.invite_code||'';}
  $('#liveStatus').textContent=(Net.connected?`Conectado al servidor. Mensajes enviados: ${Net.stats.sent}, recibidos: ${Net.stats.recv}.`:'Sin conexión con el servidor.')+(PERF.ms?` Render de luz: ${PERF.ms.toFixed(1)} ms por fotograma (pantalla ${(1000/PERF.frameMs).toFixed(0)} Hz), capas de luz a ${PERF.scale}×.`:'');
}
const inviteLink=()=>`${location.origin}/?invitar=${UI.board?UI.board.invite_code:''}`;
$('#copyInvite').onclick=async()=>{
  const link=inviteLink();
  try{await navigator.clipboard.writeText(link);toast('Enlace copiado: '+link,2600)}
  catch(e){const inp=$('#inviteLinkField');inp.value=link;inp.style.display='block';inp.select();toast('Copia el enlace del recuadro',2400)}
};
$('#newInvite').onclick=()=>withBusy($('#newInvite'),async()=>{try{const d=await apiJson(`/api/boards/${UI.board.id}/invite`,{method:'POST'});UI.board.invite_code=d.invite_code;renderLive();toast('Código nuevo. El anterior ya no sirve.')}catch(e){toast(e.message)}});
function addMember(){
  const inp=$('#addMemberName');const name=inp.value.trim();if(!name)return;
  withBusy($('#addMemberBtn'),async()=>{
    try{await apiJson(`/api/boards/${UI.board.id}/members`,{method:'POST',body:JSON.stringify({name})});inp.value='';toast(`${name} ya forma parte del tablero`)}catch(e){toast(e.message,2600)}
  });
}
$('#addMemberBtn').onclick=addMember;
$('#addMemberName').onkeydown=e=>{if(e.key==='Enter')addMember()};
$('#pingBtn').onclick=()=>Net.ping();
$('#showCursors').onchange=e=>{Net.showCursors=e.target.checked};
$('#liveBadge').onclick=()=>{selectTab('live');$('#panel').classList.add('open')};
setInterval(()=>{if(UI.tab==='live'&&UI.board)renderLive()},2000);
$('#createChar').onclick=()=>{
  if(!UI.me||S.tokens.some(ownsToken))return;
  const others=S.tokens.filter(t=>t.kind==='player');
  const base=others.length?others[others.length-1]:{x:UI.cam.x,y:UI.cam.y};
  const p=snapCell({x:base.x+CELL,y:base.y});
  const t=addObj(newToken(p,'player',{name:UI.me.name,color:UI.me.color,owner:UI.me.id,hidden:false,darkvision:0}));
  UI.selected=[t.id];changed();UI.cam.x=t.x;UI.cam.y=t.y;
  toast('Personaje creado. Doble clic para cambiar su retrato.',2600);
};
function centerView(){if(W<60||H<60){requestAnimationFrame(()=>{resize();if(W>=60)centerView()});return}const b=contentBounds();UI.cam.x=b.x+b.w/2;UI.cam.y=b.y+b.h/2;UI.cam.zoom=clamp(Math.min(W/(b.w+CELL*2),H/(b.h+CELL*2)),.05,2);requestRender()}


/* ---------- Portales y escenas ---------- */
function portalClick(w,sp){
  const dst=w.target&&UI.scenes.find(x=>x.id===w.target.scene);
  if(UI.realRole==='gm'){
    if(!dst){openEditor(w,sp);toast('Elige a qué escena lleva este portal');return}
    openContext(w,sp);return;
  }
  if(!dst){toast('Este portal todavía no lleva a ninguna parte');return}
  const mine=S.tokens.find(ownsToken);
  const m={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};
  if(mine&&dist(mine,m)>CELL*3){toast('Acércate al portal para cruzarlo');return}
  ctxEl.innerHTML='';
  const title=document.createElement('div');title.className='ctxTitle';title.textContent=w.name||'Portal';ctxEl.appendChild(title);
  const b=document.createElement('button');b.innerHTML=svgIcon('log-in');const s=document.createElement('span');s.textContent=mine?`Cruzar a ${dst.name}`:`Ver ${dst.name}`;b.appendChild(s);
  b.onclick=()=>{ctxEl.style.display='none';Net.travel(w.id,false)};ctxEl.appendChild(b);
  placePop(ctxEl,sp);
}
function portalFields(o,body,text,note,touch){
  text('Nombre del portal',o.name||'',v=>o.name=v);
  const others=UI.scenes.filter(x=>!UI.scene||x.id!==UI.scene.id);
  const wrap=(label,el)=>{const w=document.createElement('label');w.className='field';const sp=document.createElement('span');sp.textContent=label;w.append(sp,el);body.appendChild(w)};
  if(!others.length){note('Crea otra escena desde el menú de escenas (arriba) para poder enlazarla.');return}
  const sceneSel=document.createElement('select');
  sceneSel.innerHTML='<option value="">Sin destino</option>';
  for(const sc of others){const op=document.createElement('option');op.value=sc.id;op.textContent=sc.name;sceneSel.appendChild(op)}
  sceneSel.value=o.target?o.target.scene:'';
  wrap('Lleva a',sceneSel);
  const arrSel=document.createElement('select');arrSel.innerHTML='<option value="">Centro de la escena</option>';wrap('Aparece junto a',arrSel);
  const back=document.createElement('label');back.className='check';const bi=document.createElement('input');bi.type='checkbox';bi.checked=true;back.append(bi,document.createTextNode('Enlazar también ese portal hacia aquí'));body.appendChild(back);
  const loadPortals=async()=>{
    arrSel.innerHTML='<option value="">Centro de la escena</option>';back.style.display='none';
    if(!sceneSel.value)return;
    try{
      const d=await apiJson(`/api/boards/${UI.board.id}/scenes/${sceneSel.value}/portals`);
      for(const p of d.portals){const op=document.createElement('option');op.value=p.id;op.textContent=p.name||`Portal ${d.portals.indexOf(p)+1}`;arrSel.appendChild(op)}
      if(o.target&&o.target.scene===sceneSel.value&&o.target.portal!=null)arrSel.value=String(o.target.portal);
      back.style.display=arrSel.value?'':'none';
    }catch(e){toast(e.message)}
  };
  const apply=()=>{
    o.target=sceneSel.value?{scene:sceneSel.value,portal:arrSel.value?+arrSel.value:null}:null;
    touch(true);
    if(o.target&&o.target.portal!=null&&bi.checked)Net.scene('backlink',{toScene:o.target.scene,toPortal:o.target.portal,fromScene:UI.scene.id,fromPortal:o.id});
  };
  sceneSel.onchange=async()=>{await loadPortals();apply()};
  arrSel.onchange=()=>{back.style.display=arrSel.value?'':'none';apply()};
  bi.onchange=apply;
  loadPortals();
  note('Los jugadores lo cruzan con un clic cuando su personaje está a menos de 15 pies. Tú puedes llevar a todo el grupo desde su menú.');
}
function renderScenes(){
  const btn=$('#sceneBtn');if(!btn)return;
  btn.style.display=UI.scene?'inline-flex':'none';
  $('#sceneBtnName').textContent=UI.scene?UI.scene.name:'';
  const gm=UI.realRole==='gm';
  btn.disabled=!gm&&UI.scenes.length<2;
  const pop=$('#scenePop');if(pop.hidden)return;
  const list=$('#sceneList');list.innerHTML='';
  const online=new Set(Net.online.map(u=>u.id));
  for(const sc of UI.scenes){
    const row=document.createElement('div');row.className='sceneRow'+(UI.scene&&sc.id===UI.scene.id?' current':'');
    const name=document.createElement('button');name.className='sceneName';name.textContent=sc.name;
    if(sc.id===UI.activeScene){const tag=document.createElement('span');tag.className='tag';tag.textContent='grupo';name.appendChild(tag)}
    name.title=gm?'Ver esta escena (solo tú)':'';name.disabled=!gm||(UI.scene&&sc.id===UI.scene.id);
    name.onclick=()=>{Net.flushFog();Net.scene('view',{id:sc.id});closeScenePop()};
    const who=document.createElement('span');who.className='who';
    for(const m of Net.members){if(UI.where[m.id]!==sc.id)continue;const d=document.createElement('i');d.style.background=m.color;d.title=m.name+(online.has(m.id)?'':' (desconectado)');if(!online.has(m.id))d.className='off';who.appendChild(d)}
    row.append(name,who);list.appendChild(row);
    if(gm){
      const act=(ic,title,fn,cls)=>{const b=document.createElement('button');b.className='btn sq ghost'+(cls?' '+cls:'');b.innerHTML=svgIcon(ic);b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;row.appendChild(b);return b};
      act('users','Llevar a todo el grupo aquí',()=>{Net.scene('gather',{id:sc.id});closeScenePop();toast(`Grupo reunido en ${sc.name}`)});
      act('pencil','Renombrar',()=>{
        const inp=document.createElement('input');inp.className='sceneEdit';inp.value=sc.name;name.replaceWith(inp);inp.focus();inp.select();
        const done=ok=>{const v=inp.value.trim();if(ok&&v&&v!==sc.name)Net.scene('rename',{id:sc.id,name:v});renderScenes()};
        inp.onkeydown=e=>{if(e.key==='Enter')done(true);if(e.key==='Escape')done(false)};inp.onblur=()=>done(true);
      });
      act('copy','Duplicar (sin personajes)',()=>Net.scene('duplicate',{id:sc.id}));
      let armed=false;
      const del=act('trash-2','Eliminar escena',()=>{
        if(UI.scenes.length<2){toast('Un tablero necesita al menos una escena');return}
        if(!armed){armed=true;del.classList.add('on');toast(`Pulsa otra vez para eliminar ${sc.name}. Quien esté allí pasa a otra escena.`,2800);setTimeout(()=>{armed=false;del.classList.remove('on')},3000);return}
        Net.scene('delete',{id:sc.id});
      },'danger');
    }
  }
  $('#sceneCreate').hidden=!gm;
  $('#scenePopNote').textContent=gm?'Ver una escena solo cambia tu vista. «Llevar al grupo» mueve a todos los jugadores y sus personajes.':'El director decide a qué escena vas; también puedes cruzar portales.';
}
function openScenePop(){
  const pop=$('#scenePop');pop.hidden=false;
  const r=$('#sceneBtn').getBoundingClientRect();
  pop.style.left=Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,r.left))+'px';pop.style.top=(r.bottom+6)+'px';
  renderScenes();
}
function closeScenePop(){$('#scenePop').hidden=true}
$('#sceneBtn').onclick=e=>{e.stopPropagation();$('#scenePop').hidden?openScenePop():closeScenePop()};
document.addEventListener('pointerdown',e=>{if(!$('#scenePop').hidden&&!e.target.closest('#scenePop')&&!e.target.closest('#sceneBtn'))closeScenePop()});
$('#sceneCreate').onsubmit=e=>{
  e.preventDefault();
  const form=$('#sceneCreate');if(form.dataset.busy)return;form.dataset.busy='1';setTimeout(()=>{delete form.dataset.busy},1500);
  const name=$('#newSceneName').value.trim();
  Net.flushFog();
  Net.scene('create',{name,open:true});
  $('#newSceneName').value='';closeScenePop();
};

/* Secciones plegables del panel: se recuerda cuáles dejaste abiertas */
(function(){
  let folds={};try{folds=JSON.parse(localStorage.getItem('jav.paneles')||'{}')}catch(e){}
  document.querySelectorAll('details.fold').forEach(d=>{
    const k=d.dataset.fold;if(k&&k in folds)d.open=!!folds[k];
    d.addEventListener('toggle',()=>{if(!k)return;folds[k]=d.open;try{localStorage.setItem('jav.paneles',JSON.stringify(folds))}catch(e){}});
  });
})();


/* ---------- Chat y dados ---------- */
const Chat=(()=>{
  const log=()=>$('#chatLog');
  const when=ts=>{const d=new Date(ts);return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
  function render(m){
    const el=document.createElement('div');el.className='chatMsg '+m.kind+(m.secret?' secret':'');el.dataset.id=m.id;
    const who=`<span class="who" style="color:${esc(m.user_color||'#E9E3D5')}">${esc(m.user_name||'—')}</span>`;
    if(m.kind==='roll'){
      const b=m.body||{};
      const pips=(b.dice||[]).map(d=>d.rolls.map(v=>`<span class="pip${v===d.sides?' max':v===1?' min':''}" title="d${d.sides}">${v}</span>`).join('')).join('<span class="pip" style="border:0">+</span>');
      el.innerHTML=`${who}<span class="formula">tiró ${esc(b.formula||'')}${b.label?' · '+esc(b.label):''}</span><span class="total">${b.total}</span><span class="when">${when(m.created_at)}</span><div class="pips">${pips}${b.mod?`<span class="pip" style="border-style:dashed">${b.mod>0?'+':''}${b.mod}</span>`:''}</div>`;
    }else if(m.kind==='system'){el.innerHTML=`${esc(m.body&&m.body.text||'')}<span class="when">${when(m.created_at)}</span>`}
    else el.innerHTML=`${who}${esc(m.body&&m.body.text||'')}<span class="when">${when(m.created_at)}</span>`;
    return el;
  }
  const atEnd=()=>{const l=log();return l.scrollHeight-l.scrollTop-l.clientHeight<40};
  function scrollToEnd(){const l=log();l.scrollTop=l.scrollHeight}
  function load(list){const l=log();l.innerHTML='';for(const m of list)l.appendChild(render(m));scrollToEnd()}
  function receive(m){
    if(!m)return;const l=log();const stick=atEnd();l.appendChild(render(m));if(stick)scrollToEnd();
    if(m.kind==='roll'&&window.Dice3D&&S.animate!==false)Dice3D.roll($('#stageWrap'),m.body.dice,m.user_color,Math.abs(m.id));
    if(UI.tab!=='chat'){const tab=$('[data-tab="chat"]');tab.classList.add('unread')}
  }
  function submit(){
    const inp=$('#chatInput');const text=inp.value.trim();if(!text)return;
    const m=/^\/(r|roll|tirar|rs|gr|privada)\s+(.+)$/i.exec(text);
    if(m){const parts=m[2].split('#');const secret=/^(rs|gr|privada)$/i.test(m[1])||secretMode();Net.roll(parts[0].trim(),(parts[1]||'').trim(),secret)}else Net.chat(text);
    inp.value='';
  }
  return{load,receive,submit,scrollToEnd};
})();
$('#chatForm').onsubmit=e=>{e.preventDefault();Chat.submit()};
const secretMode=()=>UI.realRole==='gm'&&$('#secretRoll').getAttribute('aria-pressed')==='true';
$('#secretRoll').onclick=()=>{const b=$('#secretRoll');const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));toast(on?'Tiradas privadas: sólo las ves tú':'Tiradas públicas',1400)};
/* Bandeja: cada clic añade un dado; se tira con «Tirar», Enter, o sola a los 2,5 s */
const Tray=(()=>{
  const pool=new Map();let timer=0;
  const formula=()=>[...pool.entries()].sort((a,b)=>b[0]-a[0]).map(([d,n])=>`${n}d${d}`).join(' + ');
  function render(){
    const tray=$('#diceTray');const has=pool.size>0;tray.hidden=!has;
    if(!has)return;
    $('#trayFormula').textContent=formula();
    const bar=$('#trayProgress');bar.style.animation='none';void bar.offsetWidth;bar.style.animation='';
  }
  function add(d,n){pool.set(d,Math.min(20,(pool.get(d)||0)+n));render();clearTimeout(timer);timer=setTimeout(roll,2500)}
  function clear(){pool.clear();clearTimeout(timer);render()}
  function roll(){clearTimeout(timer);if(!pool.size)return;const f=formula();pool.clear();render();Net.roll(f,'',secretMode())}
  return{add,clear,roll,get size(){return pool.size}};
})();
for(const b of $$('#diceBar .die[data-d]'))b.onclick=e=>{const n=e.ctrlKey?3:e.shiftKey?2:1;Tray.add(Number(b.dataset.d),n)};
$('#trayRoll').onclick=()=>Tray.roll();$('#trayClear').onclick=()=>Tray.clear();
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&Tray.size&&UI.tab==='chat'&&document.activeElement!==$('#chatInput')){e.preventDefault();Tray.roll()}});
$('[data-tab="chat"]').addEventListener('click',()=>$('[data-tab="chat"]').classList.remove('unread'));

/* ---------- Iniciativa ---------- */
function initCopy(){const i=UI.initiative||{entries:[],turn:0,round:1};return{entries:i.entries.map(e=>Object.assign({},e)),turn:i.turn||0,round:i.round||1}}
function initSend(i){UI.initiative=i;Net.setInitiative(i);renderInitiative()}
function initSort(i){i.entries.sort((a,b)=>b.value-a.value);return i}
function renderInitiative(){
  const i=UI.initiative,bar=$('#initBar');
  const gm=UI.realRole==='gm';
  const show=i&&i.entries.length&&(gm||S.initiativeShown===true);
  bar.hidden=!show;
  if(show){
    $('#initBarRound').textContent=`Ronda ${i.round}`;
    $('#initBarEntries').innerHTML=i.entries.map((e,k)=>`<div class="initEntry${k===i.turn?' current':k<i.turn?' done':''}" title="${esc(e.name)}"><b>${e.value}</b><span>${esc(e.name)}</span></div>`).join('');
    const cur=$('#initBarEntries .current');if(cur)cur.scrollIntoView({block:'nearest',inline:'center'});
  }
  if(!gm)return;
  const list=$('#initList');if(!list)return;
  const it=i||{entries:[],turn:0,round:1};
  $('#initCount').textContent=it.entries.length||'';
  $('#initRoundLabel').textContent=it.entries.length?`Ronda ${it.round}`:'Sin participantes';
  $('#initTurnLabel').textContent=it.entries.length?`turno ${it.turn+1} de ${it.entries.length} · ${esc(it.entries[it.turn]?it.entries[it.turn].name:'')}`:'';
  list.innerHTML='';
  it.entries.forEach((e,k)=>{
    const row=document.createElement('div');row.className='initRow'+(k===it.turn?' current':'')+(e.hidden?' hidden':'');
    const mark=document.createElement('span');mark.className='mark';mark.title=k===it.turn?'Turno actual':'Ir a este turno';mark.style.cursor='pointer';
    mark.onclick=()=>{const c=initCopy();c.turn=k;initSend(c)};
    const name=document.createElement('input');name.value=e.name;name.maxLength=40;name.title='Nombre (clic en el punto para saltar a su turno)';
    name.onchange=()=>{const c=initCopy();c.entries[k].name=name.value.trim()||'Sin nombre';initSend(c)};
    const val=document.createElement('input');val.className='val';val.type='number';val.step='0.5';val.value=e.value;val.title='Iniciativa';
    val.onchange=()=>{const c=initCopy();c.entries[k].value=Number(val.value)||0;initSend(c)};
    const eye=document.createElement('button');eye.className='btn sq ghost';eye.dataset.ic=e.hidden?'eye-off':'eye';eye.title=e.hidden?'Oculta a los jugadores: pulsa para mostrar':'Visible para los jugadores: pulsa para ocultar';
    eye.onclick=()=>{const c=initCopy();c.entries[k].hidden=!e.hidden;initSend(c)};
    const del=document.createElement('button');del.className='btn sq ghost';del.dataset.ic='x';del.title='Quitar';
    del.onclick=()=>{const c=initCopy();c.entries.splice(k,1);if(c.turn>=c.entries.length)c.turn=0;initSend(c)};
    row.append(mark,name,val,eye,del);list.appendChild(row);
  });
  hydrate(list);
}
const esc=v=>String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
$('#initAddTokens').onclick=()=>{
  const c=initCopy();const have=new Set(c.entries.map(e=>e.tokenId));
  for(const t of S.tokens){if(have.has(t.id))continue;c.entries.push({id:nid(),name:t.name||(t.kind==='player'?'Personaje':'Enemigo'),value:0,tokenId:t.id})}
  initSend(c);
};
$('#initAddCustom').onclick=()=>{const c=initCopy();c.entries.push({id:nid(),name:'Entrada',value:0});initSend(c)};
$('#initRollAll').onclick=()=>{const c=initCopy();for(const e of c.entries)e.value=1+Math.floor(Math.random()*20);initSend(initSort(c));toast('Iniciativa tirada y ordenada',1600)};
$('#initSort').onclick=()=>initSend(initSort(initCopy()));
$('#initClear').onclick=()=>{if(!confirm('¿Vaciar la iniciativa?'))return;initSend({entries:[],turn:0,round:1})};
function initStep(dir){
  const c=initCopy();if(!c.entries.length)return;
  c.turn+=dir;
  if(c.turn>=c.entries.length){c.turn=0;c.round++}
  if(c.turn<0){c.turn=c.entries.length-1;c.round=Math.max(1,c.round-1)}
  initSend(c);
}
$('#initNext').onclick=()=>initStep(1);$('#initPrev').onclick=()=>initStep(-1);$('#initBarNext').onclick=()=>initStep(1);
/* la lectura de rendimiento de Mesa → Conexión se refresca mientras la pestaña está abierta */
setInterval(()=>{if(UI.tab==='live'&&UI.board)renderLive()},1000);
