/* Mundo del motor 2.5D: escenas de muestra, tamaño del tablero, objetos, piezas de pared,
   puertas, marcas de agua y recolocación de todo lo que se apoya en el terreno. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U, MAXH, MAXN, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
import { rng, OBJ_KINDS, CHAR_INFO, CUSTOM, ART, setCustomArt } from './art.js';
import { resetWater, simWater, buildWater, clearParts, resizeWater, WET, pours } from './water.js';
import { undoStack, boomQueue, hooks } from './fx.js';
import { resizeVision } from './vision.js';
import { ENVS, decor, charsGroup, propGroup, spriteMats, makeSprite, spriteMaterial, depthMat, spriteGeo, flatGeo, sharedSpriteMats, doorTex, mountGeo, tuftMat, objMats, addChar, addLight, restyle } from './chars.js';
import { vh, sizePedestal, buildTerrain, terrainMat } from './terrain.js';
import { CAM, applyEnv, fitDistance } from './camera.js';
const T3 = THREE;
const chars=G.chars, objs=G.objs, lights=G.lights, mounts=G.mounts,
      springs=G.springs, sinks=G.sinks, tufts=G.tufts, pcVis=G.pcVis, explored=G.explored;

/* =====================================================================
   ESTADO
   ===================================================================== */

/* ---------- manantiales y desagües que pone el director ---------- */
const markGroup=new T3.Group();
const markGeo=new T3.RingGeometry(.18,.3,20);markGeo.rotateX(-Math.PI/2);
const markMats={spring:new T3.MeshBasicMaterial({color:0x5fc6f2,transparent:true,opacity:.9,depthWrite:false}),
  sink:new T3.MeshBasicMaterial({color:0x1d2a3e,transparent:true,opacity:.85,depthWrite:false})};
