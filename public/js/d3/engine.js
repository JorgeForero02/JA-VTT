/* Motor 2.5D de JA-VTT: port del diorama (three r128 → r170). Estado del mundo por celda,
   terreno instanciado, agua, luz por mapa, visión y niebla. No toca el DOM fuera de su canvas. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U, MAXH, MAXN, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
const T3 = THREE;
import { mkCanvas, rng, pick, AC, PROP_KINDS, OBJ_KINDS, MATS, slotOf, loadPacks, toTex, disposeTex, ART } from './art.js';
import { WU, waterMat, waterMesh, curtMat, initWater, resetWater, simWater, buildWater, updateParts, clearParts, resizeWater, TICK, WET, pours } from './water.js';
import { initFx, updateMist, updateFireflies, explode, updateBooms, flashLight, shakeOff, hooks, boomQueue, undoStack } from './fx.js';
import { patchMat, refreshLights, composeLightmap, computeVision, blendVision, resizeVision, initVision } from './vision.js';
import { ENVS, decor, charsGroup, propGroup, spriteMats, makeSprite, spriteMaterial, depthMat, spriteGeo, flatGeo, sharedSpriteMats, restyle, doorTex, mountGeo, tuftMat, objMats, addChar, addLight, removeLight, charAt, select, moveTo, updateChars } from './chars.js';
// Colores como en r128: sin conversión sRGB→lineal al asignar, sin codificar a la salida.
THREE.ColorManagement.enabled=false;
export function createEngine(stage,opts) {
  R.toast = opts && opts.toast ? opts.toast : () => {};
  R.stage = stage;
  const chars=G.chars, objs=G.objs, lights=G.lights, mounts=G.mounts,
        springs=G.springs, sinks=G.sinks, tufts=G.tufts, pcVis=G.pcVis, explored=G.explored;
  const vh=i=>G.cutOn?Math.min(G.H[i],G.cutH):G.H[i];
  // el diorama avisaba en su HUD; aquí usa el toast de JA-VTT

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
const bgCanvas=mkCanvas(2,128),bgCtx=bgCanvas.getContext('2d');
const bgTex=new T3.CanvasTexture(bgCanvas);scene.background=bgTex;
const cam=new T3.PerspectiveCamera(30,1,.5,300);R.cam=cam;
const hemi=new T3.HemisphereLight(0xcfe6ff,0x7a6a48,.55*Math.PI);R.hemi=hemi;scene.add(hemi);
const sun=new T3.DirectionalLight(0xfff0d8,1*Math.PI);R.sun=sun;
sun.castShadow=true;sun.shadow.mapSize.set(isMobile?1024:2048,isMobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:1,far:80});
sun.shadow.bias=-.0006;sun.shadow.normalBias=.03;
scene.add(sun);scene.add(sun.target);

const dummy=new T3.Object3D();

/* ---------- texturas de datos: visión y luz ---------- */
initVision();
U.uDark.value=new T3.Color('#0E1316');U.uMistCol.value=new T3.Color('#dfe8ee');

