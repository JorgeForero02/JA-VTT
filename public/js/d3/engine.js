/* Motor 2.5D de JA-VTT: port del diorama (three r128 → r170). Estado del mundo por celda,
   terreno instanciado, agua, luz por mapa, visión y niebla. No toca el DOM fuera de su canvas. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U, MAXH, MAXN, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
const T3 = THREE;
import { mkCanvas, rng, pick, AC, PROP_KINDS, CHAR_INFO, OBJ_KINDS, MATS, slotOf, loadPacks, loadStyle, toTex, disposeTex, ART } from './art.js';
// Colores como en r128: sin conversión sRGB→lineal al asignar, sin codificar a la salida.
THREE.ColorManagement.enabled=false;
export function createEngine(stage,opts) {
  R.toast = opts && opts.toast ? opts.toast : () => {};
  R.stage = stage;
  const chars=G.chars, objs=G.objs, lights=G.lights, mounts=G.mounts,
        springs=G.springs, sinks=G.sinks, tufts=G.tufts, pcVis=G.pcVis, explored=G.explored;
  // el diorama avisaba en su HUD; aquí usa el toast de JA-VTT

/* =====================================================================
   MOTOR
   ===================================================================== */
const canvas=document.createElement('canvas');canvas.className='d3';stage.appendChild(canvas);R.canvas=canvas;
const renderer=new T3.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});R.renderer=renderer;
// r128 no codificaba a sRGB en la salida: se conserva ese aspecto
renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
const isMobile=window.matchMedia('(pointer: coarse)').matches;
const VIEW_R=30;
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
function dataTex(d){const t=new T3.DataTexture(d,G.N,G.N,T3.RGBAFormat);t.magFilter=T3.LinearFilter;t.minFilter=T3.LinearFilter;t.needsUpdate=true;return t;}
G.visData=new Uint8Array(G.CELLS*4);G.lightData=new Uint8Array(G.CELLS*4);
G.visTex=dataTex(G.visData);G.lightTex=dataTex(G.lightData);
U.uVis.value=G.visTex;U.uLight.value=G.lightTex;U.uDark.value=new T3.Color('#0E1316');U.uMistCol.value=new T3.Color('#dfe8ee');
const MIST_NOISE=`
float mh(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float mvn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mh(i),mh(i+vec2(1.0,0.0)),f.x),mix(mh(i+vec2(0.0,1.0)),mh(i+vec2(1.0,1.0)),f.x),f.y);}
`;
const FOG_FRAG=`
{
  vec2 fuv=(vFogXZ+vec2(uHalf))/(2.0*uHalf);
  vec4 Lt=texture2D(uLight,fuv);
  // luz de antorchas: suave, sin quemar el color
  #ifdef FOG_ORIGIN
  vec3 lit=Lt.rgb*1.7*uGain;
  #else
  vec3 lit=Lt.rgb*2.4*uGain;
  #endif
  lit=lit/(1.0+lit*0.3);
  gl_FragColor.rgb+=diffuseColor.rgb*(lit+vec3(uFloor));
  // oscuridad mágica: velo oscuro translúcido, deja intuir el fondo
  gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*0.32+vec3(0.045,0.02,0.08),Lt.a*0.8);
  #ifdef FOG_GRID
  if(uGrid>0.5&&vUp>0.5){
    vec2 gd=abs(fract(vFogXZ+0.5)-0.5);
    float gline=1.0-smoothstep(0.012,0.035,min(gd.x,gd.y));
    gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*0.5,gline*0.85);
  }
  #endif
  float hidden=0.0;
  if(uFogOn>0.5){
    vec4 V=texture2D(uVis,fuv);
    float lum=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));
    vec3 dvc=vec3(lum)*vec3(0.58,0.63,0.7);
    vec3 nowc=mix(gl_FragColor.rgb,max(gl_FragColor.rgb*0.35,dvc),V.b);
    // lo que no se ve: color plano (sin sombras ni luces), frío y apagado, para no confundirlo con una sombra
    vec3 fcol=mix(vec3(lum),diffuseColor.rgb,0.45)*uAmbFlat;
    vec3 tint=mix(fcol,fcol*vec3(0.78,0.86,1.0),0.6);
    vec3 mem=mix(tint,uDark,uFogAlpha*0.5);
    vec3 hid=mix(tint,uDark,uFogAlpha);
    gl_FragColor.rgb=mix(mix(hid,mem,V.g),nowc,V.r);
    hidden=(1.0-V.r)*(1.0-0.5*V.g);
  }
  // niebla ambiental: se pega al suelo, se mueve despacio y recoge la luz de las antorchas
  if(uMist>0.001){
    vec2 mp=vFogXZ*0.55+vec2(uMistT*0.05,uMistT*0.03);
    float nz=mvn(mp)*0.6+mvn(mp*2.3+vec2(uMistT*-0.04,5.1))*0.4;
    float hgt=1.0-smoothstep(uMistBase,uMistBase+uMistTop*(0.7+nz*0.6),vFogY);
    float m=clamp(hgt*uMist*(0.45+0.75*nz),0.0,0.82);
    vec3 mc=uMistCol+Lt.rgb*uGain*0.45;
    mc*=1.0-hidden*uFogAlpha*0.75;
    gl_FragColor.rgb=mix(gl_FragColor.rgb,mc,m);
  }
}
`;
function patchMat(mat,opt){
  mat.defines=Object.assign({},mat.defines||{});
  if(opt.origin)mat.defines.FOG_ORIGIN='';
  if(opt.grid)mat.defines.FOG_GRID='';
  mat.onBeforeCompile=function(sh){
    Object.assign(sh.uniforms,U);
    sh.vertexShader='varying vec2 vFogXZ;\nvarying float vUp;\nvarying float vFogY;\n'+sh.vertexShader.replace('#include <project_vertex>',
`#include <project_vertex>
  vec4 fwp=vec4(transformed,1.0);
  #ifdef USE_INSTANCING
    fwp=instanceMatrix*fwp;
  #endif
  fwp=modelMatrix*fwp;
  vFogY=fwp.y;
#ifdef FOG_ORIGIN
  vFogXZ=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xz;vUp=0.0;
#else
  vFogXZ=fwp.xz+objectNormal.xz*0.45;vUp=objectNormal.y;
#endif`);
    let fs=sh.fragmentShader;
    // sombras del sol más suaves. onBeforeCompile recibe la plantilla sin expandir (sólo #include), así que
    // se parchea el chunk lights_fragment_begin (donde r170 sombrea por luz) y se inserta ya expandido.
    const lfb=T3.ShaderChunk.lights_fragment_begin.replace(/getShadow\( directionalShadowMap\[ i \][^;]*\) : 1\.0;/,m=>'mix(1.0,'+m.slice(0,-7)+',uShadow) : 1.0;');
    fs=fs.replace('#include <lights_fragment_begin>',lfb);
    sh.fragmentShader='varying vec2 vFogXZ;\nvarying float vUp;\nvarying float vFogY;\nuniform sampler2D uVis;\nuniform sampler2D uLight;\nuniform float uHalf;\nuniform float uGain;\nuniform float uFloor;\nuniform float uFogOn;\nuniform float uGrid;\nuniform float uFogAlpha;\nuniform vec3 uDark;\nuniform float uShadow;\nuniform float uAmbFlat;\nuniform float uMist;\nuniform vec3 uMistCol;\nuniform float uMistBase;\nuniform float uMistTop;\nuniform float uMistT;\n'
      +MIST_NOISE+fs.replace('#include <fog_fragment>',FOG_FRAG+'\n#include <fog_fragment>');
  };
  return mat;
}


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

/* =====================================================================
   AGUA: tuberías virtuales (con inercia) + superficie continua + cascadas
   ===================================================================== */
