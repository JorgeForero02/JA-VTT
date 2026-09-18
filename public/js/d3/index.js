/* Motor 2.5D de JA-VTT (port del diorama, three r128 → r170) y puente con los scripts clásicos.
   createEngine monta renderer, escena y luces, enlaza los módulos y lleva el bucle;
   mount/unmount/… se exponen en window.D3. No toca el DOM fuera de su canvas. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U, MAXN } from './ctx.js';
import { PROP_KINDS, loadPacks, disposeTex, ART, MATS as ART_MATS, OBJ_KINDS as ART_OBJ } from './art.js';
import { WU, initWater, simWater, buildWater, updateParts, TICK } from './water.js';
import { initFx, updateMist, updateFireflies, updateBooms, flashLight, shakeOff, hooks } from './fx.js';
import { initVision, refreshLights, composeLightmap, computeVision, blendVision, viewers, exploredBytes as visionExploredBytes, exploredDirty as visionExploredDirty, loadExplored as visionLoadExplored, resetExplored as visionResetExplored } from './vision.js';
import { ENVS, decor, charsGroup, propGroup, restyle, removeLight, charAt, updateChars, syncTokens, syncLights, pxOfCell } from './chars.js';
import { CAM, envCur, rt, postMat, postScene, postCam, initCamera, tickCamera, applyEnv, stepEnv, resize, rotate } from './camera.js';
import { initTerrain, terrainMat } from './terrain.js';
import { initWorld, loadScene, loadTerrain, applyTerrainOp, applyView, placeMarks, relayout, refreshTufts, terrainChanged, removeObj, removeMount, blocksMove, closedDoor, blocksSight, maybeGrow } from './world.js';
import { initInput, setTool as setToolInput, setToolOption as setToolOptionInput, bindPointers, unbindPointers, bindKeys, unbindKeys, updateKeys, updateInput, onTerrainOp, pickAt, sendOp } from './input.js';
const T3 = THREE;
// Colores como en r128: sin conversión sRGB→lineal al asignar, sin codificar a la salida.
THREE.ColorManagement.enabled=false;
export function createEngine(stage,opts) {
  R.toast = opts && opts.toast ? opts.toast : () => {};
  R.canMove = (opts && opts.canMove) || (() => true);
  G.cellPx = (opts && opts.cell) || 50;
  R.stage = stage;

/* =====================================================================
   MOTOR
   ===================================================================== */
const canvas=document.createElement('canvas');canvas.className='d3';stage.appendChild(canvas);R.canvas=canvas;
const renderer=new T3.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});R.renderer=renderer;
// r128 no codificaba a sRGB en la salida: se conserva ese aspecto
renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
const isMobile=window.matchMedia('(pointer: coarse)').matches;
S.animLights=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T3.PCFSoftShadowMap;
const scene=new T3.Scene();R.scene=scene;
initCamera(scene);const cam=R.cam;
const hemi=new T3.HemisphereLight(0xcfe6ff,0x7a6a48,.55*Math.PI);R.hemi=hemi;scene.add(hemi);
const sun=new T3.DirectionalLight(0xfff0d8,1*Math.PI);R.sun=sun;
sun.castShadow=true;sun.shadow.mapSize.set(isMobile?1024:2048,isMobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:1,far:80});
sun.shadow.bias=-.0006;sun.shadow.normalBias=.03;
scene.add(sun);scene.add(sun.target);

/* ---------- texturas de datos: visión y luz ---------- */
initVision();
U.uDark.value=new T3.Color('#0E1316');U.uMistCol.value=new T3.Color('#dfe8ee');

/* ---------- terreno, agua, efectos, sprites, marcas, cursor ---------- */
initTerrain(scene);
initWater(scene);initFx(scene);scene.add(decor);scene.add(charsGroup);scene.add(propGroup); // los grupos de sprites viven en chars.js
initWorld(scene);initInput(scene);
onTerrainOp(op=>opts.onTerrainOp&&opts.onTerrainOp(op));

