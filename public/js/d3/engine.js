/* Motor 2.5D de JA-VTT: port del diorama (three r128 → r170). Estado del mundo por celda,
   terreno instanciado, agua, luz por mapa, visión y niebla. No toca el DOM fuera de su canvas. */
import * as THREE from '../vendor/three.module.min.js';
import { PACK_MAP } from './packmap.js';
import { G, S, R, U, MAXH, MAXN, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
const T3 = THREE;
// Colores como en r128: sin conversión sRGB→lineal al asignar, sin codificar a la salida.
THREE.ColorManagement.enabled=false;
export function createEngine(stage,opts) {
  R.toast = opts && opts.toast ? opts.toast : () => {};
  R.stage = stage;
  const chars=G.chars, objs=G.objs, lights=G.lights, mounts=G.mounts,
        springs=G.springs, sinks=G.sinks, tufts=G.tufts, pcVis=G.pcVis, explored=G.explored;
  // el diorama avisaba en su HUD; aquí usa el toast de JA-VTT
/* =====================================================================
   ARTE: dos estilos que comparten la misma distribución de piezas
   ===================================================================== */
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function rng(seed){let s=(seed>>>0)||1;return function(){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function pick(r,a){return a[Math.floor(r()*a.length)];}
function hexRgb(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
const OUTLINE='#1b1822';
const AC=8; // el atlas es de 8x8 piezas: las primeras 16 son de base, el resto una por material y cara
const TL={grassTop:0,grassSide:1,dirt:2,stoneTop:3,stoneSide:4,sandTop:5,sandSide:6,pathTop:7,deep:8,floorTop:9,cutTop:10};
const PROP_KINDS=['torch','brazier','crystal','orb'];

/* ---------------- pixel refinado ---------------- */
function pxOutline(ctx,w,h){
  const img=ctx.getImageData(0,0,w,h),d=img.data,out=new Uint8ClampedArray(d),o=hexRgb(OUTLINE);
  const op=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&d[(y*w+x)*4+3]>0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    if(d[i+3]>0){
      // sombreado automático: borde derecho/inferior más oscuro, izquierdo/superior con brillo
      let f=1;
      if(!op(x+1,y)||!op(x,y+1))f=.78;
      else if(!op(x-1,y)||!op(x,y-1))f=1.14;
      out[i]=Math.min(255,d[i]*f);out[i+1]=Math.min(255,d[i+1]*f);out[i+2]=Math.min(255,d[i+2]*f);
      continue;
    }
    if(op(x-1,y)||op(x+1,y)||op(x,y-1)||op(x,y+1)){out[i]=o[0];out[i+1]=o[1];out[i+2]=o[2];out[i+3]=255;}
  }
  img.data.set(out);ctx.putImageData(img,0,0);
}
function pixelAtlas(){
  const T=16,c=mkCanvas(T*AC,T*AC),x=c.getContext('2d');
  function tile(id,fn){const x0=(id%AC)*T,y0=Math.floor(id/AC)*T,r=rng(id*977+13);
    const px=(a,b,col)=>{x.fillStyle=col;x.fillRect(x0+a,y0+b,1,1);};fn(px,r,x0,y0);}
  const noise=(px,r,pal)=>{for(let b=0;b<16;b++)for(let a=0;a<16;a++)px(a,b,pick(r,pal));};
  const bevel=(x0,y0,hi,lo)=>{x.fillStyle=hi;x.fillRect(x0,y0,16,1);x.fillRect(x0,y0,1,16);x.fillStyle=lo;x.fillRect(x0,y0+15,16,1);x.fillRect(x0+15,y0,1,16);};
  const GR=['#5d9b3c','#67a843','#548f37','#67a843','#71b24b'];
  const DI=['#7a5534','#6b4a2d','#83603b','#6b4a2d','#5e4027'];
  tile(TL.grassTop,(px,r,x0,y0)=>{noise(px,r,GR);
    for(let k=0;k<14;k++){const a=Math.floor(r()*15),b=1+Math.floor(r()*14);px(a,b,'#86c35c');px(a,b+1,'#4b8231');}
    for(let k=0;k<3;k++){const a=1+Math.floor(r()*13),b=1+Math.floor(r()*13),f=k%2?'#f4e27a':'#f3a6c4';px(a,b,f);px(a+1,b,'#fff6d8');}
    bevel(x0,y0,'rgba(255,255,220,.18)','rgba(20,30,10,.28)');});
  tile(TL.grassSide,(px,r)=>{noise(px,r,DI);for(let k=0;k<6;k++){const a=Math.floor(r()*15),b=6+Math.floor(r()*9);px(a,b,'#a08e78');px(a+1,b,'#7c6c5a');}
    for(let a=0;a<16;a++){const d=3+(r()<.5?1:0)+(r()<.25?1:0);for(let b=0;b<d;b++)px(a,b,b===d-1?'#4b8231':pick(r,GR));px(a,0,'#7fbd55');}});
  tile(TL.dirt,(px,r)=>{noise(px,r,DI);for(let k=0;k<7;k++){const a=Math.floor(r()*15),b=Math.floor(r()*15);px(a,b,'#a08e78');px(a,b+1,'#574030');}});
  tile(TL.stoneTop,(px,r,x0,y0)=>{noise(px,r,['#8b8f94','#81858a','#959a9f']);
    const m='#5d6166',h='#a9adb2';
    for(let a=0;a<16;a++){px(a,7,m);px(a,15,m);px(a,8,h);px(a,0,h);}
    for(let b=0;b<7;b++){px(7,b,m);px(15,b,m);px(8,b,h);px(0,b,h);}
    for(let b=8;b<15;b++){px(3,b,m);px(11,b,m);px(4,b,h);px(12,b,h);}
    bevel(x0,y0,'rgba(255,255,255,.08)','rgba(0,0,0,.25)');});
  tile(TL.stoneSide,(px,r)=>{noise(px,r,['#81858a','#76797e','#8b8f94']);
    const m='#4b4f54',h='#9ea2a7';
    for(let k=0;k<4;k++){const y=k*4;for(let a=0;a<16;a++){px(a,y+3,m);px(a,y,h);}
      const o=k%2?3:7;for(let yy=y;yy<y+3;yy++){px(o,yy,m);px((o+8)%16,yy,m);px((o+1)%16,yy,'#8d9196');}}
    for(let k=0;k<4;k++)px(Math.floor(r()*16),Math.floor(r()*16),'#5f7a4a');});
  tile(TL.sandTop,(px,r,x0,y0)=>{noise(px,r,['#e2cf8f','#dac683','#ead79c','#e2cf8f']);
    for(let k=0;k<8;k++){const a=Math.floor(r()*15),b=Math.floor(r()*15);px(a,b,'#c9b170');px(a+1,b,'#f3e4b5');}
    bevel(x0,y0,'rgba(255,255,240,.2)','rgba(90,70,20,.25)');});
  tile(TL.sandSide,(px,r)=>{for(let b=0;b<16;b++)for(let a=0;a<16;a++)px(a,b,pick(r,(b%5<2)?['#c2aa6c','#b9a164']:['#d3bb7e','#cdb577']));});
  tile(TL.pathTop,(px,r,x0,y0)=>{noise(px,r,['#a88b62','#9c8058','#b3966b']);
    for(let k=0;k<9;k++){const a=Math.floor(r()*14),b=Math.floor(r()*14);px(a,b,'#8a8a82');px(a+1,b,'#b6b6ad');px(a,b+1,'#6c6c66');}
    bevel(x0,y0,'rgba(255,240,210,.14)','rgba(40,25,10,.3)');});
  tile(TL.deep,(px,r)=>{noise(px,r,['#5f6368','#55595e','#6a6e73']);for(let k=0;k<5;k++)px(Math.floor(r()*16),Math.floor(r()*16),'#43464a');});
  tile(TL.floorTop,(px,r,x0,y0)=>{noise(px,r,['#61656c','#5a5e65','#686c73']);
    const m='#3c3f45',h='#7a7e85';
    for(let a=0;a<16;a++){px(a,0,m);px(a,8,m);px(a,1,h);px(a,9,h);}
    for(let b=0;b<8;b++){px(5,b,m);px(6,b,h);}for(let b=8;b<16;b++){px(11,b,m);px(12,b,h);}
    px(2,4,'#56704a');px(3,4,'#56704a');px(13,12,'#56704a');px(8,13,m);px(9,14,m);px(10,14,m);
    bevel(x0,y0,'rgba(255,255,255,.05)','rgba(0,0,0,.3)');});
  tile(TL.cutTop,(px,r)=>{noise(px,r,['#2f3237','#34373c','#2a2d31']);for(let a=0;a<16;a++){px(a,a,'#3f4248');px(15-a,a,'#26282c');}});
  return c;
}
function pixelWater(){
  const c=mkCanvas(16,16),x=c.getContext('2d'),r=rng(91);
  for(let b=0;b<16;b++)for(let a=0;a<16;a++){x.fillStyle=pick(r,['#e6f4fb','#d4ecf8','#f2fafd']);x.fillRect(a,b,1,1);}
  x.fillStyle='#ffffff';for(let k=0;k<6;k++){x.fillRect(Math.floor(r()*13),Math.floor(r()*16),2+Math.floor(r()*2),1);}
  return c;
}
function pixelFigure(kind,f){
  const c=mkCanvas(16,24),x=c.getContext('2d');
  const R=(a,b,w,h,col)=>{x.fillStyle=col;x.fillRect(a,b,w,h);};
  const b=f,feet=f?[4,10]:[5,9];
  if(kind==='guerrera'){
    feet.forEach(fx=>{R(fx,18,2,3,'#6d7480');R(fx,21,2,2,'#4a3423');});
    R(4,10+b,8,10-b,'#2f5d8a');R(4,18,1,2,'#244a70');
    R(5,11+b,6,7,'#c4ccd6');R(6,11+b,4,7,'#3f79b3');R(7,12+b,1,4,'#6a9bd0');R(5,16+b,6,1,'#7a5a2e');R(7,16+b,2,1,'#e3c35a');
    R(3,11+b,2,5,'#aab3bf');R(11,11+b,2,5,'#aab3bf');R(3,11+b,2,1,'#dfe5ec');R(11,11+b,2,1,'#dfe5ec');R(3,16+b,2,1,'#e9c3a0');R(11,16+b,2,1,'#e9c3a0');
    R(5,4+b,6,7,'#c4ccd6');R(6,4+b,3,2,'#eef2f6');R(6,7+b,4,1,'#2a2d33');R(7,7+b,1,1,'#7fb4e0');R(5,9+b,6,1,'#98a2ae');
    R(7,1+b,2,3,'#c8413b');R(8,0+b,1,1,'#e2625b');R(9,2+b,1,2,'#9e2f2a');
    R(13,5+b,1,10,'#e4ebf2');R(13,5+b,1,1,'#ffffff');R(12,14+b,3,1,'#8a6a3a');R(13,15+b,1,2,'#5a3d22');
  }else if(kind==='mago'){
    feet.forEach(fx=>R(fx,21,2,2,'#3b2a4a'));
    R(4,11+b,8,10-b,'#5b3f8f');R(3,17,10,4,'#5b3f8f');R(3,20,10,1,'#e3c35a');R(7,11+b,2,9-b,'#7a5bb3');R(5,13+b,1,6,'#4a3176');
    R(3,12+b,2,4,'#5b3f8f');R(11,12+b,2,4,'#5b3f8f');R(3,16+b,2,1,'#e9c3a0');R(11,16+b,2,1,'#e9c3a0');
    R(6,7+b,4,3,'#e9c3a0');R(6,8+b,1,1,'#2a2233');R(9,8+b,1,1,'#2a2233');R(9,9+b,1,1,'#d9a784');
    R(6,10+b,4,3,'#eef0f2');R(7,13+b,2,1,'#eef0f2');R(8,11+b,1,2,'#c9ccd0');
    R(4,6+b,8,1,'#4a3176');R(5,4+b,6,2,'#5b3f8f');R(6,2+b,4,2,'#5b3f8f');R(7,0+b,3,2,'#5b3f8f');R(5,5+b,6,1,'#e3c35a');R(8,3+b,1,1,'#f4e27a');
    R(1,3+b,1,19-b,'#7a5230');R(0,1+b,3,3,'#7fe3ff');R(1,2+b,1,1,'#ffffff');
  }else if(kind==='arquera'){
    feet.forEach(fx=>{R(fx,18,2,3,'#5b4a36');R(fx,21,2,2,'#4a3423');});
    R(10,9+b,2,6,'#6b4a2d');R(10,8+b,1,1,'#d9d2bf');R(11,7+b,1,2,'#c84a3a');
    R(5,11+b,6,7,'#4f7a3a');R(5,15+b,6,1,'#7a5a2e');R(4,10+b,1,7,'#3f6630');R(6,12+b,1,3,'#6c9a52');
    R(3,11+b,2,5,'#4f7a3a');R(11,11+b,2,5,'#4f7a3a');R(3,16+b,2,1,'#e0b48f');R(11,16+b,2,1,'#e0b48f');
    R(4,3+b,8,8,'#3f6630');R(5,3+b,6,1,'#558a42');R(6,6+b,4,4,'#e0b48f');R(6,5+b,4,1,'#a8552f');R(10,6+b,1,3,'#a8552f');
    R(6,7+b,1,1,'#222222');R(9,7+b,1,1,'#222222');R(7,9+b,2,1,'#c98f6f');
    R(14,6+b,1,9,'#8a5a2e');R(13,5+b,1,1,'#8a5a2e');R(13,15+b,1,1,'#8a5a2e');R(13,6+b,1,9,'#e8e0cc');
  }else if(kind==='goblin'){
    feet.forEach(fx=>{R(fx,18,2,3,'#556b2f');R(fx,21,2,2,'#3a2a1c');});
    R(5,14+b,6,5,'#6b4f2f');R(5,17+b,6,1,'#4a3520');R(6,14+b,1,4,'#80613c');R(9,18,1,1,'#6b4f2f');
    R(3,14+b,2,4,'#79a33f');R(11,14+b,2,4,'#79a33f');
    R(4,8+b,8,6,'#79a33f');R(5,8+b,6,1,'#9ccb5c');R(4,13+b,8,1,'#5f8a2e');
    R(2,9+b,2,2,'#79a33f');R(12,9+b,2,2,'#79a33f');R(1,9+b,1,1,'#79a33f');R(14,9+b,1,1,'#79a33f');R(2,10+b,1,1,'#c86a5a');R(13,10+b,1,1,'#c86a5a');
    R(5,10+b,2,1,'#ffd23a');R(9,10+b,2,1,'#ffd23a');R(6,10+b,1,1,'#c0281c');R(10,10+b,1,1,'#c0281c');
    R(6,12+b,4,1,'#2b331a');R(7,12+b,1,1,'#ffffff');R(9,12+b,1,1,'#ffffff');
    R(13,12+b,1,5,'#dfe6ee');R(13,12+b,1,1,'#ffffff');R(12,17+b,3,1,'#6b4a2d');
  }else{
    const bone='#e8e4d6',sh='#b9b3a0';
    feet.forEach(fx=>{R(fx+(fx<8?1:0),17,1,4,bone);R(fx,21,2,1,bone);});
    R(5,16+b,6,1,sh);R(7,11+b,2,5,sh);R(5,12+b,6,1,bone);R(5,14+b,6,1,bone);R(6,13+b,4,1,sh);
    R(4,11+b,1,5,bone);R(11,11+b,1,5,bone);R(4,11+b,2,1,bone);R(10,11+b,2,1,bone);
    R(5,4+b,6,6,bone);R(6,4+b,4,1,'#faf8f1');R(6,6+b,2,2,OUTLINE);R(9,6+b,1,2,OUTLINE);R(6,6+b,1,1,'#7fe3ff');R(9,6+b,1,1,'#7fe3ff');
    R(6,9+b,4,1,sh);R(7,8+b,1,1,OUTLINE);R(7,10+b,1,1,bone);R(9,10+b,1,1,bone);
    R(12,6+b,1,9,'#b58a5a');R(12,6+b,1,1,'#d7ad7a');R(12,10+b,1,1,'#8a5a3a');R(11,14+b,3,1,'#5a3d22');
  }
  pxOutline(x,16,24);
  return c;
}
function pixelTree(v){
  const c=mkCanvas(32,40),x=c.getContext('2d'),r=rng(100+v*31);
  const P=(a,b,col)=>{x.fillStyle=col;x.fillRect(a,b,1,1);};
  x.fillStyle='#6b4428';x.fillRect(14,24,4,15);x.fillStyle='#553520';x.fillRect(16,24,2,15);x.fillStyle='#86583a';x.fillRect(14,26,1,10);x.fillStyle='#553520';x.fillRect(12,37,8,2);
  if(v===0){
    const blobs=[[16,15,10],[8,20,7],[24,20,7],[16,8,7]];
    for(const [bx,by,br] of blobs)for(let py=by-br;py<=by+br;py++)for(let q=bx-br;q<=bx+br;q++){
      const dx=q-bx,dy=py-by,dd=dx*dx+dy*dy;if(dd>br*br||q<0||q>31||py<0)continue;
      const l=(-dx-dy)/br;let col=l>.6?'#8ccf66':l>.1?'#5ea945':l>-.45?'#4a933a':'#347028';
      if(dd>(br-1.2)*(br-1.2)&&l<0)col='#2d6123';
      if(r()<.06)col=l>0?'#a5dc7c':'#3e8232';P(q,py,col);
    }
    for(let k=0;k<6;k++)P(6+Math.floor(r()*20),6+Math.floor(r()*18),'#e05a4a');
  }else{
    for(let i=0;i<4;i++){const top=1+i*6;
      for(let yy=0;yy<10;yy++){const half=Math.round(1+yy*(.7+i*.22));
        for(let q=16-half;q<=16+half;q++){if(q<0||q>31)continue;
          let col=q<16-half*.35?'#4e8e58':q<16+half*.3?'#35674a':'#284f3a';if(yy===9)col='#1f3f2e';if(r()<.07)col='#5fa068';
          P(q,top+yy,col);}}}
  }
  pxOutline(x,32,40);
  return c;
}
function pixelTuft(){
  const c=mkCanvas(8,8),x=c.getContext('2d');
  [[1,4,'#4f8f35'],[2,6,'#6fb04a'],[3,3,'#4f8f35'],[4,7,'#78bd50'],[5,4,'#5c9c3e'],[6,5,'#6fb04a']].forEach(([a,h,col])=>{x.fillStyle=col;x.fillRect(a,8-h,1,h);x.fillStyle='#9ad26c';x.fillRect(a,8-h,1,1);});
  return c;
}
function pixelProp(kind){
  const c=mkCanvas(24,24);
  for(let f=0;f<2;f++){
    const s=mkCanvas(12,24),y=s.getContext('2d'),R=(a,b,w,h,col)=>{y.fillStyle=col;y.fillRect(a,b,w,h);};
    const fire=(cx,base,big)=>{
      if(f===0){R(cx-2,base-5,4,5,'#ff8a2a');R(cx-1,base-7,2,2,'#ffb347');R(cx-1,base-8,1,1,'#ffd27a');R(cx-1,base-4,2,3,'#fff2a8');if(big){R(cx-3,base-3,1,3,'#ff6a1a');R(cx+2,base-4,1,3,'#ff6a1a');}}
      else{R(cx-2,base-6,4,6,'#ff8a2a');R(cx,base-8,1,2,'#ffb347');R(cx-2,base-7,1,1,'#ffb347');R(cx-1,base-4,2,3,'#fff2a8');R(cx-1,base-5,1,1,'#ffd27a');if(big){R(cx-3,base-4,1,4,'#ff6a1a');R(cx+2,base-3,1,3,'#ff6a1a');}}
    };
    if(kind==='torch'){R(5,11,2,13,'#5a3d22');R(5,11,1,13,'#7a5534');R(4,10,4,2,'#3b3b40');R(4,10,4,1,'#6a6a72');fire(6,10,false);}
    else if(kind==='brazier'){R(3,17,1,7,'#3b3b40');R(8,17,1,7,'#3b3b40');R(5,18,2,6,'#2e2e33');R(2,13,8,4,'#4a4a52');R(2,13,8,1,'#7a7a84');R(3,16,6,1,'#35353b');R(3,12,6,1,'#c24a1a');fire(6,12,true);}
    else if(kind==='crystal'){R(2,19,8,5,'#6a6e73');R(2,19,8,1,'#8a8e93');R(4,8+f,3,11-f,'#8a6fe0');R(4,8+f,1,11-f,'#c9b8ff');R(5,6+f,1,2,'#b8a4ff');R(2,13,2,6,'#7358c8');R(2,13,1,6,'#b8a4ff');R(7,11,3,8,'#7358c8');R(9,11,1,8,'#553fa6');R(8,10,1,1,'#b8a4ff');if(f)R(5,9,1,1,'#ffffff');else R(8,13,1,1,'#ffffff');}
    else{R(4,4+f,4,4,'#f4f7ff');R(3,5+f,6,2,'#f4f7ff');R(5,3+f,2,6,'#f4f7ff');R(4,5+f,2,1,'#ffffff');R(7,6+f,1,2,'#c9d4ee');
      R(f?2:9,f?3:10,1,1,'#ffffff');R(f?9:2,f?11:4,1,1,'#dfe8ff');R(5,21,2,1,'#8a8e9a');}
    pxOutline(y,12,24);
    c.getContext('2d').drawImage(s,f*12,0);
  }
  return c;
}

/* ---------------- estilo dibujado (trazo de tinta) ---------------- */
const INK='#2a2420';
function smoothClosed(ctx,pts){
  const n=pts.length;
  ctx.moveTo((pts[n-1][0]+pts[0][0])/2,(pts[n-1][1]+pts[0][1])/2);
  for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];ctx.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);}
  ctx.closePath();
}
function polyPath(ctx,pts){ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();}
function blobPts(cx,cy,rx,ry,k,r,wob){const p=[];for(let i=0;i<k;i++){const a=i/k*Math.PI*2,m=1+(r()-.5)*wob;p.push([cx+Math.cos(a)*rx*m,cy+Math.sin(a)*ry*m]);}return p;}
function jit(pts,r,a){return pts.map(p=>[p[0]+(r()-.5)*a,p[1]+(r()-.5)*a]);}
function shape(ctx,pts,fill,o){
  o=o||{};
  ctx.beginPath();(o.poly?polyPath:smoothClosed)(ctx,pts);
  ctx.fillStyle=fill;ctx.fill();
  if(o.shade!==false){
    let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;pts.forEach(p=>{mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);});
    ctx.save();ctx.clip();
    ctx.fillStyle=o.shade||'rgba(20,10,30,.22)';
    ctx.beginPath();ctx.moveTo(mnx+(mxx-mnx)*.58,mny-2);ctx.quadraticCurveTo(mnx+(mxx-mnx)*.48,(mny+mxy)/2,mnx+(mxx-mnx)*.62,mxy+2);ctx.lineTo(mxx+4,mxy+4);ctx.lineTo(mxx+4,mny-4);ctx.fill();
    if(o.hi){ctx.strokeStyle=o.hi;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(mnx+(mxx-mnx)*.22,mny+(mxy-mny)*.25);ctx.quadraticCurveTo(mnx+(mxx-mnx)*.18,(mny+mxy)/2,mnx+(mxx-mnx)*.24,mny+(mxy-mny)*.7);ctx.stroke();}
    ctx.restore();
  }
  ctx.beginPath();(o.poly?polyPath:smoothClosed)(ctx,pts);
  ctx.lineWidth=o.lw||4;ctx.strokeStyle=INK;ctx.lineJoin='round';ctx.stroke();
}
function inkLine(ctx,pts,w,col){
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.strokeStyle=INK;ctx.lineWidth=w+4;ctx.stroke();
  if(col){ctx.strokeStyle=col;ctx.lineWidth=w;ctx.stroke();}
}
function inkRect(x0,y0,x1,y1){return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];}