/* ---------- pedestal ---------- */
function woodCanvas(){
  const c=mkCanvas(32,32),x=c.getContext('2d'),r=rng(55);
  for(let p=0;p<4;p++){const base=pick(r,['#5a3a22','#4e321d','#63412a','#573821']);
    for(let yy=0;yy<32;yy++)for(let xx=0;xx<8;xx++){x.fillStyle=r()<.18?'#452b18':base;x.fillRect(p*8+xx,yy,1,1);}
    x.fillStyle='#2e1d10';x.fillRect(p*8+7,0,1,32);}
  return c;
}
const wood=toTex(woodCanvas(),true,true);
const pedestal=new T3.Mesh(new T3.BoxGeometry(G.N+.8,1.3,G.N+.8),new T3.MeshLambertMaterial({map:wood}));
pedestal.position.y=-.65;pedestal.receiveShadow=true;scene.add(pedestal);
const trim=new T3.Mesh(new T3.BoxGeometry(G.N+.95,.12,G.N+.95),new T3.MeshLambertMaterial({color:0xb08a3e}));
trim.position.y=-1.24;scene.add(trim);
{
  const c=mkCanvas(128,128),x=c.getContext('2d'),g=x.createRadialGradient(64,64,10,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
  const blob=new T3.Mesh(new T3.PlaneGeometry(G.N*1.9,G.N*1.9),new T3.MeshBasicMaterial({map:new T3.CanvasTexture(c),transparent:true,depthWrite:false}));
  blob.rotation.x=-Math.PI/2;blob.position.y=-1.6;scene.add(blob);
  pedestal.userData.blob=blob;
}
function sizePedestal(){
  pedestal.geometry.dispose();pedestal.geometry=new T3.BoxGeometry(G.N+.8,1.3,G.N+.8);wood.repeat.set((G.N+.8)/4,.33);
  trim.geometry.dispose();trim.geometry=new T3.BoxGeometry(G.N+.95,.12,G.N+.95);
  pedestal.userData.blob.scale.set(G.N/BASE_N,G.N/BASE_N,1);
  const ext=Math.min(40,Math.max(17,G.N*.78));
  Object.assign(sun.shadow.camera,{left:-ext,right:ext,top:ext,bottom:-ext,far:80+ext});sun.shadow.camera.updateProjectionMatrix();
}

function atlasBox(faces){
  const g=new T3.BoxGeometry(1,1,1),uv=g.attributes.uv,e=.03;
  for(let f=0;f<6;f++){const id=faces[f],c=id%AC,rw=Math.floor(id/AC);
    for(let v=0;v<4;v++){const k=f*4+v,u=uv.getX(k),w=uv.getY(k);
      uv.setXY(k,(c+e+u*(1-2*e))/AC,1-(rw+e+(1-w)*(1-2*e))/AC);}}
  uv.needsUpdate=true;return g;
}
const terrainMat=patchMat(new T3.MeshLambertMaterial({map:null}),{grid:true}); // el atlas se asigna en start() (restyle) cuando ya cargó packs25.png
function instanced(geo,mat,cap){
  const m=new T3.InstancedMesh(geo,mat,cap);m.count=0;m.frustumCulled=false;
  m.castShadow=true;m.receiveShadow=true;m.userData.cells=new Int32Array(cap);m.userData.n=0;m.userData.cap=cap;
  scene.add(m);return m;
}
function regrow(m,need){
  // el terreno reserva sitio según lo que hace falta; si no alcanza, se rehace más grande
  const cap=Math.max(need,m.userData.cap*2),n=instanced(m.geometry,m.material,cap);
  scene.remove(m);m.dispose&&m.dispose();return n;
}
// cada material tiene tres casillas propias en el atlas (arriba, lados, relleno) para poder cambiarlas sin afectar a los demás
const CUT=5;
const topMeshes=MATS.map((m,mi)=>{const t=slotOf(mi,'top'),sd=slotOf(mi,'side'),fl=slotOf(mi,'fill');return instanced(atlasBox([sd,sd,t,fl,sd,sd]),terrainMat,1024);});
const fillMeshes={};
MATS.forEach((m,mi)=>{const fl=slotOf(mi,'fill');fillMeshes[mi]=instanced(atlasBox([fl,fl,fl,fl,fl,fl]),terrainMat,1024);});
let terrainMeshes=topMeshes.concat(Object.values(fillMeshes));

initWater(scene);initFx(scene);scene.add(decor);scene.add(charsGroup);scene.add(propGroup); // los grupos de sprites viven en chars.js

/* ---------- cursor y selección ---------- */
function frameCanvas(){
  const c=mkCanvas(16,16),x=c.getContext('2d');
  x.fillStyle='rgba(255,236,190,.22)';x.fillRect(0,0,16,16);
  x.fillStyle='#ffe3a3';x.fillRect(0,0,16,1);x.fillRect(0,15,16,1);x.fillRect(0,0,1,16);x.fillRect(15,0,1,16);
  [[1,1,3,1],[1,1,1,3],[12,1,3,1],[14,1,1,3],[1,14,3,1],[1,12,1,3],[12,14,3,1],[14,12,1,3]].forEach(a=>x.fillRect(...a));
  return c;
}
const cursor=new T3.Mesh(new T3.PlaneGeometry(1,1),new T3.MeshBasicMaterial({map:toTex(frameCanvas(),true),transparent:true,depthWrite:false}));
cursor.rotation.x=-Math.PI/2;cursor.visible=false;cursor.renderOrder=5;scene.add(cursor);
const ring=new T3.Mesh(new T3.RingGeometry(.3,.42,28),new T3.MeshBasicMaterial({color:0xf2c35e,transparent:true,opacity:.95,depthWrite:false}));
ring.rotation.x=-Math.PI/2;ring.visible=false;ring.renderOrder=6;scene.add(ring);

/* =====================================================================
   ESTADO
   ===================================================================== */

/* ---------- manantiales y desagües que pone el director ---------- */
const markGroup=new T3.Group();scene.add(markGroup);
const markGeo=new T3.RingGeometry(.18,.3,20);markGeo.rotateX(-Math.PI/2);
const markMats={spring:new T3.MeshBasicMaterial({color:0x5fc6f2,transparent:true,opacity:.9,depthWrite:false}),
  sink:new T3.MeshBasicMaterial({color:0x1d2a3e,transparent:true,opacity:.85,depthWrite:false})};
function updateMarks(){
  markGroup.children.slice().forEach(m=>markGroup.remove(m));
  const add=(cell,mat)=>{const m=new T3.Mesh(markGeo,mat);m.userData.cell=cell;m.renderOrder=7;markGroup.add(m);};
  springs.forEach(sp=>add(sp.cell,markMats.spring));
  sinks.filter(sk=>sk.user).forEach(sk=>add(sk.cell,markMats.sink));
}
function placeMarks(t){
  markGroup.visible=S.view==='gm'&&G.tool==='agua';
  markGroup.children.forEach(m=>{const i=m.userData.cell;m.position.set(wx(cxOf(i)),G.H[i]+Math.max(G.Wr[i]||0,0)+.06,wz(czOf(i)));m.scale.setScalar(1+.12*Math.sin(t*3));});
}

/* ---------- tamaño del tablero: crece solo al acercarse al borde ---------- */
const GROW_STEP=8;
function allocWorld(n){
  G.N=n;G.CELLS=n*n;
  resizeVision(G.CELLS);
  resizeWater(G.CELLS);
  sizePedestal();
}
function growWorld(pad,quiet){
  if(G.N+pad*2>MAXN){if(!quiet)R.toast('El tablero ya está en su tamaño máximo ('+MAXN+' × '+MAXN+').');return false;}
  const oN=G.N,re=i=>(Math.floor(i/oN)+pad)*(oN+pad*2)+(i%oN)+pad;
  const oH=G.H,oM=G.M,oW=G.W,oC=G.chan,oExp=new Map(explored);
  allocWorld(oN+pad*2);
  G.H=new Uint8Array(G.CELLS);G.M=new Uint8Array(G.CELLS);G.W=new Float32Array(G.CELLS);G.chan=new Uint8Array(G.CELLS);
  const border=SCENES[G.sceneKey].border,r=rng(G.OFF*131+G.N);
  G.OFF+=pad;
  for(let z=0;z<G.N;z++)for(let x=0;x<G.N;x++){
    const i=z*G.N+x,ox=x-pad,oz=z-pad;
    if(ox>=0&&oz>=0&&ox<oN&&oz<oN){const o=oz*oN+ox;G.H[i]=oH[o];G.M[i]=oM[o];G.W[i]=oW[o];G.chan[i]=oC[o];}
    else{const b=border(x-G.OFF,z-G.OFF);G.H[i]=b.h;G.M[i]=b.m;}
  }
  explored.clear();oExp.forEach((a,c)=>{const e=new Uint8Array(G.CELLS);for(let i=0;i<a.length;i++)if(a[i])e[re(i)]=1;explored.set(c,e);});
  pcVis.clear();
  const oObjs=new Map(objs);objs.clear();oObjs.forEach((o,i)=>{const j=re(i);o.mesh.userData.cell=j;objs.set(j,o);});
  const oM2=new Map(mounts);mounts.clear();oM2.forEach(o=>{o.wall=re(o.wall);const k=mountKey(o.wall,o.dir);o.mesh.userData.mount=k;mounts.set(k,o);});
  lights.forEach(l=>{l.cell=re(l.cell);if(l.mount)l.mount.wall=re(l.mount.wall);l.cache=null;});
  chars.forEach(c=>{c.cell=re(c.cell);c.path=c.path.map(re);if(c.seg){c.seg.from=re(c.seg.from);c.seg.to=re(c.seg.to);}});
  springs.forEach(sp=>{sp.cell=re(sp.cell);});
  sinks.forEach(sk=>{sk.cell=re(sk.cell);});
  updateMarks();
  pours.forEach(pr=>{pr.cell=re(pr.cell);});
  tufts.forEach(m=>{m.userData.cell=re(m.userData.cell);});
  // decorado del anillo nuevo
  const b0=SCENES[G.sceneKey];
  for(let z=0;z<G.N;z++)for(let x=0;x<G.N;x++){
    const ox=x-pad,oz=z-pad;if(ox>=0&&oz>=0&&ox<oN&&oz<oN)continue;
    const i=z*G.N+x;if(G.M[i]!==0)continue;
    if(b0.randomTrees&&r()<.06)addObj(i,r()<.5?'arbol':'pino');
    else if(b0.tufts&&r()<.4){const m=makeSprite({t:'tuft'},.42,.42,false,tuftMat);m.userData.cell=i;m.userData.ox=(r()-.5)*.6;m.userData.oz=(r()-.5)*.6;decor.add(m);tufts.push(m);}
  }
  G.FLX.fill(0);G.Wprev.set(G.W);G.Wr.set(G.W);
  buildTerrain();relayout();G.lightsDirty=true;G.visionDirty=true;
  fitDistance();
  if(!quiet)R.toast('Tablero ampliado a '+G.N+' × '+G.N+'.');
  return true;
}
function nearEdge(i,m){const x=cxOf(i),z=czOf(i);return x<m||z<m||x>=G.N-m||z>=G.N-m;}
function maybeGrow(i){if(G.autoGrow&&nearEdge(i,2)&&G.N+GROW_STEP*2<=MAXN)growWorld(GROW_STEP,false);}

/* ---------- escenas ---------- */
function blank(h,m){G.H=new Uint8Array(G.CELLS).fill(h);G.M=new Uint8Array(G.CELLS).fill(m);G.W=new Float32Array(G.CELLS);G.chan=new Uint8Array(G.CELLS);}
function carveLine(x0,z0,x1,z1){
  const steps=Math.max(Math.abs(x1-x0),Math.abs(z1-z0)),cells=[[x0,z0]];let px=x0,pz=z0;
  for(let s=1;s<=steps;s++){const x=Math.round(x0+(x1-x0)*s/steps),z=Math.round(z0+(z1-z0)*s/steps);
    if(x!==px&&z!==pz)cells.push([x,pz]);cells.push([x,z]);px=x;pz=z;}
  let prev=99;
  for(const [x,z] of cells){const i=I(x,z);let h=Math.max(1,G.H[i]-1);if(h>prev)h=prev;G.H[i]=h;prev=h;G.M[i]=2;G.chan[i]=1;}
}
const PC=(kind,x,z,o)=>Object.assign({kind,pc:true,at:[x,z],dv:0,sight:0,light:'none'},o||{});
const NPC=(kind,x,z,o)=>Object.assign({kind,pc:false,at:[x,z],dv:60,sight:0,light:'none'},o||{});
const SCENES={
  valle:{name:'Valle del arroyo',randomTrees:true,tufts:true,
    border:(ax,az)=>({h:Math.max(1,Math.min(6,Math.round(2.6+.55*Math.sin(ax*.33+.5)+.55*Math.cos(az*.29)+.4*Math.sin((ax-az)*.17)))),m:0}),
    build(){
    blank(1,0);
    for(let z=0;z<G.N;z++)for(let x=0;x<G.N;x++){
      const h=3.6-(x+z)/(2*G.N)*2.2+Math.sin(x*.7)*.35+Math.cos(z*.55+1)*.35;
      G.H[I(x,z)]=Math.max(1,Math.min(MAXH,Math.round(h)));
    }
    for(let z=0;z<=6;z++)for(let x=0;x<=7;x++){if((x===7&&z===6)||(x===0&&z===6))continue;G.H[I(x,z)]=6;G.M[I(x,z)]=1;}
    G.H[I(1,0)]=7;G.H[I(2,0)]=7;G.H[I(0,1)]=7;
    for(const z of [2,3]){G.H[I(8,z)]=5;G.H[I(9,z)]=4;G.H[I(10,z)]=3;G.M[I(8,z)]=G.M[I(9,z)]=G.M[I(10,z)]=3;}
    for(let z=2;z<=9;z++){const i=I(11,z);G.H[i]=Math.min(G.H[i],3);G.M[i]=3;}
    for(let z=0;z<G.N;z++)for(let x=0;x<G.N;x++){
      const d=Math.hypot(x-15,z-15),i=I(x,z);
      if(d<3.2){G.H[i]=1;G.M[i]=2;G.W[i]=1;G.chan[i]=1;}else if(d<4.4){G.H[i]=Math.min(G.H[i],2);G.M[i]=2;}
    }
    for(const z of [4,5,6]){G.H[I(4,z)]=5;G.M[I(4,z)]=1;G.chan[I(4,z)]=1;}
    carveLine(4,7,12,13);
    // orillas: todo lo que rodea al cauce queda al menos un bloque por encima
    for(let i=0;i<G.CELLS;i++){
      if(!G.chan[i]||G.W[i]>0)continue;
      const x=cxOf(i),z=czOf(i);if(z<=6&&x<=7)continue;
      for(const [dx,dz] of DIRS){const nx=x+dx,nz=z+dz;if(!inb(nx,nz))continue;const j=I(nx,nz);
        if(!G.chan[j]&&G.H[j]<G.H[i]+1)G.H[j]=Math.min(MAXH,G.H[i]+1);}
    }
    const lake=[];for(let i=0;i<G.CELLS;i++)if(G.W[i]>0)lake.push({cell:i,level:1.88});
    // cementerio pequeño al noreste
    for(let z=1;z<=4;z++)for(let x=15;x<=18;x++){G.M[I(x,z)]=3;}
    return{
      springs:[{cell:I(4,4),rate:.07,cap:.6}],sinks:lake,evap:.0012,edgeDrain:true,cut:false,cutH:3,mistBase:.9,env:'day',view:'gm',target:2.2,
      objs:[['pino',1,5],['pino',6,0],['pino',0,2],['arbol',19,6],['arbol',3,12],['pino',2,17],['arbol',8,19],['pino',20,5],
        ['cofre',1,3],['barrilx',13,3],['barrilx',14,4],
        ['barril',12,3],['barril',12,4],['caja',10,5],['valla',12,7,1],['valla',12,8,1],['valla',12,9,1],
        ['lapida',15,2,0],['lapida',17,2,0],['cruz',16,1,0],['cruz',18,3,0],['craneo',16,4],
        ['taburete',5,15],['taburete',7,16],['mesa',6,17]],
      mounts:[['estandarte',7,1,0],['estandarte2',2,6,2],['limo',6,6,2]],
      randomTrees:true,tufts:true,
      lights:[['torch',11,4],['torch',12,10],['campfire',6,15],['lantern',17,4]],
      wallLights:[['torch',5,6,2],['torch',7,4,0]],
      chars:[
        PC('guerrera',6,2),PC('mago',2,2),PC('arquera',12,6,{dv:60}),
        NPC('goblin',16,7),NPC('esqueleto',16,3),NPC('arana',5,19),
      ],
    };
  }},
  cripta:{name:'Cripta de las velas',randomTrees:false,tufts:false,
    border:()=>({h:5,m:1}),
    build(){
    blank(5,1);
    const floor=(x0,z0,x1,z1,h,m)=>{for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){G.H[I(x,z)]=h||2;G.M[I(x,z)]=m==null?4:m;}};
    floor(1,15,5,20);            // vestíbulo
    floor(6,17,9,17);            // pasillo al osario (con puerta)
    floor(10,13,17,20);          // osario con canal
    floor(13,8,14,12);           // pasillo al altar
    floor(9,1,18,7);             // sala del altar
    floor(12,1,15,2,3);          // estrado
    floor(7,4,8,4);              // pasillo a la guarida (con puerta)
    floor(1,1,6,8);              // guarida
    floor(2,9,2,14);             // pasillo de vuelta (con puerta)
    for(let x=10;x<=17;x++){const i=I(x,16);if(x===13||x===14){G.M[i]=3;continue;}G.H[i]=1;G.M[i]=1;G.W[i]=1;G.chan[i]=1;}
    G.H[I(5,6)]=3;G.M[I(5,6)]=1;G.H[I(1,20)]=3;G.M[I(1,20)]=1;
    return{
      springs:[],sinks:[],evap:0,edgeDrain:false,cut:true,cutH:4,mistBase:1.9,env:'interior',view:'party',target:2,
      objs:[
        // puertas
        ['puerta',7,17],['puerta',8,4],['puerta',2,12],
        // vestíbulo
        ['barril',5,15],['barril',5,20],['caja',4,20],['craneo',2,16],
        // pasillo con trampa
        ['pinchos',8,17],
        // osario
        ['lapida',11,19,0],['lapida',12,20,0],['lapida',16,20,0],['cruz',17,19,0],['lapida',11,14,0],['cruz',16,13,0],['craneo',12,17],['pocion',17,14],
        // altar
        ['columna',11,4],['columna',16,4],['columna',11,6],['columna',16,6],
        ['cofre',13,1],['baul',14,1],['craneo',12,5],['craneo',15,6],
        // guarida
        ['barril',5,1],['barril',6,2],['barrilx',6,3],['barrilx',10,6],['caja',1,7],['mesa',4,7],['taburete',3,7],['estante',3,1,0],['pocion',4,6],
      ],
      mounts:[
        ['estandarte2',4,14,2],['estandarte',10,0,2],['estandarte',17,0,2],
        ['fuente',18,18,1],['grieta',12,21,3],['limo',11,12,2],['grieta',0,4,0],['limo',6,0,2],
      ],
      randomTrees:false,tufts:false,
      lights:[['brazier',12,1],['brazier',15,1],['crystal',1,1],['crystal',6,8],['candle',17,20],['candle',10,13],['magic',14,10]],
      wallLights:[['torch',1,14,2],['torch',9,18,3],['torch',8,6,0],['torch',19,6,1],['torch',0,18,0]],
      chars:[
        PC('guerrera',2,18,{light:'torch'}),PC('mago',3,19),PC('arquera',4,17,{dv:60}),
        NPC('esqueleto',15,19),NPC('fantasma',15,14,{dv:120}),NPC('murcielago',13,9,{dv:120}),
        NPC('nigromante',14,2,{light:'crystal'}),NPC('demonio',13,5,{dv:120}),
        NPC('goblin',3,4),NPC('rata',6,5),
      ],
    };
  }},
};