/* ---------- lo que fx.js, chars.js y vision.js necesitan de otros módulos (sin importes circulares) ---------- */
hooks.terrainChanged=terrainChanged;hooks.removeObj=removeObj;hooks.removeMount=removeMount;hooks.removeLight=removeLight;hooks.charAt=charAt;hooks.refreshTufts=refreshTufts;
hooks.envEm=()=>envCur.em;hooks.blocksMove=blocksMove;hooks.closedDoor=closedDoor;hooks.blocksSight=blocksSight;hooks.flashLight=flashLight;hooks.relayout=relayout;hooks.maybeGrow=maybeGrow;hooks.moved=c=>{if(!opts.onMove)return;const p=pxOfCell(c.cell);opts.onMove(c.vid,p.x,p.y);};
hooks.selected=c=>{if(opts.onSelect)opts.onSelect(c?c.vid:null);};

/* =====================================================================
   BUCLE
   ===================================================================== */
let last=-1,acc=0,first=true,visNext=0,raf=0;
function frame(now){
  if(last<0)last=now;
  const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;
  const s=now/1000;
  acc+=dt;let simmed=false,steps=0;
  while(acc>=TICK&&steps<3){simWater();acc-=TICK;simmed=true;steps++;}
  if(acc>TICK)acc=0;
  if(simmed)refreshTufts();
  WU.uTime.value=s;
  buildWater(Math.min(1,acc/TICK),dt,s,true);

  updateKeys(dt);
  tickCamera(dt);
  cam.position.add(shakeOff);
  sun.position.copy(envCur.sp).add(CAM.target);sun.target.position.copy(CAM.target);
  stepEnv(dt);

  updateChars(dt,s,CAM.theta);
  if(G.lightsDirty)refreshLights();
  G.lightTick-=dt;
  if(G.lightTick<=0){composeLightmap(s);G.lightTick=S.animLights?.066:.5;}
  if(G.visionDirty&&s>=visNext){computeVision();visNext=s+.08;}
  blendVision(dt,first);
  U.uFloor.value=S.view==='gm'?Math.max(0,.13-S.amb*.25):0;
  U.uFogAlpha.value+=(S.fogAlpha-U.uFogAlpha.value)*Math.min(1,dt*4);

  const lean=-CAM.elev*.55;
  [decor,charsGroup,propGroup].forEach(g=>g.children.forEach(m=>{if(m.userData.flat||m.userData.fixed)return;m.rotation.y=CAM.theta;m.rotation.x=lean;}));
  const fr=(Math.floor(s*6)%2)*.5;
  PROP_KINDS.forEach(kk=>{ART.TEX.props[kk].offset.x=kk==='orb'||kk==='crystal'?(Math.floor(s*1.5)%2)*.5:fr;});
  Object.entries(ART.art.objs).forEach(([kk,a])=>{if(a.n>1)ART.TEX.objs[kk].offset.x=(Math.floor(s*1.3)%a.n)/a.n;});

  updateInput(s);

  updateParts(dt);
  updateMist(dt,s);
  updateBooms(dt);
  placeMarks(s);
  const flyOn=G.sceneKey==='valle'&&S.view==='gm'&&envCur.fly>.02;
  updateFireflies(dt,s,flyOn?envCur.fly:0);

  postMat.uniforms.uFocus.value+=((S.focus?1:0)-postMat.uniforms.uFocus.value)*Math.min(1,dt*6);
  renderer.setRenderTarget(rt);renderer.render(scene,cam);
  renderer.setRenderTarget(null);renderer.render(postScene,postCam);
  if(first){first=false;opts.onFirstFrame&&opts.onFirstFrame();}
  raf=requestAnimationFrame(frame);
}