function drawnAtlas(){
  const T=64,c=mkCanvas(T*AC,T*AC),x=c.getContext('2d');
  function tile(id,base,fn){
    const x0=(id%AC)*T,y0=Math.floor(id/AC)*T,r=rng(id*131+7);
    x.save();x.beginPath();x.rect(x0,y0,T,T);x.clip();x.translate(x0,y0);
    x.fillStyle=base;x.fillRect(0,0,T,T);
    fn(r);
    x.restore();
  }
  const strokes=(r,n,cols,len,w,ang)=>{x.lineCap='round';for(let k=0;k<n;k++){const a=r()*64,b=r()*64,t=(ang==null?r()*Math.PI:ang+(r()-.5)*.5);x.strokeStyle=pick(r,cols);x.lineWidth=w;x.beginPath();x.moveTo(a,b);x.quadraticCurveTo(a+Math.cos(t)*len*.5+(r()-.5)*3,b+Math.sin(t)*len*.5,a+Math.cos(t)*len,b+Math.sin(t)*len);x.stroke();}};
  const border=(r,w,a)=>{x.strokeStyle='rgba(42,36,32,'+(a||.9)+')';x.lineWidth=w;x.lineJoin='round';x.beginPath();polyPath(x,jit([[1.5,1.5],[32,1.2],[62.5,1.5],[62.8,32],[62.5,62.5],[32,62.8],[1.5,62.5],[1.2,32]],r,1.2));x.stroke();};
  const hatch=(r,col,gap,a)=>{x.strokeStyle=col;x.lineWidth=1.3;for(let k=-64;k<128;k+=gap){x.beginPath();x.moveTo(k+(r()-.5)*2,0);x.lineTo(k+64*(a||.6)+(r()-.5)*2,64);x.stroke();}};
  tile(TL.grassTop,'#72904c',r=>{
    strokes(r,70,['#5f7d3e','#86a85a','#688745','#7b9a52'],7,2.2);
    for(let k=0;k<4;k++){const a=6+r()*52,b=6+r()*52;x.fillStyle=k%2?'#e8d77a':'#e3a2b8';x.beginPath();x.arc(a,b,2.2,0,7);x.fill();x.strokeStyle=INK;x.lineWidth=1;x.stroke();}
    border(r,2,.4);});
  tile(TL.grassSide,'#6b5037',r=>{
    hatch(r,'rgba(60,40,25,.45)',7);
    for(let k=0;k<5;k++){const a=r()*60,b=24+r()*36;x.fillStyle='#8f7a62';x.beginPath();x.ellipse(a,b,3,2,0,0,7);x.fill();x.strokeStyle=INK;x.lineWidth=1.2;x.stroke();}
    x.beginPath();x.moveTo(0,0);x.lineTo(64,0);x.lineTo(64,14);
    for(let a=64;a>=0;a-=8){x.quadraticCurveTo(a-4,20+r()*7,a-8,13+r()*4);}
    x.closePath();x.fillStyle='#72904c';x.fill();
    x.strokeStyle=INK;x.lineWidth=2.4;x.stroke();
    strokes(r,14,['#86a85a','#5f7d3e'],5,2,Math.PI/2);
    border(r,3);});
  tile(TL.dirt,'#6b5037',r=>{hatch(r,'rgba(60,40,25,.45)',7);
    for(let k=0;k<6;k++){const a=r()*60,b=r()*60;x.fillStyle='#8f7a62';x.beginPath();x.ellipse(a,b,3,2,r(),0,7);x.fill();x.strokeStyle=INK;x.lineWidth=1.2;x.stroke();}
    border(r,2.2,.6);});
  tile(TL.stoneTop,'#7d8185',r=>{
    const stones=[[[2,2],[30,3],[29,30],[3,28]],[[33,2],[62,2],[61,24],[34,27]],[[3,31],[26,33],[27,62],[2,61]],[[30,33],[61,28],[62,62],[29,61]]];
    stones.forEach(s=>{x.beginPath();polyPath(x,jit(s,r,3));x.fillStyle=pick(r,['#868a8e','#7a7e82','#8f9397']);x.fill();x.strokeStyle=INK;x.lineWidth=2.4;x.stroke();});
    strokes(r,10,['rgba(42,36,32,.35)'],6,1.2);border(r,3);});
  tile(TL.stoneSide,'#74787c',r=>{
    for(let k=0;k<4;k++){const y=k*16,o=k%2?16:0;
      for(let a=-16;a<64;a+=32){x.beginPath();polyPath(x,jit(inkRect(a+o+1.5,y+1.5,a+o+30.5,y+14.5),r,2));x.fillStyle=pick(r,['#7e8286','#707478','#868a8e']);x.fill();x.strokeStyle=INK;x.lineWidth=2;x.stroke();}}
    border(r,3);});
  tile(TL.sandTop,'#dcc88f',r=>{
    for(let k=0;k<90;k++){x.fillStyle=pick(r,['#c6ae73','#ead9a6','#cfb87c']);x.fillRect(r()*64,r()*64,1.6,1.6);}
    strokes(r,6,['rgba(150,120,60,.5)'],10,1.4,0.1);border(r,2,.4);});
  tile(TL.sandSide,'#cbb379',r=>{
    for(let k=0;k<6;k++){x.strokeStyle=k%2?'#b69e65':'#d8c290';x.lineWidth=2;x.beginPath();const y=6+k*10;x.moveTo(0,y);for(let a=0;a<=64;a+=16)x.quadraticCurveTo(a+8,y+(r()-.5)*5,a+16,y);x.stroke();}
    border(r,2.4,.7);});
  tile(TL.pathTop,'#a38863',r=>{
    for(let k=0;k<11;k++){const a=6+r()*52,b=6+r()*52;x.beginPath();x.ellipse(a,b,5+r()*3,3.5+r()*2,r()*3,0,7);x.fillStyle=pick(r,['#9a9890','#8a8880','#aaa89f']);x.fill();x.strokeStyle=INK;x.lineWidth=1.6;x.stroke();}
    border(r,3);});
  tile(TL.deep,'#4d5156',r=>{hatch(r,'rgba(20,20,25,.45)',6,.4);border(r,2,.5);});
  tile(TL.floorTop,'#5a5e65',r=>{
    const s=[[[2,2],[40,2],[38,22],[2,24]],[[42,2],[62,2],[62,24],[40,22]],[[2,26],[22,26],[24,62],[2,62]],[[24,26],[62,26],[62,62],[26,62]]];
    s.forEach(p=>{x.beginPath();polyPath(x,jit(p,r,3));x.fillStyle=pick(r,['#61656c','#585c63','#676b72']);x.fill();x.strokeStyle=INK;x.lineWidth=2.2;x.stroke();});
    x.strokeStyle='rgba(42,36,32,.7)';x.lineWidth=1.2;x.beginPath();x.moveTo(34,36);x.lineTo(40,42);x.lineTo(38,50);x.stroke();
    x.fillStyle='#57714a';x.beginPath();x.arc(10,44,3.5,0,7);x.fill();x.beginPath();x.arc(52,14,2.5,0,7);x.fill();
    border(r,3);});
  tile(TL.cutTop,'#2e3136',r=>{hatch(r,'rgba(0,0,0,.5)',5,1);hatch(r,'rgba(80,84,90,.35)',9,-1);border(r,3);});
  return c;
}
function drawnWater(){
  const c=mkCanvas(64,64),x=c.getContext('2d'),r=rng(19);
  x.fillStyle='#e3f2f9';x.fillRect(0,0,64,64);
  x.lineCap='round';
  for(let k=0;k<14;k++){const a=r()*64,b=r()*64;x.strokeStyle=k%3?'#bcdcec':'#ffffff';x.lineWidth=k%3?2:2.6;x.beginPath();x.moveTo(a,b);x.quadraticCurveTo(a+5,b-3,a+10,b);x.quadraticCurveTo(a+15,b+3,a+20,b);x.stroke();}
  return c;
}
function drawnFigure(kind,f){
  const figW=128,Hh=192,c=mkCanvas(figW,Hh),x=c.getContext('2d'),r=rng(kind.length*37+f);
  const b=f*3,sp=f?5:0;
  const legs=(col,boot,w)=>{
    w=w||12;
    [[48-sp,col],[68+sp,col]].forEach(([lx])=>{shape(x,inkRect(lx,138,lx+w,176),col,{poly:true,lw:3.5});shape(x,[[lx-4,172],[lx+w+2,172],[lx+w+4,187],[lx-6,187]],boot,{poly:true,lw:3.5});});
  };
  if(kind==='guerrera'){
    shape(x,[[40,70+b],[88,70+b],[98,170],[30,170]],'#2f5078',{poly:true});
    legs('#5d6470','#4a3423');
    shape(x,[[42,72+b],[86,72+b],[90,142],[38,142]],'#b9c0c8',{poly:true,hi:'rgba(255,255,255,.6)'});
    shape(x,[[54,78+b],[74,78+b],[77,146],[51,146]],'#3a6ea8',{poly:true,shade:'rgba(10,20,50,.3)'});
    shape(x,inkRect(38,118+b,90,127+b),'#6b4e2a',{poly:true,lw:3});
    shape(x,[[58,117+b],[70,117+b],[70,128+b],[58,128+b]],'#e3c35a',{poly:true,lw:3,shade:false});
    shape(x,blobPts(33,100+b,10,24,10,r,.12),'#a4adb8');
    shape(x,blobPts(95,100+b,10,24,10,r,.12),'#a4adb8');
    shape(x,[[103,30+b],[106,20+b],[110,30+b],[110,124+b],[103,124+b]],'#e1e7ee',{poly:true,lw:3.5,shade:'rgba(60,70,90,.25)'});
    shape(x,inkRect(94,122+b,119,130+b),'#8a6a3a',{poly:true,lw:3});
    shape(x,inkRect(103,130+b,110,146+b),'#5a3d22',{poly:true,lw:3});
    shape(x,blobPts(64,44+b,27,29,12,r,.08),'#c6ccd3',{hi:'rgba(255,255,255,.8)'});
    inkLine(x,[[48,48+b],[80,48+b]],3,'#1b1822');
    shape(x,inkRect(48,46+b,80,52+b),'#232630',{poly:true,lw:3,shade:false});
    x.fillStyle='#8fc3ee';x.fillRect(58,47+b,6,3);
    inkLine(x,[[64,18+b],[70,6+b],[84,2+b],[92,10+b]],7,'#c8413b');
  }else if(kind==='mago'){
    shape(x,[[46,70+b],[82,70+b],[102,186],[26,186]],'#5b3f8f',{poly:true,hi:'rgba(190,160,255,.5)'});
    inkLine(x,[[30,178],[98,178]],3,'#e3c35a');
    inkLine(x,[[64,76+b],[64,184]],3,'#7a5bb3');
    shape(x,blobPts(36,104+b,11,22,10,r,.12),'#5b3f8f');
    shape(x,blobPts(92,104+b,11,22,10,r,.12),'#5b3f8f');
    shape(x,blobPts(36,128+b,6,6,8,r,.1),'#e9c3a0',{lw:3,shade:false});
    shape(x,blobPts(92,128+b,6,6,8,r,.1),'#e9c3a0',{lw:3,shade:false});
    shape(x,blobPts(64,56+b,17,15,10,r,.08),'#e9c3a0');
    shape(x,[[46,62+b],[82,62+b],[76,96+b],[70,118+b],[64,126+b],[58,118+b],[52,96+b]],'#eceef0',{hi:'rgba(255,255,255,.9)'});
    x.fillStyle=INK;x.beginPath();x.arc(57,54+b,2.6,0,7);x.arc(71,54+b,2.6,0,7);x.fill();
    shape(x,[[38,46+b],[90,46+b],[76,24+b],[80,8+b],[92,0+b],[70,4+b],[58,22+b]],'#5b3f8f',{poly:true});
    shape(x,[[28,48+b],[100,48+b],[96,40+b],[32,40+b]],'#4a3176',{lw:3.5});
    inkLine(x,[[44,38+b],[84,38+b]],4,'#e3c35a');
    inkLine(x,[[16,34+b],[16,188]],6,'#7a5230');
    const g=x.createRadialGradient(16,26+b,2,16,26+b,22);g.addColorStop(0,'rgba(170,240,255,.9)');g.addColorStop(1,'rgba(170,240,255,0)');
    x.fillStyle=g;x.fillRect(0,4+b,40,44);
    shape(x,blobPts(16,26+b,10,10,10,r,.05),'#7fe3ff',{lw:3.5,hi:'rgba(255,255,255,.95)'});
  }else if(kind==='arquera'){
    shape(x,[[76,62+b],[90,58+b],[98,112+b],[84,116+b]],'#6b4a2d',{poly:true,lw:3.5});
    inkLine(x,[[82,60+b],[80,46+b]],3,'#d9d2bf');inkLine(x,[[88,58+b],[90,44+b]],3,'#c84a3a');
    legs('#5b4a36','#4a3423');
    shape(x,[[40,72+b],[88,72+b],[94,152],[34,152]],'#3f6630',{poly:true});
    shape(x,[[46,76+b],[82,76+b],[86,144],[42,144]],'#4f7a3a',{poly:true,hi:'rgba(200,240,160,.5)'});
    shape(x,inkRect(42,116+b,86,124+b),'#7a5a2e',{poly:true,lw:3});
    shape(x,blobPts(34,102+b,10,22,10,r,.12),'#4f7a3a');
    shape(x,blobPts(94,100+b,10,22,10,r,.12),'#4f7a3a');
    shape(x,blobPts(64,46+b,29,31,12,r,.1),'#3f6630');
    shape(x,blobPts(64,54+b,16,16,10,r,.06),'#e0b48f',{hi:'rgba(255,240,220,.7)'});
    inkLine(x,[[50,44+b],[60,38+b],[74,40+b]],4,'#a8552f');
    x.fillStyle=INK;x.beginPath();x.arc(58,54+b,2.4,0,7);x.arc(70,54+b,2.4,0,7);x.fill();
    x.lineCap='round';x.strokeStyle=INK;x.lineWidth=10;x.beginPath();x.moveTo(104,34+b);x.quadraticCurveTo(128,92+b,104,150+b);x.stroke();
    x.strokeStyle='#8a5a2e';x.lineWidth=5;x.stroke();
    x.strokeStyle='#efe6d0';x.lineWidth=1.6;x.beginPath();x.moveTo(104,34+b);x.lineTo(104,150+b);x.stroke();
  }else if(kind==='goblin'){
    [[50-sp],[68+sp]].forEach(([lx])=>{shape(x,inkRect(lx,150,lx+10,178),'#556b2f',{poly:true,lw:3.5});shape(x,[[lx-6,174],[lx+12,174],[lx+14,187],[lx-8,187]],'#3a2a1c',{poly:true,lw:3.5});});
    shape(x,[[44,116+b],[84,116+b],[90,160],[80,154],[72,162],[64,154],[56,162],[48,154],[38,160]],'#6b4f2f',{poly:true});
    shape(x,blobPts(36,132+b,9,18,10,r,.15),'#79a33f');
    shape(x,blobPts(92,132+b,9,18,10,r,.15),'#79a33f');
    shape(x,[[42,84+b],[4,66+b],[12,78+b],[40,100+b]],'#79a33f',{poly:true});
    shape(x,[[86,84+b],[124,66+b],[116,78+b],[88,100+b]],'#79a33f',{poly:true});
    shape(x,blobPts(64,92+b,29,25,12,r,.1),'#79a33f',{hi:'rgba(220,255,160,.6)'});
    [[52,88],[76,88]].forEach(([ex,ey])=>{shape(x,blobPts(ex,ey+b,7,6,8,r,.05),'#ffd23a',{lw:3,shade:false});x.fillStyle='#c0281c';x.beginPath();x.arc(ex+1,ey+b,2.6,0,7);x.fill();});
    inkLine(x,[[52,104+b],[64,108+b],[76,104+b]],2,'#2b331a');
    x.fillStyle='#fff';x.beginPath();polyPath(x,[[57,105+b],[60,105+b],[58.5,110+b]]);x.fill();x.beginPath();polyPath(x,[[68,106+b],[71,105+b],[70,110+b]]);x.fill();
    shape(x,[[100,104+b],[106,98+b],[108,140+b],[102,140+b]],'#dfe6ee',{poly:true,lw:3});
    shape(x,inkRect(96,138+b,114,145+b),'#6b4a2d',{poly:true,lw:3});
  }else{
    const bone='#ece8da';
    [[54-sp],[72+sp]].forEach(([lx])=>{inkLine(x,[[lx,132],[lx+(lx<64?-2:2),178]],4,bone);shape(x,[[lx-8,178],[lx+8,178],[lx+8,186],[lx-10,186]],bone,{poly:true,lw:3,shade:false});});
    shape(x,blobPts(64,130+b,18,8,8,r,.1),bone,{lw:3});
    inkLine(x,[[64,70+b],[64,126+b]],5,bone);
    [84,96,108].forEach((ry,k)=>{x.lineCap='round';x.beginPath();x.moveTo(64,ry+b);x.quadraticCurveTo(44-k*1,ry+6+b,48,ry+14+b);x.moveTo(64,ry+b);x.quadraticCurveTo(84+k*1,ry+6+b,80,ry+14+b);x.strokeStyle=INK;x.lineWidth=8;x.stroke();x.strokeStyle=bone;x.lineWidth=4;x.stroke();});
    inkLine(x,[[46,76+b],[36,104+b],[40,128+b]],4,bone);
    inkLine(x,[[82,76+b],[94,102+b],[98,124+b]],4,bone);
    inkLine(x,[[40,76+b],[88,76+b]],4,bone);
    shape(x,[[100,46+b],[106,40+b],[108,122+b],[102,122+b]],'#b58a5a',{poly:true,lw:3,shade:'rgba(90,40,10,.3)'});
    shape(x,inkRect(94,120+b,116,127+b),'#5a3d22',{poly:true,lw:3});
    shape(x,inkRect(52,58+b,76,70+b),bone,{poly:true,lw:3});
    shape(x,blobPts(64,44+b,23,22,12,r,.06),bone,{hi:'rgba(255,255,255,.9)'});
    [[55,44],[73,44]].forEach(([ex,ey])=>{shape(x,blobPts(ex,ey+b,7,8,8,r,.1),'#1b1822',{lw:2,shade:false});x.fillStyle='#8fe8ff';x.beginPath();x.arc(ex,ey+1+b,2.2,0,7);x.fill();});
    inkLine(x,[[56,64+b],[56,70+b]],1,bone);inkLine(x,[[64,64+b],[64,70+b]],1,bone);inkLine(x,[[72,64+b],[72,70+b]],1,bone);
  }
  return c;
}
function drawnTree(v){
  const c=mkCanvas(160,200),x=c.getContext('2d'),r=rng(300+v);
  if(v===0){
    shape(x,[[70,118],[88,118],[86,150],[96,196],[82,190],[76,196],[62,196],[72,150]],'#5a4030',{poly:true,lw:4,hi:'rgba(200,160,120,.4)'});
    inkLine(x,[[80,150],[78,170]],1,'#3e2c20');
    const blobs=[[42,96,34,28],[118,96,34,28],[80,72,60,50],[82,38,40,32]];
    blobs.forEach(([bx,by,rx,ry])=>shape(x,blobPts(bx,by,rx,ry,14,r,.22),'#4f6d3b',{shade:'rgba(20,35,15,.35)',hi:'rgba(170,200,120,.55)',lw:4.5}));
    for(let k=0;k<26;k++){const a=30+r()*100,b=24+r()*90;x.strokeStyle=pick(r,['rgba(30,45,20,.6)','rgba(140,170,100,.6)']);x.lineWidth=2;x.lineCap='round';x.beginPath();x.moveTo(a,b);x.quadraticCurveTo(a+3,b-4,a+6,b);x.stroke();}
    for(let k=0;k<5;k++){const a=40+r()*80,b=40+r()*60;x.fillStyle='#c9563f';x.beginPath();x.arc(a,b,3.4,0,7);x.fill();x.strokeStyle=INK;x.lineWidth=1.6;x.stroke();}
  }else{
    shape(x,inkRect(74,150,86,196),'#4a3527',{poly:true,lw:4});
    for(let i=0;i<5;i++){
      const top=6+i*26,bot=top+56,half=16+i*13,pts=[[80,top]];
      const n=5+i;
      for(let k=0;k<=n;k++){const t=k/n,px=80+half-t*half*2;pts.push([px,bot-(k%2?8:0)+(r()-.5)*3]);}
      pts.splice(1,0,[80+half*.5,top+28]);pts.push([80-half*.5,top+28]);
      shape(x,pts,'#30503f',{poly:true,shade:'rgba(10,25,20,.38)',hi:'rgba(140,190,160,.45)',lw:4.5});
    }
  }
  return c;
}
function drawnTuft(){
  const c=mkCanvas(40,40),x=c.getContext('2d');
  [[8,40,4,14],[14,40,12,6],[20,40,20,2],[26,40,28,8],[32,40,34,18]].forEach(([a,b,cx,ty])=>{
    x.lineCap='round';x.beginPath();x.moveTo(a,b);x.quadraticCurveTo((a+cx)/2,(b+ty)/2+4,cx,ty);
    x.strokeStyle=INK;x.lineWidth=5.5;x.stroke();x.strokeStyle='#7d9c55';x.lineWidth=2.5;x.stroke();});
  return c;
}
function drawnProp(kind){
  const c=mkCanvas(120,120),cx=c.getContext('2d');
  for(let f=0;f<2;f++){
    const s=mkCanvas(60,120),x=s.getContext('2d'),r=rng(kind.length*11+f);
    const flame=(fx,base,big)=>{
      const w=big?16:11,h=(big?34:28)+(f?5:0),lean=f?4:-3;
      const g=x.createRadialGradient(fx,base-h*.4,2,fx,base-h*.4,h);g.addColorStop(0,'rgba(255,190,90,.55)');g.addColorStop(1,'rgba(255,150,60,0)');
      x.fillStyle=g;x.fillRect(fx-h,base-h*1.5,h*2,h*2);
      shape(x,[[fx-w,base],[fx-w*.8,base-h*.45],[fx+lean,base-h],[fx+w*.8,base-h*.45],[fx+w,base]],'#ff8a2a',{lw:3,shade:false});
      shape(x,[[fx-w*.5,base],[fx-w*.4,base-h*.35],[fx+lean*.6,base-h*.62],[fx+w*.4,base-h*.35],[fx+w*.5,base]],'#ffe38a',{lw:0.01,shade:false});
    };
    if(kind==='torch'){
      shape(x,[[25,54],[35,54],[33,118],[27,118]],'#6a4a2c',{poly:true,lw:3.5,hi:'rgba(220,180,130,.5)'});
      shape(x,[[16,46],[44,46],[38,58],[22,58]],'#43434b',{poly:true,lw:3.5});
      flame(30,48,false);
    }else if(kind==='brazier'){
      inkLine(x,[[18,76],[10,118]],4,'#3b3b42');inkLine(x,[[42,76],[50,118]],4,'#3b3b42');inkLine(x,[[30,80],[30,116]],4,'#2e2e34');
      shape(x,[[4,62],[56,62],[48,84],[12,84]],'#4b4b54',{poly:true,hi:'rgba(200,200,220,.4)'});
      shape(x,blobPts(30,62,26,6,10,r,.05),'#c24a1a',{lw:3,shade:false});
      flame(22,62,true);flame(38,64,false);
    }else if(kind==='crystal'){
      shape(x,blobPts(30,108,26,11,10,r,.2),'#6a6e73',{hi:'rgba(200,200,210,.5)'});
      shape(x,[[22,104],[18,52],[30,30+f*2],[40,50],[38,104]],'#8a6fe0',{poly:true,hi:'rgba(235,225,255,.9)',shade:'rgba(40,20,90,.35)'});
      shape(x,[[6,104],[4,74],[12,64],[20,76],[18,104]],'#7358c8',{poly:true,hi:'rgba(220,210,255,.7)'});
      shape(x,[[40,104],[42,68],[50,60],[56,76],[52,104]],'#6a4fbf',{poly:true,hi:'rgba(220,210,255,.7)'});
      x.fillStyle='#fff';x.beginPath();x.arc(f?27:44,f?46:76,2.4,0,7);x.fill();
    }else{
      const g=x.createRadialGradient(30,48+f*2,4,30,48+f*2,28);g.addColorStop(0,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=g;x.fillRect(0,16,60,64);
      shape(x,blobPts(30,48+f*2,14,14,12,r,.03),'#f4f7ff',{shade:'rgba(80,100,160,.2)',hi:'rgba(255,255,255,1)',lw:3.5});
      x.fillStyle='#fff';[[f?12:48,f?30:62],[f?48:10,f?66:34]].forEach(([a,b])=>{x.beginPath();polyPath(x,[[a,b-5],[a+1.5,b-1.5],[a+5,b],[a+1.5,b+1.5],[a,b+5],[a-1.5,b+1.5],[a-5,b],[a-1.5,b-1.5]]);x.fill();});
      shape(x,blobPts(30,112,8,3,8,r,.1),'rgba(60,60,70,.5)',{lw:0.01,shade:false});
    }
    cx.drawImage(s,f*60,0);
  }
  return c;
}

/* ---------------- packs abiertos: Kenney Tiny Dungeon + 0x72 DungeonTileset II (CC0) ---------------- */
let packImg=null;
function loadPacks(){return new Promise((ok,fail)=>{const im=new Image();im.onload=()=>{packImg=im;ok();};im.onerror=fail;im.src='img/packs25.png';});}
const PXS=1.15/16; // unidades del mundo por píxel de sprite a 16 px
// Cada estilo declara su resolución: 16 px (packs y pixel a mano), 32 px (exportado del dibujo) o suave.
const STYLE_RES={packs:16,pixel:16,pixel32:32,drawn:0};
/* Pixelado: toma arte dibujado en alta resolución y lo exporta a pocos píxeles.
   Es la idea para el editor: se dibuja una vez y se saca a 16 o 32 px sin redibujar. */
function pixelize(src,w,h,shade){
  const c=mkCanvas(w,h),x=c.getContext('2d');
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  x.drawImage(src,0,0,w,h);
  const img=x.getImageData(0,0,w,h),d=img.data;
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]<120){d[i]=d[i+1]=d[i+2]=d[i+3]=0;continue;}
    d[i+3]=255;
    for(let k=0;k<3;k++){const v=d[i+k]/255;d[i+k]=Math.round(Math.pow(Math.round(Math.pow(v,.8)*9)/9,1.25)*255);}
  }
  x.putImageData(img,0,0);
  if(shade)pxOutline(x,w,h);
  return c;
}
function upscale(src,k){const c=mkCanvas(src.width*k,src.height*k),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(src,0,0,c.width,c.height);return c;}
function sheetFrom(frames,fw,fh){const c=mkCanvas(fw*frames.length,fh),x=c.getContext('2d');frames.forEach((f,k)=>x.drawImage(f,k*fw,0));return c;}
function packSheet(group){
  const fr=PACK_MAP[group],fw=Math.max(...fr.map(f=>f[2])),fh=Math.max(...fr.map(f=>f[3]));
  const c=mkCanvas(fw*fr.length,fh),x=c.getContext('2d');
  fr.forEach((f,k)=>x.drawImage(packImg,f[0],f[1],f[2],f[3],k*fw+Math.floor((fw-f[2])/2),fh-f[3],f[2],f[3]));
  return{sheet:c,fw,fh,n:fr.length};
}
const CHAR_INFO={
  guerrera:{name:'Guerrera',pack:'knight_f'},mago:{name:'Mago',pack:'wizzard_m'},arquera:{name:'Arquera',pack:'elf_f'},
  enana:{name:'Enana',pack:'dwarf_f'},goblin:{name:'Goblin',pack:'goblin'},esqueleto:{name:'Esqueleto',pack:'skelet'},
  demonio:{name:'Demonio',pack:'big_demon'},nigromante:{name:'Nigromante',pack:'necromancer'},
  fantasma:{name:'Fantasma',pack:'k_ghost',float:.35},murcielago:{name:'Murciélago',pack:'k_bat',float:.9},
  arana:{name:'Araña',pack:'k_spider'},rata:{name:'Rata',pack:'k_rat'},
};
const DRAWN_KINDS=['guerrera','mago','arquera','goblin','esqueleto'];
// fixed: no gira hacia la cámara · mount: se puede colgar en una pared · mountOnly: solo en pared
// mw/my: ancho y altura (sobre el suelo) cuando va colgado · door: se abre y se cierra
const OBJ_KINDS={
  arbol:{name:'Árbol',tree:0,move:1,sight:1},pino:{name:'Pino',tree:1,move:1,sight:1},
  columna:{name:'Columna',pack:'column',move:1,sight:1},
  puerta:{name:'Puerta',pack:'door',move:1,sight:1,fixed:1,door:1,size:1.5},
  valla:{name:'Valla',pack:'fence',move:1,fixed:1},
  barril:{name:'Barril',pack:'barrel',move:1},barrilx:{name:'Barril explosivo',pack:'barrel',move:1,explosive:'media',tint:'rgba(255,70,40,.5)'},caja:{name:'Caja',pack:'crate',move:1},
  cofre:{name:'Cofre',pack:'chest',move:1},baul:{name:'Baúl',pack:'kchest',move:1},
  mesa:{name:'Mesa',pack:'table',move:1},taburete:{name:'Taburete',pack:'stool',move:0},
  estante:{name:'Estante',pack:'shelf',move:1,fixed:1},
  lapida:{name:'Lápida',pack:'tomb',move:1,fixed:1},cruz:{name:'Cruz',pack:'cross',move:1,fixed:1},
  estandarte:{name:'Estandarte rojo',pack:'banner_red',move:1,fixed:1,mount:1,mw:.95,my:.55},
  estandarte2:{name:'Estandarte azul',pack:'banner_blue',move:1,fixed:1,mount:1,mw:.95,my:.55},
  fuente:{name:'Fuente de pared',pack:'fountain',mountOnly:1,mw:1,my:.02},
  grieta:{name:'Pared rota',pack:'hole',mountOnly:1,mw:1,my:.02},
  limo:{name:'Limo en la pared',pack:'goo',mountOnly:1,mw:1,my:.45},
  craneo:{name:'Cráneo',pack:'skull',move:0},pocion:{name:'Poción',pack:'flask',move:0},
  pinchos:{name:'Trampa de pinchos',pack:'spikes',move:0,flat:1},
};
function packAtlas(){
  const c=pixelAtlas(),x=c.getContext('2d'),T=16;
  const put=(id,group,dark)=>{const f=PACK_MAP[group][0],x0=(id%AC)*T,y0=Math.floor(id/AC)*T;
    x.clearRect(x0,y0,T,T);x.drawImage(packImg,f[0],f[1],f[2],f[3],x0,y0+T-f[3],T,f[3]);
    if(dark){x.fillStyle='rgba(8,6,10,'+dark+')';x.fillRect(x0,y0,T,T);}};
  put(TL.floorTop,'t:floor');put(TL.stoneSide,'t:wall');put(TL.stoneTop,'t:wall',.12);put(TL.deep,'t:wall',.42);
  put(TL.cutTop,'t:wall',.5);
  {const f=PACK_MAP['t:walltop'][0],x0=(TL.cutTop%AC)*T,y0=Math.floor(TL.cutTop/AC)*T;x.drawImage(packImg,f[0],f[1],f[2],f[3],x0,y0+16-f[3],16,f[3]);}
  put(TL.dirt,'t:k_dirt');put(TL.sandTop,'t:k_sand');put(TL.sandSide,'t:k_sandedge');put(TL.pathTop,'t:k_sandpeb');
  // lado del pasto: tierra de Kenney con la franja de pasto del pixel art
  {const g=pixelAtlas(),x0=(TL.grassSide%AC)*T,y0=Math.floor(TL.grassSide/AC)*T,f=PACK_MAP['t:k_dirt'][0];
   x.drawImage(packImg,f[0],f[1],16,16,x0,y0,16,16);x.drawImage(g,x0,y0,16,5,x0,y0,16,5);}
  return c;
}
function charArtFor(kind,style){
  const info=CHAR_INFO[kind];
  if(style==='pixel32'){
    if(DRAWN_KINDS.includes(kind)){
      const fr=[0,1].map(f=>pixelize(drawnFigure(kind,f),32,48,false));
      return{sheet:sheetFrom(fr,32,48),fw:32,fh:48,n:2,idle:[0,1],run:[0,1],w:1.15,h:1.725,px:true};
    }
    const ps=packSheet('c:'+info.pack),idle=ps.n>=4?[0,1,2,3]:[0],run=ps.n>=8?[4,5,6,7]:idle;
    return{sheet:upscale(ps.sheet,2),fw:ps.fw*2,fh:ps.fh*2,n:ps.n,idle,run,w:ps.fw*PXS,h:ps.fh*PXS,px:true};
  }
  if(style!=='packs'&&DRAWN_KINDS.includes(kind)){
    const px=style==='pixel',s=px?mkCanvas(32,24):mkCanvas(256,192),sx=s.getContext('2d'),fw=px?16:128;
    for(let f=0;f<2;f++)sx.drawImage(px?pixelFigure(kind,f):drawnFigure(kind,f),f*fw,0);
    return{sheet:s,fw,fh:px?24:192,n:2,idle:[0,1],run:[0,1],w:1.15,h:1.72,px};
  }
  const ps=packSheet('c:'+info.pack);
  const idle=ps.n>=4?[0,1,2,3]:[0],run=ps.n>=8?[4,5,6,7]:idle;
  return{sheet:ps.sheet,fw:ps.fw,fh:ps.fh,n:ps.n,idle,run,w:ps.fw*PXS,h:ps.fh*PXS,px:true};
}
function objArtFor(kind,style){
  const o=OBJ_KINDS[kind];
  if(o.tree!=null){
    const c=style==='drawn'?drawnTree(o.tree):style==='pixel32'?pixelize(drawnTree(o.tree),64,80,false):pixelTree(o.tree);
    return{sheet:c,n:1,w:1.8,h:2.25,px:style!=='drawn'};
  }
  const ps=packSheet('p:'+o.pack);
  if(o.tint){const x=ps.sheet.getContext('2d');x.globalCompositeOperation='source-atop';x.fillStyle=o.tint;x.fillRect(0,0,ps.sheet.width,ps.sheet.height);x.globalCompositeOperation='source-over';}
  if(style==='pixel32')ps.sheet=upscale(ps.sheet,2);
  const w=o.size||ps.fw*PXS,h=o.size?o.size*ps.fh/ps.fw:ps.fh*PXS;
  return{sheet:ps.sheet,n:ps.n,w,h,px:true,mw:o.mw||.8,mh:(o.mw||.8)*ps.fh/ps.fw};
}
function buildArt(style){
  const px=style!=='drawn',p32=style==='pixel32';
  const chars={};Object.keys(CHAR_INFO).forEach(k=>{if(!CHAR_INFO[k].custom)chars[k]=charArtFor(k,style);});
  const objs={};Object.keys(OBJ_KINDS).forEach(k=>{if(!OBJ_KINDS[k].custom)objs[k]=objArtFor(k,style);});
  const props={};PROP_KINDS.forEach(k=>{props[k]=p32?pixelize(drawnProp(k),48,48,false):px?pixelProp(k):drawnProp(k);});
  return{
    style,pixel:px,res:STYLE_RES[style],
    atlas:style==='packs'?packAtlas():p32?pixelize(drawnAtlas(),32*AC,32*AC,false):px?pixelAtlas():drawnAtlas(),
    water:px?pixelWater():drawnWater(),
    chars,objs,props,
    tuft:p32?pixelize(drawnTuft(),16,16,false):px?pixelTuft():drawnTuft(),
  };
}

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