function clearGroup(g){g.children.slice().forEach(m=>{g.remove(m);m.geometry.dispose();});}
function loadScene(key){
  G.sceneKey=key;
  G.OFF=0;if(G.N!==BASE_N)allocWorld(BASE_N);
  const cfg=SCENES[key].build();
  G.springs.length=0;G.springs.push(...cfg.springs);
  G.sinks.length=0;if(cfg.sinks)G.sinks.push(...cfg.sinks);
  G.evap=cfg.evap;G.edgeDrain=cfg.edgeDrain;G.cutOn=cfg.cut;G.cutH=cfg.cutH||3;
  target.set(0,cfg.target,0);targetT.copy(target);
  clearGroup(decor);clearGroup(charsGroup);clearGroup(propGroup);
  spriteMats.forEach(m=>m.dispose());spriteMats.clear();sharedSpriteMats();
  objs.clear();mounts.clear();G.tufts.length=0;lights.length=0;chars.length=0;clearParts();
  const r=rng(2026);
  cfg.objs.forEach(([k,x,z,q])=>addObj(I(x,z),k,q==null?null:q*Math.PI/2));
  (cfg.mounts||[]).forEach(([k,x,z,d])=>addMount(I(x,z),d,k));
  const nearChar=i=>cfg.chars.some(s=>Math.abs(s.at[0]-cxOf(i))<=1&&Math.abs(s.at[1]-czOf(i))<=1);
  const nearLight=i=>cfg.lights.some(l=>Math.abs(l[1]-cxOf(i))<=1&&Math.abs(l[2]-czOf(i))<=1);
  for(let i=0;i<G.CELLS;i++){
    if(G.M[i]!==0||G.chan[i]||objs.has(i)||nearChar(i)||nearLight(i))continue;
    if(cfg.randomTrees&&r()<.05)addObj(i,r()<.5?'arbol':'pino');
    else if(cfg.tufts&&r()<.45){const m=makeSprite({t:'tuft'},.42,.42,false,tuftMat);m.userData.cell=i;m.userData.ox=(r()-.5)*.6;m.userData.oz=(r()-.5)*.6;decor.add(m);tufts.push(m);}
  }
  cfg.lights.forEach(([p,x,z])=>addLight(p,I(x,z)));
  (cfg.wallLights||[]).forEach(([p,x,z,d])=>addLight(p,I(x+DIRS[d][0],z+DIRS[d][1]),{wall:I(x,z),dir:d}));
  cfg.chars.forEach(s=>addChar(s));
  explored.clear();pcVis.clear();undoStack.length=0;boomQueue.length=0;
  updateMarks();
  buildTerrain();
  resetWater();if(springs.length)for(let k=0;k<260;k++)simWater();
  G.Wprev.set(G.W);buildWater(1,0,0,false);relayout();
  G.selected=chars[0];
  S.env=cfg.env;S.amb=ENVS[cfg.env].ambient;S.fogAlpha=ENVS[cfg.env].fogA;S.mist=ENVS[cfg.env].mist;S.dark=null;S.view=cfg.view;
  U.uMistBase.value=cfg.mistBase;
  G.lightsDirty=true;G.visionDirty=true;
  applyView();
  applyEnv(true);
}
const isDoor=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].door;
const closedDoor=j=>isDoor(j)&&!objs.get(j).open;
const blocksMove=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].move&&!(isDoor(j)&&objs.get(j).open);
const higher=(j,i)=>G.H[j]>G.H[i]+1;
function autoRot(i,kind){
  const x=cxOf(i),z=czOf(i),at=(dx,dz)=>inb(x+dx,z+dz)&&higher(I(x+dx,z+dz),i);
  if(OBJ_KINDS[kind].door){
    if(at(0,1)&&at(0,-1))return Math.PI/2;
    if(at(1,0)&&at(-1,0))return 0;
  }
  return Math.round(theta/(Math.PI/2))*(Math.PI/2);
}
function addObj(i,kind,rot){
  const K=OBJ_KINDS[kind],a=ART.art.objs[kind],flat=!!K.flat,fixed=!!K.fixed;
  const tex=K.door?doorTex():ART.TEX.objs[kind];
  const mat=K.door?spriteMaterial(tex):objMats[kind];
  const m=new T3.Mesh(flat?flatGeo(a.w,a.h):spriteGeo(a.w,a.h),mat);
  m.rotation.order='YXZ';m.castShadow=!flat;m.customDepthMaterial=depthMat(tex);
  const r=fixed?(rot==null?autoRot(i,kind):rot):0;
  if(fixed)m.rotation.set(0,r,0);
  m.userData={art:{t:'obj',k:kind},tex,cell:i,flat,fixed};
  decor.add(m);objs.set(i,{kind,mesh:m,rot:r,open:false});
}
function removeObj(i){
  const o=objs.get(i);if(!o)return;decor.remove(o.mesh);o.mesh.geometry.dispose();
  if(OBJ_KINDS[o.kind].door){spriteMats.delete(o.mesh.material);o.mesh.material.dispose();}
  objs.delete(i);if(OBJ_KINDS[o.kind].door){lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;}
}
function toggleDoor(i){
  const o=objs.get(i);o.open=!o.open;
  o.mesh.userData.tex.offset.x=o.open?.5:0;
  lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;G.visionDirty=true;
  R.toast(o.open?'Puerta abierta.':'Puerta cerrada.');
}
// piezas colgadas: clave muro:dirección; la dirección apunta del muro hacia el suelo
const mountKey=(wall,d)=>wall+':'+d;
function mountValid(wall,d){
  const x=cxOf(wall)+DIRS[d][0],z=czOf(wall)+DIRS[d][1];
  return inb(x,z)&&G.H[wall]>G.H[I(x,z)];
}
function addMount(wall,d,kind){
  if(!mountValid(wall,d))return false;
  const key=mountKey(wall,d);if(mounts.has(key))removeMount(key);
  const m=new T3.Mesh(mountGeo(kind),objMats[kind]);
  m.castShadow=false;m.customDepthMaterial=depthMat(ART.TEX.objs[kind]);
  m.rotation.set(0,Math.atan2(DIRS[d][0],DIRS[d][1]),0);
  m.userData={art:{t:'obj',k:kind},tex:ART.TEX.objs[kind],fixed:true,mount:key};
  decor.add(m);mounts.set(key,{kind,mesh:m,wall,dir:d});
  return true;
}
function removeMount(key){const o=mounts.get(key);if(!o)return;decor.remove(o.mesh);o.mesh.geometry.dispose();mounts.delete(key);}
function placeOnWall(mesh,wall,d,up,h){
  const floor=I(cxOf(wall)+DIRS[d][0],czOf(wall)+DIRS[d][1]);
  const y=G.H[floor]+up;
  mesh.position.set(wx(cxOf(wall))+DIRS[d][0]*.515,y,wz(czOf(wall))+DIRS[d][1]*.515);
  mesh.visible=G.H[wall]>G.H[floor]&&y+h<=vh(wall)+.02;
}