const WU={uTime:{value:0},uPix:{value:16}};
const WATER_NOISE=`
float wh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float wvn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(wh(i),wh(i+vec2(1.0,0.0)),f.x),mix(wh(i+vec2(0.0,1.0)),wh(i+vec2(1.0,1.0)),f.x),f.y);}
float wfbm(vec2 p){return wvn(p)*0.55+wvn(p*2.03+7.1)*0.3+wvn(p*4.1+13.7)*0.15;}
`;
const WATER_COLOR=`
vec3 wcol;float walpha;float wn;
vec2 wp=vWPos.xz;
if(uPix>0.5)wp=(floor(wp*uPix)+0.5)/uPix;
if(vInfo.z<0.5){
  // superficie: dos capas de ruido que avanzan con la corriente y se relevan
  float ph=fract(uTime*0.35);
  vec2 fl=clamp(vFlow,-2.0,2.0);
  float n1=wfbm(wp*2.2-fl*ph*1.6+uTime*0.03);
  float n2=wfbm(wp*2.2-fl*fract(ph+0.5)*1.6+vec2(3.7,1.3)-uTime*0.03);
  wn=mix(n1,n2,abs(ph*2.0-1.0));
  float dep=clamp(vInfo.x/1.4,0.0,1.0);
  wcol=mix(vec3(0.44,0.80,0.88),vec3(0.08,0.29,0.50),dep);
  wcol+=(wn-0.5)*0.16;
  wcol+=smoothstep(0.64,0.8,wn)*0.16;
  float fo=clamp(vInfo.y,0.0,1.0);
  float fm=smoothstep(0.74-fo*0.3,0.78-fo*0.3,wn)*smoothstep(0.03,0.3,fo);
  wcol=mix(wcol,vec3(0.94,0.98,1.0),fm);
  walpha=max(mix(0.58,0.9,dep),fm*0.95);
}else{
  // cortina de cascada: vetas que caen, espuma arriba y abajo
  vec2 q=vec2(vWUv.x*6.0,vWPos.y*1.2+uTime*3.4);
  if(uPix>0.5){vec2 qs=vec2(2.67,6.0)*uPix/16.0;q=floor(q*qs)/qs;}
  wn=wvn(vec2(q.x,q.y*0.45))*0.6+wvn(q*vec2(1.0,1.7)+5.0)*0.4;
  wcol=mix(vec3(0.46,0.76,0.9),vec3(0.96,0.99,1.0),smoothstep(0.42,0.78,wn));
  float lip=smoothstep(0.14,0.0,vWUv.y)*0.6+smoothstep(0.72,1.0,vWUv.y);
  wcol=mix(wcol,vec3(0.97,0.99,1.0),clamp(lip,0.0,1.0)*0.85);
  walpha=(0.42+0.5*smoothstep(0.3,0.75,wn)+lip*0.3)*clamp(vInfo.x,0.0,1.0);
}
vec4 diffuseColor=vec4(wcol,walpha*opacity);
`;
const WATER_NORMAL=`
if(vInfo.z<0.5){
  vec2 gp=vWPos.xz*3.0+uTime*vec2(0.21,0.17)-vFlow*uTime*0.4;
  float e=0.09,a0=wvn(gp),ax=wvn(gp+vec2(e,0.0)),az=wvn(gp+vec2(0.0,e));
  normal=normalize(normal+vec3(a0-ax,0.0,a0-az)/e*0.1);
}
`;
function waterPatch(mat){
  patchMat(mat,{});
  const base=mat.onBeforeCompile;
  mat.onBeforeCompile=function(sh){
    base(sh);
    sh.uniforms.uTime=WU.uTime;sh.uniforms.uPix=WU.uPix;
    sh.vertexShader='attribute vec2 aFlow;\nattribute vec3 aInfo;\nattribute vec2 aUv;\nvarying vec2 vFlow;\nvarying vec3 vInfo;\nvarying vec2 vWUv;\nvarying vec3 vWPos;\nuniform float uTime;\n'
      +sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.y+=(sin(transformed.x*3.1+uTime*1.7)+sin(transformed.z*2.7-uTime*1.3))*0.012*(1.0-aInfo.z);\n  vFlow=aFlow;vInfo=aInfo;vWUv=aUv;vWPos=transformed;');
    sh.fragmentShader='varying vec2 vFlow;\nvarying vec3 vInfo;\nvarying vec2 vWUv;\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uPix;\n'+WATER_NOISE
      +sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',WATER_COLOR)
        .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+WATER_NORMAL);
  };
  return mat;
}
let SURF_Q=G.CELLS;const CURT_Q=2400;
function waterGeo(q){
  const g=new T3.BufferGeometry(),v=q*6;
  const at=(n,s)=>{const a=new T3.BufferAttribute(new Float32Array(v*s),s);a.setUsage(T3.DynamicDrawUsage);g.setAttribute(n,a);};
  at('position',3);at('normal',3);at('aFlow',2);at('aInfo',3);at('aUv',2);
  g.setDrawRange(0,0);g.boundingSphere=new T3.Sphere(new T3.Vector3(0,2,0),40);
  return g;
}
let surfGeo=waterGeo(SURF_Q);const curtGeo=waterGeo(CURT_Q);
const waterMat=waterPatch(new T3.MeshPhongMaterial({color:0xffffff,transparent:true,shininess:110,specular:0xcfeeff,emissive:0x3a6f86,emissiveIntensity:.3}));
const curtMat=waterPatch(new T3.MeshPhongMaterial({color:0xffffff,transparent:true,shininess:50,specular:0xcfeeff,side:T3.DoubleSide,depthWrite:false,emissive:0x9cc9dd,emissiveIntensity:.3}));
const waterMesh=new T3.Mesh(surfGeo,waterMat);
waterMesh.frustumCulled=false;waterMesh.receiveShadow=true;waterMesh.renderOrder=1;waterMesh.userData.quadCell=new Int32Array(SURF_Q);
const curtMesh=new T3.Mesh(curtGeo,curtMat);
curtMesh.frustumCulled=false;curtMesh.renderOrder=2;
scene.add(waterMesh);scene.add(curtMesh);

/* ---------- partículas ---------- */
const PMAX=600,pPos=new Float32Array(PMAX*3),parts=[];
const pGeo=new T3.BufferGeometry();pGeo.setAttribute('position',new T3.BufferAttribute(pPos,3));pGeo.setDrawRange(0,0);
const pts=new T3.Points(pGeo,new T3.PointsMaterial({color:0xeaf7ff,size:.09,transparent:true,opacity:.9,depthWrite:false}));
pts.frustumCulled=false;scene.add(pts);
const FF=26,ffPos=new Float32Array(FF*3),ffSeed=[];
const ffGeo=new T3.BufferGeometry();ffGeo.setAttribute('position',new T3.BufferAttribute(ffPos,3));
const ffMat=new T3.PointsMaterial({color:0xfff09a,size:.16,transparent:true,opacity:0,depthWrite:false,blending:T3.AdditiveBlending});
const ff=new T3.Points(ffGeo,ffMat);ff.frustumCulled=false;scene.add(ff);
{const r=rng(5);for(let k=0;k<FF;k++)ffSeed.push({x:wx(9+r()*11),z:wz(8+r()*12),y:2.4+r()*1.6,p:r()*6.28,s:.5+r()});}