/* ---------- terreno ---------- */
const MATS=[
  {name:'Pasto',top:TL.grassTop,side:TL.grassSide,fill:TL.dirt,swatch:'#6aab45'},
  {name:'Piedra',top:TL.stoneTop,side:TL.stoneSide,fill:TL.deep,swatch:'#8b8f94'},
  {name:'Arena',top:TL.sandTop,side:TL.sandSide,fill:TL.sandSide,swatch:'#e2cf8f'},
  {name:'Camino',top:TL.pathTop,side:TL.dirt,fill:TL.dirt,swatch:'#a88b62'},
  {name:'Losas',top:TL.floorTop,side:TL.stoneSide,fill:TL.deep,swatch:'#61656c'},
  {name:'Corte',top:TL.cutTop,side:TL.stoneSide,fill:TL.deep,swatch:'#2f3237',hidden:true},
  {name:'Quemado',top:TL.dirt,side:TL.dirt,fill:TL.deep,swatch:'#3b2f28',scorch:true},
];
const CUT=5;
const FACES=['top','side','fill'];
const slotOf=(mi,f)=>16+mi*3+FACES.indexOf(f);

/* ---------- arte y texturas ---------- */
/* ---------- arte propio: piezas subidas por el usuario ---------- */
// En JA-VTT no hay arte propio todavía: CUSTOM queda vacío y applyCustom deja el atlas base.
const CUSTOM={tiles:{},chars:{},objs:{},newObjs:{},newChars:{}};
// un solo lienzo con los cuadros en fila, alineados abajo
function sheetOf(frames){
  const fw=Math.max(...frames.map(f=>f.width)),fh=Math.max(...frames.map(f=>f.height));
  const c=mkCanvas(fw*frames.length,fh),x=c.getContext('2d');
  frames.forEach((f,k)=>x.drawImage(f,k*fw+Math.floor((fw-f.width)/2),fh-f.height));
  return{sheet:c,fw,fh,n:frames.length};
}
const isPixelSize=fw=>fw<=64;
function customCharArt(k){
  const c=CUSTOM.chars[k],idle=c.idle||c.run,run=c.run||c.idle;
  const frames=idle.frames.concat(run===idle?[]:run.frames);
  const sh=sheetOf(frames),sc=1.15/(idle.ppc||idle.fw);
  const idleIdx=idle.frames.map((_,i)=>i),runIdx=run===idle?idleIdx:run.frames.map((_,i)=>idle.frames.length+i);
  return{sheet:sh.sheet,fw:sh.fw,fh:sh.fh,n:sh.n,idle:idleIdx,run:runIdx,w:sh.fw*sc,h:sh.fh*sc,px:isPixelSize(sh.fw)};
}
function customObjArt(k){
  const c=CUSTOM.objs[k],K=OBJ_KINDS[k];
  let frames=c.frames.slice();
  if(K.door&&frames.length<2)frames=[frames[0],frames[0]];
  const sh=sheetOf(frames),sc=1.15/(c.ppc||c.fw);
  const w=K.size||sh.fw*sc,h=K.size?K.size*sh.fh/sh.fw:sh.fh*sc,mw=K.mw||.8;
  return{sheet:sh.sheet,n:sh.n,w,h,px:isPixelSize(sh.fw),mw,mh:mw*sh.fh/sh.fw};
}
function applyCustom(base){
  const a=Object.assign({},base);
  const T=base.atlas.width/AC;
  const at=mkCanvas(base.atlas.width,base.atlas.height),x=at.getContext('2d');
  x.drawImage(base.atlas,0,0);
  x.imageSmoothingEnabled=!base.pixel;
  MATS.forEach((m,mi)=>FACES.forEach(f=>{
    const slot=slotOf(mi,f),dx=(slot%AC)*T,dy=Math.floor(slot/AC)*T,src=m[f];
    x.clearRect(dx,dy,T,T);
    const cu=CUSTOM.tiles[mi+':'+f];
    if(cu)x.drawImage(cu.frames[0],0,0,cu.fw,cu.fh,dx,dy,T,T);
    else{
      x.drawImage(base.atlas,(src%AC)*T,Math.floor(src/AC)*T,T,T,dx,dy,T,T);
      if(m.scorch){
        // suelo quemado: tierra oscurecida con ceniza y brasas
        x.fillStyle='rgba(18,12,9,.64)';x.fillRect(dx,dy,T,T);
        const r=rng(97+mi*7+FACES.indexOf(f)),px=Math.max(1,T/16);
        for(let k=0;k<T*T/40;k++){x.fillStyle=r()<.8?'rgba(70,64,60,.8)':'rgba(190,80,30,.85)';x.fillRect(dx+Math.floor(r()*16)*px,dy+Math.floor(r()*16)*px,px,px);}
      }
    }
  }));
  a.atlas=at;
  a.chars=Object.assign({},base.chars);
  Object.keys(CUSTOM.chars).forEach(k=>{if(CHAR_INFO[k])a.chars[k]=customCharArt(k);});
  a.objs=Object.assign({},base.objs);
  Object.keys(CUSTOM.objs).forEach(k=>{if(OBJ_KINDS[k])a.objs[k]=customObjArt(k);});
  return a;
}
const ART={},BASE={};let art=null,TEX=null;
function toTex(c,px,repeat){
  const t=new T3.CanvasTexture(c);
  if(px){t.magFilter=T3.NearestFilter;t.minFilter=T3.NearestFilter;t.generateMipmaps=false;}
  else{t.magFilter=T3.LinearFilter;t.minFilter=T3.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  if(repeat){t.wrapS=t.wrapT=T3.RepeatWrapping;}
  return t;
}
function disposeTex(){
  if(!TEX)return;
  [TEX.atlas,TEX.water,TEX.tuft].forEach(t=>t&&t.dispose());
  [TEX.props,TEX.chars,TEX.objs].forEach(g=>Object.values(g).forEach(t=>t.dispose()));
}
function loadStyle(key){
  if(!BASE[key])BASE[key]=buildArt(key);
  if(!ART[key])ART[key]=applyCustom(BASE[key]);
  disposeTex();
  art=ART[key];const px=art.pixel;
  const props={};PROP_KINDS.forEach(k=>{const t=toTex(art.props[k],px);t.repeat.set(.5,1);props[k]=t;});
  const chars={};Object.entries(art.chars).forEach(([k,a])=>{chars[k]=toTex(a.sheet,a.px);});
  const objs={};Object.entries(art.objs).forEach(([k,a])=>{const t=toTex(a.sheet,a.px);t.repeat.set(1/a.n,1);objs[k]=t;});
  TEX={atlas:toTex(art.atlas,px),water:toTex(art.water,px,true),props,chars,objs,tuft:toTex(art.tuft,px)};
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
  if(a.t==='char'){const ca=art.chars[a.k],t=TEX.chars[a.k].clone();t.needsUpdate=true;t.repeat.set(1/ca.n,1);return t;}
  if(a.t==='obj')return TEX.objs[a.k];
  if(a.t==='tuft')return TEX.tuft;
  return TEX.props[a.k];
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
  tuftMat=spriteMaterial(TEX.tuft);
  objMats={};Object.keys(OBJ_KINDS).forEach(k=>{objMats[k]=spriteMaterial(TEX.objs[k]);});
}
function restyle(key){
  loadStyle(key);
  terrainMat.map=TEX.atlas;terrainMat.needsUpdate=true;
  WU.uPix.value=art.res;
  const done=new Set();
  [decor,charsGroup,propGroup].forEach(g=>g.children.forEach(mesh=>{
    const a=mesh.userData.art;
    const tex=a.t==='obj'&&OBJ_KINDS[a.k].door?doorTex(objs.get(mesh.userData.cell)):texFor(a);
    mesh.userData.tex=tex;
    if(!done.has(mesh.material)){mesh.material.map=tex;mesh.material.emissiveMap=tex;mesh.material.needsUpdate=true;done.add(mesh.material);}
    mesh.customDepthMaterial.map=tex;mesh.customDepthMaterial.needsUpdate=true;
    let dims=null;
    if(a.t==='char'){const c=mesh.userData.char;c.tex=tex;c.art=art.chars[a.k];dims=c.art;c.fi=0;setFrame(c);}
    else if(a.t==='obj')dims=art.objs[a.k];
    if(mesh.userData.mount){mesh.geometry.dispose();mesh.geometry=mountGeo(a.k);}
    else if(dims){mesh.geometry.dispose();mesh.geometry=(a.t==='obj'&&OBJ_KINDS[a.k].flat)?flatGeo(dims.w,dims.h):spriteGeo(dims.w,dims.h);}
  }));
  Object.entries(objMats).forEach(([k,m])=>{const t=TEX.objs[k];if(t){m.map=t;m.emissiveMap=t;m.needsUpdate=true;}});
  if(tuftMat){tuftMat.map=TEX.tuft;tuftMat.emissiveMap=TEX.tuft;tuftMat.needsUpdate=true;}
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
function doorTex(o){const t=TEX.objs.puerta.clone();t.needsUpdate=true;t.repeat.set(.5,1);t.offset.x=o&&o.open?.5:0;return t;}
function addObj(i,kind,rot){
  const K=OBJ_KINDS[kind],a=art.objs[kind],flat=!!K.flat,fixed=!!K.fixed;
  const tex=K.door?doorTex():TEX.objs[kind];
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
function mountGeo(kind){const a=art.objs[kind];return spriteGeo(a.mw,a.mh);}
function addMount(wall,d,kind){
  if(!mountValid(wall,d))return false;
  const key=mountKey(wall,d);if(mounts.has(key))removeMount(key);
  const m=new T3.Mesh(mountGeo(kind),objMats[kind]);
  m.castShadow=false;m.customDepthMaterial=depthMat(TEX.objs[kind]);
  m.rotation.set(0,Math.atan2(DIRS[d][0],DIRS[d][1]),0);
  m.userData={art:{t:'obj',k:kind},tex:TEX.objs[kind],fixed:true,mount:key};
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
  const ca=art.chars[s.kind];
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
  mounts.forEach(o=>{const a=art.objs[o.kind];placeOnWall(o.mesh,o.wall,o.dir,OBJ_KINDS[o.kind].my||.7,a.mh);});
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
  PROP_KINDS.forEach(kk=>{TEX.props[kk].offset.x=kk==='orb'||kk==='crystal'?(Math.floor(s*1.5)%2)*.5:fr;});
  Object.entries(art.objs).forEach(([kk,a])=>{if(a.n>1)TEX.objs[kk].offset.x=(Math.floor(s*1.3)%a.n)/a.n;});

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