// El estado del tablero vive en los scripts clásicos (window.S); el motor sólo lo refleja.
// Quién mira y con qué fichas. `view`: 'gm' (director), 'party' (el grupo) o el id de una ficha.
function setView(cfg){
  const c=cfg||{};
  if(!ready){pendingView=cfg;return;}
  S.view=c.view==null?S.view:c.view;
  S.uid=c.uid==null?S.uid:c.uid;
  S.gm=!!c.gm;S.shared=c.shared!==false;
  applyView();               // uFogOn + visionDirty (world.js)
  computeVision();           // recalcula ya, sin esperar al frame
  reportBlind();
}
let lastBlind=null,pendingView=null;
function reportBlind(){
  const b=S.view!=='gm'&&!viewers().length;
  if(b===lastBlind)return;
  lastBlind=b;if(opts.onBlind)opts.onBlind(b);
}
// `ready` evita tocar el arte antes de que loadPacks() termine: montar es inmediato, pero start() es asíncrono.
let ready=false;
function syncObjects(){const St=window.S;if(!ready||!St)return;syncTokens(St.tokens||[]);syncLights(St.lights||[]);reportBlind();}
function debug(){
  const rect=R.stage.getBoundingClientRect();
  const screen=G.chars.filter(c=>c.vid!=null).map(c=>{
    const v=c.mesh.position.clone();v.y+=.5;v.project(R.cam);
    return {vid:c.vid,x:rect.left+(v.x+1)/2*rect.width,y:rect.top+(1-v.y)/2*rect.height};
  });
  return {chars:G.chars.length, lights:G.lights.length, vids:G.chars.map(c=>c.vid).filter(v=>v!=null), screen,
    view:S.view, env:S.env, amb:S.amb, blind:lastBlind, viewers:viewers().map(c=>c.vid), explored:G.exploredUser.reduce((n,v)=>n+(v?1:0),0),
    style:ART.art?ART.art.style:null};
}
// Ajustes 2.5D de la escena tal como están ahora, para pintar el panel del director.
function settings25(){return {style:ART.art?ART.art.style:'packs', fogAlpha:S.fogAlpha, mist:S.mist, cutOn:G.cutOn, cutH:G.cutH, focus:S.focus, autoGrow:G.autoGrow, evap:G.evap, edgeDrain:G.edgeDrain, n:G.N, nMax:MAXN};}
// El shell elige (o suelta) una ficha por su id de JA-VTT: Escape, listas del panel…
function selectVid(vid){G.selected=vid==null?null:(G.chars.find(c=>c.vid===vid)||null);}
// Qué casilla del tablero hay bajo un punto de la pantalla, en píxeles de JA-VTT.
function pickCell(px,py){const p=pickAt(px,py);const i=p?(p.char?p.char.cell:p.cell):null;return i==null?null:pxOfCell(i);}

/* ---------- API interna: lo que expone createEngine ---------- */
function exploredOut(){return visionExploredBytes();}
let stopped=false;
async function start(){
  try{await loadPacks();}catch(e){throw new Error('No se pudo cargar el arte 2.5D',{cause:e});}
  if(stopped)return; // stop() llegó mientras cargaba el arte: no montar nada
  restyle('packs'); // loadStyle + actualizar sprites y agua
  terrainMat.map=ART.TEX.atlas;terrainMat.needsUpdate=true; // el terreno se creó con map:null
  resize();opts.terrain?loadTerrain(opts.terrain):loadScene('valle');
  // el entorno del tablero manda desde el primer fotograma: sin esto se ve un destello de la escena de muestra (día) mientras la transición de 3 s llega al entorno real
  if(opts.env)setEnv(opts.env,opts.ambient||0,true);
  setToolInput('mover');bindPointers();bindKeys();raf=requestAnimationFrame(frame);
  ready=true;syncObjects();if(pendingView){const v=pendingView;pendingView=null;setView(v);}
}
function stop(){stopped=true;cancelAnimationFrame(raf);unbindKeys();unbindPointers();disposeTex();renderer.dispose();rt.dispose();canvas.remove();}
// Los cuatro entornos de JA-VTT existen con el mismo nombre en ENVS del diorama.
const ENV_MAP={interior:'interior',day:'day',dusk:'dusk',night:'night'};
// Como el cambio de entorno del panel del diorama: niebla, bruma y visión se rehacen con el entorno.
function setEnv(env,amb,snap){
  if(ENVS[ENV_MAP[env]]){S.env=ENV_MAP[env];}
  const P=ENVS[S.env];S.amb=amb;S.fogAlpha=P.fogA;S.mist=P.mist;S.dark=null;G.visionDirty=true;
  applyEnv(!!snap);
}
return { start, stop, resize, rotate, setEnv, setView, loadTerrain, applyTerrainOp, terrainOp:sendOp, settings25, version:()=>G.terrainVersion, setTool:setToolInput, setToolOption:setToolOptionInput, syncObjects, debug, pickCell, select:selectVid, exploredBytes:exploredOut, exploredDirty:visionExploredDirty, loadExplored:visionLoadExplored, resetExplored:visionResetExplored };
}