/* ---------- bancos de niebla que flotan ---------- */
function mistCanvas(){
  const c=mkCanvas(128,128),x=c.getContext('2d'),r=rng(9);
  for(let k=0;k<30;k++){const px=22+r()*84,py=40+r()*48,rad=14+r()*30;
    const g=x.createRadialGradient(px,py,0,px,py,rad);g.addColorStop(0,'rgba(255,255,255,.2)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,128,128);}
  return c;
}
const mistTex=new T3.CanvasTexture(mistCanvas());
const mistGroup=new T3.Group();scene.add(mistGroup);
{
  const r=rng(31),n=isMobile?7:12;
  for(let k=0;k<n;k++){
    const sp=new T3.Sprite(new T3.SpriteMaterial({map:mistTex,transparent:true,depthWrite:false,opacity:0}));
    const w=6+r()*5;sp.scale.set(w,w*.36,1);
    sp.userData={x:(r()-.5)*G.N,z:(r()-.5)*G.N,v:.25+r()*.35,ph:r()*6};
    mistGroup.add(sp);
  }
}
function updateMist(dt,t){
  U.uMist.value+=(S.mist-U.uMist.value)*Math.min(1,dt*3);U.uMistT.value=t;
  const op=U.uMist.value*(S.view==='gm'?.5:.3);
  mistGroup.visible=op>.01;
  mistGroup.children.forEach(m=>{
    const d=m.userData;d.x+=d.v*dt;if(d.x>G.N/2+4)d.x=-G.N/2-4;
    m.position.set(d.x,U.uMistBase.value+.35+Math.sin(t*.4+d.ph)*.15,d.z);
    m.material.opacity=op*(.7+.3*Math.sin(t*.3+d.ph));m.material.color.copy(U.uMistCol.value);
  });
}

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

/* ---------- sprites ---------- */
const decor=new T3.Group(),charsGroup=new T3.Group(),propGroup=new T3.Group();
scene.add(decor);scene.add(charsGroup);scene.add(propGroup);
const spriteMats=new Set();
function spriteMaterial(tex,tint){
  const m=new T3.MeshLambertMaterial({map:tex,alphaTest:.5,side:T3.DoubleSide,emissive:tint||0xffffff,emissiveMap:tex,emissiveIntensity:envCur.em});
  if(tint)m.color.set(tint);
  patchMat(m,{origin:true});spriteMats.add(m);return m;
}
function depthMat(tex){return new T3.MeshDepthMaterial({depthPacking:T3.RGBADepthPacking,map:tex,alphaTest:.5,side:T3.DoubleSide});}
function spriteGeo(w,h){const g=new T3.PlaneGeometry(w,h);g.translate(0,h/2,0);return g;}
function texFor(a){
  if(a.t==='char'){const ca=ART.art.chars[a.k],t=ART.TEX.chars[a.k].clone();t.needsUpdate=true;t.repeat.set(1/ca.n,1);return t;}
  if(a.t==='obj')return ART.TEX.objs[a.k];
  if(a.t==='tuft')return ART.TEX.tuft;
  return ART.TEX.props[a.k];
}
function makeSprite(a,w,h,shadow,sharedMat,tint){
  const tex=texFor(a);
  const mat=sharedMat||spriteMaterial(tex,tint);
  const mesh=new T3.Mesh(spriteGeo(w,h),mat);
  mesh.rotation.order='YXZ';mesh.castShadow=!!shadow;
  mesh.customDepthMaterial=depthMat(tex);
  mesh.userData.art=a;mesh.userData.tex=tex;
  return mesh;
}
function flatGeo(w,h){const g=new T3.PlaneGeometry(w,h);g.rotateX(-Math.PI/2);g.translate(0,.03,0);return g;}
let tuftMat=null,objMats={};
function sharedSpriteMats(){
  tuftMat=spriteMaterial(ART.TEX.tuft);
  objMats={};Object.keys(OBJ_KINDS).forEach(k=>{objMats[k]=spriteMaterial(ART.TEX.objs[k]);});
}
function restyle(key){
  loadStyle(key);
  terrainMat.map=ART.TEX.atlas;terrainMat.needsUpdate=true;
  WU.uPix.value=ART.art.res;
  const done=new Set();
  [decor,charsGroup,propGroup].forEach(g=>g.children.forEach(mesh=>{
    const a=mesh.userData.art;
    const tex=a.t==='obj'&&OBJ_KINDS[a.k].door?doorTex(objs.get(mesh.userData.cell)):texFor(a);
    mesh.userData.tex=tex;
    if(!done.has(mesh.material)){mesh.material.map=tex;mesh.material.emissiveMap=tex;mesh.material.needsUpdate=true;done.add(mesh.material);}
    mesh.customDepthMaterial.map=tex;mesh.customDepthMaterial.needsUpdate=true;
    let dims=null;
    if(a.t==='char'){const c=mesh.userData.char;c.tex=tex;c.art=ART.art.chars[a.k];dims=c.art;c.fi=0;setFrame(c);}
    else if(a.t==='obj')dims=ART.art.objs[a.k];
    if(mesh.userData.mount){mesh.geometry.dispose();mesh.geometry=mountGeo(a.k);}
    else if(dims){mesh.geometry.dispose();mesh.geometry=(a.t==='obj'&&OBJ_KINDS[a.k].flat)?flatGeo(dims.w,dims.h):spriteGeo(dims.w,dims.h);}
  }));
  Object.entries(objMats).forEach(([k,m])=>{const t=ART.TEX.objs[k];if(t){m.map=t;m.emissiveMap=t;m.needsUpdate=true;}});
  if(tuftMat){tuftMat.map=ART.TEX.tuft;tuftMat.emissiveMap=ART.TEX.tuft;tuftMat.needsUpdate=true;}
  relayout();
}

/* =====================================================================
   CATÁLOGOS (de JA-VTT)
   ===================================================================== */
const LIGHT_PRESETS={
  candle:{name:'Vela',bright:5,dim:5,color:'#FFC878',intensity:.9,anim:'flicker',sprite:'torch',lh:.9,scale:.7},
  torch:{name:'Antorcha',bright:20,dim:20,color:'#FFA652',intensity:1,anim:'flicker',sprite:'torch',lh:1.3,scale:1},
  lantern:{name:'Farol',bright:30,dim:30,color:'#FFD28F',intensity:1,anim:'soft',sprite:'torch',lh:1.3,scale:1},
  campfire:{name:'Hoguera',bright:20,dim:20,color:'#FF8F3F',intensity:1,anim:'flicker',sprite:'brazier',lh:1,scale:1.1},
  brazier:{name:'Brasero',bright:10,dim:15,color:'#FF7A35',intensity:.95,anim:'flicker',sprite:'brazier',lh:1.1,scale:1},
  magic:{name:'Luz mágica',bright:20,dim:20,color:'#DDE8FF',intensity:1,anim:'none',sprite:'orb',lh:1.5,scale:.9},
  crystal:{name:'Cristal arcano',bright:10,dim:20,color:'#A98BFF',intensity:.9,anim:'pulse',sprite:'crystal',lh:1,scale:1},
  moon:{name:'Rayo de luna',bright:5,dim:15,color:'#9DBBFF',intensity:.8,anim:'none',sprite:'orb',lh:2,scale:.7},
  daylight:{name:'Luz diurna',bright:60,dim:60,color:'#FFF1D0',intensity:1,anim:'none',sprite:'orb',lh:2.4,scale:.8},
  darkness:{name:'Oscuridad mágica',bright:15,dim:0,color:'#000000',intensity:1,anim:'none',darkness:true,sprite:'orb',lh:1.2,scale:1.1,tint:'#3a2a55'},
};
const ENVS={
  interior:{name:'Interior',desc:'Oscuro. Solo ven las luces y la visión en la oscuridad.',ambient:0,dark:'#0B0E11',fogA:.82,
    sun:'#000000',si:0,sp:[-8,20,10],sky:'#5a6478',gnd:'#141414',hi:.07,top:'#0b0e11',bot:'#1c222a',em:.05,gain:1.05,fly:0,flat:.15,mist:.25,mistCol:'#3a3530'},
  day:{name:'Exterior de día',desc:'Todo lo que esté a la vista se ve.',ambient:1,dark:'#0E1316',fogA:.3,
    sun:'#fff0d8',si:1,sp:[-8,20,10],sky:'#cfe6ff',gnd:'#7a6a48',hi:.55,top:'#7fb6dd',bot:'#f3dfb5',em:.3,gain:.14,fly:0,flat:.8,mist:.12,mistCol:'#e8eef2'},
  dusk:{name:'Atardecer',desc:'Se ve a la vista, en penumbra.',ambient:.55,dark:'#1A1220',fogA:.5,
    sun:'#ff9a52',si:.9,sp:[-18,7,4],sky:'#8a78b8',gnd:'#5a3a3a',hi:.4,top:'#3e3a6b',bot:'#f0935a',em:.22,gain:.6,fly:.35,flat:.5,mist:.35,mistCol:'#e6b89a'},
  night:{name:'Noche',desc:'Luna tenue: se intuye el terreno; las criaturas, solo con luz.',ambient:.18,dark:'#081026',fogA:.7,
    sun:'#8aa6ff',si:.34,sp:[10,16,-6],sky:'#3a4a86',gnd:'#1a1a2a',hi:.24,top:'#070b1e',bot:'#27335f',em:.1,gain:1.05,fly:1,flat:.28,mist:.45,mistCol:'#4c5a86'},
};

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
  G.visData=new Uint8Array(G.CELLS*4);G.lightData=new Uint8Array(G.CELLS*4);
  const ov=G.visTex,ol=G.lightTex;
  G.visTex=dataTex(G.visData);G.lightTex=dataTex(G.lightData);ov.dispose();ol.dispose();
  U.uVis.value=G.visTex;U.uLight.value=G.lightTex;U.uHalf.value=G.N/2;
  G.FLX=new Float32Array(G.CELLS*4);G.Wprev=new Float32Array(G.CELLS);G.Wr=new Float32Array(G.CELLS);
  G.VX=new Float32Array(G.CELLS);G.VZ=new Float32Array(G.CELLS);G.FOAM=new Float32Array(G.CELLS);G.foamT=new Float32Array(G.CELLS);
  G.illum=new Float32Array(G.CELLS);G.darkMask=new Uint8Array(G.CELLS);G.lightAcc=new Float32Array(G.CELLS*3);
  G.tVis=new Float32Array(G.CELLS);G.tMem=new Float32Array(G.CELLS);G.tDv=new Float32Array(G.CELLS);
  G.cVis=new Float32Array(G.CELLS);G.cMem=new Float32Array(G.CELLS);G.cDv=new Float32Array(G.CELLS);G.strongView=new Uint8Array(G.CELLS);
  SURF_Q=G.CELLS;
  const og=surfGeo;surfGeo=waterGeo(SURF_Q);waterMesh.geometry=surfGeo;og.dispose();
  surfGeo.boundingSphere.radius=G.N*1.2;curtGeo.boundingSphere.radius=G.N*1.2;
  waterMesh.userData.quadCell=new Int32Array(SURF_Q);
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
  objs.clear();mounts.clear();G.tufts.length=0;lights.length=0;chars.length=0;parts.length=0;
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
const blocksSight=j=>objs.has(j)&&OBJ_KINDS[objs.get(j).kind].sight&&!(isDoor(j)&&objs.get(j).open);
const higher=(j,i)=>G.H[j]>G.H[i]+1;
function autoRot(i,kind){
  const x=cxOf(i),z=czOf(i),at=(dx,dz)=>inb(x+dx,z+dz)&&higher(I(x+dx,z+dz),i);
  if(OBJ_KINDS[kind].door){
    if(at(0,1)&&at(0,-1))return Math.PI/2;
    if(at(1,0)&&at(-1,0))return 0;
  }
  return Math.round(theta/(Math.PI/2))*(Math.PI/2);
}
function doorTex(o){const t=ART.TEX.objs.puerta.clone();t.needsUpdate=true;t.repeat.set(.5,1);t.offset.x=o&&o.open?.5:0;return t;}
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
function mountGeo(kind){const a=ART.art.objs[kind];return spriteGeo(a.mw,a.mh);}
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
function addChar(s){
  const ca=ART.art.chars[s.kind];
  const a={t:'char',k:s.kind};
  const mesh=makeSprite(a,ca.w,ca.h,true);
  const info=CHAR_INFO[s.kind];
  const c={id:s.kind+'-'+(chars.length+1),kind:s.kind,name:s.name||info.name,pc:s.pc,dv:s.dv,sight:s.sight||0,hidden:!!s.hidden,
    cell:I(s.at[0],s.at[1]),mesh,tex:mesh.userData.tex,art:ca,path:[],seg:null,ft:Math.random()*.1,fi:0,dir:1,carried:null,
    seed:Math.random()*6,float:info.float||0,gy:G.H[I(s.at[0],s.at[1])]};
  mesh.userData.char=c;charsGroup.add(mesh);chars.push(c);
  setCarried(c,s.light);setFrame(c);
}
function setFrame(c){const list=c.seg?c.art.run:c.art.idle;c.tex.offset.x=list[c.fi%list.length]/c.art.n;}
function setCarried(c,preset){
  if(c.carried){lights.splice(lights.indexOf(c.carried),1);c.carried=null;}
  if(preset&&preset!=='none'){const l={id:G.lightId++,preset,cell:c.cell,on:true,carrier:c,mesh:null,cache:null,seed:Math.random()*6};lights.push(l);c.carried=l;}
  G.lightsDirty=true;
}
function addLight(preset,cell,mount){
  const P=LIGHT_PRESETS[preset],sc=P.scale*(mount?.78:1);
  const mesh=makeSprite({t:'prop',k:P.sprite},.55*sc,1.1*sc,true,null,P.sprite==='orb'?(P.tint||P.color):null);
  const l={id:G.lightId++,preset,cell,on:true,carrier:null,mesh,cache:null,seed:Math.random()*6,mount:mount||null};
  if(mount){mesh.userData.fixed=true;mesh.rotation.set(0,Math.atan2(DIRS[mount.dir][0],DIRS[mount.dir][1]),0);mesh.castShadow=false;l.mh=1.1*sc;}
  mesh.userData.light=l;propGroup.add(mesh);lights.push(l);
  G.lightsDirty=true;relayout();
  return l;
}
function removeLight(l){
  const k=lights.indexOf(l);if(k<0)return;lights.splice(k,1);
  if(l.mesh){propGroup.remove(l.mesh);l.mesh.geometry.dispose();spriteMats.delete(l.mesh.material);l.mesh.material.dispose();}
  G.lightsDirty=true;
}
const vh=i=>G.cutOn?Math.min(G.H[i],G.cutH):G.H[i];
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
   AGUA DINÁMICA
   Modelo de "tuberías virtuales": cada casilla guarda cuánto fluye hacia
   cada vecina y ese caudal tiene inercia, así el agua acelera, hace olas
   y se asienta sola. Se simula a 80 Hz y se dibuja interpolado.
   ===================================================================== */
const GRAV=9.8,DAMP=.993,SUB=4,TICK=.05,DROP=.35,WET=.02;
const pours=[];
function resetWater(){G.FLX.fill(0);G.Wprev.set(G.W);G.VX.fill(0);G.VZ.fill(0);G.FOAM.fill(0);pours.length=0;}
function waterBox(){
  let x0=G.N,z0=G.N,x1=-1,z1=-1;
  for(let i=0;i<G.CELLS;i++){if(G.W[i]>0||G.FLX[i*4]>0){const x=i%G.N,z=(i/G.N)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(z<z0)z0=z;if(z>z1)z1=z;}}
  for(const sp of springs){const x=cxOf(sp.cell),z=czOf(sp.cell);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  for(const pr of pours){const x=cxOf(pr.cell),z=czOf(pr.cell);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  G.WB=x1<0?[0,-1,0,-1]:[Math.max(0,x0-2),Math.min(G.N-1,x1+2),Math.max(0,z0-2),Math.min(G.N-1,z1+2)];
}
function simWater(){
  G.Wprev.set(G.W);
  waterBox();
  // agua vertida: cae durante un momento y se reparte un poco alrededor
  for(let k=pours.length-1;k>=0;k--){
    const pr=pours[k],a=Math.min(pr.left,.16),x=cxOf(pr.cell),z=czOf(pr.cell);
    G.W[pr.cell]+=a*.52;
    for(const [dx,dz] of DIRS){const nx=x+dx,nz=z+dz;G.W[inb(nx,nz)?I(nx,nz):pr.cell]+=a*.12;}
    pr.left-=a;if(pr.left<=1e-4)pours.splice(k,1);
  }
  const dt=TICK/SUB;
  for(let st=0;st<SUB;st++){
    for(const sp of springs)if(!sp.cap||G.W[sp.cell]<sp.cap)G.W[sp.cell]+=sp.rate/SUB;
    for(let bz=G.WB[2];bz<=G.WB[3];bz++)for(let bx=G.WB[0];bx<=G.WB[1];bx++){
      const i=bz*G.N+bx,w=G.W[i],o=i*4;
      if(w<=1e-4){G.FLX[o]=G.FLX[o+1]=G.FLX[o+2]=G.FLX[o+3]=0;continue;}
      const x=i%G.N,z=(i/G.N)|0,si=G.H[i]+w;let sum=0;
      for(let d=0;d<4;d++){
        const nx=x+DIRS[d][0],nz=z+DIRS[d][1];
        let dh;
        if(nx<0||nz<0||nx>=G.N||nz>=G.N)dh=G.edgeDrain?w*.9:-1;
        else{const j=nz*G.N+nx;dh=si-(G.H[j]+G.W[j]);}
        let f=G.FLX[o+d]*DAMP+dt*GRAV*dh;
        if(f<0)f=0;
        G.FLX[o+d]=f;sum+=f;
      }
      if(sum>0){const k=w/(sum*dt);if(k<1){G.FLX[o]*=k;G.FLX[o+1]*=k;G.FLX[o+2]*=k;G.FLX[o+3]*=k;}}
    }
    for(let bz=G.WB[2];bz<=G.WB[3];bz++)for(let bx=G.WB[0];bx<=G.WB[1];bx++){
      const i=bz*G.N+bx,x=bx,z=bz,o=i*4;
      let inn=0;
      if(x>0)inn+=G.FLX[(i-1)*4];
      if(x<G.N-1)inn+=G.FLX[(i+1)*4+1];
      if(z>0)inn+=G.FLX[(i-G.N)*4+2];
      if(z<G.N-1)inn+=G.FLX[(i+G.N)*4+3];
      const w=G.W[i]+dt*(inn-(G.FLX[o]+G.FLX[o+1]+G.FLX[o+2]+G.FLX[o+3]));
      G.W[i]=w>0?w:0;
    }
  }
  // el lago desagua lo que sobra por encima de su nivel: así nunca se desborda
  for(const sk of sinks){const ex=G.H[sk.cell]+G.W[sk.cell]-sk.level;if(ex>0)G.W[sk.cell]-=Math.min(G.W[sk.cell],ex*.5);}
  G.foamT.fill(0);
  for(let bz=G.WB[2];bz<=G.WB[3];bz++)for(let bx=G.WB[0];bx<=G.WB[1];bx++){
    const i=bz*G.N+bx;let w=G.W[i];
    if(w>0){w-=G.evap;if(w<WET)w-=.003;G.W[i]=w>0?w:0;}
    const x=i%G.N,z=(i/G.N)|0,o=i*4,d=Math.max(G.W[i],.08);
    G.VX[i]=((x>0?G.FLX[(i-1)*4]:0)-G.FLX[o+1]+G.FLX[o]-(x<G.N-1?G.FLX[(i+1)*4+1]:0))*.5/d;
    G.VZ[i]=((z>0?G.FLX[(i-G.N)*4+2]:0)-G.FLX[o+3]+G.FLX[o+2]-(z<G.N-1?G.FLX[(i+G.N)*4+3]:0))*.5/d;
    if(G.W[i]<WET)continue;
    G.foamT[i]+=Math.min(.45,Math.max(0,Math.hypot(G.VX[i],G.VZ[i])-1.2)*.1);
    const si=G.H[i]+G.W[i];
    for(let k=0;k<4;k++){
      const nx=x+DIRS[k][0],nz=z+DIRS[k][1];if(nx<0||nz<0||nx>=G.N||nz>=G.N)continue;
      const j=nz*G.N+nx,sj=G.H[j]+(G.W[j]>=WET?G.W[j]:0);
      if(si-sj>DROP&&G.FLX[o+k]>.02)G.foamT[j]+=Math.min(1,G.FLX[o+k]*.9);
      else if(G.W[j]<WET&&G.H[j]>=si-.05)G.foamT[i]+=.07;
    }
  }
  for(let i=0;i<G.CELLS;i++)G.FOAM[i]+=(Math.min(1,G.foamT[i])-G.FOAM[i])*.3;
}

/* ---------- geometría del agua (se rehace cada fotograma, interpolada) ---------- */
function surfAt(i){return G.H[i]+G.Wr[i];}
function cornerH(cx,cz,si){
  // media de las superficies mojadas que tocan la esquina y están a nivel parecido
  let s=0,n=0;
  for(let dz=-1;dz<=0;dz++)for(let dx=-1;dx<=0;dx++){
    const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=G.N||z>=G.N)continue;
    const j=z*G.N+x;if(G.Wr[j]<.004)continue;
    const sj=surfAt(j);if(Math.abs(sj-si)>.4)continue;
    s+=sj;n++;
  }
  return n?s/n:si;
}
function buildWater(alpha,dt,now,withFx){
  for(let i=0;i<G.CELLS;i++)G.Wr[i]=G.Wprev[i]+(G.W[i]-G.Wprev[i])*alpha;
  // superficie
  const P=surfGeo.attributes.position.array,Nn=surfGeo.attributes.normal.array,F=surfGeo.attributes.aFlow.array,
        In=surfGeo.attributes.aInfo.array,Uv=surfGeo.attributes.aUv.array,qc=waterMesh.userData.quadCell;
  let v=0,q=0;
  const put=(x,y,z,fx,fz,dep,fo)=>{P[v*3]=x;P[v*3+1]=y;P[v*3+2]=z;Nn[v*3]=0;Nn[v*3+1]=1;Nn[v*3+2]=0;
    F[v*2]=fx;F[v*2+1]=fz;In[v*3]=dep;In[v*3+1]=fo;In[v*3+2]=0;Uv[v*2]=0;Uv[v*2+1]=0;v++;};
  const outF=i=>G.FLX[i*4]+G.FLX[i*4+1]+G.FLX[i*4+2]+G.FLX[i*4+3];
  const shows=i=>G.Wr[i]>=WET||(G.Wr[i]>=.004&&outF(i)>.004);
  for(let i=0;i<G.CELLS;i++){
    if(!shows(i))continue;
    const x=i%G.N,z=(i/G.N)|0,si=G.H[i]+Math.max(G.Wr[i],.03),x0=x-G.N/2,z0=z-G.N/2,x1=x0+1,z1=z0+1;
    const h00=cornerH(x,z,si)+.012,h01=cornerH(x,z+1,si)+.012,h10=cornerH(x+1,z,si)+.012,h11=cornerH(x+1,z+1,si)+.012;
    const fx=G.VX[i],fz=G.VZ[i],dep=G.Wr[i],fo=G.FOAM[i];
    put(x0,h00,z0,fx,fz,dep,fo);put(x0,h01,z1,fx,fz,dep,fo);put(x1,h10,z0,fx,fz,dep,fo);
    put(x1,h10,z0,fx,fz,dep,fo);put(x0,h01,z1,fx,fz,dep,fo);put(x1,h11,z1,fx,fz,dep,fo);
    qc[q++]=i;
  }
  surfGeo.setDrawRange(0,v);
  for(const n of ['position','normal','aFlow','aInfo','aUv'])surfGeo.attributes[n].needsUpdate=true;

  // cascadas: cortinas donde el agua cae a una casilla más baja o por el borde del pedestal
  const CP=curtGeo.attributes.position.array,CN=curtGeo.attributes.normal.array,CI=curtGeo.attributes.aInfo.array,
        CU=curtGeo.attributes.aUv.array,CF=curtGeo.attributes.aFlow.array;
  let c=0;
  const cput=(x,y,z,nx,nz,str,u,vv)=>{CP[c*3]=x;CP[c*3+1]=y;CP[c*3+2]=z;CN[c*3]=nx;CN[c*3+1]=0;CN[c*3+2]=nz;
    CI[c*3]=str;CI[c*3+1]=0;CI[c*3+2]=1;CU[c*2]=u;CU[c*2+1]=vv;CF[c*2]=0;CF[c*2+1]=0;c++;};
  const curtain=(cx,cz,dx,dz,top,bot,str,out0,out1,wd)=>{
    if(c+6>CURT_Q*6||top-bot<.05)return;
    const px=-dz,pz=dx;
    const ax=cx+dx*out0,az=cz+dz*out0,bx=cx+dx*out1,bz=cz+dz*out1;
    const hw=(wd||1)*.5;
    const t0x=ax-px*hw,t0z=az-pz*hw,t1x=ax+px*hw,t1z=az+pz*hw,b0x=bx-px*hw,b0z=bz-pz*hw,b1x=bx+px*hw,b1z=bz+pz*hw;
    cput(t0x,top,t0z,dx,dz,str,0,0);cput(b0x,bot,b0z,dx,dz,str,0,1);cput(t1x,top,t1z,dx,dz,str,1,0);
    cput(t1x,top,t1z,dx,dz,str,1,0);cput(b0x,bot,b0z,dx,dz,str,0,1);cput(b1x,bot,b1z,dx,dz,str,1,1);
  };
  for(let i=0;i<G.CELLS;i++){
    if(!shows(i))continue;
    const x=i%G.N,z=(i/G.N)|0,o=i*4,si=G.H[i]+Math.max(G.Wr[i],.03)+.012,cx=wx(x),cz=wz(z);
    for(let k=0;k<4;k++){
      const dx=DIRS[k][0],dz=DIRS[k][1],nx=x+dx,nz=z+dz,f=G.FLX[o+k];
      if(nx<0||nz<0||nx>=G.N||nz>=G.N){
        if(!G.edgeDrain||f<.01)continue;
        const str=Math.min(1,.5+f*1.6);
        curtain(cx,cz,dx,dz,si,.02,str,.5,.56);          // hasta el borde del pedestal
        curtain(cx,cz,dx,dz,.02,-1.3,str*.8,.9,.98);       // y del pedestal hacia abajo
        if(withFx&&Math.random()<str*dt*6)spawn(cx+dx*.62+(Math.random()-.5)*.8*dz,.05,cz+dz*.62+(Math.random()-.5)*.8*dx,dx*.6,.4,dz*.6);
        continue;
      }
      const j=nz*G.N+nx,sj=G.H[j]+(G.Wr[j]>=WET?G.Wr[j]+.012:0);
      if(si-sj<=DROP||f<.008||G.H[j]>=si)continue;
      const str=Math.min(1,.55+f*1.6),fall=si-sj;
      curtain(cx,cz,dx,dz,si,sj,str,.5,.5+Math.min(.35,.08+fall*.06));
      if(withFx&&fxOk(j)&&Math.random()<str*dt*14){
        const lx=cx+dx*(.62+Math.random()*.2)+(Math.random()-.5)*.8*dz,lz=cz+dz*(.62+Math.random()*.2)+(Math.random()-.5)*.8*dx;
        spawn(lx,sj,lz,dx*.4,1+fall*.35,dz*.4);
      }
    }
  }
  // chorro que cae del cielo mientras se vierte
  for(const pr of pours){
    const x=wx(cxOf(pr.cell)),z=wz(czOf(pr.cell)),top=G.H[pr.cell]+4.5,bot=surfAt(pr.cell)+.02;
    curtain(x,z,0,1,top,bot,.95,0,0,.32);curtain(x,z,1,0,top,bot,.95,0,0,.32);
    if(withFx&&Math.random()<dt*30)spawn(x+(Math.random()-.5)*.5,bot,z+(Math.random()-.5)*.5,0,1.6,0);
  }
  curtGeo.setDrawRange(0,c);
  for(const n of ['position','normal','aFlow','aInfo','aUv'])curtGeo.attributes[n].needsUpdate=true;
}
function spawn(x,y,z,vx,vy,vz){
  if(parts.length>=PMAX)return;
  parts.push({x,y,z,vx:vx+(Math.random()-.5)*.8,vy:vy*(.5+Math.random()*.7),vz:vz+(Math.random()-.5)*.8,life:.6+Math.random()*.6});
}
function updateParts(dt){
  for(let k=parts.length-1;k>=0;k--){
    const p=parts[k];p.vy-=7*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.life-=dt;
    if(p.life<=0||p.y<-4){parts[k]=parts[parts.length-1];parts.pop();}
  }
  let n=0;for(const p of parts){pPos[n*3]=p.x;pPos[n*3+1]=p.y;pPos[n*3+2]=p.z;n++;}
  pGeo.setDrawRange(0,n);pGeo.attributes.position.needsUpdate=true;
}

/* =====================================================================
   LÍNEA DE VISIÓN, LUCES Y VISIÓN POR PERSONAJE
   ===================================================================== */
function los(a,b,eyeH,mode){
  const ax=cxOf(a),az=czOf(a),bx=cxOf(b),bz=czOf(b);
  const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  if(len<1.01)return true;
  const h1=G.H[b]+.3,steps=Math.ceil(len*3);
  for(let s=1;s<steps;s++){
    const t=s/steps,x=Math.round(ax+dx*t),z=Math.round(az+dz*t),k=z*G.N+x;
    if(k===a||k===b)continue;
    const rayH=eyeH+(h1-eyeH)*t;
    const blk=G.H[k]+((mode===1?blocksSight(k)||G.darkMask[k]:closedDoor(k))?2.2:0);
    if(blk>rayH)return false;
  }
  return true;
}
function lightCell(l){return l.carrier?(l.carrier.seg?l.carrier.seg.to:l.carrier.cell):l.cell;}
function buildCache(l){
  const P=LIGHT_PRESETS[l.preset],cell=lightCell(l);
  const br=P.bright/5,dm=P.dim/5,R=br+dm,eye=G.H[cell]+(l.carrier?1.3:l.mount?1.25:P.lh);
  const x0=cxOf(cell),z0=czOf(cell),rc=Math.ceil(R),list=[];
  for(let z=z0-rc;z<=z0+rc;z++)for(let x=x0-rc;x<=x0+rc;x++){
    if(!inb(x,z))continue;const d=Math.hypot(x-x0,z-z0);if(d>R+.01)continue;
    const j=I(x,z);
    if(j!==cell&&!los(cell,j,eye,2))continue;
    let w;
    if(d<=br||dm<=0)w=P.darkness?1:1-.2*(d/Math.max(br,.001));
    else w=.8*Math.pow(Math.max(0,1-(d-br)/dm),1.2);
    if(w>.01)list.push(j,w);
  }
  l.cache={cell,list};
}
function animFactor(l,t){
  if(!S.animLights)return 1;
  const a=LIGHT_PRESETS[l.preset].anim;
  if(a==='flicker')return .86+.09*Math.sin(t*13+l.seed)+.05*Math.sin(t*31+l.seed*2);
  if(a==='soft')return .95+.05*Math.sin(t*2+l.seed);
  if(a==='pulse')return .78+.22*Math.sin(t*2.4+l.seed);
  return 1;
}
function refreshLights(){
  G.illum.fill(0);G.darkMask.fill(0);
  for(const l of lights){
    if(!l.cache||l.cache.cell!==lightCell(l))buildCache(l);
    if(!l.on)continue;
    const P=LIGHT_PRESETS[l.preset],L=l.cache.list;
    for(let k=0;k<L.length;k+=2){if(P.darkness)G.darkMask[L[k]]=1;else G.illum[L[k]]+=L[k+1]*P.intensity;}
  }
  G.lightsDirty=false;G.visionDirty=true;G.lightTick=0;
}
const tmpC=new T3.Color();
const WHITE=new T3.Color(1,1,1);
const softL=v=>255*(1-Math.exp(-v*.95))/1.0;
function composeLightmap(t){
  G.lightAcc.fill(0);
  for(const l of lights){
    if(!l.on||!l.cache)continue;
    const P=LIGHT_PRESETS[l.preset];if(P.darkness)continue;
    tmpC.set(P.color).lerp(WHITE,.4);const f=P.intensity*animFactor(l,t),L=l.cache.list;
    for(let k=0;k<L.length;k+=2){const j=L[k]*3,w=L[k+1]*f;G.lightAcc[j]+=tmpC.r*w;G.lightAcc[j+1]+=tmpC.g*w;G.lightAcc[j+2]+=tmpC.b*w;}
  }
  flashLight();
  for(let i=0;i<G.CELLS;i++){
    const o=i*4,j=i*3;
    G.lightData[o]=softL(G.lightAcc[j]);G.lightData[o+1]=softL(G.lightAcc[j+1]);G.lightData[o+2]=softL(G.lightAcc[j+2]);
    G.lightData[o+3]=G.darkMask[i]?255:0;
  }
  G.lightTex.needsUpdate=true;
}

/* =====================================================================
   EXPLOSIONES
   Hunden el terreno en forma de cráter, destruyen objetos, piezas de pared
   y luces, vaporizan el agua (que luego vuelve a entrar), queman el suelo
   y encadenan barriles explosivos. Se pueden deshacer.
   ===================================================================== */
const BOOM_LEVELS={
  pequena:{name:'Pequeña',ft:5,r:1.25,depth:1,rim:0,light:1.6},
  media:{name:'Media',ft:10,r:2.25,depth:2,rim:.2,light:2.4},
  grande:{name:'Grande',ft:20,r:4.2,depth:3,rim:.35,light:3.2},
  enorme:{name:'Enorme',ft:30,r:6.2,depth:4,rim:.45,light:4},
};
const SCORCH=MATS.findIndex(m=>m.scorch);
const flashes=[],booms=[],boomQueue=[],undoStack=[];
const shakeOff=new T3.Vector3();

// --- efectos visuales ---
const fireMat=new T3.MeshBasicMaterial({color:0xffa040,transparent:true,opacity:0,blending:T3.AdditiveBlending,depthWrite:false});
const coreMat=new T3.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,blending:T3.AdditiveBlending,depthWrite:false});
const waveMat=new T3.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:0,depthWrite:false,side:T3.DoubleSide});
const sphereGeo=new T3.SphereGeometry(1,20,14),waveGeo=new T3.RingGeometry(.8,1,40);waveGeo.rotateX(-Math.PI/2);
const DEB_MAX=400;
const debMesh=new T3.InstancedMesh(new T3.BoxGeometry(.14,.14,.14),new T3.MeshLambertMaterial({color:0xffffff}),DEB_MAX);
debMesh.count=0;debMesh.frustumCulled=false;debMesh.castShadow=true;scene.add(debMesh);
{const c0=new T3.Color(1,1,1);for(let k=0;k<DEB_MAX;k++)debMesh.setColorAt(k,c0);}
const debris=[],smokes=[];
const EMB_MAX=300,embPos=new Float32Array(EMB_MAX*3),embers=[];
const embGeo=new T3.BufferGeometry();embGeo.setAttribute('position',new T3.BufferAttribute(embPos,3));embGeo.setDrawRange(0,0);
const embPts=new T3.Points(embGeo,new T3.PointsMaterial({color:0xffa24a,size:.11,transparent:true,opacity:.95,depthWrite:false,blending:T3.AdditiveBlending}));
embPts.frustumCulled=false;scene.add(embPts);
const dc=new T3.Color();

