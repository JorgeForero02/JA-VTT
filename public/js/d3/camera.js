/* Cámara orbital, entorno (sol, cielo, bruma) y posproceso del motor 2.5D.
   El estado de la cámara vive en CAM para que input.js y world.js lo lean y lo muevan. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U } from './ctx.js';
import { mkCanvas } from './art.js';
import { waterMat, curtMat } from './water.js';
import { ENVS, spriteMats } from './chars.js';
const T3 = THREE;

/* =====================================================================
   CÁMARA, ENTORNO Y POSPROCESO
   ===================================================================== */
export const CAM={target:new T3.Vector3(0,2.2,0),targetT:new T3.Vector3(0,2.2,0),theta:Math.PI*.25,thetaT:Math.PI*.25,elev:.7,elevT:.7,baseDist:50,dist:50,distT:50};
let bgCanvas=null,bgCtx=null,bgTex=null;
export function initCamera(scene){
  bgCanvas=mkCanvas(2,128);bgCtx=bgCanvas.getContext('2d');
  bgTex=new T3.CanvasTexture(bgCanvas);scene.background=bgTex;
  R.cam=new T3.PerspectiveCamera(30,1,.5,300);
}
export function zoomMax(){return CAM.baseDist*1.5*Math.max(1,G.N/26);}
export function fitDistance(){CAM.baseDist=50*Math.max(1,1.1/R.cam.aspect);CAM.distT=Math.min(Math.max(CAM.distT,CAM.baseDist*.4),zoomMax());}
export function clampTarget(){const h=G.N/2;CAM.targetT.x=Math.max(-h,Math.min(h,CAM.targetT.x));CAM.targetT.z=Math.max(-h,Math.min(h,CAM.targetT.z));}
export function panBy(sx,sy){
  // arrastre en pantalla -> desplazamiento sobre el suelo según hacia dónde mira la cámara
  const k=CAM.dist*.0016,rx=Math.cos(CAM.theta),rz=-Math.sin(CAM.theta),fx=-Math.sin(CAM.theta),fz=-Math.cos(CAM.theta);
  CAM.targetT.x+=(-rx*sx+fx*sy)*k;CAM.targetT.z+=(-rz*sx+fz*sy)*k;clampTarget();
}
export function focusOn(c){CAM.targetT.x=c.mesh.position.x;CAM.targetT.z=c.mesh.position.z;clampTarget();}
export function placeCam(){
  const cam=R.cam,target=CAM.target,dist=CAM.dist,elev=CAM.elev,theta=CAM.theta;
  if(cam.far<dist*3){cam.far=dist*3;cam.updateProjectionMatrix();}
  cam.position.set(target.x+dist*Math.cos(elev)*Math.sin(theta),target.y+dist*Math.sin(elev),target.z+dist*Math.cos(elev)*Math.cos(theta));
  cam.lookAt(target);
}
/* Un paso del suavizado de la cámara (llamado cada fotograma) */
export function tickCamera(dt){
  const k=Math.min(1,dt*9);
  CAM.theta+=(CAM.thetaT-CAM.theta)*k;CAM.elev+=(CAM.elevT-CAM.elev)*k;CAM.dist+=(CAM.distT-CAM.dist)*k;
  CAM.target.x+=(CAM.targetT.x-CAM.target.x)*k;CAM.target.z+=(CAM.targetT.z-CAM.target.z)*k;
  placeCam();
}
export function rotate(dir){CAM.thetaT+=dir*Math.PI/2;}
export const envCur={sun:new T3.Color(),si:1,sp:new T3.Vector3(-8,20,10),sky:new T3.Color(),gnd:new T3.Color(),hi:.5,top:new T3.Color(),bot:new T3.Color(),em:.3,gain:.5,fly:0,dark:new T3.Color()};
let envT=0;
function envScale(){const e=ENVS[S.env];return Math.max(0,Math.min(2.5,e.ambient>0?S.amb/e.ambient:1+S.amb*10));}
function paintBg(){
  const g=bgCtx.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'#'+envCur.top.getHexString());g.addColorStop(1,'#'+envCur.bot.getHexString());
  bgCtx.fillStyle=g;bgCtx.fillRect(0,0,2,128);bgTex.needsUpdate=true;
}
export function applyEnv(instant){envT=instant?-1:3;if(instant)stepEnv(0);}
export function stepEnv(dt){
  if(envT===0)return;
  const sun=R.sun,hemi=R.hemi,target=CAM.target;
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

export const rt=new T3.WebGLRenderTarget(1,1,{format:T3.RGBAFormat,samples:4});
export const postMat=new T3.ShaderMaterial({
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
export const postScene=new T3.Scene(),postCam=new T3.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new T3.Mesh(new T3.PlaneGeometry(2,2),postMat));
export function resize(){
  const r=R.stage.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),pr=R.renderer.getPixelRatio();
  R.renderer.setSize(w,h,false);
  rt.setSize(Math.floor(w*pr),Math.floor(h*pr));
  postMat.uniforms.res.value.set(Math.floor(w*pr),Math.floor(h*pr));
  R.cam.aspect=w/h;R.cam.updateProjectionMatrix();
  const old=CAM.baseDist;fitDistance();if(old!==CAM.baseDist)CAM.distT=CAM.baseDist;
}