function relayout(){
  objs.forEach((o,i)=>{o.mesh.position.set(wx(cxOf(i)),G.H[i],wz(czOf(i)));o.mesh.visible=vh(i)===G.H[i];});
  mounts.forEach(o=>{const a=ART.art.objs[o.kind];placeOnWall(o.mesh,o.wall,o.dir,OBJ_KINDS[o.kind].my||.7,a.mh);});
  tufts.forEach(m=>{const i=m.userData.cell;m.position.set(wx(cxOf(i))+m.userData.ox,G.H[i],wz(czOf(i))+m.userData.oz);});
  lights.forEach(l=>{if(!l.mesh)return;
    if(l.mount){placeOnWall(l.mesh,l.mount.wall,l.mount.dir,.5,l.mh);return;}
    const i=l.cell;l.mesh.position.set(wx(cxOf(i)),vh(i),wz(czOf(i)));l.mesh.visible=vh(i)===G.H[i];});
  refreshTufts();
}
function refreshTufts(){tufts.forEach(m=>{const i=m.userData.cell;m.visible=G.M[i]===0&&G.Wr[i]<WET&&!objs.has(i)&&!m.userData.burnt;});}
function buildTerrain(){
  // solo se dibujan los bloques que tienen alguna cara a la vista
  const counts=new Map();terrainMeshes.forEach(m=>counts.set(m,0));
  const plan=[];
  for(let i=0;i<G.CELLS;i++){
    const real=G.H[i],h=vh(i),capped=h<real,mi=capped?CUT:G.M[i];
    const x=cxOf(i),z=czOf(i);
    let low=h;
    for(const [dx,dz] of DIRS){const nx=x+dx,nz=z+dz;const nh=inb(nx,nz)?vh(I(nx,nz)):0;if(nh<low)low=nh;}
    const top=topMeshes[mi],fill=fillMeshes[G.M[i]];
    counts.set(top,counts.get(top)+1);
    const from=Math.max(0,Math.min(low,h-1));
    if(h-1>from)counts.set(fill,counts.get(fill)+(h-1-from));
    plan.push(i,from,h,mi);
  }
  topMeshes.forEach((m,k)=>{const c=counts.get(m);if(c>m.userData.cap)topMeshes[k]=regrow(m,c);});
  Object.keys(fillMeshes).forEach(k=>{const m=fillMeshes[k],c=counts.get(m);if(c>m.userData.cap)fillMeshes[k]=regrow(m,c);});
  terrainMeshes=topMeshes.concat(Object.values(fillMeshes));
  terrainMeshes.forEach(m=>{m.userData.n=0;});
  for(let p=0;p<plan.length;p+=4){
    const i=plan[p],from=plan[p+1],h=plan[p+2],mi=plan[p+3],x=wx(cxOf(i)),z=wz(czOf(i));
    for(let k=from;k<h;k++){
      const mesh=k===h-1?topMeshes[mi]:fillMeshes[G.M[i]];
      const n=mesh.userData.n++;
      dummy.position.set(x,k+.5,z);dummy.updateMatrix();
      mesh.setMatrixAt(n,dummy.matrix);mesh.userData.cells[n]=i;
    }
  }
  terrainMeshes.forEach(m=>{m.count=m.userData.n;m.instanceMatrix.needsUpdate=true;});
}