function spawnDebris(x,y,z,col,n,power){
  for(let k=0;k<n&&debris.length<DEB_MAX;k++){
    const a=Math.random()*Math.PI*2,sp=(.8+Math.random()*2.4)*power;
    debris.push({x:x+(Math.random()-.5)*.6,y:y+.2,z:z+(Math.random()-.5)*.6,vx:Math.cos(a)*sp,vy:2.5+Math.random()*4*power,vz:Math.sin(a)*sp,
      rx:Math.random()*6,ry:Math.random()*6,life:2+Math.random()*1.5,col:dc.set(col).offsetHSL(0,0,(Math.random()-.5)*.15).getHex(),s:.6+Math.random()*.9});
  }
}
function spawnSmoke(x,y,z,n,size){
  for(let k=0;k<n;k++){
    const sp=new T3.Sprite(new T3.SpriteMaterial({map:mistTex,transparent:true,depthWrite:false,opacity:0,color:0x6b6560}));
    const s=size*(.5+Math.random()*.6);sp.scale.set(s,s,1);
    sp.position.set(x+(Math.random()-.5)*size*.8,y+.3+Math.random()*.6,z+(Math.random()-.5)*size*.8);
    sp.userData={t:0,life:2.6+Math.random()*1.8,s,vy:.5+Math.random()*.7,vx:(Math.random()-.5)*.4,vz:(Math.random()-.5)*.4};
    scene.add(sp);smokes.push(sp);
  }
}
function spawnEmbers(x,y,z,n,r){
  for(let k=0;k<n&&embers.length<EMB_MAX;k++){
    const a=Math.random()*Math.PI*2,d=Math.random()*r;
    embers.push({x:x+Math.cos(a)*d,y:y+.1,z:z+Math.sin(a)*d,vx:(Math.random()-.5)*.6,vy:.6+Math.random()*1.6,vz:(Math.random()-.5)*.6,life:1+Math.random()*2.5});
  }
}