export function initWorld(scene){scene.add(markGroup);}
export function updateMarks(){
  markGroup.children.slice().forEach(m=>markGroup.remove(m));
  const add=(cell,mat)=>{const m=new T3.Mesh(markGeo,mat);m.userData.cell=cell;m.renderOrder=7;markGroup.add(m);};
  springs.forEach(sp=>add(sp.cell,markMats.spring));
  sinks.filter(sk=>sk.user).forEach(sk=>add(sk.cell,markMats.sink));
}
export function placeMarks(t){
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
export function growWorld(pad,quiet){
  if(G.N+pad*2>MAXN){if(!quiet)R.toast('El tablero ya está en su tamaño máximo ('+MAXN+' × '+MAXN+').');return false;}
  const oN=G.N,re=i=>(Math.floor(i/oN)+pad)*(oN+pad*2)+(i%oN)+pad;
  const oH=G.H,oM=G.M,oW=G.W,oC=G.chan,oExp=new Map(explored),oEU=G.exploredUser;
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
  for(let i=0;i<oEU.length;i++)if(oEU[i])G.exploredUser[re(i)]=oEU[i];
  G.exploredDirty=true; // la niebla reproyectada tiene que llegar al servidor, si no el próximo reload la descarta
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
export function maybeGrow(i){if(G.autoGrow&&nearEdge(i,2)&&G.N+GROW_STEP*2<=MAXN)growWorld(GROW_STEP,false);}

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
export const SCENES={
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
  blank:{name:'Vacío',randomTrees:false,tufts:false,
    border:()=>({h:1,m:0}),
    build(){
      blank(1,0);
      return{springs:[],sinks:[],evap:.0012,edgeDrain:true,cut:false,cutH:3,mistBase:.9,env:'day',view:'gm',target:2.2,objs:[],mounts:[],randomTrees:false,tufts:false,lights:[],wallLights:[],chars:[]};
    }},
};

function clearGroup(g){g.children.slice().forEach(m=>{g.remove(m);m.geometry.dispose();});}
export function loadScene(key){
  G.sceneKey=key;
  G.OFF=0;if(G.N!==BASE_N)allocWorld(BASE_N);
  const cfg=SCENES[key].build();
  G.springs.length=0;G.springs.push(...cfg.springs);
  G.sinks.length=0;if(cfg.sinks)G.sinks.push(...cfg.sinks);
  G.evap=cfg.evap;G.edgeDrain=cfg.edgeDrain;G.cutOn=cfg.cut;G.cutH=cfg.cutH||3;
  CAM.target.set(0,cfg.target,0);CAM.targetT.copy(CAM.target);
  clearGroup(decor);clearGroup(charsGroup);clearGroup(propGroup);
  spriteMats.forEach(m=>m.dispose());spriteMats.clear();sharedSpriteMats();
  objs.clear();mounts.clear();G.tufts.length=0;lights.length=0;chars.length=0;clearParts();
  deferred.length=0;G.customArt={};refreshCustomArt(); // la escena de muestra no trae arte propio
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
export function applyView(){
  U.uFogOn.value=S.view==='gm'?0:1;
  G.visionDirty=true;
}

const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function loadTerrain(blob){
  if(G.N!==blob.n)allocWorld(blob.n);
  G.H=b64(blob.h);G.M=b64(blob.m);G.chan=b64(blob.chan);G.W=new Float32Array(G.CELLS);
  const X=blob.extras||{};
  G.sceneKey=SCENES[X.scene]?X.scene:'valle';G.OFF=X.off||0;
  G.springs.length=0;G.springs.push(...(X.springs||[]));G.sinks.length=0;G.sinks.push(...(X.sinks||[]));
  (X.pools||[]).forEach(p=>{if(p.cell<G.CELLS)G.W[p.cell]=p.level;});
  G.evap=X.evap??.0012;G.edgeDrain=X.edgeDrain!==false;G.cutOn=!!X.cutOn;G.cutH=X.cutH||3;
  if(X.style&&X.style!==ART.art.style)restyle(X.style);
  if(X.fogAlpha!=null)S.fogAlpha=X.fogAlpha;if(X.mist!=null)S.mist=X.mist;if(X.focus!=null)S.focus=X.focus;if(X.autoGrow!=null)G.autoGrow=X.autoGrow;
  CAM.target.set(0,2.2,0);CAM.targetT.copy(CAM.target);
  clearGroup(decor);clearGroup(charsGroup);clearGroup(propGroup);
  spriteMats.forEach(m=>m.dispose());spriteMats.clear();sharedSpriteMats();
  objs.clear();mounts.clear();G.tufts.length=0;lights.length=0;chars.length=0;clearParts();
  deferred.length=0;G.customArt=X.art||{};refreshCustomArt(); // antes de addObj: los objetos propios necesitan su material
  for(const [k,o] of Object.entries(X.objs||{})){const i=Number(k);if(!objKnown(o.kind)||i>=G.CELLS)continue;addObj(i,o.kind,o.rot);const w=objs.get(i);if(!w)continue;if(o.locked)w.locked=true;if(o.open&&OBJ_KINDS[o.kind].door){w.open=true;w.mesh.userData.tex.offset.x=.5;}}
  for(const o of Object.values(X.mounts||{})){if(objKnown(o.kind)&&o.wall<G.CELLS)addMount(o.wall,o.dir,o.kind);}
  const r=rng(2027);
  for(let i=0;i<G.CELLS;i++){if(G.M[i]!==0||G.chan[i]||objs.has(i))continue;if(r()<.45){const m=makeSprite({t:'tuft'},.42,.42,false,tuftMat);m.userData.cell=i;m.userData.ox=(r()-.5)*.6;m.userData.oz=(r()-.5)*.6;decor.add(m);tufts.push(m);}}
  explored.clear();pcVis.clear();undoStack.length=0;boomQueue.length=0;
  updateMarks();buildTerrain();
  resetWater();if(springs.length)for(let k=0;k<260;k++)simWater();
  G.Wprev.set(G.W);buildWater(1,0,0,false);relayout();
  G.selected=null;U.uMistBase.value=.9;
  G.terrainVersion=blob.version||0;
  G.lightsDirty=true;G.visionDirty=true;applyView();
}
export function applyTerrainOp(op,version){
  switch(op.type){
    case 'cells':for(const c of op.cells){if(c.i>=G.CELLS)continue;if(c.h!=null)G.H[c.i]=c.h;if(c.m!=null)G.M[c.i]=c.m;}terrainChanged();refreshTufts();break;
    case 'obj':{if(objs.has(op.i))removeObj(op.i);if(op.kind){addObj(op.i,op.kind,op.rot);const w=objs.get(op.i);if(w&&op.locked)w.locked=true;}refreshTufts();relayout();G.visionDirty=true;break;}
    case 'door':{const o=objs.get(op.i);if(!o||!OBJ_KINDS[o.kind].door)break;o.open=!!op.open;o.mesh.userData.tex.offset.x=o.open?.5:0;lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;G.visionDirty=true;break;}
    case 'mount':{if(mounts.has(op.key))removeMount(op.key);if(op.kind){const [w,d]=op.key.split(':').map(Number);addMount(w,d,op.kind);}relayout();break;}
    case 'water':G.springs.length=0;G.springs.push(...op.springs);G.sinks.length=0;G.sinks.push(...op.sinks);G.evap=op.evap;G.edgeDrain=op.edgeDrain;updateMarks();resetWater();break;
    case 'settings':if(op.style)restyle(op.style);if(op.fogAlpha!=null)S.fogAlpha=op.fogAlpha;if(op.mist!=null)S.mist=op.mist;if(op.focus!=null)S.focus=op.focus;if(op.autoGrow!=null)G.autoGrow=op.autoGrow;if(op.evap!=null)G.evap=op.evap;if(op.edgeDrain!=null)G.edgeDrain=op.edgeDrain;if(op.cutOn!=null||op.cutH!=null){if(op.cutOn!=null)G.cutOn=op.cutOn;if(op.cutH!=null)G.cutH=op.cutH;terrainChanged();}break;
    case 'grow':growWorld(op.pad,true);G.terrainVersion=version;return true;
    case 'art':{
      if(op.clear)G.customArt={};
      else if(op.remove)delete G.customArt[op.remove];
      else if(op.add){const a=Object.assign({},op.add);delete a.key;G.customArt[op.add.key]=a;}
      refreshCustomArt();break;
    }
  }
  G.terrainVersion=version;return true;
}

/* ---------- arte propio: extras.art → CUSTOM del motor → texturas y sprites ---------- */
// objetos y piezas de pared cuyo kind propio existe pero su imagen aún no ha llegado: se colocan al llegar
const deferred=[];
const isCustomId=k=>/^propio-/.test(k);
// un kind se conoce si es del catálogo o si el tablero define ese objeto propio (aunque su arte esté cargando)
const objKnown=k=>!!OBJ_KINDS[k]||(isCustomId(k)&&!!G.customArt['newobj:'+k]);
const objArtReady=k=>!!OBJ_KINDS[k]&&(!OBJ_KINDS[k].custom||!!CUSTOM.objs[k]);
let artTries=0,artTimer=0;
function dropChar(c){
  charsGroup.remove(c.mesh);c.mesh.geometry.dispose();spriteMats.delete(c.mesh.material);c.mesh.material.dispose();
  if(c.carried){lights.splice(lights.indexOf(c.carried),1);c.carried=null;}
  if(G.selected===c){G.selected=null;hooks.selected(null);}
  chars.splice(chars.indexOf(c),1);
}
export function refreshCustomArt(){
  const pending=setCustomArt(Object.entries(G.customArt).map(([key,v])=>Object.assign({key},v)),hooks.getImage||(()=>null));
  // lo que ya no tiene arte no puede seguir en escena: las fichas las vuelve a crear el shell (syncTokens)
  // con el arte por defecto; los objetos con imagen pendiente esperan en `deferred`
  chars.slice().forEach(c=>{if(!CHAR_INFO[c.kind])dropChar(c);});
  objs.forEach((o,i)=>{if(objArtReady(o.kind))return;if(objKnown(o.kind))deferred.push({i,kind:o.kind,rot:o.rot});removeObj(i);});
  mounts.forEach((o,key)=>{if(objArtReady(o.kind))return;if(objKnown(o.kind))deferred.push({wall:o.wall,dir:o.dir,kind:o.kind});removeMount(key);});
  if(ART.art){
    restyle(ART.art.style);
    terrainMat.map=ART.TEX.atlas;terrainMat.needsUpdate=true;
    // materiales compartidos de los kinds nuevos; fuera los de kinds que ya no existen
    Object.keys(objMats).forEach(k=>{if(!OBJ_KINDS[k]){objMats[k].dispose();spriteMats.delete(objMats[k]);delete objMats[k];}});
    Object.keys(OBJ_KINDS).forEach(k=>{if(!objMats[k]&&ART.TEX.objs[k])objMats[k]=spriteMaterial(ART.TEX.objs[k]);});
    deferred.splice(0).forEach(d=>{if(!objKnown(d.kind))return;if(!objArtReady(d.kind)){deferred.push(d);return;}if(d.wall!=null)addMount(d.wall,d.dir,d.kind);else addObj(d.i,d.kind,d.rot);});
    relayout();
  }
  G.lightsDirty=true;G.visionDirty=true;
  hooks.artChanged();
  clearTimeout(artTimer);
  if(pending&&++artTries<=20)artTimer=setTimeout(refreshCustomArt,400); // alguna imagen aún cargaba
  else{if(pending)R.toast('No se pudo cargar una imagen del arte propio');artTries=0;}
}

export const isDoor=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].door;
export const closedDoor=j=>isDoor(j)&&!objs.get(j).open;
export const blocksMove=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].move&&!(isDoor(j)&&objs.get(j).open);
export const blocksSight=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].sight&&!(isDoor(j)&&objs.get(j).open);
const higher=(j,i)=>G.H[j]>G.H[i]+1;
export function autoRot(i,kind){
  const x=cxOf(i),z=czOf(i),at=(dx,dz)=>inb(x+dx,z+dz)&&higher(I(x+dx,z+dz),i);
  if(OBJ_KINDS[kind].door){
    if(at(0,1)&&at(0,-1))return Math.PI/2;
    if(at(1,0)&&at(-1,0))return 0;
  }
  return Math.round(CAM.theta/(Math.PI/2))*(Math.PI/2);
}
export function canGrow(i){return G.autoGrow&&nearEdge(i,2)&&G.N+GROW_STEP*2<=MAXN;}
export function addObj(i,kind,rot){
  if(!objArtReady(kind)){if(objKnown(kind))deferred.push({i,kind,rot});return;}
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
export function removeObj(i){
  const o=objs.get(i);if(!o)return;decor.remove(o.mesh);o.mesh.geometry.dispose();
  if(OBJ_KINDS[o.kind].door){spriteMats.delete(o.mesh.material);o.mesh.material.dispose();}
  objs.delete(i);if(OBJ_KINDS[o.kind].door){lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;}
}
export function toggleDoor(i){
  const o=objs.get(i);o.open=!o.open;
  o.mesh.userData.tex.offset.x=o.open?.5:0;
  lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;G.visionDirty=true;
  R.toast(o.open?'Puerta abierta.':'Puerta cerrada.');
}
// piezas colgadas: clave muro:dirección; la dirección apunta del muro hacia el suelo
const mountKey=(wall,d)=>wall+':'+d;
export function mountValid(wall,d){
  const x=cxOf(wall)+DIRS[d][0],z=czOf(wall)+DIRS[d][1];
  return inb(x,z)&&G.H[wall]>G.H[I(x,z)];
}
export function addMount(wall,d,kind){
  if(!mountValid(wall,d))return false;
  if(!objArtReady(kind)){if(objKnown(kind))deferred.push({wall,dir:d,kind});return false;}
  const key=mountKey(wall,d);if(mounts.has(key))removeMount(key);
  const m=new T3.Mesh(mountGeo(kind),objMats[kind]);
  m.castShadow=false;m.customDepthMaterial=depthMat(ART.TEX.objs[kind]);
  m.rotation.set(0,Math.atan2(DIRS[d][0],DIRS[d][1]),0);
  m.userData={art:{t:'obj',k:kind},tex:ART.TEX.objs[kind],fixed:true,mount:key};
  decor.add(m);mounts.set(key,{kind,mesh:m,wall,dir:d});
  return true;
}
export function removeMount(key){const o=mounts.get(key);if(!o)return;decor.remove(o.mesh);o.mesh.geometry.dispose();mounts.delete(key);}
function placeOnWall(mesh,wall,d,up,h){
  const floor=I(cxOf(wall)+DIRS[d][0],czOf(wall)+DIRS[d][1]);
  const y=G.H[floor]+up;
  mesh.position.set(wx(cxOf(wall))+DIRS[d][0]*.515,y,wz(czOf(wall))+DIRS[d][1]*.515);
  mesh.visible=G.H[wall]>G.H[floor]&&y+h<=vh(wall)+.02;
}

export function relayout(){
  objs.forEach((o,i)=>{o.mesh.position.set(wx(cxOf(i)),G.H[i],wz(czOf(i)));o.mesh.visible=vh(i)===G.H[i];});
  mounts.forEach(o=>{const a=ART.art.objs[o.kind];placeOnWall(o.mesh,o.wall,o.dir,OBJ_KINDS[o.kind].my||.7,a.mh);});
  tufts.forEach(m=>{const i=m.userData.cell;m.position.set(wx(cxOf(i))+m.userData.ox,G.H[i],wz(czOf(i))+m.userData.oz);});
  lights.forEach(l=>{if(!l.mesh)return;
    if(l.mount){placeOnWall(l.mesh,l.mount.wall,l.mount.dir,.5,l.mh);return;}
    const i=l.cell;l.mesh.position.set(wx(cxOf(i)),vh(i),wz(czOf(i)));l.mesh.visible=vh(i)===G.H[i];});
  refreshTufts();
}
export function refreshTufts(){tufts.forEach(m=>{const i=m.userData.cell;m.visible=G.M[i]===0&&G.Wr[i]<WET&&!objs.has(i)&&!m.userData.burnt;});}
export function terrainChanged(){buildTerrain();relayout();lights.forEach(l=>{l.cache=null;});G.lightsDirty=true;}