/* =====================================================================
   CÁMARA, ENTORNO Y POSPROCESO
   ===================================================================== */
const target=new T3.Vector3(0,2.2,0),targetT=target.clone();
let theta=Math.PI*.25,thetaT=theta,elev=.7,elevT=elev,baseDist=50,dist=50,distT=50;
function zoomMax(){return baseDist*1.5*Math.max(1,G.N/26);}
function fitDistance(){baseDist=50*Math.max(1,1.1/cam.aspect);distT=Math.min(Math.max(distT,baseDist*.4),zoomMax());}
function clampTarget(){const h=G.N/2;targetT.x=Math.max(-h,Math.min(h,targetT.x));targetT.z=Math.max(-h,Math.min(h,targetT.z));}
function panBy(sx,sy){
  // arrastre en pantalla -> desplazamiento sobre el suelo según hacia dónde mira la cámara
  const k=dist*.0016,rx=Math.cos(theta),rz=-Math.sin(theta),fx=-Math.sin(theta),fz=-Math.cos(theta);
  targetT.x+=(-rx*sx+fx*sy)*k;targetT.z+=(-rz*sx+fz*sy)*k;clampTarget();
}
function focusOn(c){targetT.x=c.mesh.position.x;targetT.z=c.mesh.position.z;clampTarget();}
function placeCam(){
  if(cam.far<dist*3){cam.far=dist*3;cam.updateProjectionMatrix();}
  cam.position.set(target.x+dist*Math.cos(elev)*Math.sin(theta),target.y+dist*Math.sin(elev),target.z+dist*Math.cos(elev)*Math.cos(theta));
  cam.lookAt(target);
}
const envCur={sun:new T3.Color(),si:1,sp:new T3.Vector3(-8,20,10),sky:new T3.Color(),gnd:new T3.Color(),hi:.5,top:new T3.Color(),bot:new T3.Color(),em:.3,gain:.5,fly:0,dark:new T3.Color()};
let envT=0;
function envScale(){const e=ENVS[S.env];return Math.max(0,Math.min(2.5,e.ambient>0?S.amb/e.ambient:1+S.amb*10));}
function paintBg(){
  const g=bgCtx.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'#'+envCur.top.getHexString());g.addColorStop(1,'#'+envCur.bot.getHexString());
  bgCtx.fillStyle=g;bgCtx.fillRect(0,0,2,128);bgTex.needsUpdate=true;
}
function applyEnv(instant){envT=instant?-1:3;if(instant)stepEnv(0);}
function stepEnv(dt){
  if(envT===0)return;
  const P=ENVS[S.env],s=envScale(),k=envT<0?1:Math.min(1,dt*2.4),tc=new T3.Color();
  envCur.sun.lerp(tc.set(P.sun),k);envCur.sky.lerp(tc.set(P.sky),k);envCur.gnd.lerp(tc.set(P.gnd),k);
  envCur.top.lerp(tc.set(P.top),k);envCur.bot.lerp(tc.set(P.bot),k);envCur.dark.lerp(tc.set(S.dark||P.dark),k);
  envCur.sp.lerp(new T3.Vector3(...P.sp),k);
  envCur.si+=(P.si*Math.min(s,1.4)-envCur.si)*k;envCur.hi+=(P.hi*s-envCur.hi)*k;envCur.em+=(P.em*Math.min(1.5,.4+.6*s)-envCur.em)*k;
  envCur.gain+=(P.gain-envCur.gain)*k;envCur.fly+=(P.fly-envCur.fly)*k;
  U.uAmbFlat.value+=(P.flat*Math.min(1.4,.55+.45*s)-U.uAmbFlat.value)*k;
  U.uMistCol.value.lerp(tc.set(P.mistCol),k);
  sun.color.copy(envCur.sun);sun.intensity=envCur.si*Math.PI;sun.position.copy(envCur.sp).add(target);sun.target.position.copy(target);
  hemi.color.copy(envCur.sky);hemi.groundColor.copy(envCur.gnd);hemi.intensity=envCur.hi*Math.PI;
  spriteMats.forEach(m=>{m.emissiveIntensity=envCur.em;});
  waterMat.emissiveIntensity=envCur.em*.9;curtMat.emissiveIntensity=envCur.em*1.4;
  U.uGain.value=envCur.gain;U.uDark.value.copy(envCur.dark);
  paintBg();
  envT=envT<0?0:Math.max(0,envT-dt);
}

