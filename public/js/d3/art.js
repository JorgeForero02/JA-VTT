/* Arte 2.5D de JA-VTT: atlas, estilos y texturas. Módulo puro de canvas; THREE sólo para toTex. */
import * as THREE from '../vendor/three.module.min.js';
import { PACK_MAP } from './packmap.js';
import { R } from './ctx.js';
const T3 = THREE;

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
export const ART={art:null,TEX:null,styleKey:'packs'}; const BASE={}; const STYLE_CACHE={};
function toTex(c,px,repeat){
  const t=new T3.CanvasTexture(c);
  if(px){t.magFilter=T3.NearestFilter;t.minFilter=T3.NearestFilter;t.generateMipmaps=false;}
  else{t.magFilter=T3.LinearFilter;t.minFilter=T3.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(8,R.renderer?R.renderer.capabilities.getMaxAnisotropy():1);}
  if(repeat){t.wrapS=t.wrapT=T3.RepeatWrapping;}
  return t;
}
function disposeTex(){
  if(!ART.TEX)return;
  [ART.TEX.atlas,ART.TEX.water,ART.TEX.tuft].forEach(t=>t&&t.dispose());
  [ART.TEX.props,ART.TEX.chars,ART.TEX.objs].forEach(g=>Object.values(g).forEach(t=>t.dispose()));
}
export function loadStyle(key){
  if(!BASE[key])BASE[key]=buildArt(key);
  if(!STYLE_CACHE[key])STYLE_CACHE[key]=applyCustom(BASE[key]);
  disposeTex();
  ART.art=STYLE_CACHE[key];const px=ART.art.pixel;
  const props={};PROP_KINDS.forEach(k=>{const t=toTex(ART.art.props[k],px);t.repeat.set(.5,1);props[k]=t;});
  const chars={};Object.entries(ART.art.chars).forEach(([k,a])=>{chars[k]=toTex(a.sheet,a.px);});
  const objs={};Object.entries(ART.art.objs).forEach(([k,a])=>{const t=toTex(a.sheet,a.px);t.repeat.set(1/a.n,1);objs[k]=t;});
  ART.TEX={atlas:toTex(ART.art.atlas,px),water:toTex(ART.art.water,px,true),props,chars,objs,tuft:toTex(ART.art.tuft,px)};
}
export { mkCanvas, rng, pick, hexRgb, TL, AC, PROP_KINDS, CHAR_INFO, OBJ_KINDS, DRAWN_KINDS, STYLE_RES, PXS, MATS, FACES, slotOf, CUSTOM, loadPacks, toTex, disposeTex };