/* ---------- puente con los scripts clásicos ---------- */
let eng = null, starting = null;
export async function mount(stage, opts) {
  if (eng) return starting || undefined; // ya montado o montándose: misma promesa
  const me = createEngine(stage, opts || {});
  eng = me;
  const p = (async () => {
    try { await me.start(); } catch (e) { if (eng === me) { me.stop(); eng = null; } throw e; } finally { if (starting === p) starting = null; }
  })();
  starting = p;
  return p;
}
// Si llega mientras start() aún carga el arte, stop() marca el motor como parado y start() no monta nada.
export function unmount() { if (!eng) return; eng.stop(); eng = null; starting = null; }
export function resizeEngine() { if (eng) eng.resize(); }
export function rotateEngine(dir) { if (eng) eng.rotate(dir); }
export function setEnv(env, ambient) { if (eng) eng.setEnv(env, ambient); }
export function setView(cfg) { if (eng) eng.setView(cfg); }
export function isMounted() { return !!eng; }
export function loadTerrainBlob(blob){if(eng)eng.loadTerrain(blob);}
export function applyRemoteOp(op,version){return eng?eng.applyTerrainOp(op,version):false;}
export function terrainOp(op){if(eng)eng.terrainOp(op);}
export function settings25(){return eng?eng.settings25():null;}
export const STYLES=[['packs','Packs'],['pixel','Píxel 16'],['pixel32','Píxel 32'],['drawn','Dibujado']];
export function styles(){return STYLES;}
export function version(){return eng?eng.version():-1;}
export function setTool(id){if(eng)eng.setTool(id);}
export function setToolOption(k,v){if(eng)eng.setToolOption(k,v);}
export function catalog(){return {MATS:ART_MATS.map((m,i)=>({i,name:m.name,swatch:m.swatch,hidden:!!m.hidden})),OBJS:Object.entries(ART_OBJ).map(([key,o])=>({key,name:o.name,mount:!!o.mount,mountOnly:!!o.mountOnly}))};}
export function syncObjects(){if(eng)eng.syncObjects();}
export function debugInfo(){return eng&&location.hostname==='localhost'?eng.debug():null;}
export function pickCell(x,y){return eng?eng.pickCell(x,y):null;}
export function selectToken(vid){if(eng)eng.select(vid);}
export function exploredBytes(){return eng?eng.exploredBytes():null;}
export function exploredDirty(){return eng?eng.exploredDirty():false;}
export function loadExplored(bytes){if(eng)eng.loadExplored(bytes);}
export function resetExplored25(){if(eng)eng.resetExplored();}
window.D3={mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,setView,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version,setTool,setToolOption,catalog,syncObjects,debug:debugInfo,pickCell,select:selectToken,exploredBytes,exploredDirty,loadExplored,resetExplored:resetExplored25,terrainOp,settings25,styles};