const rt=new T3.WebGLRenderTarget(1,1,{format:T3.RGBAFormat,samples:4});
const postMat=new T3.ShaderMaterial({
  uniforms:{tDiffuse:{value:rt.texture},res:{value:new T3.Vector2(1,1)},uFocus:{value:1}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:[
    'uniform sampler2D tDiffuse;uniform vec2 res;uniform float uFocus;varying vec2 vUv;',
    'vec3 blur(vec2 uv,float rad){vec3 c=vec3(0.);for(int i=0;i<16;i++){float fi=float(i);float a=fi*2.39996;float r=sqrt((fi+.5)/16.);c+=texture2D(tDiffuse,uv+vec2(cos(a),sin(a))*r*rad/res).rgb;}return c/16.;}',
    'void main(){',
    ' vec3 base=texture2D(tDiffuse,vUv).rgb;float sc=res.y/800.;',
    ' float d=abs(vUv.y-.52);float k=smoothstep(.12,.5,d)*uFocus;',
    ' vec3 col=base;',
    ' if(k>.01){col=mix(base,blur(vUv,8.*k*sc),min(1.,k*1.7));}',
    ' vec3 wide=blur(vUv,16.*sc);',
    // resplandor suave solo en lo muy brillante
    ' col+=max(wide-vec3(.8),0.)*.45;',
    // contraste suave: levanta sombras y redondea las luces para que no se quemen
    ' vec3 soft=1.-exp(-col*1.55);',
    ' col=mix(col,soft,.32);',
    ' col=mix(vec3(dot(col,vec3(.299,.587,.114))),col,.97);',
    ' col*=vec3(1.02,1.,.97);',
    ' float v=smoothstep(.45,1.,length((vUv-.5)*vec2(res.x/res.y,1.)));',
    ' col*=1.-v*.3;',
    ' gl_FragColor=vec4(col,1.);',
    '}'].join('\n'),
  depthTest:false,depthWrite:false
});
const postScene=new T3.Scene(),postCam=new T3.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new T3.Mesh(new T3.PlaneGeometry(2,2),postMat));
function resize(){
  const r=stage.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),pr=renderer.getPixelRatio();
  renderer.setSize(w,h,false);
  rt.setSize(Math.floor(w*pr),Math.floor(h*pr));
  postMat.uniforms.res.value.set(Math.floor(w*pr),Math.floor(h*pr));
  cam.aspect=w/h;cam.updateProjectionMatrix();
  const old=baseDist;fitDistance();if(old!==baseDist)distT=baseDist;
}

/* =====================================================================
   HERRAMIENTAS (sin interfaz: la UI del diorama no viene; fase B la hará JA-VTT)
   ===================================================================== */