// --- explosión ---
function snapshot(){
  undoStack.push({N:G.N,H:G.H.slice(),M:G.M.slice(),objs:[],mounts:[],lights:[]});
  if(undoStack.length>5)undoStack.shift();
  return undoStack[undoStack.length-1];
}
function explode(cell,levelKey,chained){
  const L=BOOM_LEVELS[levelKey],cx=cxOf(cell),cz=czOf(cell);
  const snap=chained||snapshot();
  const R=L.r,rc=Math.ceil(R+1),top=G.H[cell]+.3,wxp=wx(cx),wzp=wz(cz);
  const affected=[],chain=[];
  // cráter, suelo quemado y agua evaporada
  for(let z=cz-rc;z<=cz+rc;z++)for(let x=cx-rc;x<=cx+rc;x++){
    if(!inb(x,z))continue;
    const i=I(x,z),d=Math.hypot(x-cx,z-cz);
    if(d<=R){
      const k=1-(d/R)*(d/R),drop=Math.max(0,Math.round(L.depth*k+(Math.random()-.5)*.8));
      const nh=Math.max(1,G.H[i]-drop);
      if(nh<G.H[i]){
        const mat=MATS[G.M[i]]&&MATS[G.M[i]].swatch||'#777';
        spawnDebris(wx(x),G.H[i],wz(z),mat,Math.min(6,2+(G.H[i]-nh)*2),1+L.depth*.25);
        G.H[i]=nh;
      }
      if(SCORCH>=0&&d<=R*.85&&Math.random()<.9)G.M[i]=SCORCH;
      G.W[i]*=d<R*.7?0:.3;
    }else if(d<=R+1&&L.rim&&Math.random()<L.rim&&G.H[i]<MAXH&&!objs.has(i)&&!charAt(i,null)){
      G.H[i]++;
    }
  }
  // objetos: los explosivos se encadenan, el resto se rompe
  Array.from(objs.entries()).forEach(([i,o])=>{
    const d=Math.hypot(cxOf(i)-cx,czOf(i)-cz),K=OBJ_KINDS[o.kind];
    if(K.explosive&&i!==cell&&d<=R*1.35){chain.push([i,K.explosive,d]);return;}
    if(d>R*.95)return;
    snap.objs.push({i,kind:o.kind,rot:o.rot,open:o.open});
    spawnDebris(wx(cxOf(i)),G.H[i]+.4,wz(czOf(i)),K.tree!=null?'#4f8a3c':'#8a5a2e',5,1);
    removeObj(i);
  });
  if(objs.has(cell)&&OBJ_KINDS[objs.get(cell).kind].explosive){
    const o=objs.get(cell);snap.objs.push({i:cell,kind:o.kind,rot:o.rot,open:o.open});removeObj(cell);
  }
  Array.from(mounts.entries()).forEach(([k,o])=>{
    const f=I(cxOf(o.wall)+DIRS[o.dir][0],czOf(o.wall)+DIRS[o.dir][1]);
    if(Math.hypot(cxOf(f)-cx,czOf(f)-cz)<=R){snap.mounts.push({wall:o.wall,dir:o.dir,kind:o.kind});removeMount(k);}
  });
  lights.slice().forEach(l=>{
    if(l.carrier)return;
    if(Math.hypot(cxOf(l.cell)-cx,czOf(l.cell)-cz)<=R*.9){snap.lights.push({preset:l.preset,cell:l.cell,mount:l.mount&&{wall:l.mount.wall,dir:l.mount.dir}});removeLight(l);}
  });
  tufts.forEach(m=>{const i=m.userData.cell;if(Math.hypot(cxOf(i)-cx,czOf(i)-cz)<=R)m.userData.burnt=true;});
  chars.forEach(c=>{
    const cc=c.seg?c.seg.to:c.cell,d=Math.hypot(cxOf(cc)-cx,czOf(cc)-cz);
    if(d<=R){affected.push(c.name);c.hit=1;}
  });
  // efectos
  booms.push({x:wxp,y:top,z:wzp,R,t:0,
    fire:new T3.Mesh(sphereGeo,fireMat.clone()),core:new T3.Mesh(sphereGeo,coreMat.clone()),wave:new T3.Mesh(waveGeo,waveMat.clone())});
  const b=booms[booms.length-1];[b.fire,b.core,b.wave].forEach(m=>{m.position.set(wxp,top,wzp);scene.add(m);});
  b.wave.position.y=G.H[cell]+.08;
  flashes.push({cell,r:R+3.5,i:L.light,t:0});
  spawnSmoke(wxp,G.H[cell],wzp,6+L.depth*3,1.4+R*.6);
  spawnEmbers(wxp,G.H[cell],wzp,30+L.depth*25,R);
  for(let k=0;k<10+L.depth*8;k++)spawn(wxp+(Math.random()-.5)*R,top,wzp+(Math.random()-.5)*R,(Math.random()-.5)*3,2+Math.random()*3,(Math.random()-.5)*3);
  G.shake=Math.max(G.shake,.15+L.depth*.12);
  chain.forEach(([i,lv,d])=>boomQueue.push({cell:i,level:lv,t:.18+d*.08,snap}));
  terrainChanged();refreshTufts();G.visionDirty=true;
  G.FLX.fill(0);G.Wprev.set(G.W);
  if(!chained)R.toast('¡Explosión '+L.name.toLowerCase()+' ('+L.ft+' pies)!'+(affected.length?' Afecta a: '+affected.join(', ')+'.':''));
  return snap;
}

