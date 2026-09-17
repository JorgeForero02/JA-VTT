/* Terreno del motor 2.5D: pedestal de madera y bloques instanciados por material.
   Los materiales (MATS) y sus casillas del atlas (slotOf) viven en art.js. */
import * as THREE from '../vendor/three.module.min.js';
import { G, R, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
import { mkCanvas, rng, pick, AC, MATS, slotOf, toTex } from './art.js';
import { patchMat } from './vision.js';
const T3 = THREE;

export const vh=i=>G.cutOn?Math.min(G.H[i],G.cutH):G.H[i];
const dummy=new T3.Object3D();
let scene=null,wood=null,pedestal=null,trim=null;

/* ---------- pedestal ---------- */
function woodCanvas(){
  const c=mkCanvas(32,32),x=c.getContext('2d'),r=rng(55);
  for(let p=0;p<4;p++){const base=pick(r,['#5a3a22','#4e321d','#63412a','#573821']);
    for(let yy=0;yy<32;yy++)for(let xx=0;xx<8;xx++){x.fillStyle=r()<.18?'#452b18':base;x.fillRect(p*8+xx,yy,1,1);}
    x.fillStyle='#2e1d10';x.fillRect(p*8+7,0,1,32);}
  return c;
}
export function sizePedestal(){
  const sun=R.sun;
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
export const terrainMat=patchMat(new T3.MeshLambertMaterial({map:null}),{grid:true}); // el atlas se asigna en start() (restyle) cuando ya cargó packs25.png
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
let topMeshes=[];
const fillMeshes={};
let terrainMeshes=[];
export function getTerrainMeshes(){return terrainMeshes;}

/* Crea pedestal y mallas instanciadas en la escena (una vez por motor) */
export function initTerrain(sc){
  scene=sc;
  wood=toTex(woodCanvas(),true,true);
  pedestal=new T3.Mesh(new T3.BoxGeometry(G.N+.8,1.3,G.N+.8),new T3.MeshLambertMaterial({map:wood}));
  pedestal.position.y=-.65;pedestal.receiveShadow=true;scene.add(pedestal);
  trim=new T3.Mesh(new T3.BoxGeometry(G.N+.95,.12,G.N+.95),new T3.MeshLambertMaterial({color:0xb08a3e}));
  trim.position.y=-1.24;scene.add(trim);
  {
    const c=mkCanvas(128,128),x=c.getContext('2d'),g=x.createRadialGradient(64,64,10,64,64,64);
    g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
    const blob=new T3.Mesh(new T3.PlaneGeometry(G.N*1.9,G.N*1.9),new T3.MeshBasicMaterial({map:new T3.CanvasTexture(c),transparent:true,depthWrite:false}));
    blob.rotation.x=-Math.PI/2;blob.position.y=-1.6;scene.add(blob);
    pedestal.userData.blob=blob;
  }
  topMeshes=MATS.map((m,mi)=>{const t=slotOf(mi,'top'),sd=slotOf(mi,'side'),fl=slotOf(mi,'fill');return instanced(atlasBox([sd,sd,t,fl,sd,sd]),terrainMat,1024);});
  MATS.forEach((m,mi)=>{const fl=slotOf(mi,'fill');fillMeshes[mi]=instanced(atlasBox([fl,fl,fl,fl,fl,fl]),terrainMat,1024);});
  terrainMeshes=topMeshes.concat(Object.values(fillMeshes));
}

export function buildTerrain(){
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