function setTool(id){G.tool=id;}
function applyView(){
  U.uFogOn.value=S.view==='gm'?0:1;
  G.visionDirty=true;
}
/* ---------- selección en el mapa ---------- */
const ray=new T3.Raycaster(),ndc=new T3.Vector2();
function faceDir(n){if(!n||Math.abs(n.y)>.5)return -1;if(n.x>.5)return 0;if(n.x<-.5)return 1;if(n.z>.5)return 2;return 3;}
function pickAt(px,py){
  const rect=stage.getBoundingClientRect();
  ndc.set(((px-rect.left)/rect.width)*2-1,-((py-rect.top)/rect.height)*2+1);
  ray.setFromCamera(ndc,cam);
  const hc=ray.intersectObjects(charsGroup.children.filter(m=>m.visible),false);
  if(hc.length)return{char:hc[0].object.userData.char};
  const hp=ray.intersectObjects(propGroup.children.filter(m=>m.visible),false);
  if(hp.length){const l=hp[0].object.userData.light;return{light:l,cell:l.cell};}
  const hm=ray.intersectObjects(Array.from(mounts.values()).map(o=>o.mesh).filter(m=>m.visible),false);
  const hits=ray.intersectObjects(terrainMeshes.concat([waterMesh],Array.from(objs.values()).map(o=>o.mesh).filter(m=>m.visible)),false);
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
function showCursor(i){
  if(i==null){cursor.visible=false;return;}
  cursor.visible=true;
  cursor.position.set(wx(cxOf(i)),vh(i)+(G.Wr[i]>=WET?G.Wr[i]+.02:0)+.03,wz(czOf(i)));
}
function terrainChanged(){buildTerrain();relayout();lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;}
const MOUNT_LIGHTS=['candle','torch','lantern','crystal','magic'];
function applyTool(p){
  if(!p)return;
  if(p.char){
    if(G.tool==='mover'){select(p.char);return;}
    p={cell:p.char.cell};
  }
  if(p.mount){
    if(G.tool==='objeto'){removeMount(p.mount);R.toast('Pieza quitada de la pared.');}
    return;
  }
  const i=p.cell;showCursor(i);
  if(G.tool!=='mover'&&G.tool!=='boom')setTimeout(()=>maybeGrow(i),0);
  if(G.tool==='mover'){
    if(p.obj&&isDoor(i)){toggleDoor(i);return;}
    if(!G.selected){R.toast('Primero toca una ficha.');return;}
    moveTo(G.selected,i);
  }else if(G.tool==='subir'){
    if(G.H[i]>=MAXH){R.toast('Ese bloque ya está a la altura máxima.');return;}
    if(charAt(i,null)){R.toast('Hay una ficha en esa casilla.');return;}
    G.H[i]++;terrainChanged();
  }else if(G.tool==='bajar'){
    if(G.H[i]<=1){R.toast('Ese bloque ya está al ras del pedestal.');return;}
    G.H[i]--;terrainChanged();
  }else if(G.tool==='pintar'){
    G.M[i]=G.paintMat;buildTerrain();refreshTufts();
  }else if(G.tool==='agua'){
    if(G.waterMode==='verter')pours.push({cell:i,left:1.6});
    else if(G.waterMode==='manantial'){
      const k=springs.findIndex(sp=>sp.cell===i);
      if(k>=0){springs.splice(k,1);R.toast('Manantial quitado.');}
      else{springs.push({cell:i,rate:.05,cap:.5});R.toast('Manantial puesto: el agua brota y busca dónde caer.');}
      updateMarks();
    }else if(G.waterMode==='desague'){
      const k=sinks.findIndex(sk=>sk.cell===i);
      if(k>=0){sinks.splice(k,1);R.toast('Desagüe quitado.');}
      else{sinks.push({cell:i,level:G.H[i]+.12,user:true});R.toast('Desagüe puesto: se lleva el agua que llegue aquí.');}
      updateMarks();
    }else{
      const x=cxOf(i),z=czOf(i);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(inb(x+dx,z+dz)){const j=I(x+dx,z+dz);G.W[j]=0;G.Wprev[j]=0;G.FLX[j*4]=G.FLX[j*4+1]=G.FLX[j*4+2]=G.FLX[j*4+3]=0;}}
    }
  }else if(G.tool==='boom'){
    const o=objs.get(i),K=o&&OBJ_KINDS[o.kind];
    explode(i,K&&K.explosive?K.explosive:G.boomLevel);
  }else if(G.tool==='objeto'){
    const K=OBJ_KINDS[G.objKind];
    if(p.obj&&objs.has(i)){removeObj(i);refreshTufts();G.visionDirty=true;return;}
    if(p.wall&&(K.mount||K.mountOnly)){addMount(p.wall.wall,p.wall.dir,G.objKind);relayout();return;}
    if(K.mountOnly){R.toast(K.name+' solo va en una pared: toca la cara de un muro.');return;}
    if(objs.has(i)){removeObj(i);refreshTufts();G.visionDirty=true;return;}
    if(charAt(i,null)&&K.move){R.toast('Hay una ficha en esa casilla.');return;}
    addObj(i,G.objKind);relayout();G.visionDirty=true;
  }else if(G.tool==='luz'){
    if(p.light){removeLight(p.light);R.toast('Luz quitada.');}
    else if(p.wall&&MOUNT_LIGHTS.includes(G.lightPreset)){
      const w=p.wall,floor=I(cxOf(w.wall)+DIRS[w.dir][0],czOf(w.wall)+DIRS[w.dir][1]);
      const ex=lights.find(l=>l.mount&&l.mount.wall===w.wall&&l.mount.dir===w.dir);
      if(ex){removeLight(ex);R.toast('Luz quitada.');}else addLight(G.lightPreset,floor,{wall:w.wall,dir:w.dir});
    }
    else{const ex=lights.find(l=>!l.carrier&&!l.mount&&l.cell===i);if(ex){removeLight(ex);R.toast('Luz quitada.');}else addLight(G.lightPreset,i);}
  }
}
const pointers=new Map();let dragMoved=false,pinchD=0,pinchM=null,hoverXY=null;
function onContextMenu(e){e.preventDefault();}
function onPointerDown(e){
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,pan:e.button===2||e.button===1||e.shiftKey});
  if(pointers.size===1)dragMoved=false;
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinchD=Math.hypot(a.x-b.x,a.y-b.y);pinchM=[(a.x+b.x)/2,(a.y+b.y)/2];dragMoved=true;}
}
function onPointerMove(e){
  const p=pointers.get(e.pointerId);
  if(!p){if(e.pointerType==='mouse')hoverXY=[e.clientX,e.clientY];return;}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(pointers.size===1){
    if(!dragMoved&&Math.hypot(p.x-p.sx,p.y-p.sy)>7){dragMoved=true;stage.classList.add('dragging');}
    if(dragMoved){
      if(p.pan)panBy(dx,dy);
      else{thetaT-=dx*.0085;elevT=Math.min(1.25,Math.max(.32,elevT+dy*.005));}
    }
  }else if(pointers.size===2){
    const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(pinchD>0)distT=Math.min(zoomMax(),Math.max(baseDist*.4,distT*pinchD/d));
    if(pinchM)panBy((mx-pinchM[0]),(my-pinchM[1]));
    pinchD=d;pinchM=[mx,my];
  }
}
function endPointer(e){
  if(!pointers.has(e.pointerId))return;
  const single=pointers.size===1;
  pointers.delete(e.pointerId);
  if(single&&!dragMoved&&e.type==='pointerup'&&G.tool!=='mover')applyTool(pickAt(e.clientX,e.clientY)); // fase A: sólo 'mover', que aquí no hace nada
  if(pointers.size<2)pinchM=null;
  if(pointers.size===0)stage.classList.remove('dragging');
}
function onPointerLeave(e){if(e.pointerType==='mouse'&&!pointers.size){hoverXY=null;cursor.visible=false;}}
function onWheel(e){e.preventDefault();distT=Math.min(zoomMax(),Math.max(baseDist*.4,distT*(1+e.deltaY*.001)));}
const POINTER_EVENTS=[['contextmenu',onContextMenu],['pointerdown',onPointerDown],['pointermove',onPointerMove],['pointerup',endPointer],['pointercancel',endPointer],['pointerleave',onPointerLeave],['wheel',onWheel,{passive:false}]];
function bindPointers(){POINTER_EVENTS.forEach(([t,f,o])=>stage.addEventListener(t,f,o));}
function unbindPointers(){POINTER_EVENTS.forEach(([t,f,o])=>stage.removeEventListener(t,f,o));pointers.clear();stage.classList.remove("dragging");}
const PAN_KEYS={w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1],a:[1,0],arrowleft:[1,0],d:[-1,0],arrowright:[-1,0]};
const keysDown=new Set();
function onKeyUp(e){keysDown.delete(e.key.toLowerCase());}
function onBlur(){keysDown.clear();}
function onKeyDown(e){
  if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
  const k=e.key.toLowerCase();
  if(k==='q')thetaT-=Math.PI/2;
  else if(k==='e')thetaT+=Math.PI/2;
  else if(PAN_KEYS[k]){keysDown.add(k);e.preventDefault();}
  else if(k==='f'&&G.selected)focusOn(G.selected);
}
function bindKeys(){window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);window.addEventListener('keydown',onKeyDown);}
function unbindKeys(){window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);window.removeEventListener('keydown',onKeyDown);keysDown.clear();}

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

  const k=Math.min(1,dt*9);
  keysDown.forEach(kk=>{const v=PAN_KEYS[kk];if(v)panBy(v[0]*dt*600,v[1]*dt*600);});
  theta+=(thetaT-theta)*k;elev+=(elevT-elev)*k;dist+=(distT-dist)*k;
  target.x+=(targetT.x-target.x)*k;target.z+=(targetT.z-target.z)*k;
  placeCam();
  cam.position.add(shakeOff);
  sun.position.copy(envCur.sp).add(target);sun.target.position.copy(target);
  stepEnv(dt);

  updateChars(dt,s,theta);
  if(G.lightsDirty)refreshLights();
  G.lightTick-=dt;
  if(G.lightTick<=0){composeLightmap(s);G.lightTick=S.animLights?.066:.5;}
  if(G.visionDirty&&s>=visNext){computeVision();visNext=s+.08;}
  blendVision(dt,first);
  U.uFloor.value=S.view==='gm'?Math.max(0,.13-S.amb*.25):0;
  U.uFogAlpha.value+=(S.fogAlpha-U.uFogAlpha.value)*Math.min(1,dt*4);

  const lean=-elev*.55;
  [decor,charsGroup,propGroup].forEach(g=>g.children.forEach(m=>{if(m.userData.flat||m.userData.fixed)return;m.rotation.y=theta;m.rotation.x=lean;}));
  const fr=(Math.floor(s*6)%2)*.5;
  PROP_KINDS.forEach(kk=>{ART.TEX.props[kk].offset.x=kk==='orb'||kk==='crystal'?(Math.floor(s*1.5)%2)*.5:fr;});
  Object.entries(ART.art.objs).forEach(([kk,a])=>{if(a.n>1)ART.TEX.objs[kk].offset.x=(Math.floor(s*1.3)%a.n)/a.n;});

  if(G.selected&&G.selected.mesh.visible){
    ring.visible=true;
    ring.position.set(G.selected.mesh.position.x,G.selected.gy+.04,G.selected.mesh.position.z);
    const sc=1+.08*Math.sin(s*4);ring.scale.set(sc,sc,sc);
  }else ring.visible=false;

  if(hoverXY&&!pointers.size){const p=pickAt(hoverXY[0],hoverXY[1]);showCursor(p?(p.char?p.char.cell:p.cell):null);hoverXY=null;}

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