// --- animación ---
function flashLight(){
  // destello: luz cálida sin sombras que se apaga en un segundo
  for(const f of flashes){
    const k=Math.max(0,1-f.t/1.1),amp=f.i*k*k,cx=cxOf(f.cell),cz=czOf(f.cell),rc=Math.ceil(f.r);
    for(let z=cz-rc;z<=cz+rc;z++)for(let x=cx-rc;x<=cx+rc;x++){
      if(!inb(x,z))continue;const d=Math.hypot(x-cx,z-cz);if(d>f.r)continue;
      const w=amp*(1-d/f.r),j=I(x,z)*3;G.lightAcc[j]+=w;G.lightAcc[j+1]+=w*.62;G.lightAcc[j+2]+=w*.28;
    }
  }
}
function updateBooms(dt){
  for(let k=boomQueue.length-1;k>=0;k--){const q=boomQueue[k];q.t-=dt;if(q.t<=0){boomQueue.splice(k,1);
    if(objs.has(q.cell)&&OBJ_KINDS[objs.get(q.cell).kind].explosive)explode(q.cell,q.level,q.snap);}}
  for(let k=flashes.length-1;k>=0;k--){flashes[k].t+=dt;if(flashes[k].t>1.1)flashes.splice(k,1);}
  if(flashes.length)G.lightTick=0;
  for(let k=booms.length-1;k>=0;k--){
    const b=booms[k];b.t+=dt;const t=b.t;
    const g=Math.min(1,t/.35),e=1-Math.pow(1-g,3);
    b.fire.scale.setScalar(.2+b.R*1.05*e);b.fire.material.opacity=Math.max(0,.85*(1-t/.75));
    b.core.scale.setScalar(.15+b.R*.55*e);b.core.material.opacity=Math.max(0,1-t/.4);
    const wv=Math.min(1,t/.6);b.wave.scale.setScalar(.3+(b.R+1.6)*wv);b.wave.material.opacity=Math.max(0,.7*(1-wv));
    b.fire.position.y=b.y+t*.8;
    if(t>1){[b.fire,b.core,b.wave].forEach(m=>{scene.remove(m);m.material.dispose();});booms.splice(k,1);}
  }
  // escombros que rebotan en el terreno
  let n=0;
  for(let k=debris.length-1;k>=0;k--){
    const p=debris[k];p.vy-=14*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rx+=dt*6;p.ry+=dt*5;p.life-=dt;
    const gx=Math.round(p.x+G.N/2-.5),gz=Math.round(p.z+G.N/2-.5),gh=inb(gx,gz)?G.H[I(gx,gz)]:-1.3;
    if(p.y<gh+.07&&p.vy<0){p.y=gh+.07;p.vy*=-.3;p.vx*=.55;p.vz*=.55;}
    if(p.life<=0||p.y<-6){debris.splice(k,1);continue;}
  }
  for(const p of debris){
    dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx,p.ry,0);dummy.scale.setScalar(p.s*Math.min(1,p.life/.5));dummy.updateMatrix();
    debMesh.setMatrixAt(n,dummy.matrix);debMesh.setColorAt(n,dc.setHex(p.col));n++;
  }
  dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);
  debMesh.count=n;debMesh.instanceMatrix.needsUpdate=true;if(debMesh.instanceColor)debMesh.instanceColor.needsUpdate=true;
  for(let k=smokes.length-1;k>=0;k--){
    const sp=smokes[k],u=sp.userData;u.t+=dt;const a=u.t/u.life;
    sp.position.y+=u.vy*dt;sp.position.x+=u.vx*dt;sp.position.z+=u.vz*dt;
    const s=u.s*(1+a*1.6);sp.scale.set(s,s,1);
    sp.material.opacity=Math.min(1,u.t*4)*(1-a)*.75;
    sp.material.color.setRGB(.42+.1*a,.4+.1*a,.38+.1*a);
    if(a>=1){scene.remove(sp);sp.material.dispose();smokes.splice(k,1);}
  }
  let m=0;
  for(let k=embers.length-1;k>=0;k--){const p=embers[k];p.vy-=.4*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.life-=dt;if(p.life<=0)embers.splice(k,1);}
  for(const p of embers){embPos[m*3]=p.x;embPos[m*3+1]=p.y;embPos[m*3+2]=p.z;m++;}
  embGeo.setDrawRange(0,m);embGeo.attributes.position.needsUpdate=true;
  // temblor de cámara
  G.shake=Math.max(0,G.shake-dt*.9);
  const s2=G.shake*G.shake*2.2;shakeOff.set((Math.random()-.5)*s2,(Math.random()-.5)*s2*.6,(Math.random()-.5)*s2);
  // fichas alcanzadas: parpadean en rojo
  chars.forEach(c=>{if(!c.hit)return;c.hit=Math.max(0,c.hit-dt*.8);const f=Math.sin(c.hit*20)>0?c.hit:0;c.mesh.material.color.setRGB(1,1-.6*f,1-.7*f);});
}

