/* Entrada del motor 2.5D: raycast sobre el tablero, cursor y anillo de selección,
   herramientas del director (sin interfaz: la UI la pone JA-VTT), punteros y teclado. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, MAXH, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
import { mkCanvas, OBJ_KINDS, toTex } from './art.js';
import { waterMesh, pours, WET } from './water.js';
import { charsGroup, propGroup, select, moveTo, charAt } from './chars.js';
import { vh, getTerrainMeshes } from './terrain.js';
import { isDoor, mountValid, applyTerrainOp, autoRot, canGrow } from './world.js';
import { CAM, panBy, focusOn, zoomMax } from './camera.js';
const T3 = THREE;
const objs=G.objs, mounts=G.mounts, springs=G.springs, sinks=G.sinks;

/* ---------- cursor y selección ---------- */
function frameCanvas(){
  const c=mkCanvas(16,16),x=c.getContext('2d');
  x.fillStyle='rgba(255,236,190,.22)';x.fillRect(0,0,16,16);
  x.fillStyle='#ffe3a3';x.fillRect(0,0,16,1);x.fillRect(0,15,16,1);x.fillRect(0,0,1,16);x.fillRect(15,0,1,16);
  [[1,1,3,1],[1,1,1,3],[12,1,3,1],[14,1,1,3],[1,14,3,1],[1,12,1,3],[12,14,3,1],[14,12,1,3]].forEach(a=>x.fillRect(...a));
  return c;
}
let cursor=null,ring=null;
export function initInput(scene){
  cursor=new T3.Mesh(new T3.PlaneGeometry(1,1),new T3.MeshBasicMaterial({map:toTex(frameCanvas(),true),transparent:true,depthWrite:false}));
  cursor.rotation.x=-Math.PI/2;cursor.visible=false;cursor.renderOrder=5;scene.add(cursor);
  ring=new T3.Mesh(new T3.RingGeometry(.3,.42,28),new T3.MeshBasicMaterial({color:0xf2c35e,transparent:true,opacity:.95,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.visible=false;ring.renderOrder=6;scene.add(ring);
}

/* =====================================================================
   HERRAMIENTAS (sin interfaz: la UI es la de JA-VTT — rail y subbarra en editor.js)
   ===================================================================== */
export function setTool(id){G.tool=id;}
export function setToolOption(k,v){if(k==='paintMat')G.paintMat=v;else if(k==='objKind')G.objKind=v;else if(k==='waterMode')G.waterMode=v;}
let emitOp=null;
export function onTerrainOp(cb){emitOp=cb;}
/* Edición del director: la op sale con la version actual y se aplica en local como version+1; el servidor confirma con ack o manda el terreno completo si hubo conflicto */
function sendOp(op){const v=G.terrainVersion;if(emitOp)emitOp(Object.assign({},op,{version:v}));applyTerrainOp(op,v+1);}

/* ---------- selección en el mapa ---------- */
const ray=new T3.Raycaster(),ndc=new T3.Vector2();
function faceDir(n){if(!n||Math.abs(n.y)>.5)return -1;if(n.x>.5)return 0;if(n.x<-.5)return 1;if(n.z>.5)return 2;return 3;}
export function pickAt(px,py){
  const rect=R.stage.getBoundingClientRect();
  ndc.set(((px-rect.left)/rect.width)*2-1,-((py-rect.top)/rect.height)*2+1);
  ray.setFromCamera(ndc,R.cam);
  const hc=ray.intersectObjects(charsGroup.children.filter(m=>m.visible),false);
  if(hc.length)return{char:hc[0].object.userData.char};
  const hp=ray.intersectObjects(propGroup.children.filter(m=>m.visible),false);
  if(hp.length){const l=hp[0].object.userData.light;return{light:l,cell:l.cell};}
  const hm=ray.intersectObjects(Array.from(mounts.values()).map(o=>o.mesh).filter(m=>m.visible),false);
  const hits=ray.intersectObjects(getTerrainMeshes().concat([waterMesh],Array.from(objs.values()).map(o=>o.mesh).filter(m=>m.visible)),false);
  if(hm.length&&(!hits.length||hm[0].distance<=hits[0].distance+.05))return{mount:hm[0].object.userData.mount};
  for(const h of hits){
    const ud=h.object.userData;
    if(ud.art&&ud.art.t==='obj')return{cell:ud.cell,obj:true};
    if(h.object===waterMesh){const qi=Math.floor(h.faceIndex/2);return{cell:waterMesh.userData.quadCell[qi]};}
    if(h.instanceId==null||!ud.cells)continue;
    const cell=ud.cells[h.instanceId];
    const d=faceDir(h.face&&h.face.normal);
    const wall=d>=0&&mountValid(cell,d)&&h.point.y>G.H[I(cxOf(cell)+DIRS[d][0],czOf(cell)+DIRS[d][1])]?{wall:cell,dir:d}:null;
    return{cell,wall};
  }
  return null;
}
export function showCursor(i){
  if(i==null){cursor.visible=false;return;}
  cursor.visible=true;
  cursor.position.set(wx(cxOf(i)),vh(i)+(G.Wr[i]>=WET?G.Wr[i]+.02:0)+.03,wz(czOf(i)));
}
export function applyTool(p){
  if(!p)return;
  if(p.char){
    if(G.tool==='mover'){
      if(p.char.vid!=null&&!R.canMove(p.char.vid)){R.toast('Esa ficha no es tuya.');return;}
      select(p.char);return;
    }
    p={cell:p.char.cell};
  }
  if(p.mount){
    if(G.tool==='objeto'){sendOp({type:'mount',key:p.mount,kind:null});R.toast('Pieza quitada de la pared.');}
    return;
  }
  const i=p.cell;showCursor(i);
  if(G.tool==='ficha')return;   // crear fichas lo hace JA-VTT con D3.pickCell (rail Ficha/Enemigo)
  if(G.tool==='mover'){
    if(p.obj&&isDoor(i)){const o=objs.get(i);if(o.locked&&S.view!=='gm'){R.toast('La puerta está cerrada con llave.');return;}sendOp({type:'door',i,open:!o.open});return;}
    if(!G.selected){R.toast('Primero toca una ficha.');return;}
    if(G.selected.vid!=null&&!R.canMove(G.selected.vid)){R.toast('Esa ficha no es tuya.');return;}
    moveTo(G.selected,i);
  }else if(G.tool==='subir'){
    if(G.H[i]>=MAXH){R.toast('Ese bloque ya está a la altura máxima.');return;}
    if(charAt(i,null)){R.toast('Hay una ficha en esa casilla.');return;}
    sendOp({type:'cells',cells:[{i,h:G.H[i]+1}]});
    if(canGrow(i))sendOp({type:'grow',pad:8});
  }else if(G.tool==='bajar'){
    if(G.H[i]<=1){R.toast('Ese bloque ya está al ras del pedestal.');return;}
    if(charAt(i,null)){R.toast('Hay una ficha en esa casilla.');return;}
    sendOp({type:'cells',cells:[{i,h:G.H[i]-1}]});
    if(canGrow(i))sendOp({type:'grow',pad:8});
  }else if(G.tool==='pintar'){
    sendOp({type:'cells',cells:[{i,m:G.paintMat}]});
    if(canGrow(i))sendOp({type:'grow',pad:8});
  }else if(G.tool==='agua'){
    if(G.waterMode==='verter')pours.push({cell:i,left:1.6});
    else if(G.waterMode==='manantial'){
      const k=springs.findIndex(sp=>sp.cell===i);
      const springs2=springs.slice();
      if(k>=0){springs2.splice(k,1);R.toast('Manantial quitado.');}
      else{springs2.push({cell:i,rate:.05,cap:.5});R.toast('Manantial puesto: el agua brota y busca dónde caer.');}
      sendOp({type:'water',springs:springs2,sinks:sinks.slice(),evap:G.evap,edgeDrain:G.edgeDrain});
      if(canGrow(i))sendOp({type:'grow',pad:8});
    }else if(G.waterMode==='desague'){
      const k=sinks.findIndex(sk=>sk.cell===i);
      const sinks2=sinks.slice();
      if(k>=0){sinks2.splice(k,1);R.toast('Desagüe quitado.');}
      else{sinks2.push({cell:i,level:G.H[i]+.12,user:true});R.toast('Desagüe puesto: se lleva el agua que llegue aquí.');}
      sendOp({type:'water',springs:springs.slice(),sinks:sinks2,evap:G.evap,edgeDrain:G.edgeDrain});
      if(canGrow(i))sendOp({type:'grow',pad:8});
    }else{
      const x=cxOf(i),z=czOf(i);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(inb(x+dx,z+dz)){const j=I(x+dx,z+dz);G.W[j]=0;G.Wprev[j]=0;G.FLX[j*4]=G.FLX[j*4+1]=G.FLX[j*4+2]=G.FLX[j*4+3]=0;}}
    }
  }else if(G.tool==='boom'){
    R.toast('Las explosiones todavía no están disponibles en el mapa 2.5D.');
  }else if(G.tool==='objeto'){
    const K=OBJ_KINDS[G.objKind];
    if(p.obj&&objs.has(i)){sendOp({type:'obj',i,kind:null});return;}
    if(p.wall&&(K.mount||K.mountOnly)){if(mountValid(p.wall.wall,p.wall.dir))sendOp({type:'mount',key:p.wall.wall+':'+p.wall.dir,kind:G.objKind});return;}
    if(K.mountOnly){R.toast(K.name+' solo va en una pared: toca la cara de un muro.');return;}
    if(objs.has(i)){sendOp({type:'obj',i,kind:null});return;}
    if(charAt(i,null)&&K.move){R.toast('Hay una ficha en esa casilla.');return;}
    sendOp({type:'obj',i,kind:G.objKind,rot:K.fixed?autoRot(i,G.objKind):0});
    if(canGrow(i))sendOp({type:'grow',pad:8});
  }else if(G.tool==='luz'){
    R.toast('Las luces todavía no se colocan desde el mapa 2.5D.');
  }
}
const pointers=new Map();let dragMoved=false,pinchD=0,pinchM=null,hoverXY=null;
function onContextMenu(e){e.preventDefault();}
function onPointerDown(e){
  R.stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,pan:e.button===2||e.button===1||e.shiftKey});
  if(pointers.size===1)dragMoved=false;
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinchD=Math.hypot(a.x-b.x,a.y-b.y);pinchM=[(a.x+b.x)/2,(a.y+b.y)/2];dragMoved=true;}
}
function onPointerMove(e){
  const p=pointers.get(e.pointerId);
  if(!p){if(e.pointerType==='mouse')hoverXY=[e.clientX,e.clientY];return;}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(pointers.size===1){
    if(!dragMoved&&Math.hypot(p.x-p.sx,p.y-p.sy)>7){dragMoved=true;R.stage.classList.add('dragging');}
    if(dragMoved){
      if(p.pan)panBy(dx,dy);
      else{CAM.thetaT-=dx*.0085;CAM.elevT=Math.min(1.25,Math.max(.32,CAM.elevT+dy*.005));}
    }
  }else if(pointers.size===2){
    const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(pinchD>0)CAM.distT=Math.min(zoomMax(),Math.max(CAM.baseDist*.4,CAM.distT*pinchD/d));
    if(pinchM)panBy((mx-pinchM[0]),(my-pinchM[1]));
    pinchD=d;pinchM=[mx,my];
  }
}
function endPointer(e){
  if(!pointers.has(e.pointerId))return;
  const single=pointers.size===1;
  pointers.delete(e.pointerId);
  if(single&&!dragMoved&&e.type==='pointerup')applyTool(pickAt(e.clientX,e.clientY));
  if(pointers.size<2)pinchM=null;
  if(pointers.size===0)R.stage.classList.remove('dragging');
}
function onPointerLeave(e){if(e.pointerType==='mouse'&&!pointers.size){hoverXY=null;cursor.visible=false;}}
function onWheel(e){e.preventDefault();CAM.distT=Math.min(zoomMax(),Math.max(CAM.baseDist*.4,CAM.distT*(1+e.deltaY*.001)));}
const POINTER_EVENTS=[['contextmenu',onContextMenu],['pointerdown',onPointerDown],['pointermove',onPointerMove],['pointerup',endPointer],['pointercancel',endPointer],['pointerleave',onPointerLeave],['wheel',onWheel,{passive:false}]];
export function bindPointers(){POINTER_EVENTS.forEach(([t,f,o])=>R.stage.addEventListener(t,f,o));}
export function unbindPointers(){POINTER_EVENTS.forEach(([t,f,o])=>R.stage.removeEventListener(t,f,o));pointers.clear();R.stage.classList.remove("dragging");}
const PAN_KEYS={w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1],a:[1,0],arrowleft:[1,0],d:[-1,0],arrowright:[-1,0]};
const keysDown=new Set();
function onKeyUp(e){keysDown.delete(e.key.toLowerCase());}
function onBlur(){keysDown.clear();}
function onKeyDown(e){
  if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
  const k=e.key.toLowerCase();
  if(k==='q')CAM.thetaT-=Math.PI/2;
  else if(k==='e')CAM.thetaT+=Math.PI/2;
  else if(PAN_KEYS[k]){keysDown.add(k);e.preventDefault();}
  else if(k==='f'&&G.selected)focusOn(G.selected);
}
export function bindKeys(){window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);window.addEventListener('keydown',onKeyDown);}
export function unbindKeys(){window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);window.removeEventListener('keydown',onKeyDown);keysDown.clear();}

/* Por fotograma: desplazamiento por teclado (antes de mover la cámara) */
export function updateKeys(dt){
  keysDown.forEach(kk=>{const v=PAN_KEYS[kk];if(v)panBy(v[0]*dt*600,v[1]*dt*600);});
}
/* Por fotograma: anillo de la ficha elegida y cursor bajo el ratón (después de mover la cámara) */
export function updateInput(s){
  if(G.selected&&G.selected.mesh.visible){
    ring.visible=true;
    ring.position.set(G.selected.mesh.position.x,G.selected.gy+.04,G.selected.mesh.position.z);
    const sc=1+.08*Math.sin(s*4);ring.scale.set(sc,sc,sc);
  }else ring.visible=false;

  if(hoverXY&&!pointers.size){const p=pickAt(hoverXY[0],hoverXY[1]);showCursor(p?(p.char?p.char.cell:p.cell):null);hoverXY=null;}
}