/* ---------- API interna: lo que expone createEngine ---------- */
let stopped=false;
async function start(){
  try{await loadPacks();}catch(e){throw new Error('No se pudo cargar el arte 2.5D',{cause:e});}
  if(stopped)return; // stop() llegó mientras cargaba el arte: no montar nada
  restyle('packs'); // loadStyle + actualizar sprites y agua
  terrainMat.map=ART.TEX.atlas;terrainMat.needsUpdate=true; // el terreno se creó con map:null
  resize();loadScene('valle');setTool('mover');bindPointers();bindKeys();raf=requestAnimationFrame(frame);
}
function stop(){stopped=true;cancelAnimationFrame(raf);unbindKeys();unbindPointers();disposeTex();renderer.dispose();rt.dispose();canvas.remove();}
function rotate(dir){thetaT+=dir*Math.PI/2;}
// Los cuatro entornos de JA-VTT existen con el mismo nombre en ENVS del diorama.
const ENV_MAP={interior:'interior',day:'day',dusk:'dusk',night:'night'};
// Como el cambio de entorno del panel del diorama: niebla, bruma y visión se rehacen con el entorno.
function setEnv(env,amb){
  if(ENVS[ENV_MAP[env]]){S.env=ENV_MAP[env];}
  const P=ENVS[S.env];S.amb=amb;S.fogAlpha=P.fogA;S.mist=P.mist;S.dark=null;G.visionDirty=true;
  applyEnv(false);
}
hooks.terrainChanged=terrainChanged;hooks.removeObj=removeObj;hooks.removeMount=removeMount;hooks.removeLight=removeLight;hooks.charAt=charAt;hooks.refreshTufts=refreshTufts;
hooks.envEm=()=>envCur.em;hooks.blocksMove=blocksMove;hooks.closedDoor=closedDoor;hooks.blocksSight=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].sight&&!(isDoor(j)&&objs.get(j).open);hooks.flashLight=flashLight;hooks.relayout=relayout;hooks.maybeGrow=maybeGrow;
return { start, stop, resize, rotate, setEnv };
}