function computeFor(c){
  let v=pcVis.get(c);if(!v){v={mode:new Uint8Array(G.CELLS),strong:new Uint8Array(G.CELLS)};pcVis.set(c,v);}
  let e=explored.get(c);if(!e){e=new Uint8Array(G.CELLS);explored.set(c,e);}
  v.mode.fill(0);v.strong.fill(0);
  const from=c.seg?c.seg.to:c.cell,eye=G.H[from]+1.5,fx=cxOf(from),fz=czOf(from);
  const R=Math.min(VIEW_R,c.sight>0?Math.ceil(c.sight/5):VIEW_R);
  for(let z=Math.max(0,fz-R);z<=Math.min(G.N-1,fz+R);z++)for(let x=Math.max(0,fx-R);x<=Math.min(G.N-1,fx+R);x++){
    const j=z*G.N+x,d=Math.hypot(x-fx,z-fz);if(d>R+.5)continue;
    if(c.sight>0&&d>c.sight/5)continue;
    if(!los(from,j,eye,1))continue;
    if(G.darkMask[j]){v.mode[j]=1;e[j]=1;continue;}
    const L=S.amb+G.illum[j];
    if(L>=.15||d<.5){v.mode[j]=1;if(L>=.3)v.strong[j]=1;}
    if(c.dv>0&&d<=c.dv/5){if(!v.mode[j])v.mode[j]=2;v.strong[j]=1;}
    if(v.mode[j])e[j]=1;
  }
}
function viewers(){
  if(S.view==='gm')return[];
  const pcs=chars.filter(c=>c.pc);
  if(S.view==='party'||S.shared)return pcs;
  const c=chars.find(x=>x.id===S.view);return c?[c]:pcs;
}
function computeVision(){
  chars.forEach(c=>{if(c.pc)computeFor(c);});
  const vs=viewers();
  G.tVis.fill(0);G.tMem.fill(0);G.tDv.fill(0);G.strongView.fill(0);
  for(let j=0;j<G.CELLS;j++){
    let lit=false,dv=false,mem=false,strong=false;
    for(const c of vs){const v=pcVis.get(c),e=explored.get(c);if(!v)continue;
      if(v.mode[j]===1)lit=true;else if(v.mode[j]===2)dv=true;
      if(v.strong[j])strong=true;if(e[j])mem=true;}
    G.tVis[j]=lit||dv?1:0;G.tDv[j]=!lit&&dv?1:0;G.tMem[j]=S.fogMemory&&mem?1:0;G.strongView[j]=strong?1:0;
  }
  // quién ve a quién
  chars.forEach(c=>{
    const cell=c.seg?c.seg.to:c.cell;
    let show=true;
    if(S.view!=='gm'&&!vs.includes(c)){
      if(c.pc&&S.view==='party')show=true;
      else show=!c.hidden&&G.tVis[cell]>0&&G.strongView[cell]>0;
    }
    c.mesh.visible=show;
  });
  G.visionDirty=false;
}
function fxOk(i){return S.view==='gm'||G.cVis[i]>.5;}
function blendVision(dt,snap){
  const k=snap?1:Math.min(1,dt*7);let moving=false;
  for(let j=0;j<G.CELLS;j++){
    const a=G.cVis[j]+(G.tVis[j]-G.cVis[j])*k,b=G.cMem[j]+(G.tMem[j]-G.cMem[j])*k,c=G.cDv[j]+(G.tDv[j]-G.cDv[j])*k;
    if(Math.abs(a-G.cVis[j])+Math.abs(b-G.cMem[j])+Math.abs(c-G.cDv[j])>.002)moving=true;
    G.cVis[j]=a;G.cMem[j]=b;G.cDv[j]=c;
    const o=j*4;G.visData[o]=a*255;G.visData[o+1]=b*255;G.visData[o+2]=c*255;G.visData[o+3]=255;
  }
  if(moving||snap)G.visTex.needsUpdate=true;
}

/* =====================================================================
   PERSONAJES
   ===================================================================== */
const charAt=(i,except)=>chars.some(c=>c!==except&&(c.cell===i||(c.seg&&c.seg.to===i)));
function findPath(c,to){
  const from=c.cell;if(from===to)return[];
  const ok=j=>!blocksMove(j)&&G.W[j]<.7&&!charAt(j,c);
  if(!ok(to))return null;
  const prev=new Int32Array(G.CELLS).fill(-1);prev[from]=from;const q=[from];
  while(q.length){
    const cur=q.shift();if(cur===to)break;
    const x=cxOf(cur),z=czOf(cur);
    for(const [dx,dz] of DIRS){
      const nx=x+dx,nz=z+dz;if(!inb(nx,nz))continue;
      const j=I(nx,nz);if(prev[j]!==-1||!ok(j)||Math.abs(G.H[j]-G.H[cur])>1)continue;
      prev[j]=cur;q.push(j);
    }
  }
  if(prev[to]===-1)return null;
  const out=[];for(let k=to;k!==from;k=prev[k])out.push(k);
  return out.reverse();
}
function select(c){G.selected=c;}
function moveTo(c,i){
  const p=findPath(c,i);
  if(p===null){R.toast('No hay camino: algún escalón mide más de un bloque o la casilla está ocupada.');return;}
  c.path=p;
}
function updateChars(dt,now){
  const rx=Math.cos(theta),rz=-Math.sin(theta);
  for(const c of chars){
    const m=c.mesh;
    if(!c.seg&&c.path.length){c.seg={from:c.cell,to:c.path.shift(),t:0};c.fi=0;if(c.pc)G.visionDirty=true;if(c.carried)G.lightsDirty=true;}
    let x,z;
    if(c.seg){
      const s=c.seg;s.t=Math.min(1,s.t+dt*3.4);
      const a=s.from,b=s.to,t=s.t,dh=G.H[b]-G.H[a];
      x=wx(cxOf(a))+(wx(cxOf(b))-wx(cxOf(a)))*t;z=wz(czOf(a))+(wz(czOf(b))-wz(czOf(a)))*t;
      c.gy=G.H[a]+dh*t+(c.float?0:Math.sin(Math.PI*t)*(.18+.25*Math.abs(dh)));
      const dot=(cxOf(b)-cxOf(a))*rx+(czOf(b)-czOf(a))*rz;
      if(Math.abs(dot)>.01)c.dir=dot<0?-1:1;
      if(t>=1){c.cell=b;c.seg=null;c.fi=0;if(c.pc&&!c.path.length)maybeGrow(b);}
    }else{
      x=wx(cxOf(c.cell));z=wz(czOf(c.cell));
      c.gy+=(G.H[c.cell]-c.gy)*Math.min(1,dt*10);
    }
    m.position.set(x,c.gy+(c.float?c.float+Math.sin(now*3+c.seed)*.09:0),z);
    m.scale.x=c.dir;
    const list=c.seg?c.art.run:c.art.idle;
    const step=c.seg?.1:(list.length>2?.16:.55);
    c.ft+=dt;if(c.ft>step){c.ft=0;c.fi=(c.fi+1)%list.length;}
    c.tex.offset.x=list[c.fi%list.length]/c.art.n;
  }
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

  updateChars(dt,s);
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
  ff.visible=flyOn;
  if(flyOn){
    ffMat.opacity=envCur.fly*(.75+.25*Math.sin(s*3));
    ffSeed.forEach((f,n)=>{ffPos[n*3]=f.x+Math.sin(s*f.s+f.p)*.8;ffPos[n*3+1]=f.y+Math.sin(s*f.s*1.7+f.p)*.35;ffPos[n*3+2]=f.z+Math.cos(s*f.s*.8+f.p)*.8;});
    ffGeo.attributes.position.needsUpdate=true;
  }

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
  restyle('packs'); // loadStyle + asignar el atlas al terreno (creado con map:null)
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
return { start, stop, resize, rotate, setEnv };
}