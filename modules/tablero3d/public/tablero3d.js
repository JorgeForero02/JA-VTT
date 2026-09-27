(function(){
'use strict';
/* Motor del tablero 3D: escenas, editor de dibujo, partida, campañas y mesa en vivo.
   Lo arranca Tablero3D.mount (t3d.js) cuando el marcado del módulo ya está en la página:
   ctx = { root, mesa, icon(name), reveal(sub), $(id) }. Todo vive dentro de _engine: ningún global.
   Devuelve { destroy }, que para el bucle, quita las escuchas de ventana y suelta WebGL. */
const T3D=window.Tablero3D=window.Tablero3D||{};
T3D._engine=function(ctx){
const ROOT=ctx.root, $=ctx.$, Vision=T3D.Vision, Fichas=T3D.Fichas, Muros=T3D.Muros, Personajes=T3D.Personajes, Ambiente=T3D.Ambiente, Ajustes=T3D.Ajustes, Dados=T3D.Dados, Catalogo=T3D.Catalogo;
const {mulberry32,hash,pick,hexRGB}=T3D.Base; const {WARM,HEX6,LIGHT_TYPES,LIGHT_IDS,OBJ_LIGHT_IDS,LIGHT_ANIMS,TOKEN_LIGHTS,normLight,lightOfType,lightName,lightRGB}=T3D.Luces;
const {G,D,S,B,W,SA,WA,SL,TH,SH,CU,Grgb,Drgb,Srgb,PROP3D}=T3D.Objetos3D;
const Escena=T3D.Escena.make({Catalogo,Muros,Ambiente,Ajustes}); const {ROOF_MAT_IDS,ROOF_SHAPE_IDS,normRoof,sceneExtras}=Escena;
/* escuchas de ventana, temporizadores y observadores que hay que soltar al desmontar */
const offs=[]; let stopped=false;
function on(t,ev,fn,o){ t.addEventListener(ev,fn,o); offs.push(()=>t.removeEventListener(ev,fn,o)); }
function every(fn,ms){ const h=setInterval(fn,ms); offs.push(()=>clearInterval(h)); }
function observe(el,fn){ if(!window.ResizeObserver||!el) return; const ro=new ResizeObserver(fn); ro.observe(el); offs.push(()=>ro.disconnect()); }
if (typeof THREE === 'undefined') { failMsg('No se pudo cargar el motor 3D. Revisa la conexión y recarga la página.'); return null; }

/* ============ constantes ============ */
let TEX = 32;
const STEP = 0.5, CH = 16, EDGE = -2;
let ELEV = 30 * Math.PI / 180, COS_E = Math.cos(ELEV), SIN_E = Math.sin(ELEV);   // variable: la vista alta la sube a 60°
const HALF_PI = Math.PI / 2;
const DIR4 = [[1,0],[-1,0],[0,1],[0,-1]];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// animar llamas, pulsos, agua y la respiración de las fichas: el ajuste de escena `animate` de JA-VTT y, siempre, el movimiento reducido
const animOn=()=>!reduceMotion&&!(M&&M.animate===false);
function failMsg(t){ const d=document.createElement('div'); d.className='t3d-fail'; d.textContent=t; ROOT.appendChild(d); }

/* ============ utilidades ============ */
function mkCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d',{willReadFrequently:true}); return c; }
function R(ctx,x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }
function outline(c,col){
  const ctx=c.getContext('2d'); const W=c.width,H=c.height;
  const d=ctx.getImageData(0,0,W,H).data;
  const op=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&d[(y*W+x)*4+3]>128;
  ctx.fillStyle=col;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(!op(x,y)&&(op(x-1,y)||op(x+1,y)||op(x,y-1)||op(x,y+1))) ctx.fillRect(x,y,1,1);
  return c;
}
function mirror(c){ const m=mkCanvas(c.width,c.height), x=m.getContext('2d'); x.translate(c.width,0); x.scale(-1,1); x.drawImage(c,0,0); return m; }
function tex(c){ const t=new THREE.CanvasTexture(c); t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter; t.generateMipmaps=false; return t; }
const BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

/* ============ paleta con cambio de tono (sombras frías, luces cálidas) ============ */
const FL=['#d9495f','#f2d15b','#ece6f5','#9a7fd6'];
const INK='#161222';
// rampas de la paleta del editor que no pinta el atlas (rojo, piel, gris, púrpura, verde azulado); también las usan los personajes
const EXTRA_RAMPS=[['#3b1f2b','#6b2f3a','#a33b3b','#d9574a','#f08a5d','#ffc48c'],['#2b1d0e','#5c3a1e','#94603a','#c98d5a','#ecc39a','#f6dcc0'],
  ['#000000','#1e1b24','#3d3945','#6b6675','#a8a3b0','#e0dde6','#ffffff'],['#2a1f3d','#453266','#6b4a99','#9a7fd6','#c7b5ef'],['#1d3b3a','#2d6b5e','#4aa386','#86d4a8','#c9f2cf']];

/* ============ atlas de casillas 16×4 ============ */
const AC=16, AR=4;
const atlas=mkCanvas(16*AC,16*AR), ac=atlas.getContext('2d');
function paint(index,seed,fn){
  const ox=(index%AC)*16, oy=Math.floor(index/AC)*16, rng=mulberry32(seed);
  const P=(x,y,c)=>{ ac.fillStyle=c; ac.fillRect(ox+(((x|0)%16)+16)%16, oy+(((y|0)%16)+16)%16,1,1); };
  const F=c=>{ ac.fillStyle=c; ac.fillRect(ox,oy,16,16); };
  fn(P,F,rng,()=>rng()*16|0);
}
// hierba (0,1,2)
const grassTop=(flowers)=>(P,F,r,n)=>{
  F(G[2]);
  for(let i=0;i<46;i++)P(n(),n(),G[1]);
  for(let i=0;i<24;i++){ const x=n(),y=n(); P(x,y,G[3]); P(x,y-1,G[4]); }
  for(let i=0;i<7;i++)P(n(),n(),G[5]);
  if(flowers) for(let k=0;k<5;k++){ const x=n(),y=n(); P(x,y,FL[k%3]); P(x,y+1,G[1]); }
};
paint(0,11,grassTop(false)); paint(1,12,grassTop(false)); paint(2,13,grassTop(true));
// losas de piedra (3,4)
const flag=(cracked)=>(P,F,r,n)=>{
  F(S[3]);
  const stones=[[0,0,8,8],[8,0,8,8],[4,8,8,8],[12,8,8,8]];
  for(const [x0,y0,w,h] of stones){
    const tone=r()<0.3?S[2]:S[3];
    for(let j=0;j<h;j++)for(let i=0;i<w;i++)P(x0+i,y0+j,tone);
    for(let i=0;i<w-1;i++){ P(x0+i,y0,S[4]); P(x0+i,y0+h-2,S[2]); }
    for(let j=0;j<h-1;j++){ P(x0,y0+j,S[4]); P(x0+w-2,y0+j,S[2]); }
    for(let i=0;i<w;i++)P(x0+i,y0+h-1,S[1]);
    for(let j=0;j<h;j++)P(x0+w-1,y0+j,S[1]);
    for(let k=0;k<3;k++)P(x0+1+(r()*(w-3)|0),y0+1+(r()*(h-3)|0),r()<.5?S[2]:S[5]);
  }
  if(cracked){ let x=n(),y=n(); for(let i=0;i<7;i++){ P(x,y,S[1]); x+=r()<.5?1:0; y+=1; } for(let i=0;i<6;i++){ const x2=n(); P(x2,7,G[1]); P(x2,15,G[2]); } }
};
paint(3,21,flag(false)); paint(4,22,flag(true));
// camino (5,6)
const path=(rich)=>(P,F,r,n)=>{
  F(D[3]);
  for(let i=0;i<55;i++)P(n(),n(),r()<.5?D[2]:D[4]);
  for(let i=0;i<(rich?12:7);i++){ const x=n(),y=n(); P(x,y,S[4]); P(x+1,y,S[3]); P(x,y+1,S[2]); P(x+1,y+1,D[1]); }
  if(rich) for(let k=0;k<5;k++){ const x=n(),y=n(); P(x,y,D[2]); P(x+1,y,D[2]); P(x,y-1,D[4]); }
};
paint(5,31,path(false)); paint(6,32,path(true));
// arena (7,8)
const sand=(shells)=>(P,F,r,n)=>{
  F(SA[2]);
  for(let i=0;i<55;i++)P(n(),n(),r()<.2?SA[1]:SA[3]);
  for(let k=0;k<6;k++){ const x=n(),y=n(),len=2+(r()*3|0); for(let i=0;i<len;i++){ P(x+i,y,SA[3]); if(i>0&&i<len-1)P(x+i,y+1,SA[2]); } }
  if(shells) for(let k=0;k<3;k++){ const x=n(),y=n(); P(x,y,SA[4]); P(x+1,y,FL[2]); }
};
paint(7,41,sand(false)); paint(8,42,sand(true));
// tablones (9,10)
const planks=(shift)=>(P,F,r,n)=>{
  for(let p=0;p<4;p++){
    const base=(p+shift)%3===0?W[2]:W[3];
    for(let y=p*4;y<p*4+4;y++)for(let x=0;x<16;x++)P(x,y,base);
    for(let x=0;x<16;x++){ P(x,p*4,W[4]); P(x,p*4+3,W[0]); }
    for(let i=0;i<6;i++)P(n(),p*4+1+(r()*2|0),W[1]);
    const seam=(p*5+3+shift*4)%16;
    for(let y=p*4;y<p*4+3;y++)P(seam,y,W[0]);
    P(seam+1,p*4+1,W[5]); P(seam-2,p*4+1,W[5]);
  }
};
paint(9,51,planks(0)); paint(10,52,planks(1));
// cima de muro (11,12)
const wallTop=(moss)=>(P,F,r,n)=>{
  F(S[2]);
  for(let i=0;i<70;i++)P(n(),n(),r()<.5?S[1]:S[3]);
  for(let i=0;i<16;i++){ P(i,0,S[3]); P(0,i,S[3]); P(i,15,S[1]); P(15,i,S[1]); }
  if(moss) for(let k=0;k<5;k++){ const x=n(),y=n(); for(let j=0;j<5;j++)P(x+(r()*3|0),y+(r()*3|0),j%2?G[2]:G[1]); }
};
paint(11,61,wallTop(false)); paint(12,62,wallTop(true));
// agua, 4 cuadros contiguos (16..19)
for(let f=0;f<4;f++) paint(16+f,101,(P,F,r,n)=>{
  F(WA[2]);
  for(let i=0;i<40;i++)P(n(),n(),WA[1]);
  for(let k=0;k<7;k++){ const x0=n(),y0=n(),len=2+(r()*3|0),dir=k%2?1:-1,x=x0+dir*f*4;
    for(let i=0;i<len;i++)P(x+i,y0,WA[3]); P(x+len,y0,WA[4]); }
  for(let k=0;k<3;k++){ const x=n(),y=n(); if((k+f)%2===0)P(x,y,WA[5]); }
});
// lateral de hierba (20), tierra (21)
const dirtSide=(P,F,r,n)=>{
  F(D[2]);
  for(let i=0;i<60;i++)P(n(),n(),r()<.5?D[1]:D[3]);
  for(let k=0;k<4;k++){ const x=n(),y=n(); P(x,y,S[3]); P(x+1,y,S[2]); P(x,y+1,D[1]); }
};
paint(20,71,(P,F,r,n)=>{ dirtSide(P,F,r,n);
  for(let x=0;x<16;x++){ const len=3+(r()*3|0); for(let y=0;y<len;y++)P(x,y,y===0?G[4]:(y===len-1?G[1]:(y<2?G[3]:G[2]))); if(r()<.25)P(x,len,G[1]); } });
paint(21,72,dirtSide);
// ladrillo (22 base, 23 musgo, 24 grieta)
const brick=(variant)=>(P,F,r,n)=>{
  F(B[3]);
  for(let row=0;row<4;row++){
    const y0=row*4, off=row%2?4:0;
    for(let k=0;k<2;k++){
      const bx=off+k*8, tone=r()<.3?B[2]:B[3];
      for(let j=0;j<3;j++)for(let i=0;i<7;i++)P(bx+i,y0+j,tone);
      for(let i=0;i<7;i++){ P(bx+i,y0,B[4]); P(bx+i,y0+2,B[2]); }
      if(r()<.5)P(bx+1+(r()*5|0),y0+1,B[5]);
      for(let j=0;j<4;j++)P(bx+7,y0+j,B[1]);
    }
    for(let x=0;x<16;x++)P(x,y0+3,B[1]);
  }
  if(variant===1) for(let x=0;x<16;x++){ const len=1+(r()*(x%5===0?6:3)|0); for(let y=0;y<len;y++)P(x,y,y===len-1?G[1]:(y===0?G[3]:G[2])); }
  if(variant===2){ let x=n(),y=0; for(let i=0;i<12;i++){ P(x,y,B[0]); P(x+1,y,B[1]); y++; if(r()<.4)x+=r()<.5?1:-1; } const cx=n(),cy=n(); for(let j=0;j<2;j++)for(let i=0;i<3;i++)P(cx+i,cy+j,B[1]); }
};
paint(22,81,brick(0)); paint(23,82,brick(1)); paint(24,83,brick(2));
// lateral de tarima (25)
paint(25,91,(P,F,r,n)=>{
  for(let p=0;p<4;p++){ const x0=p*4; for(let y=0;y<16;y++){ P(x0,y,W[4]); P(x0+1,y,W[3]); P(x0+2,y,W[2]); P(x0+3,y,W[0]); } }
  for(let x=0;x<16;x++){ P(x,0,W[5]); P(x,7,W[1]); P(x,8,W[4]); P(x,15,W[1]); }
});
// bordes de transición (fila 2): hierba 32, arena 33, camino 34, espuma 35
paint(32,111,(P,F,r)=>{ for(let x=0;x<16;x++){ const len=2+(r()*3|0)+(x%4===1?2:0); for(let y=0;y<len;y++)P(x,y,y===0?G[3]:(y===len-1&&r()<.5?G[2]:(r()<.3?G[4]:G[2]))); } });
paint(33,112,(P,F,r)=>{ for(let x=0;x<16;x++){ const len=1+(r()*3|0); for(let y=0;y<len;y++)P(x,y,y===len-1&&r()<.4?SA[3]:SA[2]); } });
paint(34,113,(P,F,r)=>{ for(let x=0;x<16;x++){ const len=1+(r()*3|0); for(let y=0;y<len;y++)P(x,y,y===len-1&&r()<.4?D[4]:D[3]); } });
paint(35,114,(P,F,r)=>{ for(let x=0;x<16;x++){ const len=1+(r()*2|0); for(let y=0;y<len;y++)P(x,y,WA[5]); if(r()<.5)P(x,len+1,WA[4]); } });
// espuma animada (44..47): burbujas que se desplazan cuadro a cuadro
for(let f=0;f<4;f++) paint(44+f,131,(P,F,r)=>{ for(let x=0;x<16;x++){ const len=1+((r()*2)|0)+(((x+f)%4===0)?1:0);
  for(let y=0;y<len;y++)P(x,y,WA[5]); const bx=(x+f*3)%16; if(r()<0.35)P(bx,len+1+((f+x)%2),WA[4]); } });
// adoquín (26): piedras redondeadas en hileras desplazadas
paint(26,141,(P,F,r)=>{ F(S[1]); for(let row=0;row<4;row++){ const y0=row*4, off=row%2?2:0;
  for(let k=0;k<4;k++){ const x0=off+k*4, tone=r()<.35?S[2]:S[3];
    for(let yy=0;yy<3;yy++) for(let xx=0;xx<3;xx++) if(!((xx===0||xx===2)&&(yy===0||yy===2)&&r()<.5)) P(x0+xx,y0+yy,tone);
    P(x0+1,y0,S[4]); P(x0,y0+1,S[4]); P(x0+2,y0+2,S[2]); } } });
// tejado (27): tejas de barro en hileras
const RF=['#3b1f2b','#6b2f3a','#a33b3b','#d9574a','#f08a5d'];
paint(27,142,(P,F,r)=>{ F(RF[2]); for(let row=0;row<4;row++){ const y0=row*4, off=row%2?4:0;
  for(let x=0;x<16;x++){ P(x,y0,RF[3]); P(x,y0+3,RF[1]); if(r()<.2) P(x,y0+1,RF[4]); }
  for(let k=0;k<2;k++){ const mx=(off+k*8)%16; for(let y=y0;y<y0+4;y++) P(mx,y,RF[1]); } } });
// más tejados (31, 41, 42, 43): pizarra, paja, tablillas de madera y cobre con verdín. Hacia abajo en el lienzo = hacia el alero.
paint(31,145,(P,F,r)=>{ F(SL[2]); for(let row=0;row<4;row++){ const y0=row*4, off=row%2?2:0;
  for(let k=0;k<4;k++){ const x0=off+k*4, tone=r()<.3?SL[3]:SL[2];
    for(let y=y0+1;y<y0+3;y++) for(let x=0;x<3;x++) P(x0+x,y,tone);
    P(x0,y0,SL[4]); P(x0+1,y0,r()<.5?SL[5]:SL[4]); P(x0+2,y0,tone);
    for(let y=y0;y<y0+3;y++) P(x0+3,y,SL[1]);
    if(r()<.3) P(x0+(r()*3|0),y0+1+(r()*2|0),r()<.5?SL[1]:SL[4]); }
  for(let x=0;x<16;x++) P(x,y0+3,SL[0]); } });
paint(41,146,(P,F,r)=>{ F(TH[3]); const tone=[3,2,3,3,2,3,4,3,2,2,3,3,2,3,3,2];
  for(const y0 of [0,8]) for(let x=0;x<16;x++){ const w=((x+(y0?3:0))%5<2)?0:1, tn=tone[(x+(y0?5:0))%16];
    for(let y=y0;y<y0+6+w;y++) P(x,y,TH[(y-y0)<2&&tn===2?3:tn]); if(r()<.25) P(x,y0+1+(r()*4|0),TH[2]);
    P(x,y0+6+w,(x%3)?TH[4]:TH[5]); P(x,y0+7+w,TH[1]); if(w===0) P(x,y0+8,TH[0]); } });
paint(42,147,(P,F,r)=>{ for(let row=0;row<4;row++){ const y0=row*4, st=row%2?2:0; let x=st;
  while(x<16+st){ const w=2+(r()*3|0), tone=[SH[2],SH[3],SH[3],SH[4]][r()*4|0], worn=r()<.15;
    for(let i=0;i<w;i++) for(let y=y0;y<y0+3;y++) P(x+i,y,worn?SH[1]:tone);
    if(r()<.6) P(x,y0,worn?SH[2]:SH[5]); for(let y=y0;y<y0+4;y++) P(x+w,y,SH[1]); if(r()<.4) P(x+1,y0+1+(r()*2|0),SH[2]); x+=w+1; }
  for(let x=0;x<16;x++) P(x,y0+3,SH[0]); } });
paint(43,148,(P,F,r)=>{ F(CU[2]); for(let i=0;i<50;i++) P(r()*16|0,r()*16|0,r()<.5?CU[3]:CU[1]);
  for(let k=0;k<5;k++){ const x=2+((r()*4|0)*4), y=r()*16|0; for(let j=0;j<3+(r()*3|0);j++) P(x,y+j,CU[4]); }
  for(let x0=0;x0<16;x0+=4) for(let y=0;y<16;y++){ P(x0,y,CU[4]); P(x0+1,y,CU[1]); }
  for(const [y,off] of [[7,0],[15,2]]) for(let x=0;x<16;x++) if(((x+off)%4)>1) P(x,y,CU[1]); });
// materiales de techo: casilla del atlas y clave del arte que la sustituye; formas (ROOF_MAT_IDS, ROOF_SHAPE_IDS y normRoof, en escena.js)
const ROOF_MATS={tile:{name:'Teja roja',slot:27,key:'roof:top',end:'o',mini:'#a33b3b'},slate:{name:'Pizarra',slot:31,key:'roof:slate',end:'w',mini:'#526079'},
  thatch:{name:'Paja',slot:41,key:'roof:thatch',end:'o',mini:'#b38f45'},shingle:{name:'Tablillas de madera',slot:42,key:'roof:shingle',end:'o',mini:'#8f6a4b'},
  copper:{name:'Cobre con verdín',slot:43,key:'roof:copper',end:'w',mini:'#4f9c82'}};
const ROOF_KEY=Object.fromEntries(Object.values(ROOF_MATS).map(m=>[m.key,m.slot]));
const ROOF_SHAPES={gable:'A dos aguas',hip:'A cuatro aguas',flat:'Plano con almenas',cone:'Cónico',shed:'A un agua'};
// nieve (29) y lateral nevado (30)
paint(29,143,(P,F,r,n)=>{ F('#e4ecf6'); for(let i=0;i<40;i++) P(n(),n(),r()<.5?'#c9d6ea':'#f4f8fc'); for(let i=0;i<6;i++) P(n(),n(),'#ffffff'); });
paint(30,144,(P,F,r,n)=>{ F(D[2]); for(let i=0;i<50;i++) P(n(),n(),r()<.5?D[1]:D[3]);
  for(let x=0;x<16;x++){ const len=3+(r()*3|0); for(let y=0;y<len;y++) P(x,y,y===len-1?'#c9d6ea':'#e4ecf6'); } });
// lava (37..40): costra oscura con grietas incandescentes que se mueven
for(let f=0;f<4;f++) paint(37+f,151,(P,F,r,n)=>{ F('#3b1f2b'); for(let i=0;i<40;i++) P(n(),n(),r()<.5?'#6b2f3a':'#2a1c2a');
  for(let k=0;k<6;k++){ let x=n(), y=n(); for(let j=0;j<6;j++){ const c=(j+f)%4; P(x,y,c===0?'#fff0b8':c<2?'#ffc14a':'#f07a2a'); x+=r()<.5?1:0; y+=r()<.6?1:0; } } });
// cascada (36): chorros verticales que se desplazan en el shader
paint(36,121,(P,F,r)=>{ for(let x=0;x<16;x++){ const base=r()<0.3?WA[2]:WA[3]; for(let y=0;y<16;y++)P(x,y,base);
  for(let k=0;k<2;k++){ const y0=(r()*16)|0, len=3+(r()*6|0); for(let y=0;y<len;y++)P(x,y0+y,y===0?WA[5]:WA[4]); } } });

const TERR={
  g:{top:[0,0,1,2],side:[20],low:[21],prio:4,fringe:32},
  a:{top:[7,8],side:[21],low:[21],prio:3,fringe:33},
  p:{top:[5,6],side:[21],low:[21],prio:2,fringe:34},
  s:{top:[3,3,4],side:[22,22,24],low:[22,24],prio:1},
  o:{top:[9,10],side:[25],low:[25],prio:0},
  w:{top:[11,11,12],side:[22,23,24,22],low:[22,22,24],prio:-1},
  '~':{top:[16],side:[21],low:[21],prio:9,anim:1,water:1},
  c:{top:[26],side:[22],low:[22],prio:1.5},
  n:{top:[29],side:[30],low:[21],prio:5},
  l:{top:[37],side:[22],low:[22],prio:0,anim:1,lava:1}
};
function uvc(index,part){
  const EU=0.02/(TEX*AC), EV=0.02/(TEX*AR);
  const col=index%AC, row=(index/AC)|0;
  const u0=col/AC+EU, u1=(col+1)/AC-EU, tT=1-row/AR, tB=1-(row+1)/AR, half=0.5/AR;
  let vT=tT, vB=tB;
  if(part==='top') vB=tT-half; else if(part==='bottom') vT=tT-half;
  return {u0,u1,vT:vT-EV,vB:vB+EV};
}
function edgeUV(u,dir){
  const {u0,u1,vT,vB}=u;
  if(dir===0) return [[u0,vT],[u0,vB],[u1,vB],[u1,vT]];   // norte (-z)
  if(dir===1) return [[u1,vB],[u1,vT],[u0,vT],[u0,vB]];   // sur (+z)
  if(dir===2) return [[u1,vT],[u0,vT],[u0,vB],[u1,vB]];   // oeste (-x)
  return [[u0,vB],[u1,vB],[u1,vT],[u0,vT]];               // este (+x)
}

/* ============ sprites ============ */
function drawTree(seed){
  const c=mkCanvas(24,32), x=c.getContext('2d'), r=mulberry32(seed);
  R(x,10,19,4,12,D[3]); R(x,12,19,2,12,D[2]); R(x,10,19,1,12,D[4]); R(x,9,29,1,2,D[3]); R(x,14,29,1,2,D[2]);
  for(let yy=1;yy<23;yy++)for(let xx=1;xx<23;xx++){
    const dx=(xx-11.5)/10.5, dy=(yy-11.5)/10.5, d=dx*dx+dy*dy;
    if(d>1-r()*0.16) continue;
    const bumps=Math.sin(xx*1.7+seed)*Math.cos(yy*1.3)*0.18;
    const l=(-dx*0.55-dy*0.8)*0.5+0.52+bumps+(r()-0.5)*0.22-d*0.18;
    x.fillStyle=G[Math.max(1,Math.min(5,1+Math.floor(l*5)))]; x.fillRect(xx,yy,1,1);
  }
  return outline(c,'#122018');
}
function drawPine(seed){
  const c=mkCanvas(24,32), x=c.getContext('2d'), r=mulberry32(seed);
  R(x,11,24,3,7,D[3]); R(x,13,24,1,7,D[2]);
  const tiers=[[2,9,4],[8,15,7],[14,23,10]];
  for(const [y0,y1,half] of tiers){
    for(let yy=y0;yy<=y1;yy++){ const w=Math.round(half*(yy-y0+1)/(y1-y0+1))+1;
      for(let xx=12-w;xx<=12+w-1;xx++){ const side=(xx-12)/w; const l=0.55-side*0.35-(yy-y0)/(y1-y0+1)*0.3+(r()-.5)*0.2;
        x.fillStyle=G[Math.max(0,Math.min(4,Math.floor(l*5)))]; x.fillRect(xx,yy,1,1); } }
  }
  R(x,11,1,2,2,G[3]);
  return outline(c,'#0f1b14');
}
function drawBrazier(f){
  const c=mkCanvas(12,18), x=c.getContext('2d');
  R(x,3,13,1,4,S[1]); R(x,8,13,1,4,S[1]); R(x,2,16,8,1,S[1]);
  R(x,1,10,10,3,S[2]); R(x,1,10,10,1,S[4]); R(x,2,12,8,1,S[1]);
  outline(c,INK);
  R(x,2,9,8,1,'#c2412b');
  (f?[2,5,7,4,6,3]:[3,6,5,7,4,2]).forEach((hh,i)=>{ const xx=3+i;
    R(x,xx,9-hh,1,hh,'#f07a2a'); if(hh>2)R(x,xx,11-hh,1,hh-2,'#ffc14a'); if(hh>4)R(x,xx,13-hh,1,hh-4,'#fff0b8'); });
  return c;
}
function drawShadow(){ const c=mkCanvas(16,10), x=c.getContext('2d'); x.fillStyle='rgba(20,10,40,0.42)';
  for(let y=0;y<10;y++)for(let xx=0;xx<16;xx++) if(((xx-7.5)/7.5)**2+((y-4.5)/4.5)**2<=1) x.fillRect(xx,y,1,1); return c; }
// anillo de selección de una ficha: trazos dorados con contorno de tinta, de N píxeles de diámetro (16 por casilla,
// como el resto del arte, sea cual sea el tamaño de la ficha); `dashes` trazos que avanzan a saltos
function drawRing(N,dashes){ const c=mkCanvas(N,N), x=c.getContext('2d'), r=N/2;
  for(let y=0;y<N;y++) for(let xx=0;xx<N;xx++){ const d=Math.hypot(xx+.5-r,y+.5-r), a=Math.atan2(y+.5-r,xx+.5-r), dash=Math.floor((a+Math.PI)/(2*Math.PI)*dashes*4)%4!==3;
    if(!dash||d<r-4||d>=r) continue; x.fillStyle=d<r-3||d>=r-1?INK:(d<r-2?'#ffe38a':'#e8b23a'); x.fillRect(xx,y,1,1); }
  return c; }
// sombra de contacto: tramada (Bayer), más densa en el centro
function drawContact(){ const N=24, c=mkCanvas(N,N), x=c.getContext('2d'); x.fillStyle='#120a20';
  for(let y=0;y<N;y++) for(let xx=0;xx<N;xx++){ const d=Math.hypot(xx+.5-N/2,y+.5-N/2)/(N/2); if(d>=1) continue;
    if(Math.min(1,(1-d)*2.4)*16>BAYER[y%4][xx%4]+0.5) x.fillRect(xx,y,1,1); }
  return c; }
function drawCursor(col){ const c=mkCanvas(16,16), x=c.getContext('2d'); x.fillStyle=col;
  [[0,0,1,1],[15,0,-1,1],[0,15,1,-1],[15,15,-1,-1]].forEach(([cx,cy,sx,sy])=>{ for(let i=0;i<4;i++){ x.fillRect(cx+sx*i,cy,1,1); x.fillRect(cx,cy+sy*i,1,1);} }); return c; }
function drawGlow(){
  const c=mkCanvas(32,32), x=c.getContext('2d');
  for(let y=0;y<32;y++)for(let xx=0;xx<32;xx++){
    const d=Math.hypot(xx-15.5,y-15.5)/15.5; if(d>=1) continue;
    const i=Math.pow(1-d,1.4), lv=Math.floor(i*3+BAYER[y%4][xx%4]/16)/3;
    if(lv<=0) continue;
    x.fillStyle=`rgba(255,255,255,${lv*0.5})`; x.fillRect(xx,y,1,1);
  }
  return c;
}
// decoración 8×8: 0-1 matas, 2-3 flores, 4 piedritas, 5 hongo, 6 huesos, 7 escombro
function drawDecor(){
  const c=mkCanvas(64,8), x=c.getContext('2d'), P=(k,px,py,col)=>R(x,k*8+px,py,1,1,col);
  [[1,4,2],[2,6,3],[3,3,4],[4,7,3],[5,5,4],[6,3,5]].forEach(([px,h,t])=>{ for(let y=0;y<h;y++)P(0,px,7-y,y===h-1?G[t+1]:G[t]); });
  [[1,5],[2,3],[3,7],[4,4],[5,6],[6,2]].forEach(([px,h],i)=>{ for(let y=0;y<h;y++)P(1,px,7-y,y>=h-2?G[4]:(i%2?G[2]:G[3])); });
  [[2,FL[0]],[5,FL[0]]].forEach(([px,col])=>{ P(2,px,6,G[2]); P(2,px,7,G[1]); P(2,px,5,G[3]); P(2,px-1,4,col); P(2,px+1,4,col); P(2,px,3,col); P(2,px,4,FL[1]); });
  [[2,FL[1]],[5,FL[3]]].forEach(([px,col])=>{ P(3,px,6,G[2]); P(3,px,7,G[1]); P(3,px-1,5,col); P(3,px+1,5,col); P(3,px,4,col); P(3,px,5,FL[2]); });
  P(4,1,7,S[2]); P(4,2,7,S[3]); P(4,1,6,S[4]); P(4,2,6,S[3]); P(4,5,7,S[2]); P(4,4,7,S[3]); P(4,5,6,S[4]); P(4,3,7,S[1]);
  R(x,5*8+3,5,2,3,'#e8e0d0'); R(x,5*8+1,2,6,3,'#c8435a'); R(x,5*8+2,1,4,1,'#c8435a'); R(x,5*8+2,2,1,1,'#f3ecd8'); R(x,5*8+5,3,1,1,'#f3ecd8'); R(x,5*8+1,4,6,1,'#8e2c48');
  R(x,6*8+1,6,6,1,'#e8e0cc'); R(x,6*8+1,5,1,3,'#e8e0cc'); R(x,6*8+6,5,1,3,'#e8e0cc'); R(x,6*8+3,3,3,3,'#e8e0cc'); R(x,6*8+3,4,1,1,INK); R(x,6*8+5,4,1,1,INK); R(x,6*8+3,5,3,1,'#a89c86');
  [[1,6,3],[3,5,4],[5,6,2],[2,7,1],[6,7,3],[4,4,2]].forEach(([px,py,t])=>{ P(7,px,py,S[t]); P(7,px+1,py,S[t+1]); if(py<7)P(7,px,py+1,S[t-1]||S[0]); });
  return c;
}
function dirCanv(fn){ const right=fn('side'); return {front:fn('front'),back:fn('back'),right,left:mirror(right)}; }
/* ---- personajes medianos (T5c): pintados a mano en personajes.js (Tablero3D.Personajes) con las rampas de este motor;
   aquí se pintan y se les pone el contorno selectivo: tinta y, en el lado de la luz (arriba a la izquierda), el color de
   la pieza oscurecido, como el filo de los techos y los árboles. ---- */
const OGS=['#3b4526','#5f6e37','#8a9a52','#b3c276','#d0dc9a'], HIDE=[D[1],D[2],D[3],D[4],D[5]], WOOD=[W[1],W[2],W[3],W[4],W[5]];
const TRS=['#232f33','#3a5250','#57786a','#7fa287','#b2cfa6'], MOSS=[G[0],G[1],G[2],G[3],G[4]], STONE=[S[1],S[2],S[3],S[4],S[5]];
const BONE='#f3ecd8', RUNE=['#2a5a8f','#41a6f6','#73eff7','#e0fbff'];
const HANDART=Personajes.art({INK,G,D,S,B,W,SA,WA,SL,TH,FL,EX:EXTRA_RAMPS,OGS,BONE,RUNE});
function selout(c){
  const x=c.getContext('2d'), w=c.width, h=c.height, img=x.getImageData(0,0,w,h), d=img.data, s=d.slice(), ink=[0x16,0x12,0x22];
  const op=(px,py)=>px>=0&&py>=0&&px<w&&py<h&&s[(py*w+px)*4+3]>128;
  for(let py=0;py<h;py++) for(let px=0;px<w;px++){ if(op(px,py)) continue;
    const r=op(px+1,py), b=op(px,py+1), l=op(px-1,py), t=op(px,py-1); if(!(r||b||l||t)) continue;
    const o=(py*w+px)*4; let col=ink;
    if((r||b)&&!l&&!t&&py<h-3){ const q=r?(py*w+px+1)*4:((py+1)*w+px)*4; col=[0,1,2].map(i=>Math.round(s[q+i]*0.42+ink[i]*0.58)); }
    d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2]; d[o+3]=255; }
  x.putImageData(img,0,0); return c;
}
function handArt(k,dir){
  const ch=HANDART.chars[k], rows=(HANDART.chars[ch.like]||ch)[dir].trim().split('\n'), key={...HANDART.KEY,...ch.key}, c=mkCanvas(16,24), x=c.getContext('2d');
  rows.forEach((row,py)=>{ row=row.trim(); for(let px=0;px<row.length;px++){ const col=key[row[px]]; if(col) R(x,px,py,1,1,col); } });
  return selout(c);
}
/* ---- arte a su tamaño (T5b): cada tamaño de ficha tiene su lienzo (Fichas.SIZES[].art, a 16 texeles por casilla) para
   que el texel del personaje mida lo mismo que el del terreno. Las criaturas grandes se modelan con volúmenes (sculpt):
   elipsoides, cápsulas y cajas con la luz de arriba a la izquierda del resto del arte, en 4-5 tonos de su rampa; donde
   una pieza tapa a otra, la de atrás se oscurece (pliegue) y el contorno exterior es de tinta, como los medianos. ---- */
const LIT=[-0.5,-0.62,0.6];
function sculpt(w,h){
  const c=mkCanvas(w,h), x=c.getContext('2d'), part=new Int16Array(w*h).fill(-1), ramps=[], edges=[];
  const tone=(rp,l,o)=>{ const i=l<0.08?0:l<0.38?1:l<0.68?2:l<0.9?3:4; return rp[Math.max(o.lo||0,Math.min(rp.length-1,o.hi??9,i))]; };
  const put=(px,py,col,id)=>{ if(px<0||py<0||px>=w||py>=h) return; x.fillStyle=col; x.fillRect(px,py,1,1); part[py*w+px]=id; };
  const lum=(nx,ny,nz,o)=>(nx*LIT[0]+ny*LIT[1]+nz*LIT[2])*(o.k??1)+(o.b??0);
  const begin=(rp,o)=>{ const id=ramps.push(rp)-1; edges[id]=o.edge!==false; return id; };
  const S={c,x,
    ell(cx,cy,rx,ry,rp,o={}){ const id=begin(rp,o);
      for(let py=Math.floor(cy-ry);py<Math.ceil(cy+ry);py++) for(let px=Math.floor(cx-rx);px<Math.ceil(cx+rx);px++){
        const nx=(px+.5-cx)/rx, ny=(py+.5-cy)/ry, d=nx*nx+ny*ny; if(d>1||(o.clip&&!o.clip(px,py))) continue;
        put(px,py,tone(rp,lum(nx,ny,Math.sqrt(1-d),o),o),id); } return S; },
    // cápsula de (x0,y0) a (x1,y1) con radio r0 → r1: brazos, piernas, garrotes
    cap(x0,y0,x1,y1,r0,r1,rp,o={}){ const id=begin(rp,o), vx=x1-x0, vy=y1-y0, L2=vx*vx+vy*vy||1, R=Math.max(r0,r1);
      for(let py=Math.floor(Math.min(y0,y1)-R);py<Math.ceil(Math.max(y0,y1)+R);py++) for(let px=Math.floor(Math.min(x0,x1)-R);px<Math.ceil(Math.max(x0,x1)+R);px++){
        const t=Math.max(0,Math.min(1,((px+.5-x0)*vx+(py+.5-y0)*vy)/L2)), r=r0+(r1-r0)*t, nx=(px+.5-x0-vx*t)/r, ny=(py+.5-y0-vy*t)/r, d=nx*nx+ny*ny;
        if(d>1||(o.clip&&!o.clip(px,py))) continue; put(px,py,tone(rp,lum(nx,ny,Math.sqrt(1-d),o),o),id); } return S; },
    // bloque tallado: cara con filo de luz arriba e izquierda y sombra abajo y derecha (piedra, madera)
    box(x0,y0,bw,bh,rp,o={}){ const id=begin(rp,o), b=o.bevel??1;
      for(let py=y0;py<y0+bh;py++) for(let px=x0;px<x0+bw;px++){ if(o.clip&&!o.clip(px,py)) continue; const l=px-x0, t=py-y0, r=x0+bw-1-px, bt=y0+bh-1-py;
        const v=(r<b||bt<b)?(t<b&&r<b?0.5:0.2):(t<b||l<b)?0.95:(o.face??0.6); put(px,py,tone(rp,v+(o.b??0),o),id); } return S; },
    dot(px,py,col){ R(x,px,py,1,1,col); return S; },
    rect(px,py,rw,rh,col){ R(x,px,py,rw,rh,col); return S; },
    // pliegues y contorno; lo que se pinte después (ojos, runas, costuras) queda encima
    done(){ const cr=[];
      for(let py=0;py<h;py++) for(let px=0;px<w;px++){ const j=part[py*w+px]; if(j<0) continue;
        for(const [dx,dy] of DIR4){ const qx=px+dx, qy=py+dy; if(qx<0||qy<0||qx>=w||qy>=h) continue; const i=part[qy*w+qx]; if(i>j&&edges[i]){ cr.push(px,py,ramps[j][0]); break; } } }
      for(let k=0;k<cr.length;k+=3) R(x,cr[k],cr[k+1],1,1,cr[k+2]);
      outline(c,INK); return S; } };
  return S;
}
// rata (Diminuto, 10×14)
function rat(dir){
  const c=mkCanvas(10,14), x=c.getContext('2d'), fur='#7d7288', furD='#554a60', furL='#a597ad', pink='#e59aa6', belly='#c9bccb';
  if(dir==='front'){ R(x,1,6,2,2,pink); R(x,7,6,2,2,pink); R(x,2,7,6,3,fur); R(x,1,9,8,3,fur); R(x,7,8,1,4,furD); R(x,2,7,5,1,furL); R(x,2,9,1,1,furL);
    R(x,3,8,1,1,INK); R(x,6,8,1,1,INK); R(x,4,10,2,1,pink); R(x,3,11,4,1,belly); R(x,2,12,2,1,pink); R(x,6,12,2,1,pink); }
  else if(dir==='back'){ R(x,1,6,2,2,pink); R(x,7,6,2,2,pink); R(x,2,7,6,3,fur); R(x,1,9,8,3,fur); R(x,2,8,1,4,furD); R(x,3,7,4,1,furL);
    R(x,4,11,2,1,furD); R(x,5,12,1,1,pink); R(x,2,12,2,1,pink); R(x,6,12,2,1,pink); }
  else { R(x,1,9,5,3,fur); R(x,2,8,3,1,fur); R(x,2,8,3,1,furL); R(x,1,11,5,1,furD); R(x,5,8,3,3,fur); R(x,5,8,2,1,furL); R(x,8,10,1,1,pink); R(x,7,10,1,1,fur);
    R(x,5,7,1,1,pink); R(x,6,9,1,1,INK); R(x,5,10,1,1,furD); R(x,2,12,2,1,pink); R(x,5,12,2,1,pink); R(x,0,9,1,2,pink); R(x,1,8,1,1,pink); R(x,3,11,2,1,belly); }
  return outline(c,INK);
}
// niño del pueblo (Pequeño, 12×18)
function boy(dir){
  const c=mkCanvas(12,18), x=c.getContext('2d'), sk='#e8b894', skD='#c98d5a', hair=W[4], hairD=W[3], tun='#5f9e48', tunD='#3f7c3e', tunL='#8fc657', pants=D[3], boot=D[1];
  if(dir==='front'){ R(x,4,2,4,2,hair); R(x,3,3,1,2,hairD); R(x,4,4,4,4,sk); R(x,7,4,1,4,skD); R(x,4,4,4,1,hair); R(x,5,5,1,1,INK); R(x,7,5,1,1,INK); R(x,5,7,2,1,skD);
    R(x,3,8,6,5,tun); R(x,8,8,1,5,tunD); R(x,3,8,6,1,tunL); R(x,3,11,6,1,boot); R(x,2,9,1,3,sk); R(x,9,9,1,3,skD);
    R(x,4,13,2,3,pants); R(x,6,13,2,3,pants); R(x,7,13,1,3,D[2]); R(x,4,16,2,1,boot); R(x,6,16,2,1,boot); }
  else if(dir==='back'){ R(x,4,2,4,6,hair); R(x,3,3,1,3,hairD); R(x,4,6,4,1,hairD); R(x,4,7,4,1,skD);
    R(x,3,8,6,5,tun); R(x,3,8,1,5,tunD); R(x,3,11,6,1,boot); R(x,2,9,1,3,skD); R(x,9,9,1,3,sk);
    R(x,4,13,2,3,pants); R(x,6,13,2,3,pants); R(x,4,13,1,3,D[2]); R(x,4,16,2,1,boot); R(x,6,16,2,1,boot); }
  else { R(x,4,2,4,3,hair); R(x,4,4,4,4,sk); R(x,4,4,2,3,hair); R(x,3,3,1,2,hairD); R(x,7,5,1,1,INK); R(x,8,6,1,1,skD); R(x,6,7,2,1,skD);
    R(x,4,8,4,5,tun); R(x,4,8,1,5,tunD); R(x,5,8,3,1,tunL); R(x,4,11,4,1,boot); R(x,6,9,2,3,sk);
    R(x,4,13,2,3,pants); R(x,6,13,2,3,D[2]); R(x,3,16,3,1,boot); R(x,6,16,3,1,boot); }
  return outline(c,INK);
}
// ogro (Grande, 32×48): barrigón, encorvado, con el garrote al hombro
function ogre(dir){
  const s=sculpt(32,48), eye='#f2d15b';
  if(dir!=='side'){ const b=dir==='back', X=v=>b?32-v:v;
    s.cap(X(25),17,X(26.5),5.5,1.3,3.8,WOOD);
    s.cap(X(12),33,X(11.5),43.5,3.8,3.2,OGS).cap(X(20),33,X(20.5),43.5,3.8,3.2,OGS);
    s.ell(X(11),45,4.3,2,OGS,{b:-0.05}).ell(X(21),45,4.3,2,OGS,{b:-0.05});
    s.ell(16,24,11,10.5,OGS);
    if(!b) s.ell(16,28,7.5,6.5,OGS,{b:0.06});
    s.ell(16,33.5,8.8,3.2,HIDE).box(X(b?19:13),33,6,7,HIDE,{face:0.5});
    s.ell(16,11.5,5.6,5,OGS);
    if(!b) s.ell(16,15,5,2.6,OGS);
    s.ell(X(10),11.5,1.5,2.2,OGS).ell(X(22),11.5,1.5,2.2,OGS);
    s.cap(X(7),18,X(5),28,3.9,3.3,OGS).cap(X(5),28,X(5),35,3.3,3.5,OGS).ell(X(5),37.5,3.4,3,OGS);
    s.cap(X(25),18,X(28),26,3.9,3.2,OGS).cap(X(28),26,X(26),17.5,3.2,3,OGS).ell(X(25.5),15.5,3.1,2.9,OGS);
    s.done();
    [[25.5,6],[27.5,8],[26.5,3]].forEach(([px,py])=>s.dot(Math.floor(X(px)),py,S[4]));
    if(!b){ s.rect(13,10,3,1,OGS[0]).rect(17,10,3,1,OGS[0]).dot(14,11,eye).dot(18,11,eye).dot(16,12,OGS[1]).dot(16,13,OGS[0])
      .rect(13,15,7,1,INK).dot(13,14,BONE).dot(19,14,BONE).dot(16,29,OGS[1]).rect(8,32,16,1,D[1]).dot(14,32,D[4]); }
    else { s.rect(15,8,3,1,OGS[1]).rect(16,19,1,9,OGS[1]).rect(8,32,16,1,D[1]); }
    return s.c; }
  s.cap(17,15,6.5,5,1.3,3.8,WOOD);
  s.cap(18,33,19,43.5,3.4,3,OGS,{b:-0.15}).ell(21,45,4,2,OGS,{b:-0.2});
  s.ell(15,24,9.5,10.5,OGS).ell(18.5,28,7,6.5,OGS,{b:0.06});
  s.ell(15,33.5,8.3,3.2,HIDE).box(18,33,5,7,HIDE,{face:0.5});
  s.cap(13,33,12.5,43.5,3.8,3.2,OGS).ell(15,45,4.6,2,OGS,{b:-0.05});
  s.ell(21,12.5,5.2,4.8,OGS).ell(23,16,4.2,2.5,OGS).ell(17.5,11.5,1.5,2.2,OGS).ell(26,13.2,1.6,1.6,OGS,{b:0.1});
  s.cap(13,18,14.5,26,3.9,3.2,OGS).cap(14.5,26,17,17,3.2,3,OGS).ell(17.5,15.5,3.1,2.9,OGS);
  s.done();
  s.rect(22,11,3,1,OGS[0]).dot(23,12,eye).rect(20,16,6,1,INK).dot(25,15,BONE).rect(10,32,13,1,D[1]).dot(6,6,S[4]).dot(9,4,S[4]);
  return s.c;
}
// trol (Enorme, 48×72): larguirucho y encorvado, brazos hasta las rodillas, nariz grande y greñas de musgo
function troll(dir){
  const s=sculpt(48,72), eye='#f07a2a';
  if(dir!=='side'){ const b=dir==='back', X=v=>b?48-v:v;
    s.cap(X(19),46,X(16.5),57,5,4,TRS).cap(X(16.5),57,X(17.5),66.5,4,3.4,TRS).cap(X(29),46,X(31.5),57,5,4,TRS).cap(X(31.5),57,X(30.5),66.5,4,3.4,TRS);
    s.ell(X(16.5),68.5,5.5,2.4,TRS,{b:-0.05}).ell(X(31.5),68.5,5.5,2.4,TRS,{b:-0.05});
    s.ell(24,34,8.6,12.5,TRS);
    s.ell(X(16),25.5,5,4.3,TRS).ell(X(32),25.5,5,4.3,TRS);
    s.ell(24,45,8.4,3.2,HIDE,{hi:3}).box(X(b?22:20),46,7,9,HIDE,{face:0.4,hi:3,clip:(px,py)=>py<53||(px*3+py)%4!==0});
    s.cap(X(14),26,X(12),40,4,3.3,TRS).cap(X(12),40,X(11),52,3.3,3.7,TRS).ell(X(11),55.5,4.2,4.2,TRS);
    s.cap(X(34),26,X(36),40,4,3.3,TRS).cap(X(36),40,X(37),52,3.3,3.7,TRS).ell(X(37),55.5,4.2,4.2,TRS);
    s.ell(24,18,7.2,7.2,TRS);
    if(!b) s.ell(24,23.5,6,3,TRS).ell(24,20,2.6,3.8,TRS,{b:0.12});
    s.cap(X(17.5),16,X(11.5),11,2.2,0.7,TRS).cap(X(30.5),16,X(36.5),11,2.2,0.7,TRS);
    s.ell(24,11.5,7.5,4.5,MOSS,{clip:(px,py)=>b||py<13+((px*7)%3)});
    if(b) s.ell(24,18,7.5,8,MOSS,{b:-0.1,clip:(px,py)=>py<24+((px*5)%4)});
    s.done();
    for(const hx of [11,37]) for(let k=-1;k<=1;k++) s.dot(Math.floor(X(hx))+k*2,59,BONE);
    for(const fx of [16.5,31.5]) for(let k=-1;k<=1;k++) s.dot(Math.floor(X(fx))+k*2,70,BONE);
    if(!b){ s.rect(19,15,4,1,TRS[0]).rect(26,15,4,1,TRS[0]).dot(21,16,eye).dot(27,16,eye).dot(21,17,TRS[0]).dot(27,17,TRS[0])
      .rect(19,24,11,1,INK).dot(20,23,BONE).dot(20,22,BONE).dot(28,23,BONE).dot(28,22,BONE)
      .rect(19,31,3,1,TRS[1]).rect(26,31,3,1,TRS[1]).rect(19,34,3,1,TRS[1]).rect(26,34,3,1,TRS[1]).dot(24,40,TRS[1]); }
    else { for(let yy=27;yy<42;yy+=3) s.dot(24,yy,TRS[1]); }
    return s.c; }
  s.cap(24,46,27,56,4.6,3.8,TRS,{b:-0.15}).cap(27,56,25,66.5,3.8,3.2,TRS,{b:-0.15}).ell(28,68.5,5,2.3,TRS,{b:-0.2});
  s.cap(15,27,13,40,3.8,3.2,TRS,{b:-0.15}).cap(13,40,15,51,3.2,3.5,TRS,{b:-0.15});
  s.ell(21,34,10,12,TRS).ell(27,26,6,5,TRS);
  s.ell(21,45,8.4,3.2,HIDE,{hi:3}).box(24,46,6,9,HIDE,{face:0.4,hi:3,clip:(px,py)=>py<53||(px*3+py)%4!==0});
  s.cap(19,46,17,56,5,4,TRS).cap(17,56,20,66.5,4,3.4,TRS).ell(22.5,68.5,5.5,2.4,TRS,{b:-0.05});
  s.ell(32,18.5,6.8,6.8,TRS).ell(37,23.5,5,3,TRS).ell(39.5,19.5,3.4,3,TRS,{b:0.12}).cap(28,16,22,11,2.2,0.7,TRS);
  s.ell(29,12,7,4.5,MOSS,{clip:(px,py)=>py<13+((px*7)%3)||px<27}).ell(24.5,17,3.5,6,MOSS,{b:-0.1,clip:(px,py)=>py<22+((px*5)%4)});
  s.cap(28,25,30,40,4.3,3.5,TRS).cap(30,40,31,52,3.5,3.9,TRS).ell(31.5,55,4.2,4.2,TRS);
  s.done();
  for(let k=0;k<3;k++){ s.dot(30+k*2,59,BONE); s.dot(24+k*2,70,BONE); }
  s.rect(33,15,4,1,TRS[0]).dot(35,16,eye).dot(35,17,TRS[0]).rect(33,24,8,1,INK).dot(38,23,BONE).dot(38,22,BONE).rect(22,31,3,1,TRS[1]).rect(22,34,3,1,TRS[1]);
  return s.c;
}
// gólem de piedra (Colosal, 64×96): hombros de roca con musgo, cabeza hundida, puños enormes y una runa que brilla
function golem(dir){
  const s=sculpt(64,96), mossTop=(cy)=>(px,py)=>py<cy+((px*5)%3);
  const rune=(cx,cy)=>{ ['....#....','...#.#...','..#.#.#..','.#..#..#.','#...#...#','.#..#..#.','..#.#.#..','...#.#...','....#....','....#....','...###...'].forEach((row,j)=>{ for(let i=0;i<9;i++) if(row[i]==='#'){
      s.dot(cx-4+i,cy-5+j,i===4?RUNE[3]:RUNE[2]); if(!(j+1<11&&['....#....','...#.#...','..#.#.#..','.#..#..#.','#...#...#','.#..#..#.','..#.#.#..','...#.#...','....#....','....#....','...###...'][j+1][i]==='#')) s.dot(cx-4+i,cy-4+j,RUNE[0]); } }); };
  if(dir!=='side'){ const b=dir==='back', X=v=>b?64-v:v;
    s.box(19,68,11,20,STONE,{bevel:2}).box(34,68,11,20,STONE,{bevel:2});
    s.box(15,86,15,8,STONE,{bevel:2,b:-0.05}).box(34,86,15,8,STONE,{bevel:2,b:-0.05});
    s.box(20,60,24,11,STONE,{bevel:2,face:0.5});
    s.ell(32,55,12,8,STONE,{b:-0.05});
    s.ell(32,41,19,13,STONE);
    s.box(25,31,14,15,STONE,{bevel:2});
    s.ell(X(12.5),31,10,9,STONE).ell(X(51.5),31,10,9,STONE);
    s.ell(X(12.5),26,8,4,MOSS,{clip:mossTop(26)}).ell(X(51.5),26,8,4,MOSS,{clip:mossTop(26)});
    s.cap(X(10),38,X(8),53,6.5,6,STONE).ell(X(8),62,8,9.5,STONE).ell(X(8.5),74,7.5,7,STONE,{b:0.05});
    s.cap(X(54),38,X(56),53,6.5,6,STONE).ell(X(56),62,8,9.5,STONE).ell(X(55.5),74,7.5,7,STONE,{b:0.05});
    s.box(26,15,12,13,STONE,{bevel:2});
    if(b) s.ell(32,18,7,4,MOSS,{clip:mossTop(18)});
    s.done();
    if(!b){ s.rect(28,20,3,1,S[0]).rect(33,20,3,1,S[0]).rect(28,21,3,1,RUNE[2]).rect(33,21,3,1,RUNE[2]).dot(29,21,RUNE[3]).dot(34,21,RUNE[3]).rect(29,25,6,1,S[0]);
      rune(32,38); s.rect(26,54,1,4,S[1]).rect(27,57,2,1,S[1]).rect(37,50,1,4,S[1]).rect(35,53,2,1,S[1]); }
    else { s.rect(31,33,1,8,S[1]).rect(29,40,2,1,S[1]).rect(33,46,1,6,S[1]).rect(24,55,1,4,S[1]); }
    s.rect(Math.floor(X(12)),33,1,4,S[1]).rect(Math.floor(X(50)),34,1,3,S[1]).rect(21,74,1,5,S[1]).rect(40,78,1,4,S[1]);
    for(const fx of [4,9,13]) s.rect(Math.floor(X(fx)),78,1,2,S[1]); for(const fx of [51,55,60]) s.rect(Math.floor(X(fx)),78,1,2,S[1]);
    return s.c; }
  s.box(31,68,11,20,STONE,{bevel:2,b:-0.15}).box(33,86,16,8,STONE,{bevel:2,b:-0.2});
  s.ell(28,55,11,8,STONE,{b:-0.05}).ell(27,42,15,14,STONE);
  s.box(20,60,20,10,STONE,{bevel:2,face:0.5});
  s.box(21,68,11,20,STONE,{bevel:2}).box(21,86,17,8,STONE,{bevel:2,b:-0.05});
  s.box(33,21,12,12,STONE,{bevel:2});
  s.ell(27,31,11,9,STONE).ell(27,26,9,4,MOSS,{clip:mossTop(26)});
  s.cap(29,36,33,52,6.5,6,STONE).ell(35,62,8,9.5,STONE).ell(36,74,7.5,7,STONE,{b:0.05});
  s.done();
  s.rect(40,25,4,1,S[0]).rect(40,26,4,1,RUNE[2]).dot(42,26,RUNE[3]).rect(39,30,5,1,S[0]);
  s.rect(40,38,1,5,RUNE[2]).dot(40,40,RUNE[3]).rect(41,39,1,3,RUNE[0]);
  s.rect(22,36,1,4,S[1]).rect(24,74,1,5,S[1]).rect(28,78,1,3,S[1]).rect(33,58,5,1,S[1]);
  for(const fx of [33,37,41]) s.rect(fx,78,1,2,S[1]);
  return s.c;
}
const CAN={ ...Object.fromEntries(Object.keys(HANDART.chars).map(k=>[k,dirCanv(d=>handArt(k,d))])), rat:dirCanv(rat), boy:dirCanv(boy), ogre:dirCanv(ogre), troll:dirCanv(troll), golem:dirCanv(golem), brazier:[drawBrazier(0),drawBrazier(1)],
  shadow:drawShadow(), sel:drawCursor('#ffd35a'), dest:drawCursor('#f4f0ff'), glow:drawGlow(), decor:drawDecor(), contact:drawContact() };
// personajes de fábrica: sprite, nombre y tamaño de su arte (el lienzo de Fichas.SIZES con el que se dibujó)
const CHARS=[['knight','Caballero','medium'],['warrior','Guerrera','medium'],['rogue','Pícaro','medium'],['cleric','Clérigo','medium'],['archer','Arquera','medium'],
  ['mage','Maga','medium'],['goblin','Goblin','medium'],['skeleton','Esqueleto','medium'],['wolf','Lobo','medium'],['bandit','Bandido','medium'],
  ['villager','Aldeano','medium'],['miller','Molinero','medium'],['barmaid','Tabernera','medium'],['smith','Herrero','medium'],['crone','Anciana','medium'],
  ['guard','Guardia','medium'],['rat','Rata','tiny'],['boy','Niño','small'],['ogre','Ogro','large'],['troll','Trol','huge'],['golem','Gólem de piedra','gargantuan']];
const CHAR_ART=Object.fromEntries(CHARS.map(c=>[c[0],c[2]]));
const spriteDimC=new Map();   // medidas en el mundo de cada sprite (spriteDims)

/* ---- ampliación EPX / Scale2x: duplica resolución suavizando diagonales sin desenfocar ---- */
function epx(src,wrap){
  const w=src.width, h=src.height, sd=src.getContext('2d').getImageData(0,0,w,h).data;
  const out=mkCanvas(w*2,h*2), oc=out.getContext('2d'), od=oc.createImageData(w*2,h*2), o=od.data;
  const at=(x,y)=>{ if(wrap){ x=((x%w)+w)%w; y=((y%h)+h)%h; } else { x=x<0?0:x>=w?w-1:x; y=y<0?0:y>=h?h-1:y; } return (y*w+x)*4; };
  const eq=(a,b)=>sd[a]===sd[b]&&sd[a+1]===sd[b+1]&&sd[a+2]===sd[b+2]&&sd[a+3]===sd[b+3];
  const put=(x,y,p)=>{ const q=(y*w*2+x)*4; o[q]=sd[p]; o[q+1]=sd[p+1]; o[q+2]=sd[p+2]; o[q+3]=sd[p+3]; };
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const P=at(x,y), A=at(x,y-1), B=at(x+1,y), C=at(x-1,y), D=at(x,y+1);
    let e0=P,e1=P,e2=P,e3=P;
    if(eq(C,A)&&!eq(C,D)&&!eq(A,B)) e0=A;
    if(eq(A,B)&&!eq(A,C)&&!eq(B,D)) e1=B;
    if(eq(D,C)&&!eq(D,B)&&!eq(C,A)) e2=C;
    if(eq(B,D)&&!eq(B,A)&&!eq(D,C)) e3=D;
    put(2*x,2*y,e0); put(2*x+1,2*y,e1); put(2*x,2*y+1,e2); put(2*x+1,2*y+1,e3);
  }
  oc.putImageData(od,0,0); return out;
}
function upscale(c,k,wrap){ while(k>1){ c=epx(c,wrap); k/=2; } return c; }
const RAMPS=[G,D,S,B,W,SA,WA,SL,TH,SH,CU], RLUT=new Map();
RAMPS.forEach((rp,ri)=>rp.forEach((h,i)=>{ const k=hexRGB(h).join(','); if(!RLUT.has(k)) RLUT.set(k,[ri,i]); }));
// grano fino: a mayor resolución, texeles sueltos pasan a un tono vecino de su propia rampa (filas 0 y 1 y los tejados de tablillas y cobre)
function detailPass(c,k){
  const T=16*k, ctx=c.getContext('2d'), img=ctx.getImageData(0,0,c.width,3*T), d=img.data;
  for(let y=0;y<3*T;y++) for(let x=0;x<c.width;x++){
    const o=(y*c.width+x)*4; if(d[o+3]<128) continue;
    let ti=((y/T)|0)*AC+((x/T)|0); if(ti>=32&&ti!==42&&ti!==43) continue;
    const e=RLUT.get(d[o]+','+d[o+1]+','+d[o+2]); if(!e) continue;
    if(ti>=16&&ti<=19) ti=16;
    const h=hash(x%T,y%T,ti+k*101); if(h>0.16) continue;
    const rp=RAMPS[e[0]], ni=Math.max(0,Math.min(rp.length-1,e[1]+(h<0.08?1:-1)));
    const c2=hexRGB(rp[ni]); d[o]=c2[0]; d[o+1]=c2[1]; d[o+2]=c2[2];
  }
  ctx.putImageData(img,0,0);
}
function upscaleAtlas(k){
  if(k===1) return atlas;
  const T=16*k, out=mkCanvas(AC*T,AR*T), oc=out.getContext('2d');
  for(let ti=0;ti<AC*AR;ti++){
    const tc=mkCanvas(16,16); tc.getContext('2d').drawImage(atlas,(ti%AC)*16,((ti/AC)|0)*16,16,16,0,0,16,16);
    oc.drawImage(upscale(tc,k,true),(ti%AC)*T,((ti/AC)|0)*T);
  }
  detailPass(out,k); return out;
}
let SPR=null, STACK=null, STK=null, atlasTex=null;
const baseTexCache=new Map(), artTops=new Map();   // peanas de las fichas por color y tamaño, anillos y alto del dibujo (se rehacen con el arte)

/* ---- volúmenes por capas (sprite stacking) a cualquier resolución ---- */
function stackCanvas(N,H){ const cols=Math.max(1,Math.min(H,Math.floor(4096/N))), rows=Math.ceil(H/cols); return {c:mkCanvas(cols*N,rows*N),cols}; }
function stackGeo(N,H,sp,cols,cw,ch){
  const pos=[], uv=[], half=N/(2*TEX), eu=0.02/cw, ev=0.02/ch;
  for(let sl=0;sl<H;sl++){
    const col=sl%cols, row=Math.floor(sl/cols), y=sl*sp+0.002;
    const u0=col*N/cw+eu, u1=(col+1)*N/cw-eu, vT=1-row*N/ch-ev, vB=1-(row+1)*N/ch+ev;
    const P=[[-half,y,-half],[-half,y,half],[half,y,half],[half,y,-half]], U=[[u0,vT],[u0,vB],[u1,vB],[u1,vT]];
    for(const q of [0,1,2,0,2,3]){ pos.push(P[q][0],P[q][1],P[q][2]); uv.push(U[q][0],U[q][1]); }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeBoundingSphere();
  return g;
}
function paintStack(N,H,k,fn){
  const {c,cols}=stackCanvas(N,H), ctx=c.getContext('2d'), img=ctx.createImageData(c.width,c.height), d=img.data, cx=(N-1)/2;
  for(let sl=0;sl<H;sl++){
    const s=(sl+0.5)/k-0.5, ox=(sl%cols)*N, oy=Math.floor(sl/cols)*N;
    for(let j=0;j<N;j++) for(let i=0;i<N;i++){
      const col=fn((i-cx)/k,(j-cx)/k,s); if(!col) continue;
      const o=((oy+j)*c.width+ox+i)*4; d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2]; d[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return {c,cols};
}
function stackTree(type,seed,k){
  const N=24*k, H=(type==='pine'?38:34)*k, r=mulberry32(seed), LX=-0.45, LY=0.78, LZ=-0.43;
  const bump=(a,s)=>Math.sin(a*5+seed)*0.5+Math.sin(a*3-s*0.7+seed*2)*0.5;
  const {c,cols}=paintStack(N,H,k,(dx,dz,s)=>{
    const dh=Math.hypot(dx,dz), a=Math.atan2(dz,dx);
    if(type==='pine'){
      if(s<12&&dh<=1.6) return dx<0?Drgb[4]:Drgb[3];
      let inside=false;
      for(const [s0,s1,R] of [[8,20,10.5],[17,29,8],[26,37,5.5]]){
        if(s<s0||s>s1) continue;
        if(dh<=R*(1-(s-s0)/(s1-s0+1))+0.8+bump(a,s)*0.6) inside=true;
      }
      if(!inside) return null;
      const nx=dx/(dh||1), nz=dz/(dh||1), l=(nx*LX+nz*LZ)*0.45+0.3+(s/38)*0.4+(r()-0.5)*0.18;
      return Grgb[Math.max(0,Math.min(4,Math.floor(l*5)))];
    }
    if(s<16&&dh<=(s<2?2.6:1.7)) return (dx+dz<0)?Drgb[4]:(dx>0?Drgb[2]:Drgb[3]);
    const R=10.2*(0.9+0.1*bump(a,s)), RV=10, dy=s-22;
    if((dh/R)**2+(dy/RV)**2>1) return null;
    const len=Math.hypot(dx/R,dy/RV,dz/R)||1;
    const l=((dx/R)*LX+(dy/RV)*LY+(dz/R)*LZ)/len*0.5+0.5+(r()-0.5)*0.22;
    return Grgb[Math.max(1,Math.min(5,1+Math.floor(l*5)))];
  });
  return {tex:tex(c), geo:stackGeo(N,H,1/TEX,cols,c.width,c.height), c, cols, N, H};
}
function stackBrazier(k){
  const N=12*k, H=19*k, coal=hexRGB('#c2412b'), f1=hexRGB('#fff0b8'), f2=hexRGB('#ffc14a'), f3=hexRGB('#f07a2a');
  let geo=null;
  const frames=[0,1].map(f=>{
    const r=mulberry32(40+f);
    const {c,cols}=paintStack(N,H,k,(dx,dz,s)=>{
      const dh=Math.hypot(dx,dz), ax=Math.abs(dx), az=Math.abs(dz);
      if(s<5.5) return (ax>=3.2&&ax<=4.8&&az>=3.2&&az<=4.8)?Srgb[1]:null;
      if(s<8.5){ const R=s<6.5?4.2:5.4; if(dh>R) return null; return s>=7.5?(dh>4.2?Srgb[4]:coal):(dx+dz<0?Srgb[3]:Srgb[2]); }
      const t=(s-9)/10, R=3.6*(1-t)+Math.sin(Math.atan2(dz,dx)*3+f*2+s)*0.6+(r()-0.5)*0.6;
      if(R<=0.3||dh>R) return null;
      const q=dh/R; return (q<0.35&&t<0.6)?f1:(q<0.7?f2:f3);
    });
    if(!geo) geo=stackGeo(N,H,1/TEX,cols,c.width,c.height);
    return tex(c);
  });
  return {tex:frames, geo};
}

/* ---- arte propio: se superpone al procedural ---- */
const CUSTOM={tiles:{},chars:{},objs:{}};
let CSTACK={}, atlasCanvas=null, PLACEHOLDER=null;
const ORIG_TERR=JSON.parse(JSON.stringify(TERR));
const TILE_SLOT={'g:top':48,'g:side':49,'a:top':50,'a:side':51,'p:top':52,'p:side':53,'s:top':54,'s:side':55,'o:top':56,'o:side':57,'w:top':58,'w:side':59,
  'c:top':13,'c:side':14,'n:top':15,'n:side':28};
const FRINGE_SLOT={g:60,a:61,p:62};
const baseAtlas={};
function fitTo(src,w,h){ const c=mkCanvas(w,h), x=c.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(src,0,0,src.width,src.height,0,0,w,h); return c; }
function drawTileAt(ctx,src,index){ const T=TEX, x=(index%AC)*T, y=((index/AC)|0)*T; ctx.clearRect(x,y,T,T); ctx.imageSmoothingEnabled=false; ctx.drawImage(src,0,0,src.width,src.height,x,y,T,T); }
function makeFringe(ctx,slot,dst){
  const T=TEX, sx=(slot%AC)*T, sy=((slot/AC)|0)*T, dx=(dst%AC)*T, dy=((dst/AC)|0)*T;
  const img=ctx.getImageData(sx,sy,T,T), d=img.data;
  for(let x=0;x<T;x++){ const x16=(x*16/T)|0, len=Math.round((2+Math.floor(hash(x16,dst,3)*3)+(x16%4===1?2:0))*T/16);
    for(let y=len;y<T;y++) d[(y*T+x)*4+3]=0; }
  ctx.clearRect(dx,dy,T,T); ctx.putImageData(img,dx,dy);
}
function applyTileOverrides(c){
  for(const k in TERR){ const o=ORIG_TERR[k]; TERR[k].top=o.top.slice(); TERR[k].side=o.side.slice(); TERR[k].low=o.low.slice(); TERR[k].fringe=o.fringe; }
  const ctx=c.getContext('2d');
  for(const [key,a] of Object.entries(CUSTOM.tiles)){
    if(key==='water:top'){ for(let f=0;f<4;f++) drawTileAt(ctx,a.canvases[f%a.canvases.length],16+f); continue; }
    if(key==='water:fall'){ drawTileAt(ctx,a.canvases[0],36); continue; }
    if(key==='l:top'){ for(let f=0;f<4;f++) drawTileAt(ctx,a.canvases[f%a.canvases.length],37+f); continue; }
    if(ROOF_KEY[key]!=null){ drawTileAt(ctx,a.canvases[0],ROOF_KEY[key]); continue; }
    const [t,face]=key.split(':'), slot=TILE_SLOT[key]; if(slot==null||!TERR[t]) continue;
    drawTileAt(ctx,a.canvases[0],slot);
    if(face==='top'){ TERR[t].top=[slot]; if(FRINGE_SLOT[t]!=null){ makeFringe(ctx,slot,FRINGE_SLOT[t]); TERR[t].fringe=FRINGE_SLOT[t]; } }
    else { TERR[t].side=[slot]; TERR[t].low=[slot]; }
  }
}
function composeAtlas(){
  if(!baseAtlas[TEX]) baseAtlas[TEX]=upscaleAtlas(TEX/16);
  const b=baseAtlas[TEX], c=mkCanvas(b.width,b.height); c.getContext('2d').drawImage(b,0,0);
  applyTileOverrides(c); return c;
}
function buildCharTex(key){
  const ch=CUSTOM.chars[key]; artTops.delete(key); spriteDimC.delete(key); if(!ch) return;
  if(SPR[key]) Object.values(SPR[key]).forEach(t=>t.dispose());
  // a la resolución del tablero, píxel a píxel del dibujo: el texel mide lo mismo que el del terreno
  const f=TEX/(ch.res||32), w=Math.max(1,Math.round(ch.canvases[0].width*f)), h=Math.max(1,Math.round(ch.canvases[0].height*f)), right=fitTo(ch.canvases[2],w,h);
  SPR[key]={front:tex(fitTo(ch.canvases[0],w,h)),back:tex(fitTo(ch.canvases[1],w,h)),right:tex(right),left:tex(mirror(right))};
}
function stackFromSlices(slices,srcRes){
  const f=TEX/srcRes, N=Math.max(1,Math.round(slices[0].width*f)), H=Math.max(1,Math.round(slices.length*f));
  const {c,cols}=stackCanvas(N,H), ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
  for(let sl=0;sl<H;sl++){ const src=slices[Math.min(slices.length-1,Math.floor(sl/f))]; ctx.drawImage(src,0,0,src.width,src.height,(sl%cols)*N,Math.floor(sl/cols)*N,N,N); }
  return {tex:tex(c), geo:stackGeo(N,H,1/TEX,cols,c.width,c.height)};
}
function placeholderStack(){
  const k=TEX/16, box=mkCanvas(16*k,16*k), x=box.getContext('2d');
  x.fillStyle=W[3]; x.fillRect(2*k,2*k,12*k,12*k); x.fillStyle=W[1]; x.fillRect(2*k,2*k,12*k,k); x.fillRect(2*k,2*k,k,12*k);
  return stackFromSlices(new Array(12*k).fill(box),TEX);
}

let PSTACK={}, PSLICES={};
// cada rebanada de alta resolución toma la rebanada base que le toca: los objetos tienen en vertical la misma densidad de píxel que el terreno
const propFn=P=>(x,z,s)=>P.fn(x,z,Math.round(s));
function buildProp(kind,k){ const P=PROP3D[kind], N=P.N*k, H=P.H*k, {c,cols}=paintStack(N,H,k,propFn(P)); return {tex:tex(c),geo:stackGeo(N,H,1/TEX,cols,c.width,c.height)}; }
// volumen de un objeto de fábrica o dibujado, hecho la primera vez que se usa
function pstack(kind){ let st=PSTACK[kind]; if(st) return st; const co=CUSTOM.objs[kind]; st=PSTACK[kind]=co?stackFromSlices(co.slices,co.res):buildProp(kind,TEX/16); return st; }
function propSlices(kind){ if(PSLICES[kind]) return PSLICES[kind]; const P=PROP3D[kind], {c,cols}=paintStack(P.N,P.H,1,propFn(P)), out=[];
  for(let sl=0;sl<P.H;sl++){ const cv=mkCanvas(P.N,P.N); cv.getContext('2d').drawImage(c,(sl%cols)*P.N,Math.floor(sl/cols)*P.N,P.N,P.N,0,0,P.N,P.N); out.push(cv); } return PSLICES[kind]=out; }
function buildArt(){
  const k=TEX/16, U=c=>tex(upscale(c,k,false));
  if(SPR){
    [atlasTex,SPR.shadow,SPR.sel,SPR.dest,SPR.glow,SPR.decor,SPR.contact,...SPR.brazier,...CHARS.flatMap(([k])=>Object.values(SPR[k])),...Object.values(PSTACK).map(t=>t.tex),
     ...STK.brazier.tex,...STACK.map(t=>t.tex)].forEach(t=>t.dispose());
    STACK.forEach(t=>t.geo.dispose()); STK.brazier.geo.dispose();
    Object.values(CSTACK).forEach(t=>{ t.tex.dispose(); t.geo.dispose(); }); if(PLACEHOLDER){ PLACEHOLDER.tex.dispose(); PLACEHOLDER.geo.dispose(); PLACEHOLDER=null; }
    for(const k in SPR) if(k.startsWith('c_')) Object.values(SPR[k]).forEach(t=>t.dispose());
  }
  const dirT=o=>({front:U(o.front),back:U(o.back),right:U(o.right),left:U(o.left)});
  Object.values(PSTACK).forEach(t=>t.geo.dispose()); PSTACK={}; PSLICES={};
  SPR={ ...Object.fromEntries(CHARS.map(([k])=>[k,dirT(CAN[k])])), brazier:CAN.brazier.map(U),
    shadow:U(CAN.shadow), sel:U(CAN.sel), dest:U(CAN.dest), glow:U(CAN.glow), decor:U(CAN.decor), contact:U(CAN.contact) };
  for(const t of baseTexCache.values()) t.dispose(); baseTexCache.clear(); artTops.clear(); spriteDimC.clear();
  atlasCanvas=composeAtlas(); atlasTex=tex(atlasCanvas);
  for(const key in CUSTOM.chars) buildCharTex(key);
  STACK=[stackTree('round',5,k), stackTree('round',17,k), stackTree('pine',29,k)];
  for(let v=0;v<3;v++){ const o=CUSTOM.objs['tree'+v]; if(o){ STACK[v].tex.dispose(); STACK[v].geo.dispose(); STACK[v]=stackFromSlices(o.slices,o.res); } }
  CSTACK={}; for(const key in CUSTOM.objs) if(key.startsWith('o_')||key==='brazier') CSTACK[key]=stackFromSlices(CUSTOM.objs[key].slices,CUSTOM.objs[key].res);
  STK={ brazier:stackBrazier(k) };
}
buildArt();
function upPlane(w,h,cy){ const g=new THREE.PlaneGeometry(w,h); g.translate(0,cy??h/2,0); return g; }
function flatPlane(w,h){ const g=new THREE.PlaneGeometry(w,h); g.rotateX(-HALF_PI); return g; }
const GEO={ mini:upPlane(1,1.5), tree:upPlane(1.5,2), brazier:upPlane(0.75,1.125), glow:upPlane(2.4,2.4,0), lightMark:flatPlane(0.5,0.5),
  shS:flatPlane(0.75,0.47), shL:flatPlane(1.25,0.8), cursor:flatPlane(1,1) };

/* ============ motor ============ */
const canvas=$('c');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'}); }
catch(e){ failMsg('Este navegador no pudo iniciar WebGL, que el tablero necesita.'); return; }
renderer.setPixelRatio(1);
renderer.info.autoReset=false;
const canPost=renderer.capabilities.isWebGL2||!!renderer.extensions.get('WEBGL_depth_texture');
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-1,1,1,-1,-100,300);
const chunkGroup=new THREE.Group(), propGroup=new THREE.Group();
scene.add(chunkGroup,propGroup);

const LIGHT_GLSL=`
  uniform vec3 uAmbient; uniform vec3 uDark; uniform float uLevel; uniform sampler2D uAmbT; uniform vec2 uAmbSize; uniform float uFlicker; uniform float uMode;
  float bayer2(vec2 a){ a=floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
  float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
  // cuánto ambiente llega a p (casillas continuas): fuera de las zonas interiores, todo (canal r, por casilla, sin fundir);
  // dentro, lo que entra por las ventanas (canal g, fundido entre casillas)
  float ambAt(vec2 p){
    if(texture2D(uAmbT, (floor(p) + 0.5) / uAmbSize).r > 0.5) return 1.0;
    return texture2D(uAmbT, p / uAmbSize).g;
  }
  vec3 shadeTint(float s){
    return s < 1.0 ? mix(vec3(0.62,0.6,0.86), vec3(1.0), s) * s
                   : mix(vec3(1.0), vec3(1.12,1.04,0.86), s - 1.0) * s;
  }
  // a: cuánto ambiente llega (ambAt). Las fuentes pesan más cuanto menos ambiente hay (Ambiente.torchK)
  vec3 lightFor(float s, vec3 torch, float a){
    float b = bayer4(gl_FragCoord.xy);
    float dk = clamp(-torch.r*1.5, 0.0, 1.0);   // oscuridad mágica (luz negativa)
    float lv = clamp(uLevel*a, 0.0, 1.0);
    vec3 tl = max(torch, 0.0) * uFlicker * (1.15 - 0.8*pow(lv, 1.5));
    if(uMode > 1.5) tl = floor(tl*5.0 + b)/5.0; else if(uMode > 0.5) tl = floor(tl*5.0 + 0.5)/5.0;
    vec3 l = mix(uDark, uAmbient, a)*shadeTint(s) + tl*(0.6 + 0.4*min(s,1.0));
    l = mix(l, vec3(0.07,0.06,0.11)*min(s,1.0), dk);
    if(uMode > 1.5) l = floor(l*7.0 + b)/7.0; else if(uMode > 0.5) l = floor(l*6.0 + 0.5)/6.0;
    return l;
  }`;
// niebla de guerra: una textura con un píxel por casilla (0 nunca visto, 1 explorado, 2 visible)
// niebla de guerra: un texel por casilla (0 nunca visto, 0,5 explorado, 1 visible) con filtro lineal;
// p es la posición continua en casillas: los bordes se funden en una casilla, en escalones tramados
const FOG_GLSL=`
  uniform sampler2D uFog; uniform vec2 uFogSize; uniform float uFogOn; uniform float uFogDM;
  vec3 applyFog(vec3 c, vec2 p){
    if(uFogOn < 0.5) return c;
    float v = texture2D(uFog, p / uFogSize).r;
    v = clamp(floor(v*6.0 + bayer4(gl_FragCoord.xy)*0.999)/6.0, 0.0, 1.0);
    if(v > 0.99) return c;
    float g = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 seen = mix(vec3(g), c, 0.35) * 0.5;
    vec3 unseen = uFogDM > 0.5 ? mix(vec3(g), c, 0.2) * 0.3 : vec3(0.043, 0.035, 0.08);
    return v > 0.5 ? mix(seen, c, (v - 0.5) * 2.0) : mix(unseen, seen, v * 2.0);
  }`;
const fogU={ uFog:{value:null}, uFogSize:{value:new THREE.Vector2(1,1)}, uFogOn:{value:0}, uFogDM:{value:0} };
// ambiente (T6c): color a pleno y de la oscuridad, nivel (ambient de JA-VTT) y la textura de cuánto llega a cada casilla
const ambTex0=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1,THREE.RGBAFormat); ambTex0.needsUpdate=true;
const ambU={ uAmbient:{value:new THREE.Color(1,1,1)}, uDark:{value:new THREE.Color(0,0,0)}, uLevel:{value:1}, uAmbT:{value:ambTex0}, uAmbSize:{value:new THREE.Vector2(1,1)} };
const uniforms={
  ...fogU, ...ambU,
  uMap:{value:atlasTex},
  uFlicker:{value:1}, uMode:{value:2}, uFrame:{value:0}
};
const terrainMat=new THREE.ShaderMaterial({ uniforms,
  vertexShader:`
    attribute float aShade; attribute vec3 aTorch; attribute float aAnim; attribute vec2 aLocal; attribute vec4 aEdge; attribute vec2 aCell;
    uniform float uFrame;
    varying vec2 vUv; varying float vShade; varying vec3 vTorch; varying vec2 vLocal; varying vec4 vEdge; varying vec2 vCell;
    void main(){
      vUv = uv + vec2(aAnim * uFrame / 16.0, 0.0);
      vShade = aShade; vTorch = aTorch; vLocal = aLocal; vEdge = aEdge; vCell = aCell;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader:`
    uniform sampler2D uMap;
    varying vec2 vUv; varying float vShade; varying vec3 vTorch; varying vec2 vLocal; varying vec4 vEdge; varying vec2 vCell;
    ${LIGHT_GLSL}
    ${FOG_GLSL}
    void main(){
      vec4 t = texture2D(uMap, vUv);
      if(t.a < 0.5) discard;
      vec2 lc = min(floor(vLocal*16.0), 15.0);
      float rim = max(max(vEdge.x*step(lc.y,0.5), vEdge.y*step(14.5,lc.y)), max(vEdge.z*step(lc.x,0.5), vEdge.w*step(14.5,lc.x)));
      gl_FragColor = vec4(applyFog(t.rgb * lightFor(vShade + rim*0.45, vTorch, ambAt(vCell + vLocal)), vCell + vLocal), 1.0);
    }`
});
const decorUniforms={ ...fogU, ...ambU, uFixed:{value:0}, uMap:{value:SPR.decor}, uFlicker:uniforms.uFlicker,
  uMode:uniforms.uMode, uYaw:{value:0}, uInvCos:{value:1/COS_E} };
const decorMat=new THREE.ShaderMaterial({ uniforms:decorUniforms,
  vertexShader:`
    attribute vec2 aCorner; attribute vec3 aTorch; attribute float aAngle; attribute float aSecond;
    uniform float uYaw; uniform float uInvCos; uniform float uFixed;
    varying vec2 vUv; varying vec3 vTorch; varying vec2 vCell;
    void main(){
      vCell = position.xz;
      float ang = uFixed > 0.5 ? aAngle : uYaw;
      float k = (uFixed < 0.5 && aSecond > 0.5) ? 0.0 : 1.0;
      vec3 right = vec3(cos(ang), 0.0, -sin(ang));
      vec3 p = position + (right*aCorner.x + vec3(0.0, aCorner.y*uInvCos, 0.0))*k;
      vUv = uv; vTorch = aTorch;
      gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
    }`,
  fragmentShader:`
    uniform sampler2D uMap;
    varying vec2 vUv; varying vec3 vTorch; varying vec2 vCell;
    ${LIGHT_GLSL}
    ${FOG_GLSL}
    void main(){
      vec4 t = texture2D(uMap, vUv);
      if(t.a < 0.5) discard;
      gl_FragColor = vec4(applyFog(t.rgb * lightFor(1.0, vTorch, ambAt(vCell)), vCell), 1.0);
    }`,
  side:THREE.DoubleSide
});
let decorMesh=null;
const waterUniforms={ ...fogU, ...ambU, uMap:uniforms.uMap, uFlicker:uniforms.uFlicker,
  uMode:uniforms.uMode, uFrame:uniforms.uFrame, uTime:{value:0}, uTexN:{value:TEX} };
const waterMat=new THREE.ShaderMaterial({ uniforms:waterUniforms,
  vertexShader:`
    attribute vec2 aLocal; attribute float aShade; attribute vec3 aTorch; attribute vec2 aFlow; attribute float aTile; attribute float aAnim; attribute vec2 aCell;
    uniform float uFrame;
    varying vec2 vLocal; varying float vShade; varying vec3 vTorch; varying vec2 vFlow; varying float vTile; varying vec2 vCell;
    void main(){
      vCell=aCell; vLocal=aLocal; vShade=aShade; vTorch=aTorch; vFlow=aFlow; vTile=aTile+aAnim*uFrame;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader:`
    uniform sampler2D uMap; uniform float uTime; uniform float uTexN;
    varying vec2 vLocal; varying float vShade; varying vec3 vTorch; varying vec2 vFlow; varying float vTile; varying vec2 vCell;
    ${LIGHT_GLSL}
    ${FOG_GLSL}
    void main(){
      vec2 off = floor(vFlow*uTime*uTexN)/uTexN;           // la corriente avanza de texel en texel
      vec2 lu = clamp(fract(vLocal - off), 0.002, 0.998);
      float tile = floor(vTile+0.5), col = mod(tile,16.0), row = floor(tile/16.0);
      vec4 t = texture2D(uMap, vec2((col+lu.x)/16.0, 1.0-(row+lu.y)/4.0));
      if(t.a < 0.5) discard;
      gl_FragColor = vec4(applyFog(t.rgb * lightFor(vShade, vTorch, ambAt(vCell + 0.5)), vCell + 0.5), 1.0);
    }`
});
const shadowMat=new THREE.MeshBasicMaterial({map:SPR.shadow,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
const brazierMat=new THREE.MeshBasicMaterial({map:SPR.brazier[0],alphaTest:0.5});
const brazierStackMat=new THREE.MeshBasicMaterial({map:STK.brazier.tex[0],alphaTest:0.5});
const glowMat=new THREE.MeshBasicMaterial({map:SPR.glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const glowMats=new Map();
// halo de un color; los de dentro de una zona interior brillan como de noche aunque fuera sea de día
function glowMatFor(hex,inside){ const key=hex+(inside?'|in':''); let m=glowMats.get(key); if(!m){ m=glowMat.clone(); m.color.set(hex); m.userData.inside=!!inside; m.opacity=inside?1:glowMat.opacity; glowMats.set(key,m); } return m; }
const selCursor=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:ringTex(22),alphaTest:0.5,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
const contactMat=new THREE.MeshBasicMaterial({map:SPR.contact,transparent:true,opacity:0.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
const destCursor=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:SPR.dest,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
destCursor.visible=false; scene.add(selCursor,destCursor);
// casilla bajo el cursor del ratón (solo con mouse)
const hoverCursor=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:SPR.dest,transparent:true,opacity:0.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
hoverCursor.visible=false; scene.add(hoverCursor);

function applyArtMaps(){
  uniforms.uMap.value=atlasTex; decorUniforms.uMap.value=SPR.decor; shadowMat.map=SPR.shadow; glowMat.map=SPR.glow; for(const m of glowMats.values()) m.map=SPR.glow;
  selCursor.material.map=ringTex(selCursor.userData.px||22); contactMat.map=SPR.contact; destCursor.material.map=SPR.dest; hoverCursor.material.map=SPR.dest;
  for(const b of bills) if(b.parts){ b.parts.top.map=baseTex(tokenColor(b.sheet),b.parts.D); b.parts.key=''; }
}
/* ---- posproceso: contornos por profundidad + cielo tramado ---- */
let rt=null;
const postUniforms={ tColor:{value:null}, tDepth:{value:null}, uRes:{value:new THREE.Vector2(1,1)},
  uThr:{value:0.00016}, uOutline:{value:1}, uSkyTop:{value:new THREE.Color()}, uSkyBot:{value:new THREE.Color()}, uInk:{value:new THREE.Color(0x120e22)} };
const postScene=new THREE.Scene(), postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({ uniforms:postUniforms, depthTest:false, depthWrite:false,
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader:`
    uniform sampler2D tColor; uniform highp sampler2D tDepth; uniform vec2 uRes; uniform highp float uThr; uniform float uOutline;
    uniform vec3 uSkyTop; uniform vec3 uSkyBot; uniform vec3 uInk;
    varying vec2 vUv;
    float bayer2(vec2 a){ a=floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
    highp float dep(vec2 o){ return texture2D(tDepth, vUv + o/uRes).x; }
    void main(){
      highp float dc = dep(vec2(0.0));
      vec3 col;
      if(dc > 0.99999){
        float g = floor(vUv.y*10.0 + bayer4(gl_FragCoord.xy))/10.0;
        col = mix(uSkyBot, uSkyTop, g);
      } else col = texture2D(tColor, vUv).rgb;
      if(uOutline > 0.5){
        highp float l = dep(vec2(-1.0,0.0)), r = dep(vec2(1.0,0.0)), u = dep(vec2(0.0,1.0)), w = dep(vec2(0.0,-1.0));
        // segunda derivada: en superficies planas (aunque estén inclinadas) es casi cero
        highp float lap = max(abs(l + r - 2.0*dc), abs(u + w - 2.0*dc));
        highp float dn = min(min(l,r), min(u,w));
        if(lap > uThr && dc - dn > uThr*0.5) col = mix(col, uInk, 0.5);
      }
      gl_FragColor = vec4(col, 1.0);
    }`
})));
function makeRT(w,h){
  if(rt){ rt.dispose(); rt.depthTexture&&rt.depthTexture.dispose(); }
  rt=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
  rt.depthTexture=new THREE.DepthTexture(w,h); rt.depthTexture.type=renderer.capabilities.isWebGL2?THREE.FloatType:THREE.UnsignedIntType;
  postUniforms.tColor.value=rt.texture; postUniforms.tDepth.value=rt.depthTexture; postUniforms.uRes.value.set(w,h);
}

const state={ sizeMul:1, cssPx:3, zooms:[0.5,1,2,3,4], zi:1, yaw:Math.PI/4, yawFrom:Math.PI/4, yawTarget:Math.PI/4, rotT:1,
  free:false, diagonal:true, lightMode:2, outline:true, decor:true, lowWalls:false, stack3d:false,
  target:new THREE.Vector3(4,1,4), lowW:0, lowH:0, time:0 };

/* ============ mapa ============ */
let WS=null, waterMesh=null;
let doorShut=new Set();
// casillas de puertas de fábrica cerradas (tapan vista y luz como un muro: GRID.door). Una puerta p: tapa por sus componentes
// y su estado, desde WALLAT (Catalogo.blocks): una reja (sight:'none') cerrada deja ver aunque no deje pasar (P-48)
let doorSeal=new Set();
/* muros de JA-VTT por casilla (T6b, muros.js): WALLAT = casilla → lista de piezas que pueden tapar (ventana, velo, maleza,
   barrera, portal, piezas p: que tapan); tapa si alguna tapa (P-48: una p: sobre una ventana ya no la pisa ni al revés).
   Las puertas van en doorShut (cerradas; doorSeal si son de fábrica) y lockedDoors (con llave), en todas sus casillas.
   HAS_COVER: hay maleza. */
let lockedDoors=new Set(), WALLAT=new Map(), HAS_COVER=false;
// ajustes del tablero (t3d.boards.settings): los de JA-VTT, ver ajustes.js. hpEnabled, acEnabled y conditionsEnabled apagados
// esconden vida, CA y estados (con la altura) a todo el mundo, director incluido; la privacidad por jugador la pone el servidor.
let SETTINGS=Ajustes.norm(null);
const hpOn=()=>SETTINGS.hpEnabled!==false, acOn=()=>SETTINGS.acEnabled!==false, condsOn=()=>SETTINGS.conditionsEnabled!==false, diceOn=()=>SETTINGS.diceEnabled!==false;
// lo que el servidor no le manda al jugador de una ficha ajena (sheet.withheld: 'ac', 'hp'; con 'bar_only', sólo hpBar)
const withheld=(b,k)=>!!(b&&b.sheet&&Array.isArray(b.sheet.withheld)&&b.sheet.withheld.includes(k));
// definiciones de piezas del tablero (p:…, Tablero3D.Catalogo las lee junto a las de fábrica); vacías hasta la fase 1.
// Van aquí arriba (y no junto a CAMP) porque propSpan y compañía las usan desde el primer mapa. Las llena loadPieces;
// hasta que termina bien (PIECES_OK) no se guarda nada; lo que lee escenas espera a PIECES_READY, que se cumple tras el primer intento
// (bien o mal, M4): con la carga fallida, las p: quedan opacas hasta que un reintento las trae.
let PIECES=new Map(), PIECES_OK=false, piecesDone=null;
const PIECES_READY=new Promise(r=>{ piecesDone=r; });
// ¿se puede guardar ya? Si no, se avisa y no se guarda: sin las definiciones se perderían piezas
const piecesGate=()=>{ if(PIECES_OK) return true; showHint('Aún se están cargando las piezas del tablero; inténtalo en un momento.',2200); return false; };
// pieza de una definición del tablero (p:) que aquí no se conoce (borrada o sin cargar): se conserva tal cual, se dibuja
// con el marcador «sin arte», ocupa su casilla y no hace nada más; al guardar se escribe igual que llegó
const opaque=p=>typeof p.def==='string'&&p.def.startsWith('p:')&&Catalogo.defIdOf(p)===p.def&&!Catalogo.defOf(p,PIECES);
const UID_OK=/^u[a-z0-9]{8}$/;
// objeto por capas con el que se pinta un objeto del mapa: el portal, el de su aspecto
// I4 (ola final): lo que decide comportamiento o campos por tipo pregunta por el de FÁBRICA (Catalogo.factoryType): una pieza p:
// con type 'portal', 'light', 'window' o 'tree' no es un portal, una luz, una ventana ni un árbol de fábrica. El arte sigue por `type`.
const FT=p=>Catalogo.factoryType(p);
const propKind=p=>FT(p)==='portal'?(Muros.PORTAL_LOOKS[p.look]||Muros.PORTAL_LOOKS.door).prop:p.type;
// clave del dibujo que sustituye a un objeto: los árboles guardan el suyo como tree0–tree2 (así pueden tener luz propia, arreglo §6);
// un portal, el de su aspecto (el que se pinta, propKind)
const propArtKey=p=>FT(p)==='tree'?'tree'+((p.v|0)%3):propKind(p);
const gmView=()=>!LIVE.on||LIVE.dm;
// ¿puede quien mira abrir esta puerta? El director, siempre; un jugador, si no tiene llave y el tablero lo deja (playersDoors)
const canOpenDoor=p=>gmView()||(!p.locked&&SETTINGS.playersDoors!==false);
const MINI_KINDS=CHARS.map(c=>c[0]);
let M=null, EH=null, L=null, DK=null, blocked=new Set(), bills=[], selected=null, destTimer=0, lightDirty=false, lastRelight=0, relitBoxes=[];
const idx=(x,z)=>z*M.w+x;
const inb=(x,z)=>x>=0&&z>=0&&x<M.w&&z<M.d;
const hAt=(x,z)=>inb(x,z)?EH[idx(x,z)]:EDGE;
const topY=(x,z)=>EH[idx(x,z)]*STEP;
// fichas de varios tamaños: una de n casillas ocupa [x, x+n) × [z, z+n); su centro es (x+n/2, z+n/2) y se apoya en la más alta
const nOf=b=>b&&b.mini&&b.sheet?Fichas.cellsOf(b.sheet):1;
function footY(x,z,n){ if(n===1) return standY(x,z); let m=-Infinity; for(let j=0;j<n;j++) for(let k=0;k<n;k++) if(inb(x+k,z+j)) m=Math.max(m,standY(x+k,z+j)); return m===-Infinity?standY(x,z):m; }
// objetos de varias casillas (`span` [ancho, fondo] en PROP3D; girados 90° se cambian): la esquina es (x, z)
function propSpan(p){ return Catalogo.span(p,PIECES); }
function propCells(p){ const [w,d]=propSpan(p), out=[]; for(let j=0;j<d;j++) for(let i=0;i<w;i++) out.push([p.x+i,p.z+j]); return out; }
const propCovers=(p,x,z)=>{ const [w,d]=propSpan(p); return x>=p.x&&z>=p.z&&x<p.x+w&&z<p.z+d; };
// puentes: DECK guarda por casilla la altura (en pasos) de la tarima que se pisa, o 0
let DECK=null;
const standY=(x,z)=>{ const i=idx(x,z); return DECK&&DECK[i]?DECK[i]*STEP:topY(x,z); };
function spanY(b){ let m=-Infinity; for(let j=0;j<b.span[1];j++) for(let i=0;i<b.span[0];i++) if(inb(b.x+i,b.z+j)) m=Math.max(m,topY(b.x+i,b.z+j)); return m===-Infinity?topY(b.x,b.z):m; }
const billY=b=>b.mini?footY(b.x,b.z,nOf(b)):b.deck?standY(b.x,b.z)-b.deck:b.span?spanY(b):topY(b.x,b.z);

function computeEH(){
  const n=M.w*M.d; EH=new Int8Array(n); gridDirty=true; planKey='';
  for(let i=0;i<n;i++){
    let h=M.h[i]; if(RCAP&&RCAP[i]) h=Math.min(h,RCAP[i]);
    if(state.lowWalls&&M.t[i]==='w'){
      const x=i%M.w, z=(i/M.w)|0; let m=-1;
      for(const [dx,dz] of DIR4){ const X=x+dx, Z=z+dz; if(inb(X,Z)&&M.t[idx(X,Z)]!=='w') m=Math.max(m,M.h[idx(X,Z)]); }
      h=Math.min(h,m>=0?m+1:3);
    }
    EH[i]=h;
  }
}
/* ---- luz: cada fuente tiene posición, altura, radio, color e intensidad; los desniveles y las
   puertas cerradas proyectan sombra. L guarda la luz de las fuentes por casilla en RGB. ---- */
const ZERO3=[0,0,0];
const Lc=i=>[L[i*3],L[i*3+1],L[i*3+2]];
// rejilla para Vision (vision.js, Tablero3D.Vision): superficie, muros y puertas cerradas del mapa actual
// ¿tapa la casilla i para flag alguna de sus piezas de WALLAT? (P-48 b)
function wallBlocks(i,flag){ const ps=WALLAT.get(i); if(!ps) return false; for(const p of ps) if(Muros.blocks(p,flag,PIECES)) return true; return false; }
function wallAdd(i,p){ const ps=WALLAT.get(i); if(ps) ps.push(p); else WALLAT.set(i,[p]); }
const GRID={ get w(){ return M.w; }, get d(){ return M.d; }, top:i=>EH[i]*STEP, wall:i=>M.t[i]==='w', door:i=>doorSeal.has(i), bk:wallBlocks };
const lightReaches=(lx,ly,lz,tx,tz,ty)=>Vision.lightReaches(GRID,lx,ly,lz,tx,tz,ty);
// cono (linterna sorda, ventana): fuera del ángulo no llega luz; el borde se funde en CONE_SOFT grados
const CONE_SOFT=12;
function coneOf(l){ if(!l.cone) return null; const a=l.cone.rot*Math.PI/180; return {cx:Math.cos(a),cz:Math.sin(a),half:l.cone.a/2}; }
function coneF(C,l,x,z,d){ if(!C||d<=0.75) return 1;
  const ang=Math.acos(Math.max(-1,Math.min(1,((x+.5-l.x)*C.cx+(z+.5-l.z)*C.cz)/d)))*180/Math.PI;
  return ang<=C.half?1:ang>=C.half+CONE_SOFT?0:1-(ang-C.half)/CONE_SOFT; }
function addLight(l){
  const r=Math.max(0.5,l.r), c=l.rgb||lightRGB(l.c), k=l.k==null?1:l.k, rr=r+1, C=coneOf(l);
  const x0=Math.max(0,Math.floor(l.x-rr)), x1=Math.min(M.w-1,Math.floor(l.x+rr)), z0=Math.max(0,Math.floor(l.z-rr)), z1=Math.min(M.d-1,Math.floor(l.z+rr));
  for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++){
    const d=Math.hypot(x+.5-l.x,z+.5-l.z); if(d>rr) continue;
    let f=(1-d/rr)*coneF(C,l,x,z,d); if(f<=0.01) continue;
    const i=idx(x,z), ty=EH[i]*STEP;
    if(d>0.75&&!lightReaches(l.x,l.y,l.z,x,z,ty)) continue;
    if(ty>l.y+0.05) f*=0.35;   // la cara de arriba de lo que está más alto que la llama sólo recibe rebote
    f*=k; L[i*3]+=c[0]*f; L[i*3+1]+=c[1]*f; L[i*3+2]+=c[2]*f;
  }
}
// oscuridad mágica: las casillas a su alcance (con sombras y cono como una luz) quedan a oscuras
function addDark(l){
  const r=Math.max(0.5,l.r), C=coneOf(l);
  const x0=Math.max(0,Math.floor(l.x-r)), x1=Math.min(M.w-1,Math.floor(l.x+r)), z0=Math.max(0,Math.floor(l.z-r)), z1=Math.min(M.d-1,Math.floor(l.z+r));
  for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++){
    const d=Math.hypot(x+.5-l.x,z+.5-l.z); if(d>r+0.25||coneF(C,l,x,z,d)<0.5) continue;
    const i=idx(x,z); if(d>0.75&&!lightReaches(l.x,l.y,l.z,x,z,EH[i]*STEP)) continue;
    DK[i]=1;
  }
}
// L < 0 en una casilla = oscuridad mágica: el sombreador la pinta casi negra, se funde en los bordes y tapa el ambiente
function computeLight(){
  const n=M.w*M.d; L=new Float32Array(n*3); DK=null; const darks=[]; computeAmbient();
  for(const l of allLights()){ if(l.baseY) l.y=l.baseY(); if(l.dark) darks.push(l); else addLight(l); }
  for(let i=0;i<n*3;i++) if(L[i]>1.6) L[i]=1.6;
  if(darks.length){ DK=new Uint8Array(n); for(const l of darks) addDark(l); for(let i=0;i<n;i++) if(DK[i]) L[i*3]=L[i*3+1]=L[i*3+2]=-1; }
  fogDirty=true; if(roofMeshes.length) roofLight();
}
const inDark=i=>!!(DK&&DK[i]);
const AO=[1,0.84,0.72,0.62];
function cornerAO(x,z,hc,sx,sz){ const s1=hAt(x+sx,z)>hc, s2=hAt(x,z+sz)>hc, c=hAt(x+sx,z+sz)>hc; return AO[(s1&&s2)?3:(s1+s2+c)]; }
function cornerLight(x,z,hc,sx,sz){
  const i0=idx(x,z); let r0=L[i0*3], g0=L[i0*3+1], b0=L[i0*3+2], n=1;
  for(const [cx,cz] of [[x+sx,z],[x,z+sz],[x+sx,z+sz]]) if(inb(cx,cz)&&EH[idx(cx,cz)]<=hc+1){ const j=idx(cx,cz)*3; r0+=L[j]; g0+=L[j+1]; b0+=L[j+2]; n++; }
  return [r0/n,g0/n,b0/n];
}
const SIDES=[
  {dx:1,dz:0,s:0.82,a:(x,z)=>[x+1,z+1],b:(x,z)=>[x+1,z]},
  {dx:-1,dz:0,s:0.60,a:(x,z)=>[x,z],b:(x,z)=>[x,z+1]},
  {dx:0,dz:1,s:0.72,a:(x,z)=>[x,z+1],b:(x,z)=>[x+1,z+1]},
  {dx:0,dz:-1,s:0.50,a:(x,z)=>[x+1,z],b:(x,z)=>[x,z]}
];
const EDGE_DIRS=[[0,-1],[0,1],[-1,0],[1,0]]; // norte, sur, oeste, este
const LOC=[[0,0],[0,1],[1,1],[1,0]], NOEDGE=[0,0,0,0];
function buildChunk(cx0,cz0){
  const pos=[],uv=[],sh=[],tl=[],an=[],loc=[],edg=[],cel=[]; let CC=[0,0];
  const quad=(P,U,Sh,T,A,Lc,E)=>{ for(const k of [0,1,2,0,2,3]){ const p=P[k]; pos.push(p[0],p[1],p[2]); uv.push(U[k][0],U[k][1]); sh.push(Sh[k]); tl.push(T[k][0],T[k][1],T[k][2]); an.push(A); cel.push(CC[0],CC[1]);
    if(Lc){ loc.push(Lc[k][0],Lc[k][1]); } else loc.push(0.5,0.5); edg.push(E[0],E[1],E[2],E[3]); } };
  const xe=Math.min(cx0+CH,M.w), ze=Math.min(cz0+CH,M.d);
  for(let z=cz0;z<ze;z++) for(let x=cx0;x<xe;x++){
    const i=idx(x,z), hc=EH[i], ter=TERR[M.t[i]], y=hc*STEP; CC=[x,z];
    const r=uvc(pick(ter.top,x,z,1),'full');
    const Sh=[cornerAO(x,z,hc,-1,-1),cornerAO(x,z,hc,-1,1),cornerAO(x,z,hc,1,1),cornerAO(x,z,hc,1,-1)];
    if(ter.lava) for(let q=0;q<4;q++) Sh[q]=1.55;   // la lava brilla por sí misma
    const T=[cornerLight(x,z,hc,-1,-1),cornerLight(x,z,hc,-1,1),cornerLight(x,z,hc,1,1),cornerLight(x,z,hc,1,-1)];
    const E=EDGE_DIRS.map(([dx,dz])=>hAt(x+dx,z+dz)<hc?1:0);
    quad([[x,y,z],[x,y,z+1],[x+1,y,z+1],[x+1,y,z]],[[r.u0,r.vT],[r.u0,r.vB],[r.u1,r.vB],[r.u1,r.vT]],Sh,T,ter.anim?1:0,LOC,E);
    // transiciones: el terreno vecino con más prioridad invade el borde de esta casilla
    const yo=y+0.008;
    EDGE_DIRS.forEach(([dx,dz],dir)=>{
      const nx=x+dx, nz=z+dz; if(!inb(nx,nz)) return;
      const ni=idx(nx,nz), nt=TERR[M.t[ni]];
      let tile=-1;
      if(ter.water){ if(!nt.water) tile=35; }
      else if(!nt.water && nt.fringe && nt.prio>ter.prio && EH[ni]===hc) tile=nt.fringe;
      if(tile<0) return;
      quad([[x,yo,z],[x,yo,z+1],[x+1,yo,z+1],[x+1,yo,z]],edgeUV(uvc(tile,'full'),dir),Sh,T,0,LOC,NOEDGE);
    });
    for(let si=0;si<4;si++){
      const Dd=SIDES[si], nx=x+Dd.dx, nz=z+Dd.dz, hn=hAt(nx,nz); if(hn>=hc) continue;
      CC=inb(nx,nz)?[nx,nz]:[x,z];   // un lateral se ve desde la casilla que tiene delante
      const ln=inb(nx,nz)?Lc(idx(nx,nz)):ZERO3, A=Dd.a(x,z), Bp=Dd.b(x,z);
      for(let l=hn;l<hc;l++){
        const y0=l*STEP, y1=(l+1)*STEP, s=hc-1-l, par=((l%2)+2)%2;
        const tile=s===0?pick(ter.side,x*4+si,z,l+7):pick(ter.low,x*4+si,z,l+9);
        const u=uvc(tile, s===0?'top':(par?'top':'bottom'));
        const f0=l===hn?0.74:1, d=Dd.s;
        quad([[A[0],y0,A[1]],[Bp[0],y0,Bp[1]],[Bp[0],y1,Bp[1]],[A[0],y1,A[1]]],
          [[u.u0,u.vB],[u.u1,u.vB],[u.u1,u.vT],[u.u0,u.vT]],[d*f0,d*f0,d,d],[ln,ln,ln,ln],0,null,NOEDGE);
      }
    }
  }
  if(!pos.length) return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('aShade',new THREE.Float32BufferAttribute(sh,1));
  g.setAttribute('aTorch',new THREE.Float32BufferAttribute(tl,3));
  g.setAttribute('aAnim',new THREE.Float32BufferAttribute(an,1));
  g.setAttribute('aLocal',new THREE.Float32BufferAttribute(loc,2));
  g.setAttribute('aEdge',new THREE.Float32BufferAttribute(edg,4));
  g.setAttribute('aCell',new THREE.Float32BufferAttribute(cel,2));
  g.computeBoundingSphere();
  return new THREE.Mesh(g,terrainMat);
}
function buildDecor(){
  if(decorMesh){ scene.remove(decorMesh); decorMesh.geometry.dispose(); decorMesh=null; }
  let r=null; const pos=[],cor=[],uv=[],tl=[],ang=[],sec=[];
  const add=(k,x,z)=>{
    const cx=x+.5+(r()-.5)*0.62, cz=z+.5+(r()-.5)*0.62, cy=topY(x,z)+0.001, t=Lc(idx(x,z));
    const u0=k/8+0.001, u1=(k+1)/8-0.001;
    const C=[[-.25,0,u0,0],[.25,0,u1,0],[.25,.5,u1,1],[-.25,.5,u0,1]];
    const a0=r()*Math.PI;
    for(let q=0;q<2;q++) for(const j of [0,1,2,0,2,3]){ pos.push(cx,cy,cz); cor.push(C[j][0],C[j][1]); uv.push(C[j][2],C[j][3]); tl.push(t[0],t[1],t[2]); ang.push(a0+q*HALF_PI); sec.push(q); }
  };
  for(let z=0;z<M.d;z++) for(let x=0;x<M.w;x++){
    const i=idx(x,z), t=M.t[i]; if(blocked.has(i)||(WS&&(WS[i]||isLake(i)))) continue;
    r=mulberry32(((M.seed||7)*9973+x*374761+z*668265)|0);
    const q=r();
    if(t==='g'){ if(q<0.55){ add(r()<.6?0:1,x,z); if(r()<.5)add(r()<.5?0:1,x,z); } if(r()<.13)add(r()<.5?2:3,x,z); if(r()<.03)add(5,x,z); }
    else if(t==='p'){ if(q<0.22)add(4,x,z); if(r()<.05)add(1,x,z); }
    else if(t==='a'){ if(q<0.12)add(4,x,z); else if(q<0.2)add(1,x,z); }
    else if(t==='s'){ if(q<0.07)add(7,x,z); else if(q<0.1)add(6,x,z); else if(q<0.12)add(5,x,z); }
  }
  if(!pos.length) return;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aCorner',new THREE.Float32BufferAttribute(cor,2));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('aTorch',new THREE.Float32BufferAttribute(tl,3));
  g.setAttribute('aAngle',new THREE.Float32BufferAttribute(ang,1));
  g.setAttribute('aSecond',new THREE.Float32BufferAttribute(sec,1));
  decorMesh=new THREE.Mesh(g,decorMat); decorMesh.frustumCulled=false; decorMesh.visible=state.decor;
  scene.add(decorMesh);
}
const chunks=new Map();
function makeChunk(cx,cz){
  const key=cx+','+cz, old=chunks.get(key);
  if(old){ chunkGroup.remove(old); old.geometry.dispose(); chunks.delete(key); }
  const m=buildChunk(cx,cz); if(m){ chunkGroup.add(m); chunks.set(key,m); }
}
/* cuadrícula (grid de JA-VTT, ajuste de escena): una línea por borde de casilla sobre su cara de arriba, con la niebla del resto
   (lo que no se ha visto no la enseña). Se rehace al cambiar las alturas. */
let gridMesh=null, gridDirty=true;
const gridMat=new THREE.ShaderMaterial({ uniforms:{...fogU}, transparent:true, depthWrite:false,
  vertexShader:`varying vec2 vCell; void main(){ vCell = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader:`
    varying vec2 vCell;
    float bayer2(vec2 a){ a=floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
    ${FOG_GLSL}
    void main(){ gl_FragColor = vec4(applyFog(vec3(0.05,0.04,0.08), vCell), 0.55); }` });
function buildGrid(){
  gridDirty=false; if(gridMesh){ scene.remove(gridMesh); gridMesh.geometry.dispose(); gridMesh=null; }
  if(!M||M.grid===false||!EH) return; const pos=[];
  for(let z=0;z<M.d;z++) for(let x=0;x<M.w;x++){ const y=EH[idx(x,z)]*STEP+0.015;
    pos.push(x,y,z, x+1,y,z, x,y,z, x,y,z+1); if(x===M.w-1||EH[idx(x+1,z)]!==EH[idx(x,z)]) pos.push(x+1,y,z, x+1,y,z+1); if(z===M.d-1||EH[idx(x,z+1)]!==EH[idx(x,z)]) pos.push(x,y,z+1, x+1,y,z+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeBoundingSphere();
  gridMesh=new THREE.LineSegments(g,gridMat); gridMesh.renderOrder=4; scene.add(gridMesh);
}
function rebuild(){
  computeEH(); computeLight();
  for(const m of chunks.values()){ chunkGroup.remove(m); m.geometry.dispose(); }
  chunks.clear();
  for(let cz=0;cz<M.d;cz+=CH) for(let cx=0;cx<M.w;cx+=CH) makeChunk(cx,cz);
  for(const b of bills) if(!b.path){ b.gy=billY(b); }
  buildWater();
}
// luz de personajes en marcha: recalcula y rehace sólo los bloques que tocan esas luces (antes y ahora)
function relight(){
  lightDirty=false; lastRelight=state.time;
  const boxes=miniLights().map(l=>[l.x-l.r-1,l.z-l.r-1,l.x+l.r+1,l.z+l.r+1]);
  if(!boxes.length&&!relitBoxes.length) return;   // nadie lleva luz: la iluminación no cambió
  computeLight(); const all=boxes.concat(relitBoxes), done=new Set(); relitBoxes=boxes;
  for(const [a0,b0,a1,b1] of all) for(let cz=Math.max(0,Math.floor(b0/CH))*CH;cz<=Math.min(M.d-1,b1);cz+=CH) for(let cx=Math.max(0,Math.floor(a0/CH))*CH;cx<=Math.min(M.w-1,a1);cx+=CH){ const k=cx+','+cz; if(done.has(k)) continue; done.add(k); makeChunk(cx,cz); }
  buildWater(); buildDecor(); if(glows.length!==allLights().filter(l=>l.glow).length) rebuildGlows();
}
// una puerta que se abre o se cierra cambia la luz de las fuentes a cuyo alcance está. No basta con lightDirty: relight()
// sólo se despierta por fichas con luz. Rehace la luz y los bloques hasta el alcance de esas fuentes (lo que la puerta
// deja pasar o tapa está en la recta fuente–casilla, más allá de la puerta, a menos de r+1 de la fuente y de la puerta).
// M6 (ola final): acepta una puerta o varias (un lote de la mesa en vivo): un solo computeLight y cada bloque una vez.
// P-48: una puerta de varias casillas cuenta desde cada una de ellas
function doorRelight(ps){ ps=Array.isArray(ps)?ps:[ps]; const lights=allLights(), done=new Set(); let any=false;
  for(const p of ps.flatMap(q=>propCells(q).map(([x,z])=>({x,z})))){ let pad=0; for(const l of lights){ const rr=Math.max(0.5,l.r)+1; if(Math.hypot(p.x+.5-l.x,p.z+.5-l.z)<=rr+1) pad=Math.max(pad,Math.ceil(rr)+1); }
    if(!pad) continue;   // ninguna fuente alcanza la puerta: la luz no cambia
    if(!any){ computeLight(); any=true; }
    const a0=Math.max(0,p.x-pad), b0=Math.max(0,p.z-pad), a1=Math.min(M.w-1,p.x+pad), b1=Math.min(M.d-1,p.z+pad);
    for(let cz=Math.floor(b0/CH)*CH;cz<=b1;cz+=CH) for(let cx=Math.floor(a0/CH)*CH;cx<=a1;cx+=CH){ const k=cx+','+cz; if(!done.has(k)){ done.add(k); makeChunk(cx,cz); } } }
  if(any){ buildWater(); buildDecor(); }
}
// reconstruye solo los bloques cercanos a lo editado (con margen para la luz)
function rebuildRegion(x0,z0,x1,z1){
  computeEH(); computeLight();
  const pad=8, a0=Math.max(0,x0-pad), b0=Math.max(0,z0-pad), a1=Math.min(M.w-1,x1+pad), b1=Math.min(M.d-1,z1+pad);
  for(let cz=Math.floor(b0/CH)*CH;cz<=b1;cz+=CH) for(let cx=Math.floor(a0/CH)*CH;cx<=a1;cx+=CH) makeChunk(cx,cz);
  for(const b of bills) if(!b.path){ b.gy=billY(b); }
  buildWater();
}


/* ============ agua: lagos por desborde (Priority-Flood) + ríos que buscan la caída ============ */
let WL=null, LR=null, DD=null, lakeProg=Infinity, WMAXR=0;
const isLake=i=>!!WL&&WL[i]>=0&&(LR[i]<0||LR[i]<=lakeProg);
const whOf=i=>isLake(i)?WL[i]:M.h[i];
function isDeep(i){ if(isLake(i)) return WL[i]>M.h[i]; return !!WS&&WS[i]>=6; }
// distancia (en casillas planas) hasta la caída más cercana; más de 6 = sin caída cerca
function computeDD(){
  const n=M.w*M.d, dd=new Int16Array(n).fill(99), q=new Int32Array(n); let qh=0, qt=0;
  for(let i=0;i<n;i++){
    if(M.t[i]==='w') continue;
    const x=i%M.w, z=(i/M.w)|0; let seed=false;
    for(const [dx,dz] of DIR4){ const X=x+dx, Z=z+dz; if(!inb(X,Z)){ seed=true; break; } const j=idx(X,Z); if(M.t[j]!=='w'&&M.h[j]<M.h[i]){ seed=true; break; } }
    if(seed){ dd[i]=0; q[qt++]=i; }
  }
  while(qh<qt){
    const c=q[qh++]; if(dd[c]>=6) continue;
    const x=c%M.w, z=(c/M.w)|0;
    for(const [dx,dz] of DIR4){ const X=x+dx, Z=z+dz; if(!inb(X,Z)) continue; const j=idx(X,Z);
      if(M.t[j]!=='w'&&M.h[j]===M.h[c]&&dd[j]>dd[c]+1){ dd[j]=dd[c]+1; q[qt++]=j; } }
  }
  return dd;
}
// montículo mínimo por altura del terreno (empates en orden de llegada)
function makeHeap(){ const a=[]; let ord=0;
  const less=(p,q)=>p[0]<q[0]||(p[0]===q[0]&&p[1]<q[1]);
  return { size:()=>a.length,
    push(h,i){ a.push([h,ord++,i]); let k=a.length-1; while(k>0){ const p=(k-1)>>1; if(!less(a[k],a[p])) break; [a[k],a[p]]=[a[p],a[k]]; k=p; } },
    pop(){ const top=a[0], last=a.pop(); if(a.length){ a[0]=last; let k=0; for(;;){ const l=2*k+1, r=l+1; let m=k;
        if(l<a.length&&less(a[l],a[m])) m=l; if(r<a.length&&less(a[r],a[m])) m=r; if(m===k) break; [a[k],a[m]]=[a[m],a[k]]; k=m; } }
      return top[2]; } };
}
// llena la cuenca desde "seed" hasta su punto de desborde; null si no es una cuenca (el agua simplemente corre)
function floodLake(seed,stampArr,stamp,avoidLakes){
  const CAP=3000, heap=makeHeap(); let level=M.h[seed], raised=false; const cells=[];
  heap.push(M.h[seed],seed); stampArr[seed]=stamp;
  const done=()=>({ok:raised,cells,level});
  while(heap.size()){
    const c=heap.pop(), gc=M.h[c];
    if(gc<level) return done();                 // desborde: el agua escapa cuesta abajo
    if(gc>level){ level=gc; raised=true; }      // el lago sube para cubrir esta casilla
    cells.push(c); if(cells.length>=CAP) return done();
    const x=c%M.w, z=(c/M.w)|0;
    for(const [dx,dz] of DIR4){
      const X=x+dx, Z=z+dz; if(!inb(X,Z)) return done();   // cae por el borde del tablero
      const j=idx(X,Z); if(stampArr[j]===stamp||M.t[j]==='w') continue;
      if(avoidLakes&&WL[j]>=0) continue;
      stampArr[j]=stamp; heap.push(M.h[j],j);
    }
  }
  return done();
}
function wStep(cur,lakeAll){
  const n=M.w*M.d, nx=new Uint8Array(n); let ch=false;
  const lk=i=>WL[i]>=0&&(lakeAll||LR[i]<0||LR[i]<=lakeProg);
  const hh=i=>lk(i)?WL[i]:M.h[i];
  for(let i=0;i<n;i++){
    let v=0;
    if(M.t[i]!=='w'){
      if(M.src[i]||lk(i)) v=8;
      else {
        const x=i%M.w, z=(i/M.w)|0, hi=M.h[i];
        for(const [dx,dz] of DIR4){
          const X=x+dx, Z=z+dz; if(!inb(X,Z)) continue;
          const j=idx(X,Z), sj=cur[j]; if(!sj||M.t[j]==='w'||M.src[j]===2) continue;   // el agua quieta no se expande
          const hj=hh(j);
          if(hj>hi) v=Math.max(v,7);                                        // cae desde más arriba
          else if(hj===hi&&(DD[j]>6||DD[i]<DD[j])) v=Math.max(v,sj-1);      // corre hacia la caída más cercana
        }
      }
    }
    nx[i]=v; if(v!==cur[i]) ch=true;
  }
  return [nx,ch];
}
// resuelve el estado final: lagos (varias pasadas: un lago desborda, el río llena la siguiente cuenca) y ríos
function solveWater(animate){
  const n=M.w*M.d, oldWL=WL;
  DD=computeDD(); WL=new Int16Array(n).fill(-1); LR=new Int32Array(n).fill(-1);
  const stampArr=new Int32Array(n); let stamp=0; WMAXR=0;
  let ws=new Uint8Array(n);
  for(let pass=0;pass<5;pass++){
    const seeds=[];
    for(let i=0;i<n;i++){
      if(M.t[i]==='w'||WL[i]>=0) continue;
      if(pass===0?M.src[i]===1:(ws[i]&&!M.src[i]&&DD[i]>6)) seeds.push(i);
    }
    const tried=new Uint8Array(n); let found=false;
    for(const sd of seeds){
      if(WL[sd]>=0||tried[sd]) continue;
      const r=floodLake(sd,stampArr,++stamp,pass>0);
      // el lago son solo las casillas bajo el nivel de desborde; las que quedan a su altura son orilla y el agua corre por ellas
      if(r.ok){ r.cells.forEach((c,k)=>{ if(WL[c]<0&&M.h[c]<r.level){ WL[c]=r.level; LR[c]=k; } }); WMAXR=Math.max(WMAXR,r.cells.length); found=true; }
      else for(const c of r.cells) tried[c]=1;
    }
    for(let k=0;k<4000;k++){ const [nx,ch]=wStep(ws,true); ws=nx; if(!ch) break; }
    if(pass>0&&!found) break;
  }
  for(let i=0;i<n;i++) if(WL[i]>=0&&(!animate||(oldWL&&oldWL.length===n&&oldWL[i]===WL[i]))) LR[i]=-1;
  lakeProg=animate?0:Infinity;
  return ws;
}
function settleWater(){ WS=solveWater(false); state.simActive=false; buildWater(); }
const wSurfY=i=>isLake(i)?WL[i]*STEP+0.12:M.h[i]*STEP+(WS[i]>=8?0.2:0.05+0.13*WS[i]/8);
const FOAMLOC=[[[0,0],[0,1],[1,1],[1,0]],[[1,1],[1,0],[0,0],[0,1]],[[1,0],[0,0],[0,1],[1,1]],[[0,1],[1,1],[1,0],[0,0]]];
function buildWater(){ if(typeof markMini==='function') markMini();
  if(waterMesh){ scene.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh=null; }
  if(!WS||WS.length!==M.w*M.d) return;
  const pos=[],loc=[],sh=[],tl=[],fl=[],ti=[],an=[],ce=[]; let WC=[0,0];
  const quad=(P,Lc,S,T,F,tile,anim)=>{ for(const k of [0,1,2,0,2,3]){ pos.push(P[k][0],P[k][1],P[k][2]); loc.push(Lc[k][0],Lc[k][1]); sh.push(S[k]); tl.push(T[0],T[1],T[2]); fl.push(F[0],F[1]); ti.push(tile); an.push(anim); ce.push(WC[0],WC[1]); } };
  const has=(x,z)=>inb(x,z)&&(WS[idx(x,z)]>0||isLake(idx(x,z)));
  for(let z=0;z<M.d;z++) for(let x=0;x<M.w;x++){
    const i=idx(x,z), s=WS[i], lake=isLake(i); if(!s&&!lake) continue;
    const g=whOf(i), y=wSurfY(i), lt=Lc(i); WC=[x,z];
    // dirección de la corriente
    let fx=0, fz=0;
    if(!M.src[i]&&!lake) for(const [dx,dz] of DIR4){
      const X=x+dx, Z=z+dz;
      if(!inb(X,Z)){ fx+=dx*2; fz+=dz*2; continue; }
      const j=idx(X,Z); if(M.t[j]==='w') continue;
      if(whOf(j)<g){ fx+=dx*2; fz+=dz*2; } else if(whOf(j)===g&&WS[j]<s){ fx+=dx*(s-WS[j]); fz+=dz*(s-WS[j]); }
    }
    const fm=Math.hypot(fx,fz); if(fm>0){ fx=fx/fm*0.7; fz=fz/fm*0.7; }
    const cy=(sx,sz)=>{ let sum=y, n=1; for(const [cx,cz] of [[x+sx,z],[x,z+sz],[x+sx,z+sz]]) if(has(cx,cz)&&whOf(idx(cx,cz))===g){ sum+=wSurfY(idx(cx,cz)); n++; } return sum/n; };
    const C=[cy(-1,-1),cy(-1,1),cy(1,1),cy(1,-1)];
    const dp=lake?1-Math.min(0.3,(WL[i]-M.h[i])*0.08):(M.src[i]===2?0.94:1+(8-s)*0.012);   // lo profundo, más oscuro
    quad([[x,C[0],z],[x,C[1],z+1],[x+1,C[2],z+1],[x+1,C[3],z]],[[0,0],[0,1],[1,1],[1,0]],[dp,dp,dp,dp],lt,[fx,fz],16,1);
    // espuma en orillas y al pie de las caídas
    EDGE_DIRS.forEach(([dx,dz],dir)=>{
      const X=x+dx, Z=z+dz; if(!inb(X,Z)) return;
      const j=idx(X,Z), wj=WS[j]||isLake(j), gj=wj?whOf(j):M.h[j];
      const bank=(!wj&&(gj>=g||M.t[j]==='w'))||(wj&&gj>g);
      if(!bank) return;
      quad([[x,C[0]+0.006,z],[x,C[1]+0.006,z+1],[x+1,C[2]+0.006,z+1],[x+1,C[3]+0.006,z]],FOAMLOC[dir],[1.1,1.1,1.1,1.1],lt,[0,0],44,1);
    });
    // cascadas hacia casillas más bajas (o por el borde del tablero)
    // faldones: cualquier borde del agua más alto que lo que hay al lado se cierra con una pared de agua
    // (cascada si el vecino está más abajo, borde corto si solo es la lámina de agua)
    const CI=[[2,3],[0,1],[1,2],[3,0]], still=M.src[i]===2;
    for(let si=0;si<4;si++){
      const D=SIDES[si], X=x+D.dx, Z=z+D.dz; let nt, ln=lt, fall=false;
      if(!inb(X,Z)){ nt=EDGE*STEP; fall=true; }
      else { const j=idx(X,Z); if(M.t[j]==='w') continue; const wj=WS[j]||isLake(j);
        nt=wj?wSurfY(j):EH[j]*STEP; fall=(wj?whOf(j):M.h[j])<g; const lj=Lc(j); ln=[Math.max(lt[0],lj[0]),Math.max(lt[1],lj[1]),Math.max(lt[2],lj[2])]; }
      if(still&&fall) nt=Math.max(nt,M.h[i]*STEP);   // el agua quieta no cae: su pared llega solo hasta su propio suelo
      const yA=C[CI[si][0]], yB=C[CI[si][1]];
      if(Math.max(yA,yB)-nt<=0.015) continue;
      const bot=Math.min(nt,yA,yB), big=fall&&!still&&Math.max(yA,yB)-bot>0.3;
      const A=D.a(x,z), Bp=D.b(x,z), ox=D.dx*0.012, oz=D.dz*0.012;
      quad([[A[0]+ox,bot,A[1]+oz],[Bp[0]+ox,bot,Bp[1]+oz],[Bp[0]+ox,yB,Bp[1]+oz],[A[0]+ox,yA,A[1]+oz]],
        [[0,yA-bot],[1,yB-bot],[1,0],[0,0]],[D.s,D.s,D.s,D.s],ln,big?[0,1.6]:[0,0],big?36:16,big?0:1);
    }
  }
  if(!pos.length) return;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aLocal',new THREE.Float32BufferAttribute(loc,2));
  g.setAttribute('aShade',new THREE.Float32BufferAttribute(sh,1));
  g.setAttribute('aTorch',new THREE.Float32BufferAttribute(tl,3));
  g.setAttribute('aFlow',new THREE.Float32BufferAttribute(fl,2));
  g.setAttribute('aTile',new THREE.Float32BufferAttribute(ti,1));
  g.setAttribute('aCell',new THREE.Float32BufferAttribute(ce,2));
  g.setAttribute('aAnim',new THREE.Float32BufferAttribute(an,1));
  g.computeBoundingSphere();
  waterMesh=new THREE.Mesh(g,waterMat); scene.add(waterMesh);
}

/* ============ entidades ============ */
function addBill(kind,x,z,opt={}){
  let geo, mat, sh, glow=null;
  const isMini=MINI_KINDS.includes(kind)||kind.startsWith('c_');
  if(isMini){ geo=GEO.mini; mat=new THREE.MeshBasicMaterial({map:(SPR[kind]||SPR.knight).front,alphaTest:0.5}); sh=GEO.shS; }
  else if(kind.startsWith('obj:')){ const key=kind.slice(4), st=CSTACK[key]||(PLACEHOLDER||(PLACEHOLDER=placeholderStack())); geo=st.geo; mat=new THREE.MeshBasicMaterial({map:st.tex,alphaTest:0.5}); sh=GEO.shL; }
  else if(PROP3D[kind]){ const st=pstack(kind); geo=st.geo; mat=new THREE.MeshBasicMaterial({map:st.tex,alphaTest:0.5}); sh=PROP3D[kind].big?GEO.shL:GEO.shS; }
  // M3 (ola final): sólo hay 3 árboles (STACK 0–2); un v=3, válido en el servidor (0–3), no revienta
  else if(kind==='tree'){ const st=STACK[(opt.v|0)%3]; geo=st.geo; mat=new THREE.MeshBasicMaterial({map:st.tex,alphaTest:0.5}); sh=GEO.shL; }
  else if(kind==='light'){ geo=GEO.lightMark; mat=new THREE.MeshBasicMaterial({map:SPR.sel,transparent:true,depthWrite:false,color:opt.darkness?'#8a6ad0':(opt.color||WARM),opacity:opt.on===false?0.35:1}); sh=null; }
  else if(CSTACK.brazier){ const st=CSTACK.brazier; geo=st.geo; mat=new THREE.MeshBasicMaterial({map:st.tex,alphaTest:0.5}); sh=GEO.shS; }
  else { geo=GEO.brazier; mat=brazierMat; sh=GEO.shS; }
  const mesh=new THREE.Mesh(geo,mat), shadow=new THREE.Mesh(sh||GEO.shS,shadowMat);
  if(kind==='light'){ shadow.visible=false; mesh.renderOrder=6; }
  if(kind==='tree'||kind.startsWith('obj:')||(kind==='brazier'&&CSTACK.brazier)) mesh.rotation.y=Math.floor(hash(x,z,5)*4)*HALF_PI;
  if(PROP3D[kind]) mesh.rotation.y=(PROP3D[kind].rand?Math.floor(hash(x,z,5)*4):((opt.v|0)&3))*HALF_PI;
  propGroup.add(mesh,shadow); if(glow) propGroup.add(glow);
  const b={owner:isMini&&typeof opt.owner==='string'?opt.owner:null,id:isMini?(opt.id||'m'+Math.random().toString(36).slice(2,9)):null,sheet:isMini?normSheet(opt.sheet,kind):null,kind,x,z,mesh,shadow,glow,mat,mini:isMini,solid:kind==='tree'||kind==='light'||kind.startsWith('obj:')||!!PROP3D[kind]||(kind==='brazier'&&!!CSTACK.brazier),prop:opt,emissive:false,fx:opt.fx??0,fz:opt.fz??1,
    px:x+.5,pz:z+.5,gy:0,path:null,pending:null,step:0,t:0,bob:Math.random()*2,dir:'front'};
  if(isMini){ const n=nOf(b); b.px=x+n/2; b.pz=z+n/2; addTokenParts(b); }
  const P3=PROP3D[kind];
  if(P3&&P3.span){ b.span=propSpan({type:kind,v:opt.v}); b.px=x+b.span[0]/2; b.pz=z+b.span[1]/2; const k2=Math.max(...b.span)*0.8; shadow.scale.set(k2,1,k2); }
  if(P3&&P3.deck) b.deck=P3.deck/16;
  if(P3&&(P3.deck||P3.noShadow)) b.noShadow=true;   // un puente o un murete bajo: sin sombra que dibujar
  if(P3&&P3.frame){ const st=pstack(P3.frame); b.frame=new THREE.Mesh(st.geo,new THREE.MeshBasicMaterial({map:st.tex,alphaTest:0.5})); b.frame.rotation.y=((opt.v|0)&3)*HALF_PI; propGroup.add(b.frame); }
  if(kind==='brazier'&&!CSTACK.brazier){ b.smat=brazierStackMat; b.stack=new THREE.Mesh(STK.brazier.geo,brazierStackMat); }
  if(b.stack){ b.stack.visible=false; propGroup.add(b.stack); }
  if(kind==='light'&&opt.angle<360){ const a=opt.angle*Math.PI/180, r0=(opt.rot||0)*Math.PI/180;
    b.cone=new THREE.Mesh(new THREE.CircleGeometry(Math.min(opt.r+1,25),Math.max(8,Math.ceil(opt.angle/6)),r0-a/2,a),
      new THREE.MeshBasicMaterial({color:opt.darkness?'#8a6ad0':(opt.color||WARM),transparent:true,opacity:opt.on===false?0.08:0.2,depthWrite:false,side:THREE.DoubleSide}));
    b.cone.rotation.x=HALF_PI; b.cone.renderOrder=4; b.cone.visible=false; propGroup.add(b.cone); }
  bills.push(b); return b;
}
function clearBills(){
  for(const b of bills){ propGroup.remove(b.mesh,b.shadow); if(b.glow) propGroup.remove(b.glow); if(b.mat!==brazierMat) b.mat.dispose(); dropTokenParts(b);
    if(b.frame){ propGroup.remove(b.frame); b.frame.material.dispose(); }
    if(b.stack){ propGroup.remove(b.stack); if(b.smat!==brazierStackMat) b.smat.dispose(); }
    if(b.cone){ propGroup.remove(b.cone); b.cone.geometry.dispose(); b.cone.material.dispose(); } }
  bills=[]; selected=null;
}

/* ============ fichas en pixel art: peana, sombra de contacto, selección y estado ============ */
// La ficha es parte del mundo: se apoya en una peana de piedra con un filo del color de su bando (pixel art con la
// paleta del terreno y alumbrada por la luz de su casilla, como el sprite), con sombra de contacto tramada; al elegirla,
// un anillo de trazos gira a saltos; encima, estados (abreviatura y color de JA-VTT) y vida con la temporal, en píxeles
// y en el mundo, sólo cuando importan (elegida, bajo el cursor o herida).
const TOKEN_COLORS={player:'#7fb2e5',enemy:'#d9705f',neutral:'#e8c05a'};
const tokenColor=s=>s.color||(s.neutral?TOKEN_COLORS.neutral:TOKEN_COLORS[s.kind]||TOKEN_COLORS.player);
function shadeHex(h,k){ return '#'+hexRGB(h).map(v=>Math.max(0,Math.min(255,Math.round(k<0?v*(1+k):v+(255-v)*k))).toString(16).padStart(2,'0')).join(''); }
const BASE_H=0.12, baseGeos=new Map(), statusGeos=new Map();
const baseDiam=s=>Fichas.sizeOf(s).base*0.86;
function baseTex(col,D){ const key=col+'|'+D; let t=baseTexCache.get(key); if(t) return t;
  const c=mkCanvas(D,D), x=c.getContext('2d'), r0=D/2, rim=shadeHex(col,0.1), rimD=shadeHex(col,-0.5);
  for(let py=0;py<D;py++) for(let px=0;px<D;px++){ const e=r0-Math.hypot(px+.5-r0,py+.5-r0); if(e<0) continue;   // distancia al borde, en píxeles
    const h=hash(px,py,D); x.fillStyle=e<1?rimD:e<2?rim:e<2.8?S[1]:h<0.12?S[2]:h<0.2?S[4]:h<0.24?S[1]:S[3]; x.fillRect(px,py,1,1); }
  t=tex(upscale(c,TEX/16,false)); baseTexCache.set(key,t); return t; }
function ringTex(N){ const key='ring|'+N; let t=baseTexCache.get(key); if(!t){ t=tex(upscale(drawRing(N,Math.max(6,Math.round(N*Math.PI/9))),TEX/16,false)); baseTexCache.set(key,t); } return t; }
// fila más alta con píxeles del dibujo del personaje (0–1): el estado va justo encima de la cabeza
function artTop(kind){ let v=artTops.get(kind); if(v!=null) return v; const cv=CUSTOM.chars[kind]?CUSTOM.chars[kind].canvases[0]:(CAN[kind]||CAN.knight).front;
  const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let top=0; outer: for(let y=0;y<cv.height;y++) for(let x=0;x<cv.width;x++) if(d[(y*cv.width+x)*4+3]>128){ top=y; break outer; }
  v=top/cv.height; artTops.set(kind,v); return v; }
// medidas del sprite en el mundo: las de sus propios píxeles (16 por casilla el de fábrica, `res` el dibujado), sea cual
// sea el tamaño de la ficha; así el texel del personaje es siempre el del terreno (caché en spriteDimC)
function spriteDims(kind){ let v=spriteDimC.get(kind); if(v) return v; const cu=CUSTOM.chars[kind];
  const cv=cu?cu.canvases[0]:(CAN[kind]||CAN.knight).front; v=Fichas.spriteWorld(cv.width,cv.height,cu?(cu.res||32):16); spriteDimC.set(kind,v); return v; }
// tamaño del arte de un sprite (el de fábrica, el que se eligió al dibujarlo o, en un dibujo de antes, Mediano)
function artSizeId(kind){ const cu=CUSTOM.chars[kind]; return cu?(cu.size||'medium'):(CHAR_ART[kind]||'medium'); }
// peana: cilindro bajo sin la tapa de abajo (nunca se ve)
function baseGeo(d){ let g=baseGeos.get(d); if(!g){ g=new THREE.CylinderGeometry(d/2,d/2*1.05,BASE_H,Math.max(12,Math.round(d*20))); g.translate(0,BASE_H/2,0); g.groups=g.groups.slice(0,2); baseGeos.set(d,g); } return g; }
const STONE_SIDE=hexRGB(S[2]).map(v=>v/255);
function addTokenParts(b){
  const D=Math.max(6,2*Math.round(8*baseDiam(b.sheet)));
  const top=new THREE.MeshBasicMaterial({map:baseTex(tokenColor(b.sheet),D)}), side=new THREE.MeshBasicMaterial({color:0xffffff});
  const base=new THREE.Mesh(baseGeo(baseDiam(b.sheet)),[side,top,side]);
  b.shadow.geometry=GEO.cursor; b.shadow.material=contactMat;
  b.parts={base,top,side,D,diam:baseDiam(b.sheet),key:'',stat:null}; propGroup.add(base);
}
// si cambia el tamaño o el color de la ficha, la peana se rehace
function syncTokenParts(b){ const P=b.parts, d=baseDiam(b.sheet), col=tokenColor(b.sheet), key=col+'|'+d; if(P.key===key) return; P.key=key;
  P.D=Math.max(6,2*Math.round(8*d)); P.diam=d; P.base.geometry=baseGeo(d); P.top.map=baseTex(col,P.D); P.top.needsUpdate=true; }
function dropTokenParts(b){ const P=b.parts; if(!P) return; propGroup.remove(P.base); P.top.dispose(); P.side.dispose();
  if(P.stat){ propGroup.remove(P.stat.mesh); P.stat.mesh.material.dispose(); P.stat.tex.dispose(); } b.parts=null; }
// letras de 3×5 píxeles para las abreviaturas de los estados y la altura
const GLYPH={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',G:'011100101101011',H:'101101111101101',I:'111010010010111',
  L:'100100100100111',M:'101111111101101',N:'111101101101101',O:'010101101101010',P:'110101110100100',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',
  0:'111101101101111',1:'010110010010111',2:'110001010100111',3:'110001010001110',4:'101101111001001',5:'111100110001110',6:'011100111101111',7:'111001010010010',8:'111101111101111',9:'111101111001110',
  '+':'000010111010000','-':'000000111000000',"'":'1100000'};
const glyphW=ch=>ch==="'"?1:3;
const textW=t=>[...t].reduce((w,ch)=>w+glyphW(ch)+1,-1);
function drawText(x,t,px,py,col){ x.fillStyle=col; for(const ch of t){ const g=GLYPH[ch]||GLYPH['-'], w=glyphW(ch);
  for(let i=0;i<g.length;i++) if(g[i]==='1') x.fillRect(px+i%w,py+Math.floor(i/w),1,1); px+=w+1; } }
const luma=h=>{ const c=hexRGB(h); return (0.3*c[0]+0.59*c[1]+0.11*c[2])/255; };
// chapa de 9 px de alto con contorno de tinta y esquinas recortadas
function drawChip(x,px,py,t,col){ const w=textW(t)+4;
  x.fillStyle=INK; x.fillRect(px+1,py,w-2,9); x.fillRect(px,py+1,w,7);
  x.fillStyle=col; x.fillRect(px+1,py+1,w-2,7); x.fillStyle=shadeHex(col,0.25); x.fillRect(px+1,py+1,w-2,1);
  drawText(x,t,px+2,py+2,luma(col)>0.55?INK:'#f4eee2'); return w; }
// barra de vida de 4 px: contorno de tinta, vida con un brillo arriba y, encima, la temporal en cian
function drawHpBar(x,px,py,w,hp){ const iw=w-2, ratio=Math.max(0,Math.min(1,hp.cur/hp.max)), col=ratio>0.5?'#6fbf73':ratio>0.25?'#f0b35a':'#d9705f';
  x.fillStyle=INK; x.fillRect(px+1,py,w-2,4); x.fillRect(px,py+1,w,2);
  x.fillStyle='#2a2236'; x.fillRect(px+1,py+1,iw,2);
  const f=hp.cur>0?Math.max(1,Math.round(iw*ratio)):0; if(f){ x.fillStyle=col; x.fillRect(px+1,py+1,f,2); x.fillStyle=shadeHex(col,0.35); x.fillRect(px+1,py+1,f,1); }
  if(hp.temp>0){ x.fillStyle='#7fd6e5'; x.fillRect(px+1,py+1,Math.max(1,Math.round(iw*Math.min(hp.temp,hp.max)/hp.max)),1); } }
// vida visible: si el tablero la enseña (hpEnabled) y el servidor la manda (hpVisibility de JA-VTT: con 'gm' no llega la ajena; con
// 'bar_only' sólo la barra, hpBar); hpView da lo que se pinta (la barra, en centésimas)
const hpShown=b=>hpOn()&&(!withheld(b,'hp')||!!b.sheet.hpBar);
const hpView=b=>withheld(b,'hp')?(b.sheet.hpBar?{cur:Math.round(b.sheet.hpBar.cur*100),max:100,temp:Math.round(b.sheet.hpBar.temp*100)}:null):b.sheet.hp;
const hpText=b=>{ const h=b.sheet.hp; return !hpOn()||withheld(b,'hp')?'':h.cur+'/'+h.max+' PV'; };
let hoverMini=null;
function updateStatus(b,show,y,yaw,invC){
  const P=b.parts, sh=b.sheet, n=nOf(b), conds=condsOn()?sh.conditions||[]:[], elev=condsOn()?sh.elevation|0:0, hv=hpShown(b)?hpView(b):null;
  const hpOn=show&&!!hv&&(b===selected||b===hoverMini||hv.cur<hv.max||hv.temp>0);
  const chips=show?conds.slice(0,conds.length>6?5:6).map(id=>[Fichas.CONDITIONS[id].abbr,Fichas.CONDITIONS[id].color]):[];
  if(show&&conds.length>6) chips.push(['+'+(conds.length-5),'#3a4046']); if(show&&elev) chips.push([(elev>0?'+':'')+elev+"'",'#3a4046']);
  const key=chips.map(c=>c.join()).join(';')+'|'+(hpOn?[hv.cur,hv.max,hv.temp,n].join():'');
  if(!chips.length&&!hpOn){ if(P.stat) P.stat.mesh.visible=false; return; }
  if(!P.stat||P.stat.key!==key){
    const cw=chips.reduce((w,c)=>w+textW(c[0])+5,-1), bw=hpOn?Math.round(12*Math.min(n,3)*Math.max(0.75,Fichas.sizeOf(sh).scale/Math.max(1,n))):0, W=Math.max(cw,bw,1), H=(chips.length?9:0)+(chips.length&&hpOn?1:0)+(hpOn?4:0);
    const c=mkCanvas(W,H), x=c.getContext('2d'); let px=Math.floor((W-cw)/2);
    for(const [t,col] of chips) px+=drawChip(x,px,0,t,col)+1;
    if(hpOn) drawHpBar(x,Math.floor((W-bw)/2),H-4,bw,hv);
    if(!P.stat){ const m=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({alphaTest:0.5})); m.renderOrder=8; propGroup.add(m); P.stat={mesh:m,tex:null,key:''}; }
    const gk=W+'x'+H; let g=statusGeos.get(gk); if(!g){ g=upPlane(W/16,H/16); statusGeos.set(gk,g); }
    if(P.stat.tex) P.stat.tex.dispose(); P.stat.tex=tex(c); P.stat.mesh.material.map=P.stat.tex; P.stat.mesh.material.needsUpdate=true; P.stat.mesh.geometry=g; P.stat.key=key;
  }
  const m=P.stat.mesh; m.visible=true; m.position.set(b.px,y,b.pz); m.rotation.y=yaw; m.scale.set(1,invC,1);
  // no se apaga de noche, pero toma algo de la luz de la escena para no brillar como una etiqueta
  const lc=lightAt(Math.floor(b.px),Math.floor(b.pz)); m.material.color.setRGB(0.72+0.28*Math.min(1,lc.r),0.72+0.28*Math.min(1,lc.g),0.72+0.28*Math.min(1,lc.b));
}
// ¿la ve quien mira? oculta sólo para el director (y su dueño); con niebla, las ajenas sólo si alguien del grupo las ve
function tokenShown(b){
  if(b.sheet.hidden&&LIVE.on&&!LIVE.dm&&b.owner!==LIVE.me) return false;
  if(state.fogDM||isPC(b)) return true;
  return Fichas.footprint(b.x,b.z,nOf(b)).some(([x,z])=>inb(x,z)&&fogVis(idx(x,z))===2&&hideOK(idx(x,z)));
}
// objetos que la maleza oculta (los pequeños: mobiliario, decorado y los dibujados); los muros, estructuras y árboles, no
const hideable=b=>!!b.prop&&FT(b.prop)!=='light'&&!Muros.kindOf(b.prop)&&Catalogo.isLow(b.prop,PIECES);

/* ============ mapas ============ */
const {demoMap,dungeonMap,townMap,lightWorkshopMap}=T3D.Mapas.make({defaultSheet,normSheet,Fichas});
const undoStack=[], redoStack=[];
// ¿puede esta definición tapar algo? {hide} si alguna forma suya (la base o una variante) tapa vista, luz o es maleza; si no, null
function senseOf(D){ let any=false, hide=false; const look=c=>{ if(!c) return; if('sight' in c&&c.sight!=='none') any=true; if('light' in c&&c.light!=='none') any=true; if(c.hide){ any=true; hide=true; } };
  look(D.components); for(const va of D.variants||[]) look(va.set); return any?{hide}:null; }
function refreshEntities(){
  clearBills(); blocked=new Set(); M.lights=[];
  doorShut=new Set(); doorSeal=new Set(); lockedDoors=new Set(); WALLAT=new Map(); HAS_COVER=false;
  DECK=null; const decks=M.props.filter(p=>Catalogo.surface(p,PIECES)); if(decks.length) computeDecks(decks);
  for(const p of M.props){ if(!UID_OK.test(p.uid||'')) p.uid=Catalogo.newUid();   // uid fijo desde que la pieza existe (antes de deshacer)
    const op=opaque(p), D=op?null:Catalogo.defOf(p,PIECES), b=addBill(op?'obj:':propKind(p),p.x,p.z,p); const i=idx(p.x,p.z);
    // P-48 (a): una puerta bloquea todas sus casillas (como gridOf del servidor); las de fábrica son de 1×1
    if(D&&D.components.door){ const cs=doorCells(p), seal=Muros.kindOf(p)==='door'; if(!p.open) for(const k of cs){ blocked.add(k); doorShut.add(k); if(seal) doorSeal.add(k); } if(p.locked) for(const k of cs) lockedDoors.add(k); if(b) doorPose(b); }
    else if(op||Catalogo.blocksMove(p,PIECES)) for(const [cx,cz] of propCells(p)) if(inb(cx,cz)) blocked.add(idx(cx,cz));
    const wk=Muros.kindOf(p); if(wk&&wk!=='door'){ wallAdd(i,p); if(wk==='cover') HAS_COVER=true; }
    // I2 (ola final): una pieza sin wallKind que pueda tapar vista, luz o maleza (en su forma o en alguna variante) entra en
    // WALLAT en todas sus casillas; GRID.bk pregunta a Catalogo.blocks con su estado de ese momento (puerta abierta, no tapa)
    else if(!wk&&D){ const c=senseOf(D); if(c){ for(const [cx,cz] of propCells(p)) if(inb(cx,cz)) wallAdd(idx(cx,cz),p); if(c.hide) HAS_COVER=true; } }
    if(b&&Catalogo.gmOnly(p,PIECES)) b.gmOnly=true;
    const l=op?null:propLight(p,b); if(l){ M.lights.push(l); b.emissive=FT(p)!=='light'; b.light=l; } }
  let lava=0; for(let i=0;i<M.t.length&&lava<48;i++) if(M.t[i]==='l'){ const lx=i%M.w, lz=(i/M.w)|0; M.lights.push({x:lx+.5,z:lz+.5,y:0,r:3,c:'#ff5a2a',k:0.8,f:1,lava:true,baseY:()=>topY(lx,lz)+0.3}); lava++; }
  for(const m of M.minis) addBill(m.kind,m.x,m.z,m);
  if(EH){ for(const b of bills) b.gy=billY(b); for(const l of M.lights) l.y=l.baseY(); }
  rebuildGlows();
  selected=bills.find(b=>b.kind==='knight')||bills.find(b=>b.mini)||null;
}
// altura de cada tramo de puente: la de la orilla más alta a lo largo del paso (hasta 8 casillas a cada lado)
function computeDecks(decks){ DECK=new Int8Array(M.w*M.d); const on=new Set(decks.flatMap(p=>propCells(p).filter(([x,z])=>inb(x,z)).map(([x,z])=>idx(x,z))));
  for(const p of decks) for(const [cx,cz] of propCells(p)){ if(!inb(cx,cz)) continue; const [dx,dz]=(p.v|0)%2?[1,0]:[0,1]; let h=-1;
    for(const sg of [1,-1]) for(let k=1;k<=8;k++){ const x=cx+dx*k*sg, z=cz+dz*k*sg; if(!inb(x,z)) break; const i=idx(x,z); if(on.has(i)) continue;
      if(M.t[i]!=='w'&&!M.src[i]) h=Math.max(h,M.h[i]); break; }
    DECK[idx(cx,cz)]=Math.max(1,h<0?M.h[idx(cx,cz)]+2:h); } }
// luz de un objeto del mapa: fuente suelta, brasero, farol, antorcha u objeto dibujado con luz.
// La posición de la luz del objeto gira con él; la altura se mide desde el suelo de su casilla.
const DEF_OBJ_LIGHT={r:6,c:WARM,f:1};
function objLightSpec(key){ const o=CUSTOM.objs[key]; if(!o||!o.light) return null;
  if(o.light===true){ const w=o.slices[0].width; return {px:(w-1)/2,py:(w-1)/2,s:Math.round(o.slices.length*0.8),r:6,c:WARM,f:1,res:o.res,w}; }
  return Object.assign({},DEF_OBJ_LIGHT,o.light,{res:o.res,w:o.slices[0].width}); }
function propLight(p,b){
  const sp=propSpan(p), cx=p.x+sp[0]/2, cz=p.z+sp[1]/2, rot=b&&b.mesh?b.mesh.rotation.y:0;
  const mk=(ox,oy,oz,r,c,f,k)=>{ const ca=Math.cos(rot), sa=Math.sin(rot), wx=ox*ca+oz*sa, wz=-ox*sa+oz*ca;
    const l={x:cx+wx,z:cz+wz,oy,r,c,f,k:k==null?1:k,src:p,glow:true}; l.baseY=()=>topY(p.x,p.z)+oy; l.y=EH?l.baseY():oy; return l; };
  const spec=key=>{ const s2=objLightSpec(key); if(!s2) return null; const T=LIGHT_TYPES[s2.preset];
    const l=mk((s2.px+0.5-s2.w/2)/s2.res,(s2.s+0.5)/s2.res,(s2.py+0.5-s2.w/2)/s2.res,s2.r,s2.c,s2.f,T&&!T.darkness?T.intensity:null);
    if(T&&!T.darkness) l.anim=s2.f?T.anim==='none'?'flicker':T.anim:'none'; l.seed=p.x*7+p.z*13; return l; };
  if(FT(p)==='light'){ if(p.on===false) return null; const T=LIGHT_TYPES[p.preset];
    const l=mk(0,Math.max(0,Math.min(4,p.h==null?1.2:+p.h)),0,Math.max(1,Math.min(24,p.r||5)),HEX6.test(p.color||'')?p.color:WARM,p.anim==='flicker'?1:0,Number.isFinite(p.intensity)?p.intensity:1);
    return lightExtras(l,p.anim,p.angle,p.rot,p.darkness,T?T.glow!==false:true,p.x*7+p.z*13); }
  // un dibujo antiguo (d:) alumbra con su dibujo; una pieza p: con arte de dibujo, también si ese dibujo existe (manda, como
  // en el arreglo §6); si no, su emitLight (I4, ola final: el prefijo obj: del type no decide solo)
  if(p.type.startsWith('obj:')&&(CUSTOM.objs[p.type.slice(4)]||String(Catalogo.defIdOf(p)).startsWith('d:'))) return spec(p.type.slice(4));
  // un dibujo que sustituye a un objeto de fábrica manda sobre su luz: con luz, la suya; con light:false, ninguna (arreglo §6)
  if(CUSTOM.objs[propArtKey(p)]) return CUSTOM.objs[propArtKey(p)].light?spec(propArtKey(p)):null;
  // el portal mágico alumbra con su tipo de luz (Cristal arcano: violeta que late) desde el centro del aro
  if(FT(p)==='portal'){ const lk=Muros.PORTAL_LOOKS[p.look], T=lk&&LIGHT_TYPES[lk.light]; if(!T) return null;
    return lightExtras(mk(0,1.1,0,T.r,T.color,0,T.intensity),T.anim,360,0,false,true,p.x*7+p.z*13); }
  const E=Catalogo.emitLight(p,PIECES); if(E) return mk(0,E.h,0,E.r,WARM,1);
  return null;
}
// animación, cono, oscuridad y halo de una fuente (lo que los tipos de luz añaden al motor)
function lightExtras(l,anim,angle,rot,dark,glow,seed){
  l.anim=anim||'none'; l.seed=seed||0; if(Number.isFinite(angle)&&angle<360) l.cone={a:angle,rot:rot||0};
  if(dark){ l.dark=true; l.glow=false; } else l.glow=glow!==false; return l; }
// personajes que llevan luz (el `light` de JA-VTT): sigue al personaje desde su centro, a la altura de la mano.
// Un tipo de TOKEN_LIGHTS alumbra con los parámetros del motor para ese tipo (los mismos que antes); una luz a medida,
// con su radio (pies brillantes + tenues) / 5, color, intensidad y animación. La linterna sorda apunta hacia donde mira.
function miniLights(){ const out=[]; for(const b of bills){ const L=b.mini&&b.sheet?b.sheet.light:null; if(!Fichas.lightOn(L)||!alive(b)) continue;
  const n=nOf(b), base={x:b.x+n/2,z:b.z+n/2,y:(EH?billY(b):0)+1.1*Math.min(1.6,Fichas.sizeOf(b.sheet).scale),bill:b}, facing=Math.round(Math.atan2(b.fz,b.fx)*180/Math.PI), T=LIGHT_TYPES[L.preset];
  if(T&&!T.darkness){ out.push(lightExtras(Object.assign(base,{r:T.r,c:T.color,f:T.anim==='flicker'?1:0,k:T.intensity}),T.anim,T.angle,facing,false,true,b.x*7+b.z*13)); continue; }
  const r=Math.max(1,Math.min(24,Math.round((L.bright+L.dim)/5)));
  out.push(lightExtras(Object.assign(base,{r,c:HEX6.test(L.color)?L.color:WARM,f:L.anim==='flicker'?1:0,k:L.intensity}),L.anim,L.angle,facing+L.rot,false,true,b.x*7+b.z*13)); }
  return out; }
function allLights(){ return M.lights.concat(miniLights()); }
let glows=[];
function rebuildGlows(){
  for(const g of glows) propGroup.remove(g.mesh); glows=[];
  for(const l of allLights()){ if(!l.glow) continue; const m=new THREE.Mesh(GEO.glow,glowMatFor(l.c||WARM)); m.renderOrder=5; propGroup.add(m); glows.push({mesh:m,l}); }
}
function syncMinis(){ M.minis=bills.filter(b=>b.mini).map(b=>{ const d=b.path?b.path[b.path.length-1]:[b.x,b.z]; return {kind:b.kind,x:d[0],z:d[1],fx:b.fx,fz:b.fz,id:b.id,owner:b.owner,sheet:cloneSheet(b.sheet)}; }); }
/* Ficha (sheet): los campos de la ficha de JA-VTT, ver fichas.js (Tablero3D.Fichas). Por defecto, la del sprite. */
// ficha con la que nace cada personaje de fábrica (el nombre sale de CHARS; sin entrada: jugador de 20 PG y CA 16)
const NPC={kind:'enemy',neutral:true,hp:4,ac:10,init:0};
const SHEET_OF={ goblin:{kind:'enemy',hp:7,ac:15,init:2,darkvision:60}, villager:NPC, mage:{kind:'player',hp:14,ac:12,init:2},
  rat:{kind:'enemy',tiny:true,hp:1,ac:10,init:0,speed:20,darkvision:30}, boy:{kind:'enemy',neutral:true,small:true,hp:3,ac:10,init:1,speed:25},
  ogre:{kind:'enemy',size:2,hp:59,ac:11,init:-1,speed:40,darkvision:60}, troll:{kind:'enemy',size:3,hp:84,ac:15,init:1,speed:30,darkvision:60},
  golem:{kind:'enemy',size:4,hp:178,ac:17,init:-1,speed:30,darkvision:120},
  warrior:{kind:'player',hp:24,ac:15,init:1}, rogue:{kind:'player',hp:18,ac:14,init:4}, cleric:{kind:'player',hp:18,ac:16,init:0}, archer:{kind:'player',hp:18,ac:14,init:3},
  skeleton:{kind:'enemy',hp:13,ac:13,init:2,darkvision:60}, wolf:{kind:'enemy',hp:11,ac:13,init:2,speed:40}, bandit:{kind:'enemy',hp:11,ac:12,init:1},
  miller:NPC, barmaid:NPC, smith:{...NPC,hp:9,ac:11}, crone:{...NPC,hp:3,speed:20}, guard:{kind:'enemy',neutral:true,hp:11,ac:16,init:1} };
function defaultSheet(kind){
  const L=Fichas.noLight(), base={size:1,hidden:false,vision:true,sight:60,darkvision:0,light:L,conditions:[],elevation:0,speed:30};
  const f=CHARS.find(c=>c[0]===kind), o=SHEET_OF[kind];
  if(o){ const {hp,...rest}=o; return {...base,name:f[1],...rest,hp:{cur:hp,max:hp,temp:0}}; }
  const c=kind.startsWith('c_')&&CUSTOM.chars[kind];
  const out={...base,name:f?f[1]:(c?c.name:'Personaje'),kind:'player',hp:{cur:20,max:20,temp:0},ac:16,init:1};
  return c&&c.size?Fichas.setSize(out,c.size):out;
}
// una ficha guardada (de ahora o de antes: team, hp/hpMax, vision y dark en casillas, luz) a la forma de JA-VTT
function normSheet(o,kind){ return Fichas.norm(o,defaultSheet(kind)); }
const cloneSheet=s=>JSON.parse(JSON.stringify(s));
const isPC=b=>b.sheet.kind==='player';
const lightTypeName=L=>!Fichas.lightOn(L)?'ninguna':LIGHT_TYPES[L.preset]?LIGHT_TYPES[L.preset].name:'luz de '+Math.round(L.bright+L.dim)+' pies';
function loadMap(def,keepCam){
  M=def; Object.assign(M,Ajustes.sceneFlags(M)); if(!Array.isArray(M.plans)) M.plans=[]; if(!Array.isArray(M.notes)) M.notes=[]; EH=null; WS=null; WL=null; LR=null; DD=null; undoStack.length=0; redoStack.length=0;
  const n=M.w*M.d; if(!M.src||M.src.length!==n) M.src=new Uint8Array(n);
  for(let i=0;i<n;i++) if(M.t[i]==='~'){ M.t[i]='a'; M.src[i]=2; }
  refreshEntities(); rebuild(); settleWater(); buildDecor();
  for(const b of bills) b.gy=billY(b);
  M.roofs=(Array.isArray(M.roofs)?M.roofs:[]).map(r=>normRoof(r,M.w,M.d)).filter(Boolean); state.roofSel=null; roofKey=null; RCAP=null; buildRoofs();
  fogSetup(); state.fog=!!M.fog; fogU.uFogOn.value=state.fog?1:0; GM.active=false; GM.order=[]; GM.cur=null; rangeKey=''; GM.meas.a=null; GM.meas.b=null; updateMeasure(); if(state.gameOpen) renderGame();
  setEnv(M,!(keepCam&&LIVE.on));   // en la mesa en vivo, el cambio de momento del director se funde
  $('animToggle').checked=M.animate!==false; $('gridToggle').checked=M.grid!==false; gridDirty=true; planKey='';
  if(!keepCam) state.target.set(M.start[0]+.5,2*STEP,M.start[1]+.5);
  setBoardName(M.name);
}

/* ============ movimiento ============ */
// caminos: Fichas.route/paths (fichas.js) sobre esta rejilla; una ficha grande necesita todas sus casillas libres
// Ruling R18: casillas que tapan el paso piezas que este cliente no tiene (las gmOnly del director; el servidor sólo manda
// sus índices en `blockCells`). No se dibujan ni se guardan: sólo bloquean caminos, llegadas y colocación.
const blockCell=i=>!!(M.blockCells&&M.blockCells.has(i));
const PATHG={ get w(){ return M.w; }, get d(){ return M.d; }, h:i=>DECK&&DECK[i]?DECK[i]:M.h[i],
  open:i=>{ if(DECK&&DECK[i]) return true; const tt=M.t[i]; return !(tt==='w'||tt==='l'||isDeep(i)||blockCell(i)||(blocked.has(i)&&!(doorShut.has(i)&&passDoor(i)))); },   // una puerta cerrada se abre al pasar (si se puede); un puente se pisa
  hard:i=>!(DECK&&DECK[i])&&!!(WS&&WS[i]&&!isDeep(i)) };
// una puerta cerrada se cruza si quien mueve puede abrirla; con llave, nadie pasa (el director la abre a mano)
function passDoor(i){ return !lockedDoors.has(i)&&(gmView()||SETTINGS.playersDoors!==false); }
// casillas que ocupan las demás fichas (las de `self` no cuentan)
function takenBy(self){ const occ=new Uint8Array(M.w*M.d);
  for(const b of bills) if(b!==self&&b.mini){ const n=nOf(b); for(const [x,z] of Fichas.footprint(b.x,b.z,n)) if(inb(x,z)) occ[idx(x,z)]=1; }
  return i=>occ[i]===1; }
function dijkstra(sx,sz,self,maxCost,target){ return Fichas.paths(PATHG,sx,sz,nOf(self),maxCost,target,takenBy(self)); }
function findPath(sx,sz,tx,tz,self){ return Fichas.route(PATHG,sx,sz,tx,tz,nOf(self),takenBy(self)); }
// esquina a la que va una ficha cuando se toca (x,z): la ficha queda sobre esa casilla
function anchorAt(b,x,z){ return Fichas.anchorFor(x,z,nOf(b),M.w,M.d); }
// marca de destino del tamaño de la ficha
function markDest(b,x,z,t){ const n=b?nOf(b):1, [ax,az]=b?anchorAt(b,x,z):[x,z]; destCursor.scale.set(n,1,n); destCursor.position.set(ax+n/2,footY(ax,az,n)+0.02,az+n/2); destTimer=t; }
function updateMovement(b,dt){
  if(!b.path) return;
  { const a=b.path[b.step], c=b.path[b.step+1]; b.t+=dt/(0.2*(c&&a[0]!==c[0]&&a[1]!==c[1]?1.41:1)); }
  while(b.t>=1&&b.path){
    b.t-=1; b.step++;
    const [cx,cz]=b.path[b.step]; b.x=cx; b.z=cz; fogDirty=true; if(b.sheet&&Fichas.lightOn(b.sheet.light)) lightDirty=true;
    if(b.pending){ b.path=b.pending.length>1?b.pending:null; b.pending=null; b.step=0; }
    else if(b.step>=b.path.length-1){ b.path=null; }
    if(!b.path){ const n=nOf(b); b.px=b.x+n/2; b.pz=b.z+n/2; b.gy=billY(b); b.t=0; arrived(b); }
  }
  if(!b.path) return;
  const [ax,az]=b.path[b.step], [bx,bz]=b.path[b.step+1], t=b.t, n=nOf(b);
  for(const [dx,dz] of Fichas.footprint(bx,bz,n)) if(doorShut.has(idx(dx,dz))){ const dp=doorAt(dx,dz); if(dp&&!dp.open&&canOpenDoor(dp)) toggleDoor(dp); }
  b.fx=bx-ax; b.fz=bz-az;
  b.px=ax+n/2+(bx-ax)*t; b.pz=az+n/2+(bz-az)*t;
  const ya=footY(ax,az,n), yb=footY(bx,bz,n);
  b.gy=t<0.5?ya:yb;
  b.hop=ya+(yb-ya)*t+Math.sin(Math.PI*t)*(ya!==yb?0.35:0.08);
}

/* ============ cámara ============ */
const tmpR=new THREE.Vector3(), tmpU=new THREE.Vector3();
function ppu(){ return TEX*state.zooms[state.zi]; }
function baseYaw(){ return state.diagonal?Math.PI/4:0; }
function snapYaw(y){ const b=baseYaw(); return b+Math.round((y-b)/HALF_PI)*HALF_PI; }
function animateYawTo(y){ state.yawFrom=state.yaw; state.yawTarget=y; state.rotT=reduceMotion?1:0; if(reduceMotion) state.yaw=y; }
function updateCamera(){
  const k=ppu(), hw=state.lowW/(2*k), hh=state.lowH/(2*k);
  camera.left=-hw; camera.right=hw; camera.top=hh; camera.bottom=-hh; camera.updateProjectionMatrix();
  const y=state.yaw;
  camera.position.set(state.target.x+Math.sin(y)*COS_E*100, state.target.y+SIN_E*100, state.target.z+Math.cos(y)*COS_E*100);
  camera.lookAt(state.target);
  camera.updateMatrixWorld();
  tmpR.setFromMatrixColumn(camera.matrixWorld,0); tmpU.setFromMatrixColumn(camera.matrixWorld,1);
  const px=1/k, p=camera.position, a=p.dot(tmpR), b=p.dot(tmpU);
  p.addScaledVector(tmpR,Math.round(a/px)*px-a).addScaledVector(tmpU,Math.round(b/px)*px-b);
  camera.updateMatrixWorld();
  postUniforms.uThr.value=0.12/400;
}
function panBy(dx,dy){
  const k=1/(state.cssPx*ppu()), y=state.yaw;
  const R0=Math.cos(y), R1=-Math.sin(y), F0=-Math.sin(y), F1=-Math.cos(y);
  state.target.x+=-dx*k*R0+dy*k/SIN_E*F0;
  state.target.z+=-dx*k*R1+dy*k/SIN_E*F1;
  state.target.x=Math.max(0,Math.min(M.w,state.target.x));
  state.target.z=Math.max(0,Math.min(M.d,state.target.z));
}
function zoomStep(d){ state.zi=Math.max(0,Math.min(state.zooms.length-1,state.zi+d)); }
function resize(){
  const dpr=window.devicePixelRatio||1;
  const s=Math.max(1,Math.round(48*state.sizeMul*dpr/TEX)); // píxeles físicos enteros por texel
  state.cssPx=s/dpr;
  const st=$('stage'), vw=(st&&st.clientWidth)||innerWidth, vh=(st&&st.clientHeight)||innerHeight;
  state.lowW=Math.max(64,Math.floor(vw*dpr/s)); state.lowH=Math.max(64,Math.floor(vh*dpr/s));
  renderer.setSize(state.lowW,state.lowH,false);
  canvas.style.width=(state.lowW*s/dpr)+'px'; canvas.style.height=(state.lowH*s/dpr)+'px';
  if(canPost) makeRT(state.lowW,state.lowH);
}
on(window,'resize',resize);
observe($('stage'),()=>resize());

/* ============ ambiente: momentos de luz de JA-VTT (interior, día, atardecer, noche) ============ */
// ENV: el de la escena (env, ambient, darkColor, Ambiente.norm); LOOK: lo que se pinta ahora (se funde en ~1 s al cambiar)
let ENV=Ambiente.norm({env:'day'}), LOOK=Ambiente.look(ENV), envAnim=null;
const ENV_FADE=0.9;
function applyLook(k){
  LOOK=k; ambU.uAmbient.value.setRGB(...k.amb); ambU.uDark.value.setRGB(...k.dark); ambU.uLevel.value=k.level;
  postUniforms.uSkyTop.value.setRGB(...k.sky[0]); postUniforms.uSkyBot.value.setRGB(...k.sky[1]); renderer.setClearColor(new THREE.Color(...k.sky[2]));
  glowMat.opacity=k.glow; for(const m of glowMats.values()) m.opacity=m.userData.inside?1:k.glow;
}
// cambia el momento de la escena; instant: sin fundido (al abrir una escena)
function setEnv(o,instant){
  ENV=Ambiente.norm(o); if(M){ M.env=ENV.env; M.ambient=ENV.ambient; M.darkColor=ENV.darkColor; }
  const to=Ambiente.look(ENV);
  if(instant||reduceMotion){ envAnim=null; applyLook(to); } else envAnim={from:LOOK,to,t:0};
  fogDirty=true; renderEnv();
}
function envTick(dt){ if(!envAnim) return; envAnim.t=Math.min(1,envAnim.t+dt/ENV_FADE); const e=envAnim.t*envAnim.t*(3-2*envAnim.t);
  applyLook(Ambiente.mix(envAnim.from,envAnim.to,e)); if(envAnim.t>=1){ envAnim=null; fogDirty=true; } }
// lo cambia el director (con deshacer; en la mesa en vivo se reparte con la escena)
function editEnv(o,sn){ if(LIVE.on&&!LIVE.dm) return; const before=sn||snap(); setEnv(Object.assign({},ENV,o)); pushUndo(before); if(LIVE.on&&LIVE.dm) liveBoardSoon(); }
let envSnap=null;
function renderEnv(){
  const g=$('envGrid'); if(!g) return;
  if(!g.children.length) for(const k of Ambiente.ENV_IDS){ const E=Ambiente.ENVS[k], b=document.createElement('button'); b.className='env'; b.dataset.env=k;
    b.innerHTML=ctx.icon(E.icon)+'<b></b><small></small>'; b.querySelector('b').textContent=E.name; b.querySelector('small').textContent=E.desc;
    b.onclick=()=>editEnv({env:k,ambient:E.ambient,darkColor:E.dark}); g.appendChild(b); }
  for(const b of g.children) b.setAttribute('aria-pressed',String(b.dataset.env===ENV.env));
  const a=Math.round(ENV.ambient*100); if(document.activeElement!==$('ambient')) $('ambient').value=a; $('ambientOut').textContent=a+' %';
  $('darkColor').value=ENV.darkColor.toLowerCase();
}
// deslizador y color: se ven al momento; al soltar queda un paso de deshacer con lo de antes
for(const [id,k,val] of [['ambient','ambient',()=>+$('ambient').value/100],['darkColor','darkColor',()=>$('darkColor').value]]){
  $(id).oninput=()=>{ if(LIVE.on&&!LIVE.dm) return; if(!envSnap) envSnap=snap(); setEnv(Object.assign({},ENV,{[k]:val()}),true); };
  $(id).onchange=()=>{ if(LIVE.on&&!LIVE.dm) return; const sn=envSnap; envSnap=null; editEnv({[k]:val()},sn); }; }

/* ---- zonas interiores y luz que entra por las ventanas: AMBF[i] = cuánto ambiente llega a la casilla (1 fuera) ---- */
let INTERIOR=null, AMBF=null, ambTex=null;
// rejilla sin los muros recortados al abrir un techo (así la luz de las ventanas no cambia al asomarse)
const AGRID={ get w(){ return M.w; }, get d(){ return M.d; }, top:i=>(DECK&&DECK[i]?DECK[i]:M.h[i])*STEP, wall:i=>M.t[i]==='w', door:i=>doorSeal.has(i), bk:wallBlocks };
// ventanas y puertas abiertas; una puerta de varias casillas deja entrar luz por cada una (P-48 a)
const openings=()=>M.props.filter(p=>FT(p)==='window'||(Catalogo.isDoor(p,PIECES)&&p.open)).flatMap(p=>{ const cs=propCells(p); return cs.length===1?[p]:cs.map(([x,z])=>({x,z})); });
function computeAmbient(){
  const n=M.w*M.d; INTERIOR=Ambiente.interiorMask(M.w,M.d,M.roofs,M.zoneCells);
  const win=Ambiente.windowLight(AGRID,INTERIOR,openings(),(lx,ly,lz,tx,tz,ty)=>Vision.lightReaches(AGRID,lx,ly,lz,tx,tz,ty));
  AMBF=Ambiente.field(INTERIOR,win);
  if(!ambTex||ambTex.image.width!==M.w||ambTex.image.height!==M.d){ if(ambTex) ambTex.dispose(); ambTex=new THREE.DataTexture(new Uint8Array(n*4),M.w,M.d,THREE.RGBAFormat);
    ambTex.magFilter=THREE.LinearFilter; ambTex.minFilter=THREE.LinearFilter; }
  const d=ambTex.image.data;
  // r: fuera (1) o dentro (0); g: el ambiente que llega, fundido entre casillas (fuera 1, salvo en los muros, que no dejan pasar)
  for(let i=0;i<n;i++){ const out=!INTERIOR[i]; d[i*4]=out?255:0; d[i*4+1]=Math.round((out?(M.t[i]==='w'?0:1):AMBF[i])*255); d[i*4+2]=0; d[i*4+3]=255; }
  ambTex.needsUpdate=true; ambU.uAmbT.value=ambTex; ambU.uAmbSize.value.set(M.w,M.d);
  drawZones();
}
const ambAt=i=>AMBF?AMBF[i]:1;
// para el clima (hoja de ruta R7): ¿es interior la casilla? Ahí no cae la lluvia ni la nieve
const isInterior=i=>!!(INTERIOR&&INTERIOR[i]);
// JA-VTT: se ve sin luz propia si el ambiente que llega pasa de 0,25
const ambientLit=i=>Ambiente.ambientLit(ENV.ambient,ambAt(i));

/* ============ billboards ============ */
const lightCol=new THREE.Color();
// la luz de un sprite: el mismo cálculo que lightFor del sombreador (ambiente que llega a la casilla + fuentes)
function lightAt(x,z){
  const i=inb(x,z)?idx(x,z):-1, t=i>=0?Lc(i):ZERO3, a=i>=0?ambAt(i):1, k=uniforms.uFlicker.value*Ambiente.torchK(LOOK.level*a)*0.9;
  if(t[0]<0) return lightCol.setRGB(0.1,0.09,0.15);   // dentro de oscuridad mágica sólo se intuye la silueta
  const A=LOOK.amb, D=LOOK.dark, am=j=>D[j]+(A[j]-D[j])*a;
  // los sprites no se queman a blanco con la luz que llevan encima
  let r=Math.min(1.3,am(0)+t[0]*k), g=Math.min(1.3,am(1)+t[1]*k), b=Math.min(1.3,am(2)+t[2]*k);
  if(state.lightMode>0){ r=Math.round(r*6)/6; g=Math.round(g*6)/6; b=Math.round(b*6)/6; }
  return lightCol.setRGB(r,g,b);
}
// si un material pasa de no tener textura a tenerla, three.js debe reconfigurarlo; si no, queda blanco
function setMap(mat,t){ if(!mat.map&&t) mat.needsUpdate=true; mat.map=t; }
function updateBills(dt){
  const y=state.yaw, invC=1/COS_E, bobPx=1/(16*COS_E), fl=uniforms.uFlicker.value;
  const R0=Math.cos(y), R1=-Math.sin(y), F0=-Math.sin(y), F1=-Math.cos(y);
  decorUniforms.uYaw.value=y;
  // cuadro de fuego con resto siempre positivo: un reloj negativo daba -1 y el material quedaba sin textura (blanco)
  const ff=animOn()?((Math.floor(state.time*6)%2)+2)%2:0;
  setMap(brazierMat,SPR.brazier[ff]||SPR.brazier[0]); setMap(brazierStackMat,STK.brazier.tex[ff]||STK.brazier.tex[0]);
  for(const b of bills){
    if(b.mini) updateMovement(b,dt);
    const m=b.mesh;
    if(b.mini){ updateToken(b,y,invC,bobPx); continue; }
    if(!b.solid){ m.rotation.y=y; m.scale.y=invC; }
    const py=b.path?b.hop:b.gy;
    m.position.set(b.px+(b.ox||0),py+(b.oy||0),b.pz+(b.oz||0));
    b.shadow.position.set(b.px,b.gy+0.01,b.pz);
    if(b.mat!==brazierMat&&!b.emissive&&b.kind!=='light') b.mat.color.copy(lightAt(Math.floor(b.px),Math.floor(b.pz)));
    if(b.frame){ b.frame.position.set(b.px,b.gy,b.pz); b.frame.material.color.copy(b.mat.color); }
    // niebla: los objetos se ven si la zona ya se exploró
    const fi=idx(Math.floor(b.px),Math.floor(b.pz)), fv=fogVis(fi);
    let show=state.fogDM||fv>=1; if(show&&!state.fogDM&&fv===2&&HV&&hideable(b)&&!hideOK(fi)) show=false;
    if(b.gmOnly&&!gmView()) show=false;   // la barrera: sólo el director ve su contorno
    m.visible=show; b.shadow.visible=show&&b.kind!=='light'&&!b.noShadow; if(b.frame) b.frame.visible=show;
    if(b.kind==='light') m.visible=state.mode==='edit';
    if(b.stack){
      const on=state.stack3d; b.stack.visible=on&&show; m.visible=!on&&show;
      if(on) b.stack.position.set(b.px,py,b.pz);
    }
  }
  // halos: un poco detrás de la llama vista desde la cámara (así el objeto la tapa y no se lava a blanco)
  for(const g of glows){ const l=g.l, b=l.bill, gx=b?b.px:l.x, gz=b?b.pz:l.z, gyy=b?(b.path?b.hop:b.gy)+1.1*Math.min(1.6,Fichas.sizeOf(b.sheet).scale):l.y;
    const s=(0.55+Math.min(8,l.r)*0.07)*glowAnim(l,fl);
    g.mesh.position.set(gx+F0*0.3,gyy,gz+F1*0.3); g.mesh.rotation.y=y; g.mesh.scale.set(s,s*invC,1);
    const fc=Math.floor(gx), fz2=Math.floor(gz), gin=inb(fc,fz2)&&ambAt(idx(fc,fz2))<0.5; if(g.mesh.material.userData.inside!==gin) g.mesh.material=glowMatFor(g.l.c||WARM,gin);
    g.mesh.visible=!inb(fc,fz2)||(!inDark(idx(fc,fz2))&&(state.fogDM||fogVis(idx(fc,fz2))>=1)); }
  updateLightMarks();
  // anillo de la elegida: alrededor de su peana, gira a saltos de 1/40 de vuelta (se apaga con movimiento reducido)
  if(selected&&selected.mini&&state.mode==='play'&&selected.mesh.visible){ const N=Math.max(12,2*Math.round(8*(baseDiam(selected.sheet)*1.15+0.34))), k=N/16;
    if(selCursor.userData.px!==N){ selCursor.userData.px=N; selCursor.material.map=ringTex(N); selCursor.material.needsUpdate=true; }
    selCursor.visible=true; selCursor.scale.set(k,1,k); selCursor.position.set(selected.px,(selected.path?selected.hop:selected.gy)+0.015,selected.pz);
    selCursor.rotation.y=reduceMotion?0:Math.floor(state.time*4)*Math.PI/(4*Math.max(6,Math.round(N*Math.PI/9))); }
  else selCursor.visible=false;
  if(destTimer>0){ destTimer-=dt; destCursor.visible=Math.floor(destTimer*8)%2===0; if(destTimer<=0) destCursor.visible=false; }
}

// una ficha: sprite a su escala sobre la peana (alzado si vuela), sombra, peana alumbrada y estado encima
function updateToken(b,yaw,invC,bobPx){
  const m=b.mesh, sh=b.sheet, SZ=Fichas.sizeOf(sh), show=tokenShown(b), ground=b.path?b.hop:b.gy, lift=Math.max(0,Math.min(6,(sh.elevation||0)/5));
  syncTokenParts(b);
  const sd=spriteDims(b.kind);
  let py=ground+BASE_H+lift; if(!b.path&&animOn()&&Math.floor((state.time+b.bob)/0.45)%2) py+=bobPx;
  m.rotation.y=yaw; m.scale.set(sd.w,sd.h/1.5*invC,sd.w); m.position.set(b.px,py,b.pz);
  const F0=-Math.sin(yaw), F1=-Math.cos(yaw), R0=Math.cos(yaw), R1=-Math.sin(yaw), dF=b.fx*F0+b.fz*F1, dR=b.fx*R0+b.fz*R1;
  const dir=Math.abs(dF)>=Math.abs(dR)?(dF>0?'back':'front'):(dR>0?'right':'left');
  if(dir!==b.dir){ b.dir=dir; b.mat.map=(SPR[b.kind]||SPR.knight)[dir]; }
  const lc=lightAt(Math.floor(b.px),Math.floor(b.pz)), down=!alive(b)||(sh.conditions||[]).includes('dead');
  if(down) b.mat.color.setRGB(0.36,0.34,0.42); else b.mat.color.copy(lc);
  const P=b.parts; P.top.color.copy(lc); P.side.color.setRGB(lc.r*STONE_SIDE[0],lc.g*STONE_SIDE[1],lc.b*STONE_SIDE[2]);
  P.base.position.set(b.px,ground,b.pz);
  const k=P.diam*(1.35+lift*0.05); b.shadow.scale.set(k,1,k); b.shadow.position.set(b.px,b.gy+0.01,b.pz);
  // oculta para los jugadores: el director la ve a medias
  const ghost=!!sh.hidden; if(b.ghost!==ghost){ b.ghost=ghost; for(const mt of [b.mat,P.top,P.side]){ mt.transparent=ghost; mt.opacity=ghost?0.5:1; mt.needsUpdate=true; } b.mat.alphaTest=ghost?0.2:0.5; }
  m.visible=show; b.shadow.visible=show; P.base.visible=show;
  updateStatus(b,show,py+(sd.h*(1-artTop(b.kind))+0.08)*invC,yaw,invC);
}
// halo según la animación del tipo (JA-VTT: none, flicker, soft, pulse); el parpadeo es el de siempre
function glowAnim(l,fl){ if(!animOn()) return 1; const t=state.time, sd=(l.seed||0)*1.713;
  if(l.anim==='soft') return 0.97+0.035*(Math.sin(t*2.7+sd)*0.6+Math.sin(t*5.3+sd)*0.4);
  if(l.anim==='pulse') return 0.88+0.14*Math.sin(t*1.3+sd);
  return l.f?(0.94+0.1*(fl-0.9)*5):1; }
// en edición: el cono de las luces dirigidas y el nombre de cada luz sobre el tablero
let tagBox=null; const tagV=new THREE.Vector3();
function updateLightMarks(){
  const ed=state.mode==='edit', lt=ed&&state.tool==='light';
  // con una luz elegida sólo se ve su cono; si no, los de todas las dirigidas (el cono no sabe de muros: es una guía)
  const sel=lt&&state.lightSel&&state.lightSel.angle<360?state.lightSel:null;
  for(const b of bills) if(b.cone){ b.cone.visible=lt&&(!sel||b.prop===sel); if(b.cone.visible) b.cone.position.set(b.px,b.gy+0.04,b.pz); }
  // etiquetas sobre el tablero: en edición, el nombre de cada luz; siempre, las anotaciones que ve quien mira (las gmOnly, en lila)
  const want=(ed?bills.filter(b=>b.kind==='light'&&b.prop&&b.prop.name).map(b=>({x:b.px,y:b.gy+(b.prop.h||0)+0.55,z:b.pz,text:b.prop.name,cls:'t3d-tag'+(b.prop.on===false?' t3d-off':'')})):[])
    .concat(visibleNotes().map(n=>({x:n.x+.5,y:topY(n.x,n.z)+0.45,z:n.z+.5,text:n.text,cls:'t3d-tag t3d-note'+(n.gmOnly?' t3d-gmnote':''),note:n.id})));
  if(!want.length){ if(tagBox) tagBox.hidden=true; return; }
  if(!tagBox){ tagBox=document.createElement('div'); tagBox.className='t3d-tags'; tagBox.setAttribute('aria-hidden','true'); canvas.parentElement.appendChild(tagBox); }
  tagBox.hidden=false; while(tagBox.children.length<want.length) tagBox.appendChild(document.createElement('span'));
  const cw=canvas.clientWidth, chh=canvas.clientHeight; camera.updateMatrixWorld();
  [...tagBox.children].forEach((el,k)=>{ const w=want[k]; if(!w){ el.hidden=true; el.className='t3d-tag'; return; }
    tagV.set(w.x,w.y,w.z).project(camera); el.hidden=tagV.x<-1.1||tagV.x>1.1||tagV.y<-1.1||tagV.y>1.1;
    if(el.textContent!==w.text) el.textContent=w.text; if(el.className!==w.cls) el.className=w.cls; if(w.note) el.dataset.note=w.note; else delete el.dataset.note;
    el.style.transform=`translate(${Math.round((tagV.x+1)/2*cw)}px,${Math.round((1-tagV.y)/2*chh)}px) translate(-50%,-100%)`; });
}
/* ---- anotaciones (type 'note' de JA-VTT): texto sobre una casilla; las gmOnly sólo las ve el director (el servidor no se las
   manda a los jugadores). Viajan con la escena (live/board). ---- */
const visibleNotes=()=>M&&Array.isArray(M.notes)?M.notes.filter(n=>gmView()||!n.gmOnly):[];
const noteAt=(x,z)=>visibleNotes().find(n=>n.x===x&&n.z===z);
function sceneNoteEditor(x,z,existing,cx,cy){
  closeCtx(); ctxEl.textContent=''; const h=document.createElement('strong'); h.textContent='Anotación en la casilla '+x+', '+z; ctxEl.appendChild(h);
  const ta=document.createElement('textarea'); ta.maxLength=200; ta.value=existing?existing.text:''; ta.dataset.k='noteText'; ta.setAttribute('aria-label','Texto de la anotación'); ctxEl.appendChild(ta);
  const lb=document.createElement('label'); lb.className='check'; const cb=document.createElement('input'); cb.type='checkbox'; cb.dataset.k='noteGm'; cb.checked=existing?!!existing.gmOnly:false;
  lb.append(cb,document.createTextNode(' Sólo el director')); ctxEl.appendChild(lb);
  const done=()=>{ closeCtx(); liveBoardSoon(); renderGame(); };
  const save=document.createElement('button'); save.textContent='Guardar anotación'; save.onclick=()=>{ const t=ta.value.trim().slice(0,200);
    if(existing){ if(t){ existing.text=t; existing.gmOnly=cb.checked; } else M.notes.splice(M.notes.indexOf(existing),1); }
    else if(t) M.notes.push({id:Ajustes.nextId(M.notes),x,z,text:t,gmOnly:cb.checked}); done(); };
  ctxEl.appendChild(save);
  if(existing){ const del=document.createElement('button'); del.textContent='Quitar la anotación'; del.onclick=()=>{ M.notes.splice(M.notes.indexOf(existing),1); done(); }; ctxEl.appendChild(del); }
  ctxEl.hidden=false; ctxEl.style.left=Math.max(8,Math.min(cx,innerWidth-320))+'px'; ctxEl.style.top=Math.max(8,Math.min(cy,innerHeight-240))+'px'; ta.focus();
}

/* ============ entrada ============ */
const hintEl=$('hint'); let hintTimer=0;
function showHint(t,ms=2200){ hintEl.textContent=t; hintEl.classList.remove('t3d-hide'); clearTimeout(hintTimer); hintTimer=setTimeout(()=>hintEl.classList.add('t3d-hide'),ms); }
hintTimer=setTimeout(()=>hintEl.classList.add('t3d-hide'),7000);
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function cellAt(cx,cy){
  const rect=canvas.getBoundingClientRect();
  ndc.set(((cx-rect.left)/rect.width)*2-1, -((cy-rect.top)/rect.height)*2+1);
  scene.updateMatrixWorld(); ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(chunkGroup.children,false); if(!hits.length) return null;
  const h=hits[0], n=h.face.normal, x=Math.floor(h.point.x-n.x*0.01), z=Math.floor(h.point.z-n.z*0.01);
  return inb(x,z)?{x,z,i:idx(x,z)}:null;
}
function onTap(cx,cy){
  const rect=canvas.getBoundingClientRect();
  ndc.set(((cx-rect.left)/rect.width)*2-1, -((cy-rect.top)/rect.height)*2+1);
  scene.updateMatrixWorld(); ray.setFromCamera(ndc,camera);
  const minis=bills.filter(b=>b.mini&&b.mesh.visible);
  const hm=ray.intersectObjects(minis.map(b=>b.mesh),false);
  if(hm.length){ selected=minis.find(b=>b.mesh===hm[0].object); return; }
  const doors=bills.filter(b=>!b.mini&&b.prop&&Catalogo.isDoor(b.prop,PIECES)&&b.mesh.visible), hd=ray.intersectObjects(doors.map(b=>b.mesh),false);
  if(hd.length){ const db=doors.find(b=>b.mesh===hd[0].object); if(db&&db.prop) toggleDoor(db.prop); return; }
  const pts=bills.filter(b=>b.prop&&FT(b.prop)==='portal'&&b.mesh.visible), hp=ray.intersectObjects(pts.map(b=>b.mesh),false);
  if(hp.length){ const pb=pts.find(b=>b.mesh===hp[0].object); if(pb) portalClick(pb.prop); return; }
  const cell=cellAt(cx,cy); if(!cell) return;
  const x=cell.x, z=cell.z;
  markDest(selected&&selected.mini?selected:null,x,z,0.9);
  if(!selected){ showHint('Toca primero un personaje para elegirlo.'); return; }
  moveMiniTo(selected,...anchorAt(selected,x,z));
}
const ptrs=new Map(); let gesture=null;
const keysDown=new Set();
const pdist=()=>{ const a=[...ptrs.values()]; return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y); };
const pmid=()=>{ const a=[...ptrs.values()]; return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}; };
const pang=()=>{ const a=[...ptrs.values()]; return Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x); };
function startPaint(g,x,y){ g.editPending=false; g.paint=true; beginStroke(); paintAt(x,y,true); }
// zoom manteniendo fijo el punto de la pantalla (cursor o centro de los dedos)
function zoomAt(d,cx,cy){ const z1=state.zooms[state.zi]; zoomStep(d); const z2=state.zooms[state.zi]; if(z1===z2) return;
  const r=canvas.getBoundingClientRect(), ox=cx-(r.left+r.width/2), oy=cy-(r.top+r.height/2); panBy(ox*(1-z2/z1),oy*(1-z2/z1)); state.camGoal=null; }
function snapIfFixed(){ if(!state.free) animateYawTo(snapYaw(state.yaw)); }
function setCursor(c){ if(canvas.style.cursor!==c) canvas.style.cursor=c; }
function baseCursor(){ return state.mode==='edit'?'crosshair':'default'; }
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});
  if(ptrs.size===1){
    const mouse=e.pointerType==='mouse', side=mouse&&(e.button===1||e.button===2);
    const pan=mouse&&(keysDown.has(' ')||(side&&e.shiftKey));
    gesture={moved:false,pan,orbit:side&&!pan};
    if(gesture.pan) setCursor('move'); else if(gesture.orbit) setCursor('grabbing');
    // en juego: empezar sobre un personaje lo arrastra en vez de mover la cámara
    if(state.mode==='play'&&!pan&&!side&&!(state.gameOpen&&GM.meas.mode)){ const mi=miniAt(e.clientX,e.clientY); if(mi){ gesture.drag=mi; selected=mi; setCursor('grabbing'); } }
    // mantener pulsado (táctil, en juego): menú contextual
    if(e.pointerType!=='mouse'&&state.mode==='play'){ const g=gesture, id=e.pointerId;
      g.lp=setTimeout(()=>{ const p=ptrs.get(id); if(gesture===g&&!g.moved&&p&&ptrs.size===1){ g.ctx=true; g.drag=null; openCtx(p.x,p.y); } },520); }
    if(state.mode==='edit'&&!gesture.pan&&!gesture.orbit){
      // espera un instante: si llega un segundo dedo, es para mover la cámara, no para pintar
      const g=gesture, id=e.pointerId; g.editPending=true;
      setTimeout(()=>{ const p=ptrs.get(id); if(gesture===g&&g.editPending&&p&&ptrs.size===1) startPaint(g,p.x,p.y); },90);
    }
  } else if(ptrs.size===2){
    if(gesture&&gesture.paint) endStroke();
    gesture={moved:true,pinch:pdist(),mid:pmid(),ang:pang(),twist:0,twisting:false};
  }
});
canvas.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId);
  if(!p){ if(e.pointerType==='mouse') hoverAt(e.clientX,e.clientY); return; }
  if(!gesture) return;
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(ptrs.size===1){
    if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>6){ gesture.moved=true; clearTimeout(gesture.lp); }
    if(gesture.ctx) return;
    if(gesture.drag){ if(!gesture.moved) return; const c=cellAt(e.clientX,e.clientY);
      if(c&&(!gesture.dc||gesture.dc.i!==c.i)){ gesture.dc=c; const b=gesture.drag; markDest(b,c.x,c.z,60); showPath(b,c,e.clientX,e.clientY); }
      return; }
    if(gesture.orbit){ if(gesture.moved){ state.yaw-=dx*0.008; state.yawTarget=state.yaw; state.rotT=1; } return; }
    if(gesture.pan){ panBy(dx,dy); state.camGoal=null; return; }
    if(gesture.editPending&&gesture.moved) startPaint(gesture,e.clientX,e.clientY);
    if(gesture.paint){ paintAt(e.clientX,e.clientY,false); if(e.pointerType==='mouse') hoverAt(e.clientX,e.clientY); return; }
    if(!gesture.moved||gesture.editPending) return;
    state.camGoal=null;
    if(state.free){ state.yaw-=dx*0.01; state.yawTarget=state.yaw; state.rotT=1; panBy(0,dy); }
    else panBy(dx,dy);
  } else if(ptrs.size===2&&gesture.pinch){
    const m=pmid(); panBy(m.x-gesture.mid.x,m.y-gesture.mid.y); gesture.mid=m; state.camGoal=null;
    const d=pdist(), k=d/gesture.pinch;
    if(k>1.3){ zoomAt(1,m.x,m.y); gesture.pinch=d; } else if(k<0.77){ zoomAt(-1,m.x,m.y); gesture.pinch=d; }
    // girar dos dedos rota el tablero (con un umbral para no confundirlo con el pellizco)
    let da=pang()-gesture.ang; if(da>Math.PI) da-=2*Math.PI; if(da<-Math.PI) da+=2*Math.PI; gesture.ang+=da;
    gesture.twist+=da; if(!gesture.twisting&&Math.abs(gesture.twist)>0.14){ gesture.twisting=true; da=gesture.twist; }
    if(gesture.twisting){ state.yaw+=da; state.yawTarget=state.yaw; state.rotT=1; }
  }
});
const endPtr=e=>{
  if(!ptrs.has(e.pointerId)) return;
  const p=ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  setCursor(baseCursor()); if(gesture) clearTimeout(gesture.lp);
  if(gesture&&gesture.ctx&&ptrs.size===0){ gesture=null; return; }
  if(gesture&&gesture.drag&&ptrs.size===0){ const g=gesture; gesture=null; destTimer=0.35; clearPath();
    if(g.moved&&g.dc&&e.type==='pointerup') moveMiniTo(g.drag,...anchorAt(g.drag,g.dc.x,g.dc.z)); return; }
  if(gesture&&gesture.orbit&&ptrs.size===0){ if(gesture.moved) snapIfFixed(); else if(e.type==='pointerup') openCtx(e.clientX,e.clientY); gesture=null; return; }
  if(gesture&&gesture.twisting&&ptrs.size===0){ snapIfFixed(); gesture=null; return; }
  if(gesture&&gesture.editPending&&ptrs.size===0&&e.type==='pointerup') startPaint(gesture,p.x,p.y);
  if(gesture&&gesture.paint&&ptrs.size===0){ endStroke(); gesture=null; return; }
  if(e.type==='pointerup'&&gesture&&!gesture.moved&&!gesture.pan&&!gesture.orbit&&ptrs.size===0&&state.mode==='play'){
    if(state.gameOpen&&GM.meas.mode){ const mi=miniAt(e.clientX,e.clientY); if(mi&&(GM.meas.mode==='cone'||GM.meas.mode==='line')) selected=mi; else measureAt(cellAt(e.clientX,e.clientY),true); }
    else onTap(e.clientX,e.clientY); }
  if(ptrs.size===0) gesture=null;
};
canvas.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse'){ hoverCursor.visible=false; hoverMini=null; clearPath(); } });
let hoverT=0;
function hoverAt(cx,cy){
  const now=performance.now(); if(now-hoverT<30) return; hoverT=now;   // como mucho ~30 veces por segundo
  const c=cellAt(cx,cy); if(!c){ hoverCursor.visible=false; setCursor(baseCursor()); clearPath(); return; }
  const big=state.mode==='edit'&&state.brush>1&&!state.fill&&!['prop','mini','light','roof'].includes(state.tool)&&!(state.tool==='zone'&&state.zoneMode==='rect')?state.brush:1;
  hoverCursor.scale.set(big,1,big); hoverCursor.position.set(c.x+.5,topY(c.x,c.z)+0.02,c.z+.5); hoverCursor.visible=true;
  livePresence({cell:[c.x,c.z]});
  if(state.mode==='play'&&state.gameOpen&&GM.meas.mode) measureAt(c,false);
  if(state.mode==='play'){ ray.setFromCamera(ndc,camera); const ms=bills.filter(b=>b.mini&&b.mesh.visible), hm=ray.intersectObjects(ms.map(b=>b.mesh),false), over=hm.length>0;
    hoverMini=over?ms.find(b=>b.mesh===hm[0].object):null; setCursor(over?'pointer':'default');
    const b=selected; if(!over&&b&&b.mini&&!b.path&&alive(b)&&canControl(b)&&!(state.gameOpen&&GM.meas.mode)) showPath(b,c,cx,cy); else clearPath(); }
  else setCursor('crosshair');
}
canvas.addEventListener('dblclick',e=>{ if(state.mode!=='play') return; const c=cellAt(e.clientX,e.clientY); if(c) state.camGoal={x:c.x+.5,z:c.z+.5}; });
function focusSelected(){ if(selected) state.camGoal={x:selected.px,z:selected.pz}; }
function resetView(){ state.zi=1; state.camGoal={x:M.start[0]+.5,z:M.start[1]+.5}; if(state.free) setFree(false); animateYawTo(baseYaw()+Math.round((state.yaw-baseYaw())/(2*Math.PI))*2*Math.PI); }
function cycleMini(d){ const ms=bills.filter(b=>b.mini&&(!LIVE.on||LIVE.dm||tokenShown(b))); if(!ms.length) return; const i=ms.indexOf(selected); selected=ms[((i<0?0:i+d)+ms.length)%ms.length]; focusSelected(); }
canvas.addEventListener('pointerup',endPtr); canvas.addEventListener('pointercancel',endPtr);
let wheelLock=0;
canvas.addEventListener('wheel',e=>{ e.preventDefault(); const now=performance.now(); if(now<wheelLock) return; wheelLock=now+140;
  const d=(e.deltaY||e.deltaX)<0?1:-1; if(e.shiftKey){ rotate(d); return; } zoomAt(d,e.clientX,e.clientY); },{passive:false});
on(window,'keydown',e=>{
  if(ART.open){ artKey(e); return; }
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')) return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&key==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey)&&key==='y'){ e.preventDefault(); redo(); return; }
  if((e.ctrlKey||e.metaKey)&&key==='s'){ e.preventDefault(); if((!LIVE.on||LIVE.dm)&&piecesGate()) autoSave(true); return; }
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  keysDown.add(key==='shift'?'shift':key);
  if(key==='q') rotate(1); else if(key==='e') rotate(-1);
  else if(key==='+'||key==='=') zoomStep(1); else if(key==='-') zoomStep(-1);
  else if(key==='f') focusSelected();
  else if(key==='h'||key==='home') resetView();
  else if(key==='tab'){ e.preventDefault(); cycleMini(e.shiftKey?-1:1); }
  else if(key==='?'){ const open=$('helpSheet').hidden; SHEETS.forEach(k=>{ $(k).hidden=true; }); $('helpSheet').hidden=!open; }
  else if(key==='escape'){ SHEETS.forEach(k=>{ $(k).hidden=true; }); $('sheet').hidden=true; closeCtx(); }
  else if(key==='t') toggleHigh();
  else if(key==='v'&&state.mode==='edit') $('mode').click();
  else if(key==='i') $('roofsBtn').click();
  else if(key==='n'&&GM.active) nextTurn();
  else if(key==='r'&&state.mode==='edit'&&state.tool==='light') turnLight(e.shiftKey?-1:1);
  else if(key==='r'&&state.mode==='edit'&&state.tool==='roof') turnRoof(e.shiftKey?-1:1);
  else if(key==='r'&&state.mode==='edit'&&state.tool==='wall') turnWall(e.shiftKey?-1:1);
  else if(key==='p'&&LIVE.on&&hoverCursor.visible) livePing(Math.floor(hoverCursor.position.x),Math.floor(hoverCursor.position.z));
  else if(key===' '||key.startsWith('arrow')) e.preventDefault();
  // las teclas de herramienta entran en edición desde cualquier modo (sólo el director)
  if(/^[0-9mz]$/.test(key)&&LIVE.dm){ const b=[...$('rail').querySelectorAll('[data-tool]')].find(x=>{ const k=x.querySelector('kbd'); return k&&k.textContent.toLowerCase()===key; }); if(b) b.click(); }
  if(state.mode==='edit'){
    if(key==='['&&state.brush>1){ state.brush-=2; $('brush').querySelector('span').textContent=state.brush+'×'+state.brush; }
    else if(key===']'&&state.brush<5){ state.brush+=2; $('brush').querySelector('span').textContent=state.brush+'×'+state.brush; }
  }
});
on(window,'keyup',e=>{ const k=e.key.toLowerCase(); keysDown.delete(k==='shift'?'shift':k); if(k==='shift') keysDown.delete('shift'); });
on(window,'blur',()=>keysDown.clear());



/* ============ botones ============ */

/* ============ vista alta, minimapa, menú contextual y arrastrar personajes ============ */
// --- vista alta: inclina la cámara a 60° con una transición suave ---
state.elevTarget=ELEV;
function setElev(r){ ELEV=r; COS_E=Math.cos(r); SIN_E=Math.sin(r); decorUniforms.uInvCos.value=1/COS_E; }
function toggleHigh(){ const hi=state.elevTarget<0.7; state.elevTarget=(hi?60:30)*Math.PI/180; if(reduceMotion) setElev(state.elevTarget);
  $('high').setAttribute('aria-pressed',String(hi)); showHint(hi?'Vista alta: ideal para planificar.':'Vista normal.',1200); }
$('high').onclick=toggleHigh;

// --- minimapa ---
const miniCv=$('mini'), mctx=miniCv.getContext('2d'); let miniBase=null, miniDirty=true, miniS=1;
const TCOL={};
function terrColor(t){ if(TCOL[t]) return TCOL[t]; const ti=(TERR[t]||TERR.g).top[0], x=(ti%AC)*16, y=((ti/AC)|0)*16;
  const d=ac.getImageData(x,y,16,16).data; let r=0,g=0,b=0; for(let o=0;o<d.length;o+=4){ r+=d[o]; g+=d[o+1]; b+=d[o+2]; }
  return TCOL[t]=[r/256,g/256,b/256]; }
function markMini(){ miniDirty=true; }
function drawMiniBase(){
  if(!M) return; const W=M.w, D=M.d; miniS=Math.max(1,Math.floor(140/Math.max(W,D)));
  const cw=W*miniS, ch=D*miniS; if(miniCv.width!==cw||miniCv.height!==ch){ miniCv.width=cw; miniCv.height=ch; }
  miniBase=mkCanvas(cw,ch); const x=miniBase.getContext('2d'), img=x.createImageData(cw,ch), d=img.data;
  for(let z=0;z<D;z++) for(let xx=0;xx<W;xx++){
    const i=idx(xx,z); let c; const fvv=(state.fog&&!state.fogDM&&FOG)?FOG[i]:2;
    if(fvv===0) c=[11,9,20];
    else if(M.t[i]==='w') c=[40,34,52];
    else if((WS&&WS[i])||(typeof isLake==='function'&&isLake(i))) c=hexRGB(WA[isDeep(i)?2:3]);
    else { const b=terrColor(M.t[i]), k=0.62+0.38*Math.min(1,M.h[i]/6); c=[b[0]*k,b[1]*k,b[2]*k]; }
    if(fvv===1) c=c.map(v=>v*0.5);
    for(let sy=0;sy<miniS;sy++) for(let sx=0;sx<miniS;sx++){ const o=((z*miniS+sy)*cw+xx*miniS+sx)*4; d[o]=c[0]; d[o+1]=c[1]; d[o+2]=c[2]; d[o+3]=255; }
  }
  x.putImageData(img,0,0);
  for(const p of M.props){ x.fillStyle=p.type==='brazier'?'#f07a2a':'#1e3b2f'; const [sw,sd]=propSpan(p);
    if(sw>1||sd>1){ x.fillStyle='#6e4331'; x.fillRect(p.x*miniS+1,p.z*miniS+1,sw*miniS-2,sd*miniS-2); continue; }
    const r=Math.max(1,miniS*0.6); x.fillRect(p.x*miniS+(miniS-r)/2,p.z*miniS+(miniS-r)/2,r,r); }
  if(M.roofs) for(const [k,r] of M.roofs.entries()){ if(roofMeshes[k]&&!roofMeshes[k].visible) continue; x.globalAlpha=0.88; x.fillStyle=(ROOF_MATS[r.mat]||ROOF_MATS.tile).mini; x.fillRect(r.x*miniS,r.z*miniS,r.w*miniS,r.d*miniS); x.globalAlpha=1; }
  miniDirty=false;
}
function drawMini(){
  if($('miniBox').hidden||!M) return; if(miniDirty) drawMiniBase(); if(!miniBase) return;
  mctx.imageSmoothingEnabled=false; mctx.drawImage(miniBase,0,0);
  // área visible: las cuatro esquinas de la pantalla proyectadas sobre el suelo
  const k=ppu(), hw=state.lowW/(2*k), hh=state.lowH/(2*k)/SIN_E, y=state.yaw, R=[Math.cos(y),-Math.sin(y)], F=[-Math.sin(y),-Math.cos(y)], t=state.target;
  const P=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[(t.x+R[0]*hw*a+F[0]*hh*b)*miniS,(t.z+R[1]*hw*a+F[1]*hh*b)*miniS]);
  mctx.strokeStyle='#ffd35a'; mctx.lineWidth=1.5; mctx.beginPath(); P.forEach(([px,pz],i)=>i?mctx.lineTo(px,pz):mctx.moveTo(px,pz)); mctx.closePath(); mctx.stroke();
  for(const b of bills) if(b.mini&&tokenShown(b)){ const n=nOf(b), r=Math.max(2,miniS*(n-0.2)); mctx.fillStyle=b===selected?'#ffd35a':(b.sheet.neutral?'#e8c05a':b.sheet.kind==='enemy'?'#d9495f':'#f4f0ff');
    mctx.fillRect(b.px*miniS-r/2,b.pz*miniS-r/2,r,r); }
}
$('miniT').onclick=()=>{ const on=$('miniBox').hidden; $('miniBox').hidden=!on; $('miniT').setAttribute('aria-pressed',String(on)); };
if(innerWidth<600&&false) $('miniBox').hidden=true;
(()=>{ const box=$('miniBox'); let down=false;
  const go=e=>{ const r=miniCv.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*M.w, z=(e.clientY-r.top)/r.height*M.d;
    state.camGoal={x:Math.max(0,Math.min(M.w,x)),z:Math.max(0,Math.min(M.d,z))}; };
  box.addEventListener('pointerdown',e=>{ down=true; box.setPointerCapture(e.pointerId); go(e); });
  box.addEventListener('pointermove',e=>{ if(down) go(e); });
  box.addEventListener('pointerup',()=>{ down=false; }); box.addEventListener('pointercancel',()=>{ down=false; }); })();

// --- personajes: nombre, movimiento y búsqueda bajo el puntero ---
function miniName(b){ if(b.sheet&&b.sheet.name) return b.sheet.name; const f=CHARS.find(c=>c[0]===b.kind); if(f) return f[1]; const c=CUSTOM.chars[b.kind]; return c?c.name:'Personaje'; }
function miniAt(cx,cy){ const rect=canvas.getBoundingClientRect();
  ndc.set(((cx-rect.left)/rect.width)*2-1, -((cy-rect.top)/rect.height)*2+1); scene.updateMatrixWorld(); ray.setFromCamera(ndc,camera);
  const ms=bills.filter(b=>b.mini&&b.mesh.visible), h=ray.intersectObjects(ms.map(b=>b.mesh),false); return h.length?ms.find(b=>b.mesh===h[0].object):null; }
function moveMiniTo(b,x,z,quiet){
  clearPath();
  const from=b.path?b.path[b.step+1]:[b.x,b.z], path=findPath(from[0],from[1],x,z,b);
  if(!path){ if(!quiet) showHint('No hay camino hasta esa casilla.'); return false; }
  if(b.path) b.pending=path; else if(path.length>1){ b.path=path; b.step=0; b.t=0; }
  return true; }
// distancias para quien juega: siempre en pies (5 por casilla), como JA-VTT
const feet=n=>n*5+' pies';

// --- menú contextual: clic derecho sin arrastrar, o mantener pulsado en el celular ---
const ctxEl=$('ctxMenu');
function closeCtx(){ ctxEl.hidden=true; }
function openCtx(cx,cy){
  closeCtx(); const mi=miniAt(cx,cy), cell=cellAt(cx,cy); if(!mi&&!cell) return;
  ctxEl.textContent=''; const add=(label,fn,opt={})=>{ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.textContent=label; if(opt.disabled) b.disabled=true; b.onclick=()=>{ closeCtx(); fn(); }; ctxEl.appendChild(b); };
  const head=(t,sub)=>{ const h=document.createElement('strong'); h.textContent=t; ctxEl.appendChild(h); if(sub){ const s2=document.createElement('small'); s2.textContent=sub; ctxEl.appendChild(s2); } };
  if(mi){
    head(miniName(mi),'En la casilla '+mi.x+', '+mi.z);
    add('Elegir',()=>{ selected=mi; });
    add('Centrar la cámara',()=>{ selected=mi; focusSelected(); });
    add('Girar a la derecha',()=>{ [mi.fx,mi.fz]=[-mi.fz,mi.fx]; });
    add('Girar a la izquierda',()=>{ [mi.fx,mi.fz]=[mi.fz,-mi.fx]; });
    if(state.mode==='edit') add('Quitar este personaje',()=>{ beginStroke(); removeEntitiesAt(mi.x,mi.z); flushEdit(); endStroke(); });
  } else {
    const i=idx(cell.x,cell.z), T=M.t[i], names={stairs:'',g:'pasto',a:'arena',p:'camino',s:'piedra',o:'madera',w:'muro',c:'adoquín',n:'nieve',l:'lava'};
    const water=(WS&&WS[i])||isLake(i);
    head('Casilla '+cell.x+', '+cell.z,'Altura '+M.h[i]+', '+(names[T]||'terreno propio')+(water?', con agua':''));
    { const dp=doorAt(cell.x,cell.z); if(dp){ if(canOpenDoor(dp)) add(dp.open?'Cerrar la puerta':'Abrir la puerta',()=>toggleDoor(dp)); else add(dp.locked?'Cerrada con llave':'Puerta (el director no deja abrirla)',()=>{},{disabled:true});
      if(gmView()) add(dp.locked?'Quitar la llave':'Cerrar con llave',()=>lockDoor(dp,!dp.locked)); } }
    { const pp=portalAt(cell.x,cell.z); if(pp) portalMenu(pp,add,head); }
    { const nt=noteAt(cell.x,cell.z); if(nt){ const sm=document.createElement('small'); sm.textContent='Anotación'+(nt.gmOnly?' (sólo el director)':'')+': '+nt.text; ctxEl.appendChild(sm); }
      if(gmView()) add(nt?'Editar la anotación':'Añadir una anotación aquí',()=>setTimeout(()=>sceneNoteEditor(cell.x,cell.z,nt,cx,cy),0)); }
    if(CAMP&&!(LIVE.on&&!LIVE.dm)){
      const nt=campNotes().find(n=>n.x===cell.x&&n.z===cell.z);
      if(nt){ const sm=document.createElement('small'); sm.textContent='Nota del DM: '+nt.text; ctxEl.appendChild(sm); }
      add(nt?'Editar la nota del DM':'Añadir nota del DM aquí',()=>setTimeout(()=>{ noteEditor(cell.x,cell.z,nt); ctxEl.style.left=Math.min(cx,innerWidth-320)+'px'; ctxEl.style.top=Math.min(cy,innerHeight-220)+'px'; },0));
      if(state.mode==='edit') for(const [id,bd] of Object.entries(CAMP.boards)) if(id!==CAMP.cur) add('Crear portal a '+bd.name,()=>{ beginStroke(); campLink(cell.x,cell.z,id); stroke.changed=true; endStroke(); });
    }
    if(state.mode==='play'){
      if(selected){
        const [ax,az]=anchorAt(selected,cell.x,cell.z), pth=findPath(selected.x,selected.z,ax,az,selected), straight=Fichas.gap(selected.x,selected.z,nOf(selected),cell.x,cell.z,1).cells;
        const info=document.createElement('small'); info.textContent=miniName(selected)+': '+(pth?'a pie, '+feet(pth.cost):'sin camino')+'; en línea recta, '+feet(straight)+'.'; ctxEl.appendChild(info);
        add('Mover a '+miniName(selected)+' aquí',()=>{ moveMiniTo(selected,ax,az); },{disabled:!pth});
      }
      add('Centrar la cámara aquí',()=>{ state.camGoal={x:cell.x+.5,z:cell.z+.5}; });
      if(LIVE.on) add('Señalar esta casilla a la mesa',()=>livePing(cell.x,cell.z));
    } else {
      add('Tomar este terreno para pintar',()=>{ $('rail').querySelector('[data-tool="paint"]').click(); state.terrain=T; renderPalette(); });
      const edit=fn=>{ beginStroke(); fn(); flushEdit(); endStroke(); };
      add('Subir un nivel',()=>edit(()=>{ if(M.h[i]<12){ M.h[i]++; touch(cell.x,cell.z); } }));
      add('Bajar un nivel',()=>edit(()=>{ if(M.h[i]>0){ M.h[i]--; touch(cell.x,cell.z); } }));
      add(M.src[i]?'Quitar el agua':'Poner un manantial',()=>edit(()=>{ M.src[i]=M.src[i]?0:(T==='w'?0:1); stroke.water=true; stroke.changed=true; }),{disabled:T==='w'});
      if(occupied(cell.x,cell.z)) add('Quitar lo que hay aquí',()=>edit(()=>removeEntitiesAt(cell.x,cell.z)));
    }
  }
  ctxEl.hidden=false; const r=ctxEl.getBoundingClientRect();
  ctxEl.style.left=Math.max(8,Math.min(cx,innerWidth-r.width-8))+'px'; ctxEl.style.top=Math.max(8,Math.min(cy,innerHeight-r.height-8))+'px';
  const first=ctxEl.querySelector('button:not([disabled])'); if(first) first.focus({preventScroll:true});
}
on(window,'pointerdown',e=>{ if(!ctxEl.hidden&&!ctxEl.contains(e.target)) closeCtx(); },true);

function setFree(on){ state.free=on; $('free').setAttribute('aria-pressed',String(on)); if(!on) animateYawTo(snapYaw(state.yaw)); }
function rotate(d){ if(state.free) setFree(false); animateYawTo(snapYaw(state.rotT<1?state.yawTarget:state.yaw)+d*HALF_PI); }
$('rotL').onclick=()=>rotate(1);
$('rotR').onclick=()=>rotate(-1);
$('free').onclick=()=>{ setFree(!state.free); if(state.free) showHint('Arrastra a los lados para girar libremente.'); };
$('angle').onclick=()=>{ state.diagonal=!state.diagonal; const b=$('angle'); b.setAttribute('aria-pressed',String(state.diagonal)); b.textContent=state.diagonal?'Vista diagonal':'Vista recta'; if(!state.free) animateYawTo(snapYaw(state.yaw)); };
$('zoomIn').onclick=()=>zoomStep(1);
$('zoomOut').onclick=()=>zoomStep(-1);
const SIZES=[0.75,1,1.35];
$('pix').onclick=()=>{ state.sizeMul=SIZES[(SIZES.indexOf(state.sizeMul)+1)%3]; $('pix').textContent='Tamaño '+Math.round(state.sizeMul*100)+'%'; resize(); };
$('res').onclick=()=>{
  const order=[16,32,64]; TEX=order[(order.indexOf(TEX)+1)%3]; $('res').textContent='Resolución '+TEX;
  showHint('Generando arte a '+TEX+'×'+TEX+' por casilla…',1500);
  setTimeout(()=>{
    const t0=performance.now(), keep=state.target.clone();
    syncMinis(); buildArt(); applyArtMaps(); resize(); loadMap(M,true); state.target.copy(keep); renderPalette();
    showHint('Arte a '+TEX+'×'+TEX+' listo en '+Math.round(performance.now()-t0)+' ms.',2200);
  },40);
};
const LIGHT_NAMES=['Luz suave','Luz por bandas','Luz tramada'];
$('light').onclick=()=>{ state.lightMode=(state.lightMode+1)%3; uniforms.uMode.value=state.lightMode; $('light').textContent=LIGHT_NAMES[state.lightMode]; };
$('outline').onclick=()=>{ state.outline=!state.outline; postUniforms.uOutline.value=state.outline?1:0; $('outline').setAttribute('aria-pressed',String(state.outline)); };
$('decor').onclick=()=>{ state.decor=!state.decor; if(decorMesh) decorMesh.visible=state.decor; $('decor').setAttribute('aria-pressed',String(state.decor)); };
$('solid').onclick=()=>{ state.stack3d=!state.stack3d; decorUniforms.uFixed.value=state.stack3d?1:0; $('solid').setAttribute('aria-pressed',String(state.stack3d)); };
$('walls').onclick=()=>{ state.lowWalls=!state.lowWalls; $('walls').setAttribute('aria-pressed',String(state.lowWalls)); rebuild(); };
if(!canPost){ $('outline').disabled=true; $('outline').setAttribute('aria-pressed','false'); $('outline').title='Este navegador no permite contornos'; }
$('sheet').querySelectorAll('[data-map]').forEach(btn=>btn.onclick=()=>{
  $('sheet').querySelectorAll('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
  const k=btn.dataset.map;
  showHint('Generando el tablero…',900); $('sheet').hidden=true;
  setTimeout(()=>{
    const t0=performance.now();
    loadMap(k==='demo'?demoMap():k==='town'?townMap():k==='lights'?lightWorkshopMap():dungeonMap(k==='d64'?64:128,(Math.random()*1e9)|0)); renderPalette();
    if(k==='lights') showHint('Una alcoba por tipo de luz. En Editar (luz, tecla 8) ves el nombre de cada una y el cono de las dirigidas.',4200);
    else if(k!=='demo'&&k!=='town') showHint(`Mazmorra lista en ${Math.round(performance.now()-t0)} ms. Prueba "Muros bajos" para ver dentro de las salas.`,3800);
  },30);
});


/* ============ editor de tablero ============ */
const TERR_OPTS=[['g','Pasto',0],['a','Arena',7],['p','Camino',5],['c','Adoquín',26],['s','Piedra',3],['o','Madera',9],['n','Nieve',29],['l','Lava',37],['w','Muro',22]];
const PROP_BASE=[{type:'tree',v:0,name:'Árbol'},{type:'tree',v:1,name:'Árbol frondoso'},{type:'tree',v:2,name:'Pino'},{type:'brazier',v:0,name:'Brasero'},
  ...Object.keys(PROP3D).filter(k=>!PROP3D[k].hidden).flatMap(k=>PROP3D[k].orient?[{type:k,v:0,name:PROP3D[k].name},{type:k,v:1,name:PROP3D[k].name+' (girada)'}]:[{type:k,v:0,name:PROP3D[k].name}])];
function propOpts(){ return [...PROP_BASE,...Object.entries(CUSTOM.objs).filter(([k])=>k.startsWith('o_')).map(([k,o])=>({type:'obj:'+k,v:0,name:o.name,custom:k}))]; }
function miniOpts(){ return [...CHARS.map(([k,n])=>[k,n]),...Object.entries(CUSTOM.chars).filter(([k])=>k.startsWith('c_')).map(([k,c])=>[k,c.name])]; }
function stackThumb(slices){
  const w=slices[0].width, n=slices.length, sc=Math.max(0.25,Math.min(2,48/(w*1.5*SIN_E+n*COS_E)));
  const c=mkCanvas(Math.ceil(w*1.5*sc)+2,Math.ceil((w*1.5*SIN_E+n*COS_E)*sc)+2), x=c.getContext('2d'); x.imageSmoothingEnabled=false;
  const base=c.height-w*0.75*SIN_E*sc-1;
  slices.forEach((sl,i)=>{ x.save(); x.translate(c.width/2,base-i*COS_E*sc); x.scale(sc,sc*SIN_E); x.rotate(0.6); x.drawImage(sl,-w/2,-w/2); x.restore(); });
  return c; }
Object.assign(state,{waterMode:'spring',simActive:false,mode:'play',tool:'paint',brush:1,fill:false,terrain:'g',propSel:0,miniKind:'knight',newSize:16,
  levelH:2,lightSel:null,lightDraft:lightOfType('torch'),propCat:'all',roofDraft:{mat:'tile',shape:'gable'},roofSel:null,wallKind:'wall',wallSel:null,portalLook:'door',zoneMode:'rect',zoneA:null,zoneB:null});
let stroke=null;
function setBoardName(n){ M.name=n; $('mapName').textContent=n; $('bname').value=n; }
$('bname').addEventListener('input',()=>{ const v=$('bname').value.trim()||'Tablero sin nombre'; M.name=v; $('mapName').textContent=v; });
function snap(){ return {roofs:(M.roofs||[]).map(r=>({...r})),src:M.src.slice(),h:M.h.slice(),t:M.t.slice(),props:M.props.map(p=>({...p})),minis:M.minis.map(m=>({...m})),env:{...ENV},zoneCells:M.zoneCells||''}; }
function restore(sn){ M.roofs=sn.roofs||[]; roofKey=null; M.src=sn.src; M.h=sn.h; M.t=sn.t; M.props=sn.props; M.minis=sn.minis; M.zoneCells=sn.zoneCells||'';
  if(sn.env&&(sn.env.env!==ENV.env||sn.env.ambient!==ENV.ambient||sn.env.darkColor!==ENV.darkColor)) setEnv(sn.env);
  refreshEntities(); rebuild(); solveWater(true); state.simActive=true; buildDecor(); }
function pushUndo(sn){ undoStack.push(sn); if(undoStack.length>40) undoStack.shift(); redoStack.length=0; }
function undo(){ if(!undoStack.length){ showHint('No hay nada que deshacer.',1200); return; } syncMinis(); redoStack.push(snap()); restore(undoStack.pop()); }
function redo(){ if(!redoStack.length){ showHint('No hay nada que rehacer.',1200); return; } syncMinis(); undoStack.push(snap()); restore(redoStack.pop()); }
function beginStroke(){ stroke={snap:snap(),changed:false,last:-1,ents:false,box:null}; }
function touch(x,z){
  stroke.changed=true;
  const b=stroke.box; stroke.box=b?[Math.min(b[0],x),Math.min(b[1],z),Math.max(b[2],x),Math.max(b[3],z)]:[x,z,x,z];
}
function flushEdit(){
  if(stroke.ents){ refreshEntities(); stroke.ents=false; }
  if(stroke.box){ const b=stroke.box; stroke.box=null; rebuildRegion(b[0],b[1],b[2],b[3]); }
  if(stroke.water) stroke.water=false;
}
function fillWater(x,z,v){
  const i0=idx(x,z), h0=M.h[i0]; if(M.t[i0]==='w') return;
  const seen=new Uint8Array(M.w*M.d), q=[i0]; seen[i0]=1;
  for(let k=0;k<q.length&&k<20000;k++){
    const c=q[k]; if(M.src[c]!==v){ M.src[c]=v; stroke.water=true; stroke.changed=true; }
    const cx=c%M.w, cz=(c/M.w)|0;
    for(const [dx,dz] of DIR4){ const X=cx+dx, Z=cz+dz; if(!inb(X,Z)) continue; const n=idx(X,Z);
      if(!seen[n]&&M.t[n]!=='w'&&M.h[n]===h0){ seen[n]=1; q.push(n); } }
  }
}
function endStroke(){
  if(!stroke) return;
  if(state.zoneA&&state.tool==='zone'){ const [ax,az]=state.zoneA, [bx,bz]=state.zoneB||state.zoneA, cs=[]; state.zoneA=state.zoneB=null;
    for(let z=Math.min(az,bz);z<=Math.max(az,bz);z++) for(let x=Math.min(ax,bx);x<=Math.max(ax,bx);x++) cs.push([x,z]);
    setZoneCells(cs,'1'); showHint('Zona interior de '+(Math.abs(ax-bx)+1)*5+' × '+(Math.abs(az-bz)+1)*5+' pies: dentro no llega la luz ambiental.',2000); }
  flushEdit();
  if(stroke.changed){ solveWater(true); state.simActive=true; buildDecor(); pushUndo(stroke.snap); }
  stroke=null;
}
function removeEntitiesAt(x,z){
  const gone=M.props.filter(p=>propCovers(p,x,z)), np=M.props.filter(p=>!propCovers(p,x,z)), nm=M.minis.filter(m=>!Fichas.covers(m.x,m.z,miniCells(m),x,z));
  if(np.length!==M.props.length||nm.length!==M.minis.length){ M.props=np; M.minis=nm; stroke.ents=true; touch(x,z);
    for(const p of gone){ const l=propLight(p,null); if(l) touchLight({x,z,r:l.r}); if(p===state.lightSel) state.lightSel=null; } }
}
function setTerrain(x,z,T){
  const i=idx(x,z), old=M.t[i]; if(old===T) return;
  let h=M.h[i];
  if(T==='w'&&old!=='w') h=Math.min(12,h+4); else if(T!=='w'&&old==='w') h=Math.max(0,h-4);
  M.t[i]=T; M.h[i]=h; if(T==='w') M.src[i]=0;
  if(T==='w'||T==='~') removeEntitiesAt(x,z);
  touch(x,z);
}
function fillFrom(x,z){
  const i0=idx(x,z), t0=M.t[i0], h0=M.h[i0]; if(t0===state.terrain) return;
  const seen=new Uint8Array(M.w*M.d), q=[i0]; seen[i0]=1; const cells=[];
  for(let k=0;k<q.length&&cells.length<20000;k++){
    const c=q[k]; cells.push(c); const cx=c%M.w, cz=(c/M.w)|0;
    for(const [dx,dz] of DIR4){ const X=cx+dx, Z=cz+dz; if(!inb(X,Z)) continue; const n=idx(X,Z);
      if(!seen[n]&&M.t[n]===t0&&M.h[n]===h0){ seen[n]=1; q.push(n); } }
  }
  for(const c of cells) setTerrain(c%M.w,(c/M.w)|0,state.terrain);
}
const miniCells=m=>Fichas.cellsOf(m.sheet||defaultSheet(m.kind));
// forMini: un personaje puede estar sobre lo que se pisa (velo, maleza, escalones). «Se pisa» es lo de su definición, no lo de
// su estado: una puerta abierta sigue ocupando su casilla al colocar (como antes; Muros.gridOf mira igual)
const walkable=p=>!opaque(p)&&!Catalogo.blocksMove(p,PIECES)&&!Catalogo.isDoor(p,PIECES);
function occupied(x,z,forMini){ return (inb(x,z)&&blockCell(idx(x,z)))||M.props.some(p=>FT(p)!=='light'&&!(forMini&&walkable(p)&&!Catalogo.surface(p,PIECES))&&propCovers(p,x,z))||M.minis.some(m=>Fichas.covers(m.x,m.z,miniCells(m),x,z)); }
function applyTool(x,z,first){
  const t=state.tool, r=(state.brush-1)>>1, cells=[];
  for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){ const X=x+dx, Z=z+dz; if(inb(X,Z)) cells.push([X,Z]); }
  if(t==='paint'){
    if(state.fill){ if(first) fillFrom(x,z); }
    else for(const [X,Z] of cells) setTerrain(X,Z,state.terrain);
  } else if(t==='raise'||t==='lower'){
    for(const [X,Z] of cells){ const i=idx(X,Z), nh=Math.max(0,Math.min(12,M.h[i]+(t==='raise'?1:-1)));
      if(nh!==M.h[i]){ M.h[i]=nh; touch(X,Z); } }
  } else if(t==='prop'||t==='mini'){
    if(!first) return;
    // un personaje grande o un objeto de varias casillas las ocupa todas: todas tienen que admitirlo; un puente va sobre el agua
    const P=t==='prop'?(propOpts()[state.propSel]||PROP_BASE[0]):null;
    let ax=x, az=z, cells;
    if(t==='mini'){ const n=Fichas.cellsOf(defaultSheet(state.miniKind)); [ax,az]=Fichas.anchorFor(x,z,n,M.w,M.d); cells=Fichas.footprint(ax,az,n); }
    else { const [sw,sd]=propSpan(P); ax=Math.max(0,Math.min(M.w-sw,x-((sw-1)>>1))); az=Math.max(0,Math.min(M.d-sd,z-((sd-1)>>1))); cells=propCells({type:P.type,v:P.v,x:ax,z:az}); }
    if(cells.some(([X,Z])=>!inb(X,Z)||M.t[idx(X,Z)]==='w'||(!Catalogo.surface(P,PIECES)&&isDeep(idx(X,Z)))||occupied(X,Z,t==='mini'))){ showHint('Esa casilla está ocupada o no admite objetos.',1600); return; }
    if(t==='prop') M.props.push({type:P.type,x:ax,z:az,v:P.v,uid:Catalogo.newUid()});
    else M.minis.push({kind:state.miniKind,x:ax,z:az,fx:0,fz:1});
    stroke.ents=true; touch(x,z);
  } else if(t==='roof'){
    if(!first) return;
    if(state.roofRemove){ const k=roofOf(x,z); if(k>=0){ if(M.roofs[k]===state.roofSel) state.roofSel=null; M.roofs.splice(k,1); stroke.changed=true; buildRoofs(); } else showHint('Ahí no hay techo.',1200); return; }
    if(!state.roofA){ const k=roofOf(x,z);
      if(k>=0){ state.roofSel=M.roofs[k]; renderToolOpts(); showHint('Techo elegido: cambia su material y su forma en el panel; R gira la cumbrera.',2200); return; }
      state.roofA=[x,z]; state.roofSel=null; renderToolOpts(); showHint('Ahora toca la esquina opuesta de la casa.',1800); return; }
    const [ax,az]=state.roofA, D0=state.roofDraft; state.roofA=null;
    const r={x:Math.min(ax,x),z:Math.min(az,z),w:Math.abs(ax-x)+1,d:Math.abs(az-z)+1,mat:D0.mat,shape:D0.shape,...(Number.isInteger(D0.rot)?{rot:D0.rot}:{})};
    if(r.w<2||r.d<2){ showHint('El techo necesita al menos 10×10 pies (2×2 casillas).',1500); return; }
    M.roofs.push(r); state.roofSel=r; stroke.changed=true; buildRoofs(); renderToolOpts();
    showHint('Techo '+ROOF_SHAPES[r.shape].toLowerCase()+' de '+ROOF_MATS[r.mat].name.toLowerCase()+' añadido. En juego se abre al entrar.',2400);
  } else if(t==='level'){
    if(first){ state.levelH=M.h[idx(x,z)]; showHint('Nivelando a la altura '+state.levelH+'.',1200); }
    for(const [X,Z] of cells){ const i=idx(X,Z); if(M.t[i]!=='w'&&M.h[i]!==state.levelH){ M.h[i]=state.levelH; touch(X,Z); } }
  } else if(t==='light'){
    if(!first) return;
    const here=M.props.find(p=>FT(p)==='light'&&p.x===x&&p.z===z);
    if(here){ state.lightSel=here; renderToolOpts(); showHint(here.angle<360?'Luz elegida: R la gira; el resto, en el panel.':'Luz elegida: cambia su tipo, radio, altura y color en el panel.',1800); return; }
    const np=Object.assign({type:'light',x,z,v:0,uid:Catalogo.newUid()},normLight(state.lightDraft));
    M.props.push(np); state.lightSel=np; stroke.ents=true; touchLight(np); renderToolOpts();
  } else if(t==='wall'){
    if(state.wallKind==='wall'){ for(const [X,Z] of cells) setTerrain(X,Z,'w'); }
    else if(first) placeWall(x,z,state.wallKind);
  } else if(t==='zone'){
    if(state.zoneMode==='rect'){ if(first) state.zoneA=[x,z]; state.zoneB=[x,z]; drawZones(); return; }
    setZoneCells(cells,state.zoneMode==='paint'?'1':null);
  } else if(t==='erase'){
    for(const [X,Z] of cells) removeEntitiesAt(X,Z);
  } else if(t==='water'){
    const v=state.waterMode==='spring'?1:state.waterMode==='still'?2:0;
    if(state.fill&&v){ if(first) fillWater(x,z,v); }
    else for(const [X,Z] of cells){ const i=idx(X,Z); if(M.t[i]!=='w'&&M.src[i]!==v){ M.src[i]=v; if(v) removeEntitiesAt(X,Z); stroke.water=true; stroke.changed=true; } }
  }
  flushEdit();
}
// una luz cambia la iluminación en todo su radio: se marca esa zona para reconstruirla
function touchLight(p){ const rr=Math.ceil((p.r||5)+1); touch(Math.max(0,p.x-rr),Math.max(0,p.z-rr)); touch(Math.min(M.w-1,p.x+rr),Math.min(M.d-1,p.z+rr)); }
function paintAt(cx,cy,first){
  if(!stroke) return;
  const c=cellAt(cx,cy); if(!c) return;
  if(!first&&c.i===stroke.last) return;
  stroke.last=c.i;
  applyTool(c.x,c.z,first);
  const b=(state.brush>1&&!(state.fill&&(state.tool==='paint'||state.tool==='water'))&&!['prop','mini','light','roof'].includes(state.tool)&&!(state.tool==='wall'&&state.wallKind!=='wall')&&!(state.tool==='zone'&&state.zoneMode==='rect'))?state.brush:1;
  destCursor.scale.set(b,1,b); destCursor.position.set(c.x+.5,topY(c.x,c.z)+0.02,c.z+.5); destTimer=0.5;
}

/* ---- zonas interiores (zone de JA-VTT, por casilla): rectángulo, pincel y borrar ---- */
const ZONE_COLOR='#B79BD8';
const ZONE_MODES=[['rect','Rectángulo','square-dashed','Arrastra sobre un edificio o cueva'],['paint','Pincel','house','Pinta casillas interiores (el pincel de [ y ])'],
  ['erase','Borrar','eraser','Quita la zona; sobre un techo, la casilla queda al aire libre']];
// v: '1' interior; null borra (sobre un techo queda '2', exterior a la fuerza)
function setZoneCells(cells,v){
  const n=M.w*M.d, a=(M.zoneCells&&M.zoneCells.length===n?M.zoneCells:'0'.repeat(n)).split(''); let ch=false;
  for(const [x,z] of cells){ if(!inb(x,z)) continue; const i=idx(x,z), c=v||(roofOf(x,z)>=0?'2':'0'); if(a[i]!==c){ a[i]=c; ch=true; } }
  if(!ch) return; const zc=a.join(''); M.zoneCells=/[12]/.test(zc)?zc:''; stroke.changed=true; computeAmbient(); fogDirty=true;
}
// contorno a trazos de las zonas (las pintadas y las de los techos) sobre el tablero; sólo el director, al editar
let zoneLines=null, zoneFill=null;
const zoneLineMat=new THREE.LineDashedMaterial({color:ZONE_COLOR,dashSize:0.3,gapSize:0.2,depthWrite:false});
const zonePrevMat=new THREE.LineDashedMaterial({color:0xF0B35A,dashSize:0.3,gapSize:0.2,depthWrite:false});
const zoneFillMat=new THREE.MeshBasicMaterial({color:ZONE_COLOR,transparent:true,opacity:0.16,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
function drawZones(){
  for(const m of [zoneLines,zoneFill]) if(m){ scene.remove(m); m.geometry.dispose(); } zoneLines=zoneFill=null;
  if(!M||!INTERIOR||!EH||state.mode!=='edit'||!gmView()) return;
  const pos=[], fill=[], y=i=>EH[i]*STEP, E=0.04;
  for(let z=0;z<M.d;z++) for(let x=0;x<M.w;x++){ const i=idx(x,z); if(!INTERIOR[i]) continue;
    if(state.tool==='zone'){ const h=y(i)+0.02; fill.push(x,h,z, x,h,z+1, x+1,h,z+1, x,h,z, x+1,h,z+1, x+1,h,z); }
    for(const [dx,dz,ax,az,bx,bz] of [[1,0,1,0,1,1],[-1,0,0,0,0,1],[0,1,0,1,1,1],[0,-1,0,0,1,0]]){ const X=x+dx, Z=z+dz; if(inb(X,Z)&&INTERIOR[idx(X,Z)]) continue;
      const h=Math.max(y(i),inb(X,Z)?y(idx(X,Z)):0)+E; pos.push(x+ax,h,z+az, x+bx,h,z+bz); } }
  if(state.zoneA&&state.tool==='zone'){ const [ax,az]=state.zoneA, [bx,bz]=state.zoneB||state.zoneA, x0=Math.min(ax,bx), x1=Math.max(ax,bx)+1, z0=Math.min(az,bz), z1=Math.max(az,bz)+1;
    let h=0; for(let z=z0;z<z1;z++) for(let x=x0;x<x1;x++) h=Math.max(h,y(idx(x,z))); h+=E*2;
    const pv=[x0,h,z0, x1,h,z0, x1,h,z0, x1,h,z1, x1,h,z1, x0,h,z1, x0,h,z1, x0,h,z0], g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pv,3));
    zoneFill=new THREE.LineSegments(g,zonePrevMat); zoneFill.computeLineDistances(); zoneFill.renderOrder=6; scene.add(zoneFill); }
  else if(fill.length){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(fill,3)); zoneFill=new THREE.Mesh(g,zoneFillMat); zoneFill.renderOrder=6; scene.add(zoneFill); }
  if(pos.length){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); zoneLines=new THREE.LineSegments(g,zoneLineMat); zoneLines.computeLineDistances(); zoneLines.renderOrder=6; scene.add(zoneLines); }
}

/* ---- paleta ---- */
function thumbCanvas(src,sx,sy,sw,sh){ const c=mkCanvas(sw,sh); c.getContext('2d').drawImage(src,sx,sy,sw,sh,0,0,sw,sh); return c; }
function renderPalette(){
  const el=$('palette'); el.textContent='';
  let items=null;
  if(state.tool==='paint') items=TERR_OPTS.map(([k,n,ti])=>({label:n,cv:CUSTOM.tiles[k+':top']?CUSTOM.tiles[k+':top'].canvases[0]:thumbCanvas(atlas,(ti%AC)*16,((ti/AC)|0)*16,16,16),on:state.terrain===k,act:()=>{state.terrain=k;}}));
  else if(state.tool==='prop') items=propOpts().map((o,i)=>{ const co=o.custom?CUSTOM.objs[o.custom]:(o.type==='tree'?CUSTOM.objs['tree'+o.v]:CUSTOM.objs[o.type]||null);
    return {label:o.name,cv:co?stackThumb(co.slices):PROP3D[o.type]?stackThumb(propSlices(o.type)):(o.type==='brazier'?CAN.brazier[0]:(o.v===2?drawPine(29):drawTree(o.v?17:5))),on:state.propSel===i,act:()=>{state.propSel=i;}}; });
  else if(state.tool==='water') items=[
    {label:'Manantial',cv:thumbCanvas(atlas,4*16,32,16,16),on:state.waterMode==='spring',act:()=>{state.waterMode='spring';}},
    {label:'Agua quieta',cv:thumbCanvas(atlas,0,16,16,16),on:state.waterMode==='still',act:()=>{state.waterMode='still';}},
    {label:'Quitar agua',cv:thumbCanvas(atlas,7*16,0,16,16),on:state.waterMode==='remove',act:()=>{state.waterMode='remove';}}];
  else if(state.tool==='roof'){ const cur=roofSelected()||state.roofDraft; items=[
    ...ROOF_MAT_IDS.map(k=>({label:ROOF_MATS[k].name,cv:roofSwatch(k),on:!state.roofRemove&&cur.mat===k,mat:k,act:()=>{ state.roofRemove=false; setRoof({mat:k}); }})),
    {label:'Quitar techo',cv:thumbCanvas(atlas,(7%AC)*16,0,16,16),on:!!state.roofRemove,act:()=>{state.roofRemove=true; state.roofA=null; state.roofSel=null;}}]; }
  else if(state.tool==='mini') items=miniOpts().map(([k,n])=>({label:n,cv:CUSTOM.chars[k]?CUSTOM.chars[k].canvases[0]:(CAN[k]||CAN.knight).front,on:state.miniKind===k,act:()=>{state.miniKind=k;}}));
  else if(state.tool==='wall') items=Muros.WALL_KINDS.map(k=>{ const T=Muros.WALL_TYPES[k]; return {label:T.name,ic:T.icon,col:T.color,wall:k,title:T.desc,on:state.wallKind===k,act:()=>{ state.wallKind=k; state.wallSel=null; }}; });
  else if(state.tool==='zone') items=ZONE_MODES.map(([k,n,ic,title])=>({label:n,ic,col:ZONE_COLOR,title,zone:k,on:state.zoneMode===k,act:()=>{ state.zoneMode=k; state.zoneA=null; }}));
  else if(state.tool==='light') items=LIGHT_IDS.map(id=>({label:LIGHT_TYPES[id].name,ic:LIGHT_TYPES[id].icon,col:id==='darkness'?'#8a6ad0':LIGHT_TYPES[id].color,id,
    on:(state.lightSel&&M.props.includes(state.lightSel)?state.lightSel:state.lightDraft).preset===id,act:()=>setLightType(id)}));
  if(state.tool==='prop'){ const cat=state.propCat; items=items.filter((it,i)=>cat==='all'||propCat(propOpts()[i])===cat); }
  renderPalFilter(); renderToolOpts();
  if(!items){
    const sp=document.createElement('span'); sp.className='t3d-note';
    sp.textContent={raise:'Toca o arrastra para subir el terreno un nivel.',lower:'Toca o arrastra para bajar el terreno un nivel.',level:'Empieza a arrastrar en una casilla: las demás que pintes toman su altura. Útil para suelos de casas, plazas y mesetas.',erase:'Toca para quitar objetos, luces y personajes.'}[state.tool];
    el.appendChild(sp); return;
  }
  for(const it of items){
    const b=document.createElement('button'); b.className='t3d-sw'; b.setAttribute('aria-pressed',String(it.on));
    if(it.ic){ const ic=document.createElement('span'); ic.className='t3d-swIc'; ic.style.color=it.col; ic.innerHTML=ctx.icon(it.ic); b.appendChild(ic); if(it.id) b.dataset.light=it.id; if(it.wall) b.dataset.wall=it.wall; if(it.zone) b.dataset.zone=it.zone; if(it.title) b.title=it.title; }
    else { const cv=mkCanvas(it.cv.width,it.cv.height); cv.getContext('2d').drawImage(it.cv,0,0); b.appendChild(cv); if(it.mat) b.dataset.mat=it.mat; }
    const sp=document.createElement('span'); sp.textContent=it.label; b.appendChild(sp);
    b.onclick=()=>{ it.act(); renderPalette(); };
    el.appendChild(b);
  }
}
$('rail').querySelectorAll('[data-tool]').forEach(btn=>btn.onclick=()=>{
  if(state.mode!=='edit') $('mode').click();
  state.tool=btn.dataset.tool;
  $('rail').querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
  $('fill').disabled=!(state.tool==='paint'||state.tool==='water');
  if(state.tool==='water') showHint('El agua nace en las fuentes, corre por lo plano y cae por los desniveles.',3000);
  if(state.tool==='zone') showHint(ENV.ambient>0?'Arrastra sobre un edificio o cueva: dentro no llega la luz ambiental.':'Las zonas interiores se notan cuando hay luz ambiental (exterior).',2600);
  renderPalette(); railSync(); drawZones();
});
$('zoneToolBtn').onclick=()=>$('rail').querySelector('[data-tool="zone"]').click();
if($('explore')) $('explore').onclick=()=>{ if(state.mode==='edit') $('mode').click(); };
$('brush').onclick=()=>{ state.brush=state.brush>=5?1:state.brush+2; $('brush').querySelector('span').textContent=state.brush+'×'+state.brush; };
$('fill').onclick=()=>{ state.fill=!state.fill; $('fill').setAttribute('aria-pressed',String(state.fill)); };
$('undo').onclick=undo; $('redo').onclick=redo;
function layout(){}
// raíl de herramientas: «Explorar» o la herramienta de edición activa
function railSync(){ const ed=state.mode==='edit';
  $('rail').querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(ed&&b.dataset.tool===state.tool)));
  const ex=$('explore'); if(ex) ex.setAttribute('aria-pressed',String(!ed)); }
on(window,'resize',layout);
$('mode').addEventListener('click',()=>{ hoverCursor.visible=false; setCursor(state.mode==='edit'?'crosshair':'default'); });
$('mode').onclick=()=>{
  const editing=state.mode!=='edit';
  state.mode=editing?'edit':'play';
  $('mode').setAttribute('aria-pressed',String(editing));
  $('edit').hidden=!editing; state.zoneA=null; setTimeout(drawZones,0);
  if(editing){ syncMinis(); refreshEntities(); renderPalette();
    showHint(matchMedia('(pointer: coarse)').matches?'Un dedo pinta; dos dedos mueven y hacen zoom.':'Clic izquierdo pinta; clic derecho y arrastrar mueve la cámara.',3200); }
  layout();
};

/* ---- luces y filtros de la paleta ---- */
// elegir un tipo en la paleta: la próxima luz será de ese tipo y, si hay una elegida, la cambia (conserva dirección y encendido)
function setLightType(id){ const sel=state.lightSel&&M.props.includes(state.lightSel)?state.lightSel:null;
  state.lightDraft=lightOfType(id,state.lightDraft); if(sel) editLight(l=>{ const was=LIGHT_TYPES[l.preset]; Object.assign(l,lightOfType(id,l)); if(was&&l.name===was.name) l.name=LIGHT_TYPES[id].name; }); }
// R (Mayús+R al revés): gira 45° la luz dirigida elegida, o la próxima que pongas
function turnLight(dir){ const sel=state.lightSel&&M.props.includes(state.lightSel)?state.lightSel:null, L0=sel||state.lightDraft;
  if(!(L0.angle<360)){ showHint('Sólo las luces dirigidas (linterna sorda, ventana) tienen dirección.',1600); return; }
  const v=((((L0.rot||0)+dir*45)%360)+360)%360; state.lightDraft.rot=v; if(sel) editLight(l=>{ l.rot=v; }); renderToolOpts(); showHint('Apunta al '+compass(v)+'.',900); }
const compass=v=>['este','sureste','sur','suroeste','oeste','noroeste','norte','noreste'][Math.round((((v%360)+360)%360)/45)%8];
// cambia la luz elegida y reconstruye su zona; un solo paso de deshacer por gesto
function editLight(fn){ const l=state.lightSel; if(!l||!M.props.includes(l)){ state.lightSel=null; return; }
  const own=!stroke; if(own) beginStroke(); touchLight(l); fn(l); touchLight(l); stroke.ents=true; flushEdit(); if(own) endStroke(); }
const PROP_CATS=[['all','Todo'],['build','Estructuras'],['nature','Naturaleza'],['furniture','Mobiliario'],['decor','Decorado'],['light','Luz'],['mine','Tuyos']];
function propCat(o){ if(!o) return 'all'; if(o.custom) return 'mine'; if(o.type==='tree') return 'nature'; if(o.type==='brazier'||(PROP3D[o.type]&&PROP3D[o.type].light)) return 'light';
  if(PROP3D[o.type]&&PROP3D[o.type].cat) return PROP3D[o.type].cat; if(['fence','stairs'].includes(o.type)) return 'nature'; return 'furniture'; }
function renderPalFilter(){ const el=$('palFilter'); el.hidden=state.tool!=='prop'; if(el.hidden) return; el.textContent='';
  for(const [k,n] of PROP_CATS){ const b=mkBtn(n,()=>{ state.propCat=k; renderPalette(); },{pressed:state.propCat===k}); b.classList.add('t3d-chipBtn'); el.appendChild(b); } }
// --- opciones de la herramienta Techos: forma, dirección de la cumbrera y el techo elegido ---
const roofSelected=()=>state.roofSel&&M&&M.roofs&&M.roofs.includes(state.roofSel)?state.roofSel:null;
function roofSwatch(k){ const m=ROOF_MATS[k], cu=CUSTOM.tiles[m.key]; return cu?cu.canvases[0]:thumbCanvas(atlas,(m.slot%AC)*16,((m.slot/AC)|0)*16,16,16); }
// silueta de cada forma en píxeles, con el color del material
function shapeThumb(k,mat){ const c=mkCanvas(16,12), x=c.getContext('2d'), col=(ROOF_MATS[mat]||ROOF_MATS.tile).mini, dk=shadeHex(col,-0.35), lt=shadeHex(col,0.25);
  const inRoof={gable:(i,j)=>j>=1+Math.abs(i-7.5)*0.9&&j<=8,hip:(i,j)=>j>=2&&j<=8&&j>=2+(Math.abs(i-7.5)-3.5)*1.2,flat:(i,j)=>(j>=4&&j<=8&&i>=2&&i<=13)||(j>=2&&j<4&&i>=2&&i<=13&&(i-2)%3<2),
    cone:(i,j)=>j<=8&&j>=Math.abs(i-7.5)*1.7-2,shed:(i,j)=>j<=8&&j>=1+(i-1)*0.45&&i>=1&&i<=14}[k];
  for(let j=0;j<12;j++) for(let i=0;i<16;i++){ let f=null;
    if(inRoof(i,j)) f=k==='flat'?(j<4||j===4?'#b3b4c4':'#8a8aa0'):(i<7.5?lt:col);
    else if(j>8&&i>=3&&i<=12) f=j===9?'#48303c':'#8a6564';
    if(f){ x.fillStyle=f; x.fillRect(i,j,1,1); } }
  return outline(c,INK); }
function roofDirText(r){ const sh=r.shape||'gable'; if(sh==='cone'||sh==='flat') return 'Sin dirección';
  if(!Number.isInteger(r.rot)&&r.w==null) return sh==='shed'?'Cae hacia el lado largo (automática)':'Cumbrera a lo largo del lado largo (automática)';
  const {along,flip}=roofAxis({w:r.w||2,d:r.d||1,rot:r.rot});
  if(sh==='shed') return 'Cae hacia el '+(along==='x'?(flip?'norte':'sur'):(flip?'oeste':'este'));
  return 'Cumbrera '+(along==='x'?'este–oeste':'norte–sur'); }
function editRoof(fn){ const r=roofSelected(); if(!r) return; const own=!stroke; if(own) beginStroke(); fn(r); stroke.changed=true; buildRoofs(); roofKey=null; if(own) endStroke(); }
function setRoof(ch){ Object.assign(state.roofDraft,ch); if(roofSelected()) editRoof(r=>Object.assign(r,ch)); renderPalette(); }
// R (Mayús+R al revés): gira la cumbrera del techo elegido o del próximo; a un agua, las cuatro caídas
function turnRoof(dir){ const sel=roofSelected(), R0=sel||state.roofDraft, sh=R0.shape||'gable';
  if(sh==='cone'||sh==='flat'){ showHint('Un techo '+ROOF_SHAPES[sh].toLowerCase()+' no tiene dirección.',1500); return; }
  const n=sh==='shed'?4:2, cur=Number.isInteger(R0.rot)?R0.rot%n:(sel?(sel.w>=sel.d?0:1):(dir>0?n-1:0)), nx=((cur+dir)%n+n)%n;
  state.roofDraft.rot=nx; if(sel) editRoof(r=>{ r.rot=nx; }); renderToolOpts(); showHint(roofDirText(sel||state.roofDraft)+'.',1200); }
function renderRoofOpts(el){
  const sel=roofSelected(), R0=sel||state.roofDraft;
  const h=document.createElement('h3'); h.className='popSub'; h.textContent=(sel?'Techo elegido ('+sel.w+'×'+sel.d+' en '+sel.x+', '+sel.z+')':'Techo nuevo: toca dos esquinas opuestas')+' · '+ROOF_MATS[R0.mat].name; el.appendChild(h);
  const row=document.createElement('div'); row.className='t3d-shapes';
  for(const k of ROOF_SHAPE_IDS){ const b=mkBtn('',()=>setRoof({shape:k}),{pressed:R0.shape===k,title:ROOF_SHAPES[k]}); b.classList.add('t3d-shape'); b.dataset.shape=k;
    b.appendChild(shapeThumb(k,R0.mat)); const sp=document.createElement('span'); sp.textContent=ROOF_SHAPES[k]; b.appendChild(sp); row.appendChild(b); }
  el.appendChild(row);
  const dr=document.createElement('div'); dr.className='row'; const dt=document.createElement('span'); dt.className='t3d-roofDir'; dt.dataset.k='rot'; dt.textContent=roofDirText(R0);
  const tb=mkBtn('Girar (R)',()=>turnRoof(1),{disabled:R0.shape==='cone'||R0.shape==='flat'}); dr.append(dt,tb); el.appendChild(dr);
  if(sel){ const r2=document.createElement('div'); r2.className='row'; r2.append(mkBtn('Soltar',()=>{ state.roofSel=null; renderToolOpts(); }),mkBtn('Quitar este techo',()=>{ const r=sel; beginStroke(); M.roofs=M.roofs.filter(q=>q!==r); state.roofSel=null; stroke.changed=true; buildRoofs(); endStroke(); renderPalette(); })); r2.lastChild.classList.add('danger'); el.appendChild(r2); }
  const p=document.createElement('p'); p.className='small muted';
  p.textContent='Toca dentro de un techo para elegirlo. Con esta herramienta los techos se ven; con las demás se ocultan y en juego se abren cuando alguien entra.';
  el.appendChild(p); }
function renderToolOpts(){
  const el=$('toolOpts'); el.textContent=''; el.hidden=!['light','roof','wall'].includes(state.tool); if(el.hidden) return;
  if(state.tool==='roof'){ renderRoofOpts(el); return; }
  if(state.tool==='wall'){ renderWallOpts(el); return; }
  const sel=state.lightSel&&M.props.includes(state.lightSel)?state.lightSel:null, L0=sel||state.lightDraft, T=LIGHT_TYPES[L0.preset];
  const h=document.createElement('h3'); h.className='popSub'; h.textContent=(sel?'Luz elegida (casilla '+sel.x+', '+sel.z+')':'Luz nueva: toca una casilla para colocarla')+' · '+(T?T.name:'a medida'); el.appendChild(h);
  const set=(k,v)=>{ state.lightDraft[k]=v; if(sel) editLight(l=>{ l[k]=v; }); };
  const range=(label,k,min,max,step,fmt)=>{ const row=document.createElement('label'); row.className='rangeRow'; const sp=document.createElement('span'); sp.textContent=label;
    const inp=document.createElement('input'); inp.type='range'; inp.min=min; inp.max=max; inp.step=step; inp.value=L0[k]; inp.dataset.k=k; const out=document.createElement('output'); out.textContent=fmt(+L0[k]);
    inp.oninput=()=>{ out.textContent=fmt(+inp.value); set(k,+inp.value); }; row.append(sp,inp,out); el.appendChild(row); };
  const tr=document.createElement('label'); tr.className='rangeRow'; const ts=document.createElement('span'); ts.textContent='Tipo';
  const tsel=document.createElement('select'); tsel.dataset.k='preset'; tsel.setAttribute('aria-label','Tipo de luz');
  for(const [v,n] of [...LIGHT_IDS.map(id=>[id,LIGHT_TYPES[id].name]),['custom','A medida']]){ const o=document.createElement('option'); o.value=v; o.textContent=n; tsel.appendChild(o); }
  tsel.value=T?L0.preset:'custom'; tsel.onchange=()=>{ if(LIGHT_TYPES[tsel.value]) setLightType(tsel.value); else set('preset','custom'); renderPalette(); };
  tr.append(ts,tsel); el.appendChild(tr);
  range('Radio','r',1,24,1,v=>v*5+' pies'); range('Altura','h',0,4,0.25,v=>Math.round(v*5*10)/10+' pies');
  if(!L0.darkness) range('Intensidad','intensity',0.1,1.2,0.05,v=>Math.round(v*100)+' %');
  if(L0.angle<360){ range('Dirección','rot',0,345,15,v=>v+'° · '+compass(v)); range('Apertura','angle',10,180,5,v=>v+'°'); }
  if(!L0.darkness){
    const cr=document.createElement('label'); cr.className='rangeRow'; const cs=document.createElement('span'); cs.textContent='Color';
    const ci=document.createElement('input'); ci.type='color'; ci.value=L0.color||WARM; ci.className='t3d-colorIn'; ci.onchange=()=>set('color',ci.value.toLowerCase()); cr.append(cs,ci); el.appendChild(cr);
    const ar=document.createElement('label'); ar.className='rangeRow'; const as=document.createElement('span'); as.textContent='Animación';
    const asel=document.createElement('select'); asel.dataset.k='anim'; asel.setAttribute('aria-label','Animación de la luz');
    for(const [v,n] of LIGHT_ANIMS){ const o=document.createElement('option'); o.value=v; o.textContent=n; asel.appendChild(o); }
    asel.value=L0.anim||'none'; asel.onchange=()=>set('anim',asel.value); ar.append(as,asel); el.appendChild(ar);
  }
  const fl=document.createElement('label'); fl.className='check'; const fi=document.createElement('input'); fi.type='checkbox'; fi.dataset.k='on'; fi.checked=L0.on!==false; fi.onchange=()=>set('on',fi.checked); fl.append(fi,document.createTextNode(' Encendida')); el.appendChild(fl);
  if(sel){ const row=document.createElement('div'); row.className='row'; row.append(mkBtn('Soltar',()=>{ state.lightSel=null; renderToolOpts(); }),mkBtn('Quitar esta luz',()=>{ const l=sel; beginStroke(); touchLight(l); M.props=M.props.filter(q=>q!==l); stroke.ents=true; flushEdit(); endStroke(); state.lightSel=null; renderToolOpts(); })); row.lastChild.classList.add('danger'); el.appendChild(row); }
  const p=document.createElement('p'); p.className='small muted';
  p.textContent=L0.darkness?'La oscuridad mágica apaga toda luz a su alcance: dentro no se ve nada, ni con visión en la oscuridad.'
    :L0.angle<360?'Luz dirigida: R la gira 45° (Mayús+R al revés); el cono se ve mientras editas luces.'
    :'La altura es la de la llama sobre el suelo: una luz alta pasa por encima de los muros bajos y proyecta sombras más cortas.';
  el.appendChild(p);
}

/* ---- herramienta Muros (T6b, tecla M): los tipos de muro de JA-VTT por casilla, con sus nombres, iconos y colores ---- */
const wallSelected=()=>state.wallSel&&M&&M.props.includes(state.wallSel)?state.wallSel:null;
const isWallAt=(x,z)=>inb(x,z)&&(M.t[idx(x,z)]==='w'||M.props.some(p=>p.x===x&&p.z===z&&Muros.kindOf(p)));
// a lo largo del muro que tenga a los lados: este–oeste (0) o norte–sur (1)
function autoV(x,z){ if(isWallAt(x-1,z)||isWallAt(x+1,z)) return 0; if(isWallAt(x,z-1)||isWallAt(x,z+1)) return 1; return 0; }
function placeWall(x,z,k){
  const here=M.props.find(p=>p.x===x&&p.z===z&&Muros.kindOf(p));
  if(here){ state.wallSel=here; renderToolOpts(); showHint('Elegido: '+Muros.WALL_TYPES[Muros.kindOf(here)].name.toLowerCase()+'. Cámbialo en el panel; R lo gira.',1800); return; }
  const i=idx(x,z);
  // sobre un muro abre un hueco: la casilla toma el suelo de al lado
  if(M.t[i]==='w'){ let tt='s'; for(const [dx,dz] of DIR4){ const X=x+dx, Z=z+dz; if(inb(X,Z)&&M.t[idx(X,Z)]!=='w'){ tt=M.t[idx(X,Z)]; break; } } setTerrain(x,z,tt); }
  if(isDeep(i)||occupied(x,z)){ showHint('Esa casilla está ocupada o no admite objetos.',1600); return; }
  const p={type:k,x,z,v:k==='cover'?0:autoV(x,z),uid:Catalogo.newUid()};
  if(k==='door') p.open=false;
  if(k==='portal') Object.assign(p,{id:Muros.nextPortalId(M.props),look:state.portalLook,target:null});
  M.props.push(p); state.wallSel=p; stroke.ents=true; touch(x,z); touchLight({x,z,r:8}); renderToolOpts();
  if(k==='portal') showHint('Portal colocado: elige en el panel a qué escena lleva.',2400);
}
function editWall(fn){ const p=wallSelected(); if(!p) return; const own=!stroke; if(own) beginStroke(); fn(p); stroke.ents=true; stroke.changed=true; touchLight({x:p.x,z:p.z,r:8}); flushEdit(); if(own) endStroke(); renderToolOpts(); }
function turnWall(dir){ if(!wallSelected()){ showHint('Toca primero algo colocado con esta herramienta para elegirlo.',1500); return; } editWall(q=>{ q.v=(((q.v|0)+dir)%4+4)%4; }); }
// qué hace cada tipo en el tablero 3D (las reglas de JA-VTT, por casilla)
const WALL_NOTES={wall:'Pinta casillas de muro (como el terreno Muro). Arrastra para pintar varias.',
  door:'Sobre un muro abre el hueco. Cerrada tapa vista, luz y paso; el jugador la abre si no tiene llave y el tablero lo deja (pestaña Mesa).',
  window:'Tramo de muro con cristal: se ve y pasa la luz, no se cruza.',
  veil:'Cortina, follaje o humo: tapa la vista y la luz hasta la altura de una persona; se cruza.',
  cover:'Hierba alta: el suelo y la luz se ven, pero quien está detrás no (sí quien está dentro); se cruza.',
  barrier:'Invisible para los jugadores (tú ves su contorno a trazos): sólo frena el paso.',
  portal:'Lleva a otra escena del tablero. Una ficha junto a él cruza; llegan a su lado del portal de destino.'};
function renderWallOpts(el){
  const sel=wallSelected(), k=sel?Muros.kindOf(sel):state.wallKind, T=Muros.WALL_TYPES[k];
  const h=document.createElement('h3'); h.className='popSub';
  h.textContent=sel?'Elegido: '+T.name.toLowerCase()+' (casilla '+sel.x+', '+sel.z+')':T.name+(k==='wall'?': pinta casillas':': toca una casilla para colocarlo'); el.appendChild(h);
  const d=document.createElement('p'); d.className='small muted'; d.textContent=WALL_NOTES[k]; el.appendChild(d);
  if(k==='portal') renderPortalOpts(el,sel);
  if(k==='door'&&sel){
    const lk=document.createElement('label'); lk.className='check'; const li=document.createElement('input'); li.type='checkbox'; li.dataset.k='locked'; li.checked=!!sel.locked;
    li.onchange=()=>lockDoor(sel,li.checked); lk.append(li,document.createTextNode(' Cerrada con llave (el jugador no la abre)')); el.appendChild(lk);
    el.appendChild(mkBtn(sel.open?'Cerrar la puerta':'Abrir la puerta',()=>{ toggleDoor(sel); renderToolOpts(); })); }
  if(sel){ const row=document.createElement('div'); row.className='row';
    row.append(mkBtn('Girar (R)',()=>turnWall(1),{disabled:k==='cover'}),mkBtn('Soltar',()=>{ state.wallSel=null; renderToolOpts(); }),
      mkBtn('Quitar',()=>{ const q=sel; beginStroke(); M.props=M.props.filter(x=>x!==q); stroke.ents=true; touch(q.x,q.z); touchLight({x:q.x,z:q.z,r:8}); flushEdit(); endStroke(); state.wallSel=null; renderToolOpts(); }));
    row.lastChild.classList.add('danger'); el.appendChild(row); }
}
/* ---- portales (T6b): como los de JA-VTT, unen cualquier escena 3D del tablero (en una campaña, sus escenas) ---- */
const portalAt=(x,z)=>M.props.find(p=>FT(p)==='portal'&&p.x===x&&p.z===z)||null;
const portalLabel=p=>p.name||(Muros.PORTAL_LOOKS[p.look]||Muros.PORTAL_LOOKS.door).name;
const newSceneId=()=>'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const hereId=()=>CAMP?CAMP.cur:M.boardId;
// escenas guardadas del tablero (id → nombre y datos), para elegir destino y nombrar a dónde lleva un portal
let SCN=new Map(), scnLoading=null;
function refreshScenes(){ if(!scnLoading) scnLoading=storeList().then(items=>{ SCN=new Map(items.map(it=>[it.id,{name:it.name||'Escena',data:it}])); },()=>{}).then(()=>{ scnLoading=null; return SCN; }); return scnLoading; }
function sceneChoices(){ if(CAMP) return Object.entries(CAMP.boards).filter(([id])=>id!==CAMP.cur).map(([id,b])=>[id,b.name]);
  return [...SCN].filter(([id])=>id!==M.boardId).map(([id,v])=>[id,v.name]); }
function portalsOf(sid){ const data=CAMP&&CAMP.boards[sid]?CAMP.boards[sid].data:SCN.get(sid)&&SCN.get(sid).data; if(!data||!Array.isArray(data.props)) return [];
  return Muros.fixPortalIds(data.props.map(x=>Muros.normProp(x)||x)).filter(x=>FT(x)==='portal'); }
function portalDest(p){ const t=p&&p.target; if(!t) return null;
  if(CAMP&&CAMP.boards[t.scene]) return {camp:true,name:CAMP.boards[t.scene].name};
  const sc=SCN.get(t.scene); return {name:sc?'«'+sc.name+'»':'otra escena'}; }
function renderPortalOpts(el,sel){
  const P0=sel||{look:state.portalLook};
  const row=document.createElement('div'); row.className='t3d-shapes';
  for(const [id,L] of Object.entries(Muros.PORTAL_LOOKS)){ const b=mkBtn('',()=>{ state.portalLook=id; if(sel) editWall(q=>{ q.look=id; }); else renderToolOpts(); },{pressed:P0.look===id,title:L.name});
    b.classList.add('t3d-shape'); b.dataset.look=id; b.appendChild(stackThumb(propSlices(L.prop))); const sp=document.createElement('span'); sp.textContent=L.name; b.appendChild(sp); row.appendChild(b); }
  el.appendChild(row);
  if(!sel) return;
  const field=(label,inp)=>{ const r=document.createElement('label'); r.className='rangeRow'; const sp=document.createElement('span'); sp.textContent=label; r.append(sp,inp); el.appendChild(r); return inp; };
  const nm=document.createElement('input'); nm.maxLength=40; nm.value=sel.name||''; nm.dataset.k='portalName'; nm.placeholder=portalLabel({look:sel.look});
  nm.onchange=()=>editWall(q=>{ const v=nm.value.trim().slice(0,40); if(v) q.name=v; else delete q.name; }); field('Nombre',nm);
  const sc=document.createElement('select'); sc.dataset.k='portalScene'; sc.setAttribute('aria-label','Escena a la que lleva');
  const choices=sceneChoices(), opt=(v,t)=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; return o; };
  sc.appendChild(opt('','Sin destino')); for(const [id,n] of choices) sc.appendChild(opt(id,n));
  if(sel.target&&!choices.some(([id])=>id===sel.target.scene)) sc.appendChild(opt(sel.target.scene,'Escena '+sel.target.scene));
  sc.value=sel.target?sel.target.scene:''; sc.onchange=()=>editWall(q=>{ q.target=sc.value?{scene:sc.value,portal:null}:null; }); field('Lleva a',sc);
  if(!choices.length&&!CAMP){ const n=document.createElement('p'); n.className='small muted'; n.textContent=SCN.size?'Guarda otra escena en el tablero para poder enlazarla.':'Cargando las escenas del tablero…'; el.appendChild(n);
    if(!SCN.size) refreshScenes().then(()=>{ if(state.tool==='wall'&&wallSelected()===sel&&SCN.size) renderToolOpts(); }); }
  if(sel.target){ const pt=document.createElement('select'); pt.dataset.k='portalTo'; pt.setAttribute('aria-label','Portal de llegada');
    pt.appendChild(opt('','Junto a su punto de entrada')); for(const q of portalsOf(sel.target.scene)) pt.appendChild(opt(String(q.id),portalLabel(q)+' ('+q.x+', '+q.z+')'));
    pt.value=sel.target.portal?String(sel.target.portal):''; pt.onchange=()=>editWall(q=>{ q.target={scene:q.target.scene,portal:pt.value?+pt.value:null}; }); field('Llega por',pt);
    el.appendChild(mkBtn('Enlazar también la vuelta',()=>backlink(sel),{disabled:!sel.target.portal,title:'El portal de llegada lleva de vuelta a éste'})); }
}
// el portal de llegada lleva de vuelta a éste (como el backlink de JA-VTT); la escena de destino se guarda
async function backlink(p){ const t=p.target, here=hereId(); if(!t||!t.portal) return;
  if(!here){ showHint('Guarda esta escena en el tablero para enlazar la vuelta.',2200); return; }
  if(CAMP&&CAMP.boards[t.scene]){ const data=CAMP.boards[t.scene].data; data.props=Muros.fixPortalIds(data.props.map(x=>Muros.normProp(x)||x));
    const q=data.props.find(x=>FT(x)==='portal'&&x.id===t.portal); if(q){ q.target={scene:here,portal:p.id}; showHint('Vuelta enlazada. Guarda la campaña.',1800); } return; }
  await refreshScenes(); const sc=SCN.get(t.scene); if(!sc) return; const data=JSON.parse(JSON.stringify(sc.data));
  data.props=Muros.fixPortalIds((data.props||[]).map(x=>Muros.normProp(x)||x)); const q=data.props.find(x=>FT(x)==='portal'&&x.id===t.portal); if(!q) return;
  q.target={scene:here,portal:p.id};
  try{ await storeSave(t.scene,data); await refreshScenes(); showHint('Vuelta enlazada: «'+portalLabel(q)+'» de «'+sc.name+'» lleva aquí.',2400); }catch(e){ showHint('No se pudo enlazar la vuelta.',2000); }
}
// menú contextual de la casilla de un portal
function portalMenu(p,add){
  const d=portalDest(p), sm=document.createElement('small'); sm.textContent='Portal «'+portalLabel(p)+'»'+(d?' hacia '+d.name:': todavía no lleva a ninguna parte'); ctxEl.appendChild(sm);
  if(!d){ if(gmView()) add('Elegir a dónde lleva',()=>{ $('rail').querySelector('[data-tool="wall"]').click(); state.wallSel=p; renderToolOpts(); }); return; }
  const b=selected&&selected.mini&&canControl(selected)?selected:null;
  if(b) add('Cruzar con '+miniName(b),()=>crossPortal(p,[b]),{disabled:!gmView()&&!Muros.near(b.x,b.z,nOf(b),p)});
  if(gmView()){ add('Cruzar con todo el grupo',()=>crossPortal(p,null)); if(!b) add('Ir sin fichas',()=>crossPortal(p,[])); }
}
// tocar un portal: se ofrece cruzar (el jugador, con su ficha y junto a él)
function portalClick(p){ const d=portalDest(p);
  if(!d){ showHint(gmView()?'Este portal aún no lleva a ninguna parte: elígelo con la herramienta Muros (M).':'Este portal todavía no lleva a ninguna parte.',2200); return; }
  const b=selected&&selected.mini&&canControl(selected)?selected:null;
  if(!gmView()&&(!b||!Muros.near(b.x,b.z,nOf(b),p))){ showHint('Acércate al portal con tu personaje para cruzarlo.',2000); return; }
  travelDialog(p,b); }
function travelDialog(p,b,ask){ const d=portalDest(p); if(!d) return;
  $('travelTxt').textContent=ask||(b?miniName(b)+' está junto al portal «'+portalLabel(p)+'», que lleva a '+d.name+'.':'El portal «'+portalLabel(p)+'» lleva a '+d.name+'.');
  $('travelGo').textContent=b?'Cruzar con '+miniName(b):'Ir sin fichas'; $('travel').hidden=false;
  $('travelGo').onclick=()=>{ $('travel').hidden=true; crossPortal(p,b?[b]:[]); };
  $('travelAll').onclick=()=>{ $('travel').hidden=true; crossPortal(p,null); };
  $('travelNo').onclick=()=>{ $('travel').hidden=true; }; }
/* Cruzar: en una campaña, en el cliente (como los pasos de antes); en la mesa en vivo, el servidor mueve las fichas y la mesa
   (o avisa al director si cruza un jugador); fuera de ella, el director manda su escena y el servidor guarda las dos.
   list: fichas que cruzan ([] = nadie: sólo la vista), null = todo el grupo. */
async function crossPortal(p,list){
  const d=portalDest(p); if(!d){ showHint('Este portal todavía no lleva a ninguna parte.',1800); return; }
  syncMinis(); const ids=list?list.map(b=>b.id):null;
  if(d.camp){ const tr=M.minis.filter(q=>ids?ids.includes(q.id):q.sheet&&q.sheet.kind==='player'); campGo(p.target.scene,{portal:p.target.portal,minis:tr}); return; }
  if(!BOARD){ showHint('Cruzar portales necesita el tablero en el servidor.',2000); return; }
  if(LIVE.on){
    try{ const r=await BOARD.travel({portal:p.id,tokens:ids||[],all:!list});
      if(r&&r.asked) showHint('Pediste cruzar a '+d.name+'. El director decide cuándo viaja la mesa.',3200);
      else if(r&&r.left&&r.left.length) showHint(r.left.length+' ficha(s) no cupieron junto al portal de llegada y se quedaron.',2600); }
    catch(e){ showHint(e&&e.message?e.message:'No se pudo cruzar.',2600); }
    return; }
  if(!gmView()){ showHint('Fuera de la mesa en vivo sólo el director cruza portales.',2000); return; }
  if(!M.boardId) M.boardId=newSceneId();
  if(!piecesGate()) return;
  try{ const r=await BOARD.travelSaved({from:M.boardId,map:serialize(),portal:p.id,tokens:ids||[],all:!list}); await arriveScene(r,ids); }
  catch(e){ showHint(e&&e.message?e.message:'No se pudo cruzar.',2600); }
}
async function arriveScene(r,ids){ await PIECES_READY; const m=deserialize(r.scene); m.boardId=r.scene.id; loadMap(m); clearMapButtons(); if(state.mode==='edit') refreshEntities();
  const s2=ids&&ids.length?bills.find(b=>b.id===ids[0]):bills.find(b=>r.moved.includes(b.id)); if(s2){ selected=s2; focusSelected(); }
  refreshScenes(); showHint('Ahora en «'+m.name+'»'+(r.left&&r.left.length?'; '+r.left.length+' ficha(s) no cupieron y se quedaron':'')+'.',2200); }
// «Reunir al grupo» (gather de JA-VTT): todas las fichas del grupo (bando Jugador) van a esa escena, junto a su punto de entrada
async function gatherTo(id){
  if(!BOARD||!gmView()) return; syncMinis();
  try{ if(LIVE.on){ await BOARD.gather({scene:id}); showHint('El grupo se reúne en la escena elegida.',1800); return; }
    if(!M.boardId) M.boardId=newSceneId(); if(!piecesGate()) return;
    await arriveScene(await BOARD.travelSaved({from:M.boardId,map:serialize(),to:id,all:true}),null); }
  catch(e){ showHint(e&&e.message?e.message:'No se pudo reunir al grupo.',2600); }
}
// ajustes de escena de JA-VTT: animate (Iluminación) y grid (Cuadrícula); viajan con la escena
$('animToggle').onchange=()=>{ M.animate=$('animToggle').checked; liveBoardSoon(); };
$('gridToggle').onchange=()=>{ M.grid=$('gridToggle').checked; gridDirty=true; liveBoardSoon(); };
// ajustes del tablero (pestaña Mesa: «Reglas para jugadores» y «Chat, dados y fichas», con los textos de JA-VTT)
const BOARD_TOGGLES=['sharedVision','playersDoors','initiativeShown','chatEnabled','diceEnabled','hpEnabled','conditionsEnabled','acEnabled'];
function applySettings(st){ if(!st) return; SETTINGS=Ajustes.norm(st,SETTINGS);
  for(const k of BOARD_TOGGLES){ const cb=$(k); if(cb) cb.checked=!!SETTINGS[k]; }
  const hv=$('hpVisibility'); if(hv){ hv.value=SETTINGS.hpVisibility; hv.disabled=!SETTINGS.hpEnabled; }
  rangeKey=''; fogDirty=true; if(state.gameOpen) renderGame(); }
function setSetting(patch){ if(!BOARD){ applySettings(Object.assign({},SETTINGS,patch)); return; }
  BOARD.setSettings(patch).then(applySettings).catch(e=>{ applySettings(SETTINGS); showHint(e&&e.message?e.message:'No se pudo cambiar el ajuste.',2000); }); }
for(const k of BOARD_TOGGLES) $(k).onchange=()=>setSetting({[k]:$(k).checked});
$('hpVisibility').onchange=()=>setSetting({hpVisibility:$('hpVisibility').value});

/* ---- tableros: nuevo, guardar, abrir, exportar, importar ---- */
// escena vacía (escena.js); la semilla al azar la pone el motor
function blankMap(n,terr,env){ return Escena.blankMap(n,terr,env,(Math.random()*1e9)|0); }
const NEW_SIZES=[8,16,32,64,128];
$('newSize').onclick=()=>{ state.newSize=NEW_SIZES[(NEW_SIZES.indexOf(state.newSize)+1)%NEW_SIZES.length]; $('newSize').textContent='Nuevo '+state.newSize+'×'+state.newSize; };
function clearMapButtons(){ $('sheet').querySelectorAll('[data-map]').forEach(b=>b.setAttribute('aria-pressed','false')); }
$('create').onclick=()=>{ $('sheet').hidden=true; const m=blankMap(state.newSize,$('newTerr').value,$('newEnv').value); if($('newName').value.trim()) m.name=$('newName').value.trim().slice(0,40);
  loadMap(m); clearMapButtons(); if(state.mode==='edit') refreshEntities();
  showHint('«'+m.name+'» lista para crear. Guárdala con Ctrl+S.',2400); };
// al entrar: la última escena guardada del tablero; si no hay ninguna, una vacía (nunca una plantilla)
async function openLatestScene(){
  if(!M||!M.initial||undoStack.length) return;
  let items=[]; try{ items=await storeList(); }catch(e){ return; }
  SCN=new Map(items.map(it=>[it.id,{name:it.name||'Escena',data:it}]));
  if(!items.length||!M.initial||undoStack.length) return;
  const it=items.slice().sort((a,b)=>(b.updated||0)-(a.updated||0))[0];
  try{ const m=deserialize(it); m.boardId=it.id; loadMap(m); clearMapButtons(); if(state.mode==='edit') refreshEntities(); showHint('Abierta la última escena: «'+m.name+'».',2000); }catch(e){}
}
// leer y guardar escenas (escena.js); aquí sólo el estado del motor que necesitan y la semilla al azar
const escenaDeps=()=>({pieces:PIECES,opaque,ft:FT,terr:TERR,miniKinds:MINI_KINDS,normSheet});
function serialize(){ syncMinis(); return Escena.write(M,{...escenaDeps(),env:ENV,fog:!!state.fog}); }
function deserialize(o){ return {...Escena.read(o,escenaDeps()),seed:(Math.random()*1e9)|0}; }
let DB=null, DL=null, BOARD=null;
(async()=>{
  const c=ctx.mesa;
  if(c&&typeof c.use==='function'){
    try{ DB=await c.use('db'); }catch(e){ DB=null; }
    try{ DL=await c.use('downloads'); }catch(e){ DL=null; }
    try{ BOARD=await c.use('board'); }catch(e){ BOARD=null; }
    if(BOARD){ BOARD.onSettings(applySettings); BOARD.settings().then(applySettings,()=>{}); }
    setTimeout(()=>{ PIECES_READY.then(()=>liveInit(c)); },0);   // la mesa en vivo, tras el primer intento de cargar las piezas (M4)
  }
  $('export').hidden=!DL; $('artExp').hidden=!DL; layout();
  setTimeout(loadAllAssets,0); setTimeout(loadPieces,0); PIECES_READY.then(openLatestScene);   // la escena, tras el primer intento de cargar sus piezas (M4)
})();
// definiciones de piezas del tablero (p:…); vacías hasta la fase 1. Se cargan antes que las escenas para poder leerlas
// Si falla, se reintenta con espera creciente (1 s, 2 s… hasta 30 s) y se avisa una vez; sin DB (local) no hay nada que cargar.
// M4 (ola final): abrir no espera a que carguen: tras el primer intento (bien o mal) PIECES_READY se cumple y la escena y la mesa
// se abren (las p: quedan opacas); sólo guardar espera a PIECES_OK (piecesGate). M5: al cargar, lo que hace el motor tras editar.
async function loadPieces(){ let wait=1000, warned=false;
  for(;;){
    try{ if(DB){ const q=await DB.collection('pieces').get();
        // abrir no guarda: la escena abierta sin definiciones (M4) no cambió si su clave sigue siendo la de la línea base; con
        // las definiciones la clave cambia (Catalogo.complete), así que se rehace la base en vez de guardar sin motivo (P-48)
        let untouched=false; try{ untouched=!!M&&AUTO.last!==null&&autoKey()===AUTO.last; }catch(e){ untouched=false; }
        PIECES=new Map(q.docs.map(d=>{ const x=d.data(); return [x.id,x]; })); if(untouched) autoBaseline(); }
      PIECES_OK=true; piecesDone(); if(M&&PIECES.size){ refreshEntities(); rebuildRegion(0,0,M.w-1,M.d-1); lightDirty=true; fogDirty=true; } return; }
    catch(e){ if(stopped) return; piecesDone(); if(!warned){ warned=true; showHint('No se pudieron cargar las piezas del tablero; se reintenta. Mientras tanto no se guarda nada.',4000); }
      await new Promise(r=>setTimeout(r,wait)); wait=Math.min(wait*2,30000); if(stopped) return; } } }
const LS='tablero:boards';
function lsAll(){ try{ return JSON.parse(localStorage.getItem(LS)||'{}')||{}; }catch(e){ return {}; } }
function lsPut(all){ try{ localStorage.setItem(LS,JSON.stringify(all)); return true; }catch(e){ return false; } }
async function storeList(){
  if(DB){ try{ const q=await DB.collection('boards').orderBy('updated','desc').limit(40).get(); return q.docs.map(d=>({id:d.id,...d.data()})); }catch(e){} }
  return Object.entries(lsAll()).map(([id,o])=>({id,...o})).sort((a,b)=>(b.updated||0)-(a.updated||0));
}
async function storeSave(id,obj){
  if(DB){ try{ await DB.collection('boards').doc(id).set(obj); return 'db'; }catch(e){ if(e&&(e.code==='quota_exceeded'||e.code==='invalid_argument')) throw e; } }
  const all=lsAll(); all[id]=obj; if(!lsPut(all)) throw {code:'local'}; return 'local';
}
async function storeDelete(id){
  if(DB){ try{ await DB.collection('boards').doc(id).delete(); }catch(e){} }
  const all=lsAll(); if(all[id]){ delete all[id]; lsPut(all); }
}
const saveErr=e=>e&&e.code==='quota_exceeded'?'Se llenó el almacén del tablero. Borra alguna escena desde el menú de escenas.':e&&e.message?'No se pudo guardar: '+e.message:'No se pudo guardar: el almacenamiento no está disponible aquí.';
/* «Guardar como nueva»: una copia aparte de la escena abierta, que pasa a ser la que se edita (y se guarda sola) */
$('save').onclick=async()=>{
  if(!piecesGate()) return;
  if(CAMP){ autoSave(true); return; }
  M.boardId=newSceneId(); AUTO.last=null;
  await autoSave(true);
  if(!AUTO.err) showHint('«'+M.name+'» guardada como escena nueva.');
};
/* ---- guardado automático, como el 2D: cada AUTO_MS se compara la escena (o la campaña abierta) con lo último guardado
   y, si cambió, se guarda sola. Sólo el director (fuera de la mesa en vivo, o siendo su DM); abrir una escena no la guarda. ---- */
const AUTO_MS=2000, AUTO={last:null,busy:false,at:0,err:null,failed:null};
const autoKey=()=>{ const s=JSON.stringify(serialize()); return CAMP?s+'|'+CAMP.id+'|'+CAMP.cur+'|'+JSON.stringify(CAMP.notes)+'|'+CAMP.name:s; };
const canAutoSave=()=>PIECES_OK&&!!M&&gmView()&&!ROOT.classList.contains('t3d-player');
function autoBaseline(){ try{ AUTO.last=autoKey(); }catch(e){ AUTO.last=null; } AUTO.err=null; AUTO.failed=null; renderAutoState(); }
function renderAutoState(){ const el=$('autosave'); if(!el) return;
  el.textContent=AUTO.busy?'Guardando…':AUTO.err?AUTO.err:AUTO.at?'Guardado en el tablero a las '+new Date(AUTO.at).toLocaleTimeString('es')+'.':''; }
async function autoSave(now){
  if(AUTO.busy||!canAutoSave()) return;
  let key; try{ key=autoKey(); }catch(e){ return; }
  if(AUTO.last===null&&!now){ AUTO.last=key; return; }   // primera mirada tras abrir: es lo que ya había
  if(key===AUTO.last||(key===AUTO.failed&&!now)) return;
  AUTO.busy=true; renderAutoState();
  try{
    if(CAMP){ campStore(); CAMP.updated=Date.now(); const rec=JSON.parse(JSON.stringify(CAMP));
      if(DB) await DB.collection('campaigns').doc(CAMP.id).set(rec); else { const all=lsGet(LSC); all[CAMP.id]=rec; if(!lsSet(LSC,all)) throw {code:'local'}; } }
    else { const obj=serialize(); obj.updated=Date.now(); if(!M.boardId) M.boardId=newSceneId(); await storeSave(M.boardId,obj); refreshScenes(); }
    AUTO.last=key; AUTO.at=Date.now(); AUTO.err=null; AUTO.failed=null;
  }catch(e){ AUTO.failed=key; AUTO.err=saveErr(e); showHint(AUTO.err,3500); }
  finally{ AUTO.busy=false; renderAutoState(); }
}
every(()=>{ autoSave(false); },AUTO_MS);
async function renderList(){
  const el=$('list'); el.textContent='Cargando…';
  const items=await storeList(); el.textContent=''; SCN=new Map(items.map(it=>[it.id,{name:it.name||'Escena',data:it}]));
  if(!items.length){ const p=document.createElement('p'); p.className='empty'; p.textContent='Este tablero aún no tiene escenas guardadas. Usa «Guardar en el tablero» en la pestaña Escena.'; el.appendChild(p); return; }
  for(const it of items){
    const row=document.createElement('div'); row.className='item';
    const o=document.createElement('button'); o.className='t3d-open';
    const nm=document.createElement('span'); nm.textContent=it.name||'Tablero'; o.appendChild(nm);
    const sm=document.createElement('small'); sm.textContent=(it.w||'?')+'×'+(it.d||'?')+(it.updated?', '+new Date(it.updated).toLocaleString('es'):''); o.appendChild(sm);
    o.onclick=async()=>{ await PIECES_READY; try{ const m=deserialize(it); m.boardId=it.id; loadMap(m); clearMapButtons(); if(state.mode==='edit') refreshEntities(); $('sheet').hidden=true; showHint('"'+m.name+'" abierto.'); }catch(e){ showHint('Ese tablero está dañado y no se puede abrir.'); } };
    const del=document.createElement('button'); del.textContent='Borrar';
    del.onclick=async()=>{ if(del.dataset.armed!=='1'){ del.dataset.armed='1'; del.textContent='¿Seguro?'; return; } await storeDelete(it.id); if(M.boardId===it.id) M.boardId=null; renderList(); };
    row.append(o,del);
    if(gmView()&&BOARD){ const g=document.createElement('button'); g.textContent='Reunir al grupo'; g.title='Todas las fichas del grupo van a esta escena'; g.dataset.gather=it.id; g.onclick=()=>{ $('sheet').hidden=true; gatherTo(it.id); }; row.insertBefore(g,del); }
    el.appendChild(row);
  }
}
$('open').onclick=()=>{ const show=$('sheet').hidden; $('sheet').hidden=!show; if(show) renderList(); };
$('closeSheet').onclick=()=>{ $('sheet').hidden=true; };
$('export').onclick=async()=>{
  if(!DL) return;
  const obj=serialize(), fname=(M.name||'tablero').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g,'').trim().replace(/\s+/g,'-')||'tablero';
  try{ await DL.save({filename:fname+'.json',data:JSON.stringify(obj)}); showHint('Tablero exportado.'); }
  catch(e){ if(e&&e.code==='declined') return; if(e&&(e.code==='unavailable'||e.code==='not_granted')){ $('export').hidden=true; layout(); } showHint('No se pudo exportar el tablero.'); }
};
$('import').onclick=()=>$('file').click();
$('file').onchange=()=>{
  const f=$('file').files&&$('file').files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=async()=>{ await PIECES_READY; try{ const m=deserialize(JSON.parse(rd.result)); loadMap(m); clearMapButtons(); if(state.mode==='edit') refreshEntities(); showHint('"'+m.name+'" importado.'); }
    catch(e){ showHint('Ese archivo no es una escena válida.'); } $('file').value=''; };
  rd.readAsText(f);
};


/* ============ editor de pixel art ============ */
const artEl=$('art'), acv=$('artCv'), actx=acv.getContext('2d'), apv=$('artPrev'), apx=apv.getContext('2d');
const ART={open:false,doc:null,tool:'pencil',prevTool:'pencil',size:1,mirX:false,mirY:false,pp:true,grid:true,onion:true,shade:-1,fillAll:false,shapeFill:false,
  tiled:false,prim:[34,28,54,255],sec:[0,0,0,0],zoom:8,px:0,py:0,frame:0,layer:0,sel:null,flt:null,undo:[],redo:[],clip:null,dirty:false,angle:0.6,spin:true,
  cache:new Map(),custom:[],delCol:false,thumbs:[],space:false,round:true,play:true,fps:4,recent:[]};
let PAL_RAMPS=[G,D,S,B,W,SA,WA,SL,TH,SH,CU,...EXTRA_RAMPS,...HANDART.RAMPS,FL];
const BOARD_RAMPS=PAL_RAMPS;
// paletas conocidas, ordenadas de oscuro a claro para que el sombreado avance por luminosidad
const lum=h=>{ const [r,g,b]=hexRGB(h); return 0.299*r+0.587*g+0.114*b; };
const byLum=a=>a.slice().sort((p,q)=>lum(p)-lum(q));
const PRESETS={
  board:BOARD_RAMPS,
  sweetie:[byLum(['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'])],
  pico:[byLum(['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'])],
  gb:[['#0f380f','#306230','#8bac0f','#9bbc0f']],
  endesga:[['#3e2731','#733e39','#a22633','#e43b44','#f77622','#feae34','#fee761'],['#193c3e','#265c42','#3e8948','#63c74d'],['#181425','#262b44','#3a4466','#5a6988','#8b9bb4','#c0cbdc','#ffffff'],
    ['#124e89','#0099db','#2ce8f5'],['#68386c','#b55088','#f6757a','#e8b796','#ead4aa'],['#c28569','#be4a2f','#d77643','#e4a672','#b86f50'],['#ff0044','#3a4466']]
};
try{ ART.custom=(JSON.parse(localStorage.getItem('tablero:colors')||'[]')||[]).filter(h=>/^#[0-9a-f]{6}$/i.test(h)).slice(0,40); }catch(e){ ART.custom=[]; }
const saveCustomCols=()=>{ try{ localStorage.setItem('tablero:colors',JSON.stringify(ART.custom)); }catch(e){} };
const toHex=c=>'#'+[c[0],c[1],c[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
const fromHex=h=>[...hexRGB(h),255];
let SHADE=new Map();
function buildShade(){ SHADE=new Map(); [...PAL_RAMPS,ART.custom].forEach((rp,ri)=>rp.forEach((h,i)=>{ const k=hexRGB(h).join(','); if(!SHADE.has(k)) SHADE.set(k,[ri,i]); })); }
buildShade();

/* ---- documento ---- */
const TILE_TARGETS=[['g:top','Pasto, superficie'],['g:side','Pasto, lateral'],['a:top','Arena, superficie'],['a:side','Arena, lateral'],['p:top','Camino, superficie'],['p:side','Camino, lateral'],
  ['s:top','Piedra, superficie'],['s:side','Piedra, lateral'],['o:top','Madera, superficie'],['o:side','Madera, lateral'],['c:top','Adoquín, superficie'],['c:side','Adoquín, lateral'],
  ['n:top','Nieve, superficie'],['n:side','Nieve, lateral'],['w:top','Muro, cima'],['w:side','Muro, lateral'],['l:top','Lava (4 cuadros)'],
  ...ROOF_MAT_IDS.map(k=>[ROOF_MATS[k].key,'Tejado de '+ROOF_MATS[k].name.toLowerCase()]),
  ['water:top','Agua (4 cuadros)'],['water:fall','Cascada']];
const CHAR_TARGETS=CHARS.map(([k,n])=>[k,n]);
const OBJ_TARGETS=[['tree0','Árbol'],['tree1','Árbol frondoso'],['tree2','Pino'],['brazier','Brasero'],...Object.keys(PROP3D).map(k=>[k,PROP3D[k].name])];
function artTargets(kind){
  if(kind==='tile') return TILE_TARGETS;
  if(kind==='char') return [['new','Personaje nuevo'],...CHAR_TARGETS.map(([k,n])=>[k,'Reemplazar '+n.toLowerCase()])];
  return [['new','Objeto nuevo'],...OBJ_TARGETS.map(([k,n])=>[k,'Reemplazar '+n.toLowerCase()])];
}
const targetName=(kind,t)=>{ const e=artTargets(kind).find(x=>x[0]===t); return e?e[1]:t; };
function emptyCel(d){ return new Uint8ClampedArray(d.w*d.h*4); }
function newDoc(kind,target,res,fp,ht,size){
  let w,h,count,names=null;
  if(kind==='tile'){ w=h=res; count=(target==='water:top'||target==='l:top')?4:1; names=count===4?['Cuadro 1','Cuadro 2','Cuadro 3','Cuadro 4']:['Casilla']; }
  else if(kind==='char'){ size=Fichas.SIZE_IDS.includes(size)?size:'medium'; [w,h]=Fichas.artDims(size,res); count=3; names=['Frente','Espalda','Perfil']; }
  else { w=h=Math.round(res*fp); count=Math.round(res*ht); }
  const d={key:null,kind,target,res,w,h,light:false,name:'',layers:[{name:'Capa 1',vis:true,op:100,lock:false}],frames:[]};
  if(kind==='char') d.charSize=size;
  for(let f=0;f<count;f++) d.frames.push({name:names?names[f]:'Rebanada '+(f+1),cels:[emptyCel(d)]});
  d.name=kind==='tile'?targetName(kind,target):(target==='new'?(kind==='char'?'Personaje':'Objeto'):targetName(kind,target).replace('Reemplazar ',''));
  return d;
}
function composeDoc(d,f){
  const n=d.w*d.h*4, out=new Uint8ClampedArray(n);
  d.layers.forEach((ly,li)=>{ if(!ly.vis) return; const c=d.frames[f].cels[li], op=ly.op==null?1:ly.op/100; if(op<=0) return;
    for(let o=0;o<n;o+=4){ const a=Math.round(c[o+3]*op); if(!a) continue;
      if(a===255||!out[o+3]){ out[o]=c[o]; out[o+1]=c[o+1]; out[o+2]=c[o+2]; out[o+3]=a; }
      else { const t=a/255; out[o]=out[o]*(1-t)+c[o]*t; out[o+1]=out[o+1]*(1-t)+c[o+1]*t; out[o+2]=out[o+2]*(1-t)+c[o+2]*t; out[o+3]=Math.max(out[o+3],a); } } });
  return out;
}
function compCanvas(f){
  let e=ART.cache.get(f); if(e) return e;
  const d=ART.doc, c=mkCanvas(d.w,d.h); c.getContext('2d').putImageData(new ImageData(composeDoc(d,f),d.w,d.h),0,0);
  ART.cache.set(f,c); return c;
}
function docComposites(d){ return d.frames.map((fr,f)=>{ const c=mkCanvas(d.w,d.h); c.getContext('2d').putImageData(new ImageData(composeDoc(d,f),d.w,d.h),0,0); return c; }); }
function loadCanvasInto(d,f,src){ const c=fitTo(src,d.w,d.h); d.frames[f].cels[0]=new Uint8ClampedArray(c.getContext('2d').getImageData(0,0,d.w,d.h).data); }
// un personaje en un lienzo de otro tamaño: centrado y apoyado en la línea de suelo, píxel a píxel (sin reescalar)
function placeCharCel(src,w,h){ const c=mkCanvas(w,h); c.getContext('2d').drawImage(src,Math.floor((w-src.width)/2),h-src.height); return new Uint8ClampedArray(c.getContext('2d').getImageData(0,0,w,h).data); }
function celCanvas(buf,w,h){ const c=mkCanvas(w,h); c.getContext('2d').putImageData(new ImageData(buf.slice(),w,h),0,0); return c; }

/* ---- deshacer ---- */
function snapDoc(){ const d=ART.doc; return {frames:d.frames.map(fr=>({name:fr.name,cels:fr.cels.slice()})),layers:d.layers.map(l=>({...l})),frame:ART.frame,layer:ART.layer}; }
function pushEntry(e){ ART.undo.push(e); if(ART.undo.length>100) ART.undo.shift(); ART.redo.length=0; ART.dirty=true; }
function pushCel(){ const c=ART.doc.frames[ART.frame].cels[ART.layer]; pushEntry({t:'cel',f:ART.frame,l:ART.layer,data:c.slice()}); }
function pushDoc(){ pushEntry({t:'doc',...snapDoc()}); }
function applyEntry(e){
  const d=ART.doc;
  if(e.t==='cel'){ const fr=d.frames[e.f], c=fr&&fr.cels[e.l]; if(!c) return null; const inv={t:'cel',f:e.f,l:e.l,data:c.slice()}; c.set(e.data); ART.frame=e.f; ART.layer=e.l; return inv; }
  const inv={t:'doc',...snapDoc()};
  d.frames=e.frames.map(fr=>({name:fr.name,cels:fr.cels.slice()})); d.layers=e.layers.map(l=>({...l}));
  ART.frame=Math.min(e.frame,d.frames.length-1); ART.layer=Math.min(e.layer,d.layers.length-1); return inv;
}
function artUndo(){ commitFloat(); const e=ART.undo.pop(); if(!e){ showHint('No hay nada que deshacer.',1000); return; } const inv=applyEntry(e); if(inv) ART.redo.push(inv); changed(true); }
function artRedo(){ const e=ART.redo.pop(); if(!e){ showHint('No hay nada que rehacer.',1000); return; } const inv=applyEntry(e); if(inv) ART.undo.push(inv); changed(true); }
function changed(all){ if(typeof renderAdjust==='function'&&all) setTimeout(renderAdjust,0); if(all) ART.cache.clear(); else ART.cache.delete(ART.frame); ART.dirty=true; if(all) renderFrames(); else updateThumb(ART.frame); renderLayers(); artDraw(); }

/* ---- píxeles ---- */
const curBuf=()=>ART.doc.frames[ART.frame].cels[ART.layer];
function colAt(buf,x,y){ const d=ART.doc; if(x<0||y<0||x>=d.w||y>=d.h) return null; const o=(y*d.w+x)*4; return [buf[o],buf[o+1],buf[o+2],buf[o+3]]; }
function setRaw(buf,x,y,c){ const d=ART.doc; if(x<0||y<0||x>=d.w||y>=d.h) return; const o=(y*d.w+x)*4; buf[o]=c[0]; buf[o+1]=c[1]; buf[o+2]=c[2]; buf[o+3]=c[3]; }
// la selección es un rectángulo con máscara opcional (varita mágica, lazo)
const inSel=(x,y)=>{ const s=ART.sel; if(!s) return true; if(x<s.x||y<s.y||x>=s.x+s.w||y>=s.y+s.h) return false; return !s.mask||s.mask[(y-s.y)*s.w+(x-s.x)]===1; };
function maskSel(mask,W,H){ let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(mask[y*W+x]){ if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y; }
  if(x1<0) return null; const w=x1-x0+1, h=y1-y0+1, m=new Uint8Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++) m[y*w+x]=mask[(y0+y)*W+x0+x];
  return {x:x0,y:y0,w,h,mask:m}; }
function selToMask(){ const d=ART.doc, m=new Uint8Array(d.w*d.h); if(ART.sel) for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++) if(inSel(x,y)) m[y*d.w+x]=1; return m; }
function wandSelect(p,add){ const d=ART.doc, buf=curBuf(), t=colAt(buf,p.x,p.y); if(!t) return;
  const same=i=>buf[i*4]===t[0]&&buf[i*4+1]===t[1]&&buf[i*4+2]===t[2]&&buf[i*4+3]===t[3], m=add?selToMask():new Uint8Array(d.w*d.h);
  if(ART.fillAll){ for(let i=0;i<d.w*d.h;i++) if(same(i)) m[i]=1; }
  else { const st=[p.y*d.w+p.x], seen=new Uint8Array(d.w*d.h); while(st.length){ const i=st.pop(); if(seen[i]) continue; seen[i]=1; if(!same(i)) continue; m[i]=1; const x=i%d.w, y=(i/d.w)|0;
    if(x>0) st.push(i-1); if(x<d.w-1) st.push(i+1); if(y>0) st.push(i-d.w); if(y<d.h-1) st.push(i+d.w); } }
  ART.sel=maskSel(m,d.w,d.h); renderOpts(); artDraw(); }
function lassoSelect(pts,add){ const d=ART.doc; if(pts.length<3){ if(!add) ART.sel=null; artDraw(); return; } const m=add?selToMask():new Uint8Array(d.w*d.h);
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ const px=x+.5, py=y+.5; let inside=false;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const a=pts[i], b=pts[j]; if(((a.fy>py)!==(b.fy>py))&&(px<(b.fx-a.fx)*(py-a.fy)/(b.fy-a.fy)+a.fx)) inside=!inside; }
    if(inside) m[y*d.w+x]=1; }
  ART.sel=maskSel(m,d.w,d.h); renderOpts(); artDraw(); }
function put(buf,x,y,c){ if(inSel(x,y)) setRaw(buf,x,y,c); }
function putM(buf,x,y,c){ const d=ART.doc; put(buf,x,y,c); if(ART.mirX) put(buf,d.w-1-x,y,c); if(ART.mirY) put(buf,x,d.h-1-y,c); if(ART.mirX&&ART.mirY) put(buf,d.w-1-x,d.h-1-y,c); }
function shadePx(buf,x,y,g){
  const d=ART.doc, pts=[[x,y]];
  if(ART.mirX) pts.push([d.w-1-x,y]); if(ART.mirY) pts.push([x,d.h-1-y]); if(ART.mirX&&ART.mirY) pts.push([d.w-1-x,d.h-1-y]);
  const ramps=[...PAL_RAMPS,ART.custom];
  for(const [X,Y] of pts){
    if(!inSel(X,Y)) continue; const key=Y*d.w+X; if(g.seen.has(key)) continue; g.seen.add(key);
    const c=colAt(buf,X,Y); if(!c||!c[3]) continue;
    const e=SHADE.get(c[0]+','+c[1]+','+c[2]); if(!e) continue;
    const rp=ramps[e[0]], ni=e[1]+(g.btn===2?-ART.shade:ART.shade); if(ni<0||ni>=rp.length) continue;
    setRaw(buf,X,Y,[...hexRGB(rp[ni]),c[3]]);
  }
}
function brushCells(){ const sz=ART.size, o=-((sz-1)>>1), out=[], c=(sz-1)/2, rr=(sz/2)**2+0.01;
  for(let dy=0;dy<sz;dy++) for(let dx=0;dx<sz;dx++){ if(ART.round&&sz>2&&(dx-c)**2+(dy-c)**2>rr) continue; out.push([o+dx,o+dy]); } return out; }
function stamp(buf,x,y,c,g){
  const cb=ART.cbrush;
  if(cb&&(ART.tool==='pencil'||ART.tool==='eraser')){ const ox=x-(cb.w>>1), oy=y-(cb.h>>1);
    for(let j=0;j<cb.h;j++) for(let i=0;i<cb.w;i++){ const o=(j*cb.w+i)*4; if(!cb.data[o+3]) continue;
      putM(buf,ox+i,oy+j,ART.tool==='eraser'?[0,0,0,0]:(ART.cbColor?c:[cb.data[o],cb.data[o+1],cb.data[o+2],cb.data[o+3]])); } return; }
  for(const [ddx,ddy] of brushCells()){
    const X=x+ddx, Y=y+ddy;
    if(ART.tool==='dither'&&((X+Y)&1)) continue;
    if(ART.tool==='shade'){ shadePx(buf,X,Y,g); continue; }
    putM(buf,X,Y,c);
  }
}
// aerógrafo: puntos al azar dentro del radio del pincel
function spray(buf,x,y,c){ const R=Math.max(2,ART.size*1.5), n=Math.max(3,ART.size*2);
  for(let k=0;k<n;k++){ const a=Math.random()*Math.PI*2, d=Math.sqrt(Math.random())*R; putM(buf,Math.round(x+Math.cos(a)*d),Math.round(y+Math.sin(a)*d),c); } }
// degradado tramado entre el color principal y el secundario, a lo largo del arrastre
function gradient(buf,a,b){ const d=ART.doc, vx=b.x-a.x, vy=b.y-a.y, L2=vx*vx+vy*vy||1;
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ if(!inSel(x,y)) continue; const o=(y*d.w+x)*4; if(ART.gradOpaque&&!buf[o+3]) continue;
    const t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/L2)), use2=t>(BAYER[y&3][x&3]+0.5)/16, c=use2?ART.sec:ART.prim;
    if(!c[3]&&!use2) continue; setRaw(buf,x,y,c); } }
function lineCb(x0,y0,x1,y1,cb){ const dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1; let e=dx+dy;
  for(;;){ cb(x0,y0); if(x0===x1&&y0===y1) break; const e2=2*e; if(e2>=dy){ e+=dy; x0+=sx; } if(e2<=dx){ e+=dx; y0+=sy; } } }
function ppOn(){ return ART.pp&&ART.size===1&&!ART.cbrush&&!ART.mirX&&!ART.mirY&&(ART.tool==='pencil'||ART.tool==='eraser'); }
// pixel perfect: al dibujar a mano alzada se quitan las esquinas en L
function drawPt(g,x,y){
  if(ppOn()){
    if(!inSel(x,y)) return; const prev=colAt(g.buf,x,y); if(!prev) return;
    setRaw(g.buf,x,y,g.col); g.pts.push({x,y,prev});
    const n=g.pts.length;
    if(n>=3){ const a=g.pts[n-3], b=g.pts[n-2], c=g.pts[n-1];
      if((a.x===b.x||a.y===b.y)&&(c.x===b.x||c.y===b.y)&&a.x!==c.x&&a.y!==c.y){ setRaw(g.buf,b.x,b.y,b.prev); g.pts.splice(n-2,1); } }
  } else stamp(g.buf,x,y,g.col,g);
}
function normRect(a,b){ const d=ART.doc, x0=Math.max(0,Math.min(a.x,b.x)), y0=Math.max(0,Math.min(a.y,b.y)), x1=Math.min(d.w-1,Math.max(a.x,b.x)), y1=Math.min(d.h-1,Math.max(a.y,b.y));
  return x1<x0||y1<y0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}; }
function drawShape(g,b){
  const buf=g.buf, a=g.a, c=g.col;
  if(ART.tool==='line'){ lineCb(a.x,a.y,b.x,b.y,(x,y)=>stamp(buf,x,y,c,g)); return; }
  const x0=Math.min(a.x,b.x), y0=Math.min(a.y,b.y), x1=Math.max(a.x,b.x), y1=Math.max(a.y,b.y);
  if(ART.tool==='rect'){
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if(ART.shapeFill||x===x0||x===x1||y===y0||y===y1) stamp(buf,x,y,c,g);
    return;
  }
  const cx=(x0+x1+1)/2, cy=(y0+y1+1)/2, rx=(x1-x0+1)/2, ry=(y1-y0+1)/2;
  const ins=(x,y)=>((x+0.5-cx)/rx)**2+((y+0.5-cy)/ry)**2<=1.0001;
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ if(!ins(x,y)) continue;
    if(ART.shapeFill||!ins(x-1,y)||!ins(x+1,y)||!ins(x,y-1)||!ins(x,y+1)) stamp(buf,x,y,c,g); }
}
function bucket(buf,x,y,c){
  const d=ART.doc, t=colAt(buf,x,y); if(!t||!inSel(x,y)) return;
  if(t[0]===c[0]&&t[1]===c[1]&&t[2]===c[2]&&t[3]===c[3]) return;
  const same=o=>buf[o]===t[0]&&buf[o+1]===t[1]&&buf[o+2]===t[2]&&buf[o+3]===t[3];
  if(ART.fillAll){ for(let yy=0;yy<d.h;yy++) for(let xx=0;xx<d.w;xx++) if(inSel(xx,yy)&&same((yy*d.w+xx)*4)) setRaw(buf,xx,yy,c); return; }
  const st=[[x,y]], seen=new Uint8Array(d.w*d.h);
  while(st.length){ const [px,py]=st.pop(); if(px<0||py<0||px>=d.w||py>=d.h) continue; const i=py*d.w+px; if(seen[i]) continue; seen[i]=1;
    if(!inSel(px,py)||!same(i*4)) continue; setRaw(buf,px,py,c); st.push([px+1,py],[px-1,py],[px,py+1],[px,py-1]); }
}

/* ---- selección flotante ---- */
function regionOf(buf,r){ const d=ART.doc, out=new Uint8ClampedArray(r.w*r.h*4);
  for(let y=0;y<r.h;y++) for(let x=0;x<r.w;x++){ if(r.mask&&!r.mask[y*r.w+x]) continue; const s=((r.y+y)*d.w+r.x+x)*4, o=(y*r.w+x)*4; out[o]=buf[s]; out[o+1]=buf[s+1]; out[o+2]=buf[s+2]; out[o+3]=buf[s+3]; }
  return out; }
function fltCanvas(f){ const c=mkCanvas(f.w,f.h); c.getContext('2d').putImageData(new ImageData(f.data,f.w,f.h),0,0); f.cv=c; }
function liftSel(){
  const d=ART.doc, r=ART.sel||{x:0,y:0,w:d.w,h:d.h}; pushCel();
  const buf=curBuf(), data=regionOf(buf,r);
  for(let y=0;y<r.h;y++) for(let x=0;x<r.w;x++) if(!r.mask||r.mask[y*r.w+x]) setRaw(buf,r.x+x,r.y+y,[0,0,0,0]);
  ART.flt={x:r.x,y:r.y,w:r.w,h:r.h,data}; fltCanvas(ART.flt); ART.sel=null; changed(false);
}
function commitFloat(){
  const f=ART.flt; if(!f) return; const buf=curBuf();
  for(let y=0;y<f.h;y++) for(let x=0;x<f.w;x++){ const o=(y*f.w+x)*4; if(f.data[o+3]) setRaw(buf,f.x+x,f.y+y,[f.data[o],f.data[o+1],f.data[o+2],f.data[o+3]]); }
  ART.sel=normRect({x:f.x,y:f.y},{x:f.x+f.w-1,y:f.y+f.h-1}); ART.flt=null; changed(false);
}
function artCopy(){ const d=ART.doc; if(ART.flt){ const f=ART.flt; ART.clip={w:f.w,h:f.h,data:f.data.slice()}; }
  else { const r=ART.sel||{x:0,y:0,w:d.w,h:d.h}; ART.clip={w:r.w,h:r.h,data:regionOf(curBuf(),r)}; } showHint('Copiado.',900); }
function artPaste(){ if(!ART.clip) { showHint('Primero copia algo.',1200); return; } commitFloat(); pushCel();
  const s=ART.sel; ART.flt={x:s?s.x:0,y:s?s.y:0,w:ART.clip.w,h:ART.clip.h,data:ART.clip.data.slice()}; fltCanvas(ART.flt); ART.sel=null; setTool('move'); changed(false); }
function artDelete(){ if(ART.flt){ ART.flt=null; changed(false); return; } const d=ART.doc, r=ART.sel||{x:0,y:0,w:d.w,h:d.h}; pushCel(); const buf=curBuf();
  for(let y=0;y<r.h;y++) for(let x=0;x<r.w;x++) if(!r.mask||r.mask[y*r.w+x]) setRaw(buf,r.x+x,r.y+y,[0,0,0,0]); changed(false); }

/* ---- transformaciones ---- */
function transformRegion(fn){ // fn(src,w,h) -> {data,w,h}
  if(!ART.flt&&ART.sel&&ART.sel.mask) liftSel();   // con forma libre se transforma lo levantado, no el rectángulo
  if(ART.flt){ const f=ART.flt, r=fn(f.data,f.w,f.h); Object.assign(f,{data:r.data,w:r.w,h:r.h}); fltCanvas(f); changed(false); return; }
  const d=ART.doc, r=ART.sel||{x:0,y:0,w:d.w,h:d.h}; const src=regionOf(curBuf(),r), o=fn(src,r.w,r.h);
  if(o.w!==r.w||o.h!==r.h){ showHint('Para rotar, la selección debe ser cuadrada.',1800); return; }
  pushCel(); const buf=curBuf();
  for(let y=0;y<r.h;y++) for(let x=0;x<r.w;x++){ const k=(y*r.w+x)*4; setRaw(buf,r.x+x,r.y+y,[o.data[k],o.data[k+1],o.data[k+2],o.data[k+3]]); }
  changed(false);
}
const flipH=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(y*w+x)*4+k]=s[(y*w+w-1-x)*4+k]; return {data:o,w,h}; };
const flipV=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(y*w+x)*4+k]=s[((h-1-y)*w+x)*4+k]; return {data:o,w,h}; };
const rot90=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(x*h+(h-1-y))*4+k]=s[(y*w+x)*4+k]; return {data:o,w:h,h:w}; };
function offsetHalf(){ // desplaza todas las capas media casilla: ayuda a que la textura se repita sin costuras
  commitFloat(); const d=ART.doc; pushDoc(); const fr=d.frames[ART.frame];
  fr.cels=fr.cels.map(c=>{ const o=new Uint8ClampedArray(c.length), hx=d.w>>1, hy=d.h>>1;
    for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ const s=(y*d.w+x)*4, t=(((y+hy)%d.h)*d.w+((x+hx)%d.w))*4; o[t]=c[s]; o[t+1]=c[s+1]; o[t+2]=c[s+2]; o[t+3]=c[s+3]; } return o; });
  changed(true); showHint('Movido media casilla: así ves y corriges las costuras.',2200);
}
function addOutline(){ commitFloat(); const d=ART.doc; pushCel(); const buf=curBuf(), src=buf.slice(), a=(x,y)=>x>=0&&y>=0&&x<d.w&&y<d.h&&src[(y*d.w+x)*4+3]>0;
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++) if(!a(x,y)&&(a(x-1,y)||a(x+1,y)||a(x,y-1)||a(x,y+1))&&inSel(x,y)) setRaw(buf,x,y,ART.prim); changed(false); }
function clearLayer(){ commitFloat(); pushCel(); curBuf().fill(0); changed(false); }
function fillSel(){ if(!ART.sel) return; commitFloat(); pushCel(); const d=ART.doc, buf=curBuf(); for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++) if(inSel(x,y)) setRaw(buf,x,y,ART.prim); changed(false); }
function strokeSel(){ if(!ART.sel) return; commitFloat(); pushCel(); const d=ART.doc, buf=curBuf();
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++) if(inSel(x,y)&&(!inSel(x-1,y)||!inSel(x+1,y)||!inSel(x,y-1)||!inSel(x,y+1)||x===0||y===0||x===d.w-1||y===d.h-1)) setRaw(buf,x,y,ART.prim); changed(false); }
function brushFromSel(){ const d=ART.doc, r=ART.flt?{x:ART.flt.x,y:ART.flt.y,w:ART.flt.w,h:ART.flt.h}:ART.sel; if(!r){ showHint('Selecciona primero lo que quieres usar como pincel.',1800); return; }
  const data=ART.flt?ART.flt.data.slice():regionOf(compCanvas(ART.frame).getContext('2d').getImageData(0,0,d.w,d.h).data,r);
  ART.cbrush={w:r.w,h:r.h,data}; commitFloat(); ART.sel=null; setTool('pencil'); showHint('Pincel propio listo: pinta con el lápiz. Vuelve al pincel normal en Opciones.',2600); }

/* ---- lienzo en pantalla ---- */
function artResize(){ const r=acv.getBoundingClientRect(), dpr=devicePixelRatio||1; acv.width=Math.max(1,Math.round(r.width*dpr)); acv.height=Math.max(1,Math.round(r.height*dpr)); artDraw(); }
function artFit(){ const d=ART.doc, r=acv.getBoundingClientRect(); const z=Math.max(1,Math.floor(Math.min(r.width/d.w,r.height/d.h)*0.86)); ART.zoom=z; ART.px=Math.round((r.width-d.w*z)/2); ART.py=Math.round((r.height-d.h*z)/2); artDraw(); }
function artZoomAt(nz,sx,sy){ nz=Math.max(1,Math.min(64,Math.round(nz))); if(nz===ART.zoom) return; const k=nz/ART.zoom; ART.px=Math.round(sx-(sx-ART.px)*k); ART.py=Math.round(sy-(sy-ART.py)*k); ART.zoom=nz; artDraw(); }
function artDraw(){
  const d=ART.doc; if(!d||!ART.open) return;
  const dpr=devicePixelRatio||1, Wc=acv.width/dpr, Hc=acv.height/dpr, z=ART.zoom, ox=ART.px, oy=ART.py, cw=d.w*z, ch=d.h*z;
  actx.setTransform(dpr,0,0,dpr,0,0); actx.imageSmoothingEnabled=false; actx.clearRect(0,0,Wc,Hc);
  if(ART.tiled&&d.kind==='tile'){ // modo mosaico: la casilla repetida alrededor para ver las costuras mientras dibujas
    actx.globalAlpha=0.55; const cv=compCanvas(ART.frame);
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) if(i||j) actx.drawImage(cv,ox+i*cw,oy+j*ch,cw,ch);
    actx.globalAlpha=1; }
  const cs=Math.max(4,z*Math.max(1,Math.round(d.w/16)));
  actx.fillStyle='#cdc7d6'; actx.fillRect(ox,oy,cw,ch); actx.fillStyle='#b7b0c4';
  for(let y=0;y*cs<ch;y++) for(let x=(y&1);x*cs<cw;x+=2) actx.fillRect(ox+x*cs,oy+y*cs,Math.min(cs,cw-x*cs),Math.min(cs,ch-y*cs));
  if(ART.ref){ actx.globalAlpha=ART.refA; const r=ART.ref, s2=Math.min(cw/r.width,ch/r.height), rw=r.width*s2, rh=r.height*s2; actx.imageSmoothingEnabled=true; actx.drawImage(r,ox+(cw-rw)/2,oy+(ch-rh)/2,rw,rh); actx.imageSmoothingEnabled=false; actx.globalAlpha=1; }
  if(ART.onion){
    if(ART.frame>0){ actx.globalAlpha=0.32; actx.drawImage(compCanvas(ART.frame-1),ox,oy,cw,ch); }
    if(d.kind==='obj'&&ART.frame<d.frames.length-1){ actx.globalAlpha=0.14; actx.drawImage(compCanvas(ART.frame+1),ox,oy,cw,ch); }
    actx.globalAlpha=1;
  }
  actx.drawImage(compCanvas(ART.frame),ox,oy,cw,ch);
  if(ART.flt){ const f=ART.flt; actx.drawImage(f.cv,ox+f.x*z,oy+f.y*z,f.w*z,f.h*z); }
  if(ART.grid&&z>=6){ actx.strokeStyle='rgba(22,18,34,0.16)'; actx.lineWidth=1; actx.beginPath();
    for(let x=0;x<=d.w;x++){ const X=ox+x*z+0.5; actx.moveTo(X,oy); actx.lineTo(X,oy+ch); }
    for(let y=0;y<=d.h;y++){ const Y=oy+y*z+0.5; actx.moveTo(ox,Y); actx.lineTo(ox+cw,Y); } actx.stroke(); }
  // personaje: línea de suelo (donde apoya en la peana) y una marca por casilla de alto (5 pies), con su rótulo
  if(d.kind==='char'&&ART.guides!==false){ const step=d.res*z; actx.save(); actx.lineWidth=1; actx.font='11px sans-serif'; actx.textAlign='right'; actx.textBaseline='middle';
    for(let k=0;k*step<=ch+0.5;k++){ const Y=Math.round(oy+ch-k*step)+0.5; actx.strokeStyle=k?'rgba(214,162,74,0.55)':'rgba(214,162,74,0.95)'; actx.setLineDash(k?[4,4]:[]);
      actx.beginPath(); actx.moveTo(ox-10,Y); actx.lineTo(ox+cw+10,Y); actx.stroke(); actx.fillStyle='#d6a24a'; actx.fillText(k?(k*5)+' pies':'suelo',ox-14,Y); }
    actx.setLineDash([]); actx.restore(); }
  if(d.kind==='tile'&&ART.grid){ actx.strokeStyle='rgba(22,18,34,0.35)'; actx.beginPath(); actx.moveTo(ox,oy+ch/2+0.5); actx.lineTo(ox+cw,oy+ch/2+0.5); actx.stroke(); }
  actx.strokeStyle='#d6a24a'; actx.lineWidth=2;
  if(ART.mirX){ actx.beginPath(); actx.moveTo(ox+cw/2,oy-6); actx.lineTo(ox+cw/2,oy+ch+6); actx.stroke(); }
  if(ART.mirY){ actx.beginPath(); actx.moveTo(ox-6,oy+ch/2); actx.lineTo(ox+cw+6,oy+ch/2); actx.stroke(); }
  const r=ART.flt?{x:ART.flt.x,y:ART.flt.y,w:ART.flt.w,h:ART.flt.h}:ART.sel;
  const ants=path=>{ actx.lineWidth=1; actx.setLineDash([4,3]); actx.strokeStyle='#ffffff'; actx.stroke(path); actx.lineDashOffset=3.5; actx.strokeStyle='#161222'; actx.stroke(path); actx.setLineDash([]); actx.lineDashOffset=0; };
  if(r&&r.mask){ // contorno de la forma: los lados de cada píxel elegido que dan a uno sin elegir
    const P=new Path2D(), m=(x,y)=>x>=0&&y>=0&&x<r.w&&y<r.h&&r.mask[y*r.w+x];
    for(let y=0;y<r.h;y++) for(let x=0;x<r.w;x++){ if(!m(x,y)) continue; const X=ox+(r.x+x)*z+0.5, Y=oy+(r.y+y)*z+0.5;
      if(!m(x,y-1)){ P.moveTo(X,Y); P.lineTo(X+z,Y); } if(!m(x,y+1)){ P.moveTo(X,Y+z); P.lineTo(X+z,Y+z); }
      if(!m(x-1,y)){ P.moveTo(X,Y); P.lineTo(X,Y+z); } if(!m(x+1,y)){ P.moveTo(X+z,Y); P.lineTo(X+z,Y+z); } }
    ants(P); }
  else if(r){ const P=new Path2D(); P.rect(ox+r.x*z+0.5,oy+r.y*z+0.5,r.w*z-1,r.h*z-1); ants(P); }
  if(ART.lasso&&ART.lasso.length>1){ const P=new Path2D(); ART.lasso.forEach((q,i)=>{ const X=ox+q.fx*z, Y=oy+q.fy*z; i?P.lineTo(X,Y):P.moveTo(X,Y); }); P.closePath(); ants(P); }
  // luz del objeto: marca en su píxel (fuerte en su rebanada, tenue en las demás)
  const L0=d.kind==='obj'&&d.light&&typeof d.light==='object'?d.light:null;
  if(L0){ const X=ox+(L0.px+0.5)*z, Y=oy+(L0.py+0.5)*z, on=L0.s===ART.frame; actx.globalAlpha=on?1:0.35;
    const gr=actx.createRadialGradient(X,Y,0,X,Y,Math.max(8,z*2.5)); gr.addColorStop(0,L0.c||WARM); gr.addColorStop(1,'rgba(0,0,0,0)');
    actx.fillStyle=gr; actx.beginPath(); actx.arc(X,Y,Math.max(8,z*2.5),0,Math.PI*2); actx.fill();
    actx.strokeStyle='#ffffff'; actx.lineWidth=2; actx.beginPath(); actx.arc(X,Y,Math.max(4,z*0.6),0,Math.PI*2); actx.stroke(); actx.globalAlpha=1; }
  // el pincel bajo el cursor
  const hv=ART.hover;
  if(hv&&!aG&&['pencil','eraser','dither','shade','spray'].includes(ART.tool)&&hv.x>=-8&&hv.y>=-8&&hv.x<d.w+8&&hv.y<d.h+8){
    actx.lineWidth=1; actx.strokeStyle='rgba(255,255,255,0.9)'; const cb=ART.cbrush;
    if(cb&&(ART.tool==='pencil'||ART.tool==='eraser')){ actx.globalAlpha=0.6; const bx=hv.x-(cb.w>>1), by=hv.y-(cb.h>>1);
      if(!cb.cv){ cb.cv=mkCanvas(cb.w,cb.h); cb.cv.getContext('2d').putImageData(new ImageData(cb.data.slice(),cb.w,cb.h),0,0); }
      actx.drawImage(cb.cv,ox+bx*z,oy+by*z,cb.w*z,cb.h*z); actx.globalAlpha=1; actx.strokeRect(ox+bx*z+0.5,oy+by*z+0.5,cb.w*z-1,cb.h*z-1); }
    else if(ART.tool==='spray'){ const R=Math.max(2,ART.size*1.5)*z; actx.beginPath(); actx.arc(ox+(hv.x+.5)*z,oy+(hv.y+.5)*z,R,0,Math.PI*2); actx.stroke(); }
    else { const col=ART.tool==='eraser'?null:ART.prim; for(const [ddx,ddy] of brushCells()){ const X=ox+(hv.x+ddx)*z, Y=oy+(hv.y+ddy)*z;
        if(col&&col[3]){ actx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},0.55)`; actx.fillRect(X,Y,z,z); } }
      const cs=brushCells(), xs=cs.map(q=>q[0]), ys=cs.map(q=>q[1]); actx.strokeRect(ox+(hv.x+Math.min(...xs))*z+0.5,oy+(hv.y+Math.min(...ys))*z+0.5,(Math.max(...xs)-Math.min(...xs)+1)*z-1,(Math.max(...ys)-Math.min(...ys)+1)*z-1); } }
  actx.strokeStyle='rgba(22,18,34,0.6)'; actx.lineWidth=1; actx.strokeRect(ox-0.5,oy-0.5,cw+1,ch+1);
}
function artInfo(p){ const d=ART.doc; $('artInfo').textContent=d.w+'×'+d.h+' · '+d.frames[ART.frame].name+' · zoom ×'+ART.zoom+(p&&p.x>=0&&p.y>=0&&p.x<d.w&&p.y<d.h?(' · x '+p.x+', y '+p.y):''); }

/* ---- entrada en el lienzo ---- */
const aP=new Map(); let aG=null;
function aPos(cx,cy){ const r=acv.getBoundingClientRect(), fx=(cx-r.left-ART.px)/ART.zoom, fy=(cy-r.top-ART.py)/ART.zoom; return {x:Math.floor(fx),y:Math.floor(fy),fx,fy,sx:cx-r.left,sy:cy-r.top}; }
const DRAWS=['pencil','eraser','dither','shade','line','rect','ellipse','fill','spray','gradient'];
function toolStart(g,cx,cy){
  g.pend=false; g.started=true; const p=aPos(cx,cy), t=ART.tool, d=ART.doc; g.a=p; g.last=p;
  const col=g.btn===2?ART.sec:ART.prim;
  if(DRAWS.includes(t)&&t!=='eraser') noteRecent(col);
  if(DRAWS.includes(t)&&d.layers[ART.layer].lock){ showHint('La capa «'+d.layers[ART.layer].name+'» está bloqueada. Desbloquéala en Capas.',2000); g.started=false; return; }
  if(t==='lightpos'){ placeLight(p); g.started=false; return; }
  if(t!=='move'&&t!=='select'&&t!=='pick'&&t!=='wand'&&t!=='lasso'&&ART.flt) commitFloat();
  if(t==='pencil'||t==='eraser'||t==='dither'||t==='shade'){ pushCel(); g.buf=curBuf(); g.col=t==='eraser'?[0,0,0,0]:col; g.seen=new Set(); g.pts=[]; g.mod=true; drawPt(g,p.x,p.y); changed(false); }
  else if(t==='line'||t==='rect'||t==='ellipse'){ pushCel(); g.buf=curBuf(); g.base=g.buf.slice(); g.col=col; g.seen=new Set(); g.mod=true; drawShape(g,p); changed(false); }
  else if(t==='fill'){ pushCel(); bucket(curBuf(),p.x,p.y,col); changed(false); g.done=true; }
  else if(t==='spray'){ pushCel(); g.buf=curBuf(); g.col=col; g.mod=true; spray(g.buf,p.x,p.y,col); changed(false); }
  else if(t==='gradient'){ pushCel(); g.buf=curBuf(); g.base=g.buf.slice(); g.mod=true; }
  else if(t==='wand'){ commitFloat(); wandSelect(p,g.shift); g.started=false; }
  else if(t==='lasso'){ commitFloat(); if(!g.shift) ART.sel=null; g.lpts=[{fx:p.fx,fy:p.fy}]; artDraw(); }
  else if(t==='pick'){ pickAt(p,g.btn); }
  else if(t==='select'){ commitFloat(); ART.sel=null; artDraw(); }
  else if(t==='move'){ if(!ART.flt) liftSel(); g.fx=ART.flt.x; g.fy=ART.flt.y; }
}
function pickAt(p,btn){ const d=ART.doc; if(p.x<0||p.y<0||p.x>=d.w||p.y>=d.h) return; const cv=compCanvas(ART.frame), px=cv.getContext('2d').getImageData(p.x,p.y,1,1).data;
  if(px[3]===0) return; const c=[px[0],px[1],px[2],255]; if(btn===2) ART.sec=c; else ART.prim=c; renderPal(); }
function toolMove(g,cx,cy){
  const p=aPos(cx,cy), t=ART.tool; artInfo(p);
  if(t==='pencil'||t==='eraser'||t==='dither'||t==='shade'){ if(p.x===g.last.x&&p.y===g.last.y) return;
    let first=true; lineCb(g.last.x,g.last.y,p.x,p.y,(x,y)=>{ if(first){ first=false; return; } drawPt(g,x,y); }); g.last=p; changed(false); }
  else if(t==='line'||t==='rect'||t==='ellipse'){ g.buf.set(g.base); drawShape(g,p); changed(false); }
  else if(t==='pick'){ pickAt(p,g.btn); }
  else if(t==='select'){ ART.sel=normRect(g.a,p); artDraw(); }
  else if(t==='spray'){ spray(g.buf,p.x,p.y,g.col); changed(false); }
  else if(t==='gradient'){ g.buf.set(g.base); gradient(g.buf,g.a,p); changed(false); }
  else if(t==='lasso'&&g.lpts){ const q=g.lpts[g.lpts.length-1]; if(Math.hypot(p.fx-q.fx,p.fy-q.fy)>0.4) g.lpts.push({fx:p.fx,fy:p.fy}); ART.lasso=g.lpts; artDraw(); }
  else if(t==='move'&&ART.flt){ ART.flt.x=g.fx+(p.x-g.a.x); ART.flt.y=g.fy+(p.y-g.a.y); artDraw(); }
}
function toolEnd(g){
  if(g.last&&['pencil','eraser','dither','line'].includes(ART.tool)) ART.lastPt=g.last;
  if(ART.tool==='pick'){ setTool(ART.prevTool); }
  if(ART.tool==='select'&&ART.sel&&ART.sel.w===1&&ART.sel.h===1&&g.a.x===g.last.x&&g.a.y===g.last.y) ART.sel=null;
  if(ART.tool==='lasso'&&g.lpts){ lassoSelect(g.lpts,g.shift); ART.lasso=null; }
  if(ART.tool==='select'||ART.tool==='lasso') renderOpts();
  artDraw();
}
function toolCancel(g){ if(g.mod){ const e=ART.undo.pop(); if(e) applyEntry(e); changed(false); } }
acv.addEventListener('contextmenu',e=>e.preventDefault());
acv.addEventListener('pointerdown',e=>{
  acv.setPointerCapture(e.pointerId); aP.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(aP.size===1){
    const pan=e.button===1||ART.tool==='hand'||ART.space;
    aG={pan,btn:e.button,pend:!pan,started:false,cx:e.clientX,cy:e.clientY,moved:false,shift:e.shiftKey};
    if(!pan&&e.pointerType==='mouse'&&e.altKey){ pickAt(aPos(e.clientX,e.clientY),e.button); aG.pend=false; aG.picked=true; return; }
    if(!pan&&e.pointerType==='mouse'&&e.shiftKey&&ART.lastPt&&['pencil','eraser','dither'].includes(ART.tool)&&!ART.doc.layers[ART.layer].lock){
      const p=aPos(e.clientX,e.clientY), g=aG; g.pend=false; commitFloat(); pushCel(); g.buf=curBuf(); g.col=ART.tool==='eraser'?[0,0,0,0]:(e.button===2?ART.sec:ART.prim); g.seen=new Set(); g.pts=[];
      lineCb(ART.lastPt.x,ART.lastPt.y,p.x,p.y,(x,y)=>stamp(g.buf,x,y,g.col,g)); ART.lastPt=p; changed(false); g.picked=true; return; }
    if(!pan){ const g=aG, id=e.pointerId; if(e.pointerType==='mouse') toolStart(g,e.clientX,e.clientY);
      else {
        setTimeout(()=>{ if(aG===g&&g.pend&&aP.size===1) toolStart(g,g.cx,g.cy); },70);
        // mantener pulsado: cuentagotas (se deshace el punto que alcanzó a pintarse)
        g.lp=setTimeout(()=>{ if(aG!==g||g.moved||aP.size!==1) return; if(g.started) toolCancel(g);
          g.started=false; g.pend=false; g.picked=true; const p=aP.get(id); if(p){ pickAt(aPos(p.x,p.y),0); showHint('Color tomado.',800); } },450);
      } }
  } else if(aP.size===2){
    if(aG){ clearTimeout(aG.lp); if(aG.started) toolCancel(aG); }
    const a=[...aP.values()], d0=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y), mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
    aG={pinch:d0,d0,z0:ART.zoom,mx,my,mx0:mx,my0:my,n:2,t0:performance.now(),moved:false};
  } else if(aG&&aG.pinch){ aG.n=Math.max(aG.n,aP.size); }
});
acv.addEventListener('pointermove',e=>{
  const p=aP.get(e.pointerId);
  if(!p){ if(e.pointerType==='mouse'){ const q=aPos(e.clientX,e.clientY); artInfo(q); if(!ART.hover||ART.hover.x!==q.x||ART.hover.y!==q.y){ ART.hover=q; artDraw(); } } return; }
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; if(!aG) return;
  if(aP.size===1){
    if(aG.pan){ ART.px+=dx; ART.py+=dy; artDraw(); return; }
    if(aG.picked) return;
    if(Math.hypot(e.clientX-aG.cx,e.clientY-aG.cy)>6){ aG.moved=true; clearTimeout(aG.lp); }
    if(aG.pend&&Math.hypot(e.clientX-aG.cx,e.clientY-aG.cy)>3) toolStart(aG,aG.cx,aG.cy);
    if(aG.started) toolMove(aG,e.clientX,e.clientY);
  } else if(aP.size===2&&aG.pinch){
    const a=[...aP.values()], mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2, dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(Math.abs(dist-aG.d0)>12||Math.hypot(mx-aG.mx0,my-aG.my0)>12) aG.moved=true;
    ART.px+=mx-aG.mx; ART.py+=my-aG.my; aG.mx=mx; aG.my=my;
    const r=acv.getBoundingClientRect(); artZoomAt(aG.z0*dist/aG.pinch,mx-r.left,my-r.top); artDraw();
  }
});
const aEnd=e=>{ if(!aP.has(e.pointerId)) return; aP.delete(e.pointerId); const g=aG;
  if(g) clearTimeout(g.lp);
  // toque rápido con dos dedos: deshacer; con tres: rehacer
  if(g&&g.pinch&&aP.size===0){ if(!g.moved&&performance.now()-g.t0<320){ g.n>=3?artRedo():artUndo(); } aG=null; return; }
  if(g&&g.pend&&aP.size===0&&e.type==='pointerup'){ toolStart(g,g.cx,g.cy); }
  if(g&&g.started&&aP.size===0) toolEnd(g);
  if(aP.size===0) aG=null; };
acv.addEventListener('pointerup',aEnd); acv.addEventListener('pointercancel',aEnd);
acv.addEventListener('pointerleave',()=>{ if(ART.hover){ ART.hover=null; artDraw(); } });
acv.addEventListener('wheel',e=>{ e.preventDefault(); const r=acv.getBoundingClientRect(); artZoomAt(ART.zoom*(e.deltaY<0?1.25:0.8)+(e.deltaY<0?0.5:-0.5),e.clientX-r.left,e.clientY-r.top); },{passive:false});
// girar la vista previa arrastrando; doble toque reanuda el giro automático
(()=>{ const box=$('artPrevBox'); let last=null, taps=0;
  box.addEventListener('pointerdown',e=>{ box.setPointerCapture(e.pointerId); last=e.clientX; if(++taps===2){ ART.spin=true; taps=0; } setTimeout(()=>taps=0,350); });
  box.addEventListener('pointermove',e=>{ if(last===null) return; const dx=e.clientX-last; last=e.clientX; if(Math.abs(dx)>0){ ART.spin=false; ART.angle+=dx*0.02; } });
  const up=()=>{ last=null; }; box.addEventListener('pointerup',up); box.addEventListener('pointercancel',up); })();

/* ---- barras: herramientas, opciones, paleta, cuadros y capas ---- */
const ATOOLS=[['pencil','Lápiz','b'],['eraser','Borrador','e'],['fill','Cubeta','g'],['pick','Gotero','i'],['line','Línea','l'],['rect','Rect.','u'],
  ['ellipse','Elipse','o'],['spray','Aerógrafo','a'],['gradient','Degradado','k'],['select','Selec.','m'],['wand','Varita','w'],['lasso','Lazo','q'],['move','Mover','v'],
  ['shade','Sombra','s'],['dither','Tramado','d'],['hand','Mano','h']];
function setTool(t){ if(t==='pick'&&ART.tool!=='pick') ART.prevTool=ART.tool; if(t!=='move'&&ART.flt) commitFloat(); ART.tool=t; renderTools(); renderOpts(); artDraw(); }
function mkBtn(label,fn,opt={}){ const b=document.createElement('button'); b.className='btn'; b.textContent=label; if(opt.pressed!==undefined) b.setAttribute('aria-pressed',String(!!opt.pressed)); if(opt.title) b.title=opt.title; if(opt.disabled) b.disabled=true; b.onclick=fn; return b; }
function sepEl(){ const s=document.createElement('span'); s.className='t3d-sep'; return s; }
function lblEl(t){ const s=document.createElement('span'); s.className='t3d-lbl'; s.textContent=t; return s; }
const ART_IC={pencil:'pencil',eraser:'eraser',fill:'paint-bucket',pick:'pipette',line:'slash',rect:'rectangle-horizontal',ellipse:'ellipse',select:'square-dashed',move:'move',shade:'contrast',dither:'grid-2x2',hand:'hand-grab',spray:'spray-can',gradient:'blend',wand:'wand-sparkles',lasso:'lasso',lightpos:'lightbulb'};
function renderTools(){ const el=$('artTools'); el.textContent='';
  for(const [k,n,key] of ATOOLS){ const b=document.createElement('button'); b.className='t3d-tb';
    b.innerHTML=ctx.icon(ART_IC[k]||'pencil'); const sp=document.createElement('span'); sp.textContent=n; b.appendChild(sp);
    b.title=n+' ('+key.toUpperCase()+')'; b.setAttribute('aria-pressed',String(ART.tool===k)); b.onclick=()=>setTool(k); el.appendChild(b); }
  // colores activos siempre a mano: toca para abrir la pestaña Colores
  const ch=document.createElement('div'); ch.className='t3d-chips';
  for(const [c,lab] of [[ART.prim,'Color principal'],[ART.sec,'Color secundario']]){ const b=document.createElement('button'); b.className='t3d-big'+(c[3]?'':' t3d-tr');
    if(c[3]) b.style.background=toHex(c); b.title=lab+': toca para ver los colores'; b.setAttribute('aria-label',lab); b.onclick=()=>artTab('cols'); ch.appendChild(b); }
  el.appendChild(ch); }
// cambia el tamaño de un personaje: el lienzo toma las medidas de ese tamaño y el dibujo se queda en su sitio (centrado
// sobre la línea de suelo), sin reescalar; lo que no quepa se recorta. No se puede deshacer: vacía el historial.
function resizeCharDoc(size){ commitFloat(); const d=ART.doc; if(!d||d.kind!=='char'||!Fichas.SIZE_IDS.includes(size)||size===d.charSize) return;
  const [w,h]=Fichas.artDims(size,d.res);
  d.frames.forEach(fr=>{ fr.cels=fr.cels.map(c=>placeCharCel(celCanvas(c,d.w,d.h),w,h)); });
  d.w=w; d.h=h; d.charSize=size; ART.sel=null; ART.undo=[]; ART.redo=[]; ART.cache.clear(); ART.dirty=true;
  renderOpts(); renderFrames(); docInfo(); artFit(); artInfo(); showHint('Lienzo de '+Fichas.SIZES.find(z=>z.id===size).name.toLowerCase()+': '+w+'×'+h+'.',1800); }
function renderOpts(){
  const el=$('artOpts'), t=ART.tool; el.textContent='';
  const add=(...a)=>a.forEach(x=>el.appendChild(x));
  if(['pencil','eraser','dither','shade','line','rect','ellipse','spray'].includes(t)){
    add(mkBtn('Pincel '+ART.size,()=>{ ART.size=ART.size%8+1; renderOpts(); artDraw(); },{title:'Tamaño del pincel, de 1 a 8 ([ y ] también lo cambian)'}),
        mkBtn(ART.round?'Redondo':'Cuadrado',()=>{ ART.round=!ART.round; renderOpts(); artDraw(); },{title:'Forma del pincel a partir de 3 píxeles'}));
    if(ART.cbrush&&(t==='pencil'||t==='eraser')) add(mkBtn('Pincel normal',()=>{ ART.cbrush=null; renderOpts(); artDraw(); },{title:'Deja de usar el pincel propio'}),
        mkBtn('Con el color principal',()=>{ ART.cbColor=!ART.cbColor; renderOpts(); },{pressed:!!ART.cbColor,title:'Pinta la forma del pincel propio con el color principal'})); }
  if(t==='gradient') add(mkBtn('Sólo sobre lo dibujado',()=>{ ART.gradOpaque=!ART.gradOpaque; renderOpts(); },{pressed:!!ART.gradOpaque,title:'Arrastra del color principal al secundario; con esto no pinta los píxeles vacíos'}));
  if(t==='wand') add(mkBtn(ART.fillAll?'Todo ese color':'Zona conectada',()=>{ ART.fillAll=!ART.fillAll; renderOpts(); },{title:'Mayúsculas + clic suma a la selección'}));
  if(t==='pencil'||t==='eraser') add(mkBtn('Píxel perfecto',()=>{ ART.pp=!ART.pp; renderOpts(); },{pressed:ART.pp,title:'Quita las esquinas en L al dibujar a mano'}));
  if(t==='rect'||t==='ellipse') add(mkBtn('Figura rellena',()=>{ ART.shapeFill=!ART.shapeFill; renderOpts(); },{pressed:ART.shapeFill}));
  if(t==='fill') add(mkBtn(ART.fillAll?'Rellenar todo ese color':'Rellenar zona conectada',()=>{ ART.fillAll=!ART.fillAll; renderOpts(); }));
  if(t==='shade') add(mkBtn(ART.shade<0?'Oscurecer':'Aclarar',()=>{ ART.shade=-ART.shade; renderOpts(); },{title:'Usa las rampas de la paleta; clic derecho hace lo contrario'}));
  add(mkBtn('Espejo horizontal',()=>{ ART.mirX=!ART.mirX; renderOpts(); artDraw(); },{pressed:ART.mirX}),
      mkBtn('Espejo vertical',()=>{ ART.mirY=!ART.mirY; renderOpts(); artDraw(); },{pressed:ART.mirY}),
      mkBtn('Cuadrícula',()=>{ ART.grid=!ART.grid; renderOpts(); artDraw(); },{pressed:ART.grid}),
      mkBtn('Papel cebolla',()=>{ ART.onion=!ART.onion; renderOpts(); artDraw(); },{pressed:ART.onion,title:'Muestra el cuadro o rebanada anterior en transparencia'}),
      sepEl());
  if(ART.sel||ART.flt||t==='select'||t==='move'||t==='wand'||t==='lasso') add(mkBtn('Copiar',artCopy),mkBtn('Pegar',artPaste),mkBtn('Borrar',artDelete),
      mkBtn('Fijar',()=>{ commitFloat(); },{disabled:!ART.flt}),mkBtn('Quitar selección',()=>{ commitFloat(); ART.sel=null; artDraw(); renderOpts(); }),
      mkBtn('Rellenar selección',fillSel,{disabled:!ART.sel}),mkBtn('Contornear selección',strokeSel,{disabled:!ART.sel}),
      mkBtn('Invertir selección',invertSel),mkBtn('Usar como pincel',brushFromSel,{disabled:!ART.sel&&!ART.flt}),sepEl());
  else add(mkBtn('Pegar',artPaste),sepEl());
  add(mkBtn('Voltear horizontal',()=>transformRegion(flipH)),mkBtn('Voltear vertical',()=>transformRegion(flipV)),mkBtn('Rotar 90°',()=>transformRegion(rot90)),
      mkBtn('Contorno',addOutline,{title:'Dibuja un borde con el color principal alrededor de lo dibujado'}),
      mkBtn('Sombra proyectada',dropShadow,{title:'Copia la silueta un píxel abajo a la derecha con el color secundario (o negro)'}),
      mkBtn('Invertir colores',()=>mapColors(c=>[255-c[0],255-c[1],255-c[2],c[3]])),
      mkBtn('Desaturar',()=>mapColors(c=>{ const v=Math.round(0.299*c[0]+0.587*c[1]+0.114*c[2]); return [v,v,v,c[3]]; })));
  if(ART.doc&&ART.doc.kind==='tile') add(mkBtn('Mosaico en el lienzo',()=>{ ART.tiled=!ART.tiled; renderOpts(); artDraw(); },{pressed:ART.tiled,title:'Muestra la casilla repetida alrededor mientras dibujas'}),
      mkBtn('Desplazar media casilla',offsetHalf,{title:'Para revisar que la textura se repita sin costuras'}));
  add(mkBtn('Limpiar capa',clearLayer));
  if(ART.doc&&ART.doc.kind==='char'){ const sz=document.createElement('select'); sz.setAttribute('aria-label','Tamaño del personaje'); sz.dataset.k='charSize';
    for(const z of Fichas.SIZES){ const o=document.createElement('option'); o.value=z.id; o.textContent=z.name; sz.appendChild(o); }
    sz.value=ART.doc.charSize||'medium'; sz.onchange=()=>resizeCharDoc(sz.value); add(sepEl(),lblEl('Tamaño'),sz,
      mkBtn('Guías de altura',()=>{ ART.guides=!ART.guides; renderOpts(); artDraw(); },{pressed:ART.guides!==false,title:'Línea de suelo y una marca por casilla de alto (5 pies)'})); }
  if(ART.doc&&ART.doc.kind==='obj') renderLightOpts(add);
}
// luz del objeto: se coloca tocando un píxel de una rebanada (la rebanada da la altura)
function renderLightOpts(add){
  const d=ART.doc, L=d.light&&typeof d.light==='object'?d.light:null;
  add(sepEl(),lblEl('Luz del objeto'),mkBtn(L?'Da luz':'Sin luz',()=>{ d.light=L?false:defaultObjLight(d); ART.dirty=true; $('artLight').checked=!!d.light; renderOpts(); artDraw(); },{pressed:!!L}));
  if(!L) return;
  add(mkBtn('Colocar la luz',()=>setTool('lightpos'),{pressed:ART.tool==='lightpos',title:'Toca un píxel: la luz sale de ahí, a la altura de la rebanada en la que estás'}),
      lblEl('rebanada '+(L.s+1)+', píxel '+L.px+','+L.py),
      mkBtn('Radio '+L.r*5+' pies',()=>{ L.r=L.r%12+1; ART.dirty=true; renderOpts(); },{title:'Hasta dónde alcanza (5 a 60 pies)'}),
      mkBtn(L.f?'Parpadea':'Luz fija',()=>{ L.f=L.f?0:1; ART.dirty=true; renderOpts(); }),
      mkBtn('Tipo: '+(LIGHT_TYPES[L.preset]?LIGHT_TYPES[L.preset].name:'a medida'),()=>{ const ids=['',...OBJ_LIGHT_IDS], k=(ids.indexOf(L.preset||'')+1)%ids.length, T=LIGHT_TYPES[ids[k]];
        if(T){ L.preset=ids[k]; L.c=T.color; L.f=T.anim==='none'?0:1; } else delete L.preset; ART.dirty=true; renderOpts(); artDraw(); },{title:'Tipo de luz (como en Just Another VTT): da el color, la intensidad y la animación'}));
  const ci=document.createElement('input'); ci.type='color'; ci.className='t3d-colorIn'; ci.value=L.c; ci.title='Color de la luz'; ci.setAttribute('aria-label','Color de la luz');
  ci.oninput=()=>{ L.c=ci.value.toLowerCase(); ART.dirty=true; artDraw(); }; add(ci);
}
function defaultObjLight(d){ const mid=Math.floor((d.w-1)/2); return {px:mid,py:mid,s:Math.min(d.frames.length-1,Math.max(0,ART.frame)),r:6,c:WARM,f:1}; }
function placeLight(p){ const d=ART.doc; if(d.kind!=='obj') return; if(p.x<0||p.y<0||p.x>=d.w||p.y>=d.h) return;
  const L=d.light&&typeof d.light==='object'?d.light:defaultObjLight(d);
  L.px=p.x; L.py=p.y; L.s=ART.frame; d.light=L; ART.dirty=true; $('artLight').checked=true; renderOpts(); artDraw();
  showHint('Luz en la rebanada '+(L.s+1)+'. Pruébala con «Probar en el tablero».',1800); }
function invertSel(){ const d=ART.doc; commitFloat(); const m=selToMask(); if(!ART.sel) m.fill(0); for(let i=0;i<m.length;i++) m[i]=m[i]?0:1; ART.sel=maskSel(m,d.w,d.h); renderOpts(); artDraw(); }
function mapColors(fn){ commitFloat(); pushCel(); const d=ART.doc, buf=curBuf();
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ const o=(y*d.w+x)*4; if(!buf[o+3]||!inSel(x,y)) continue; const c=fn([buf[o],buf[o+1],buf[o+2],buf[o+3]]); buf[o]=c[0]; buf[o+1]=c[1]; buf[o+2]=c[2]; buf[o+3]=c[3]; }
  changed(false); }
function dropShadow(){ commitFloat(); pushCel(); const d=ART.doc, buf=curBuf(), src=buf.slice(), c=ART.sec[3]?ART.sec:[20,16,28,255];
  for(let y=d.h-1;y>=1;y--) for(let x=d.w-1;x>=1;x--){ const o=(y*d.w+x)*4, s2=((y-1)*d.w+x-1)*4; if(!src[o+3]&&src[s2+3]&&inSel(x,y)) setRaw(buf,x,y,c); }
  changed(false); }
function swatch(hex,onPick,opt={}){
  const b=document.createElement('button'); b.className='t3d-swc'+(hex?'':' t3d-tr'); if(hex) b.style.background=hex; b.title=opt.title||hex||'Transparente';
  const c=hex?fromHex(hex):[0,0,0,0]; const eq=(a,q)=>a[0]===q[0]&&a[1]===q[1]&&a[2]===q[2]&&a[3]===q[3];
  b.setAttribute('aria-pressed',String(eq(ART.prim,c))); b.setAttribute('aria-label',hex?('Color '+hex):'Transparente');
  let timer=0, long=false;
  b.addEventListener('pointerdown',e=>{ long=false; if(e.pointerType!=='mouse') timer=setTimeout(()=>{ long=true; ART.sec=c; renderPal(); showHint('Color secundario elegido.',900); },450); });
  b.addEventListener('pointerup',()=>clearTimeout(timer)); b.addEventListener('pointerleave',()=>clearTimeout(timer));
  b.addEventListener('contextmenu',e=>{ e.preventDefault(); ART.sec=c; renderPal(); });
  b.onclick=()=>{ if(long) return; onPick?onPick(c):(ART.prim=c); renderPal(); };
  return b;
}
function renderPal(){
  if(ART.doc) renderTools();
  const el=$('artPal'); el.textContent='';
  const cur=document.createElement('div'); cur.className='t3d-ramp';
  const p=document.createElement('button'); p.className='t3d-big'+(ART.prim[3]?'':' t3d-tr'); if(ART.prim[3]) p.style.background=toHex(ART.prim); p.title='Color principal: toca para intercambiar con el secundario';
  const q=document.createElement('button'); q.className='t3d-big'+(ART.sec[3]?'':' t3d-tr'); if(ART.sec[3]) q.style.background=toHex(ART.sec); q.title='Color secundario (clic derecho o mantener pulsado un color)';
  p.onclick=q.onclick=()=>{ [ART.prim,ART.sec]=[ART.sec,ART.prim]; renderPal(); };
  cur.append(p,q); el.appendChild(cur); el.appendChild(swatch(null));
  // código hexadecimal del color principal
  const hx=document.createElement('input'); hx.type='text'; hx.className='t3d-hexIn'; hx.maxLength=7; hx.value=ART.prim[3]?toHex(ART.prim):''; hx.placeholder='#rrggbb'; hx.setAttribute('aria-label','Código del color principal');
  hx.onchange=()=>{ let v=hx.value.trim().toLowerCase(); if(!v.startsWith('#')) v='#'+v; if(/^#[0-9a-f]{3}$/.test(v)) v='#'+v[1]+v[1]+v[2]+v[2]+v[3]+v[3];
    if(/^#[0-9a-f]{6}$/.test(v)){ ART.prim=fromHex(v); renderPal(); } else { hx.value=ART.prim[3]?toHex(ART.prim):''; showHint('Escribe un color como #a33b3b.',1600); } };
  el.appendChild(hx);
  if(ART.recent&&ART.recent.length){ el.appendChild(lblEl('Recientes')); const rg=document.createElement('div'); rg.className='t3d-ramp'; ART.recent.forEach(h=>rg.appendChild(swatch(h))); el.appendChild(rg); }
  if(ART.prim[3]){ el.appendChild(lblEl('Rampa del color (con cambio de tono)')); const hr=document.createElement('div'); hr.className='t3d-ramp';
    hueRamp(ART.prim).forEach(h=>hr.appendChild(swatch(h,c=>{ ART.prim=c; },{title:h+' (Mayúsculas + clic la añade a tus colores)'}))); el.appendChild(hr);
    el.appendChild(mkBtn('Añadir rampa a tus colores',()=>{ hueRamp(ART.prim).forEach(h=>{ if(!ART.custom.includes(h)) ART.custom.push(h); }); ART.custom=ART.custom.slice(-40); saveCustomCols(); buildShade(); renderPal(); },{title:'Así el sombreado usa esta rampa'})); }
  if(ART.doc){ const data=compCanvas(ART.frame).getContext('2d').getImageData(0,0,ART.doc.w,ART.doc.h).data, used=new Set();
    for(let o=0;o<data.length&&used.size<32;o+=4) if(data[o+3]) used.add(toHex([data[o],data[o+1],data[o+2]]));
    if(used.size){ el.appendChild(lblEl('En este cuadro')); const ug=document.createElement('div'); ug.className='t3d-ramp'; used.forEach(h=>ug.appendChild(swatch(h))); el.appendChild(ug); el.appendChild(sepEl()); } }
  for(const rp of PAL_RAMPS){ const g=document.createElement('div'); g.className='t3d-ramp'; rp.forEach(h=>g.appendChild(swatch(h))); el.appendChild(g); }
  el.appendChild(sepEl()); el.appendChild(lblEl('Tus colores'));
  const cg=document.createElement('div'); cg.className='t3d-ramp';
  ART.custom.forEach((h,i)=>cg.appendChild(swatch(h,c=>{ if(ART.delCol){ ART.custom.splice(i,1); saveCustomCols(); buildShade(); } else ART.prim=c; })));
  el.appendChild(cg);
  const inp=document.createElement('input'); inp.type='color'; inp.value=toHex(ART.prim[3]?ART.prim:[128,128,128,255]); inp.style.cssText='width:0;height:0;opacity:0;position:absolute';
  inp.onchange=()=>{ const h=inp.value.toLowerCase(); if(!ART.custom.includes(h)){ ART.custom.push(h); if(ART.custom.length>40) ART.custom.shift(); saveCustomCols(); buildShade(); } ART.prim=fromHex(h); renderPal(); };
  el.append(inp, mkBtn('Añadir color',()=>inp.click()), mkBtn('Quitar colores',()=>{ ART.delCol=!ART.delCol; renderPal(); if(ART.delCol) showHint('Toca uno de tus colores para quitarlo.',1600); },{pressed:ART.delCol}),
    sepEl(), mkBtn('Importar paleta',()=>$('artPalFile').click(),{title:'Lista de colores hex, archivo .hex o .gpl (GIMP, Aseprite, Lospec) o una imagen'}),
    mkBtn('Sacar paleta del dibujo',()=>{ const d=ART.doc; if(!d) return; const set=new Set(); d.frames.forEach((fr,f)=>{ const px=composeDoc(d,f); for(let o=0;o<px.length&&set.size<64;o+=4) if(px[o+3]) set.add(toHex([px[o],px[o+1],px[o+2]])); });
      usePalette([...set],'Del dibujo'); }));
}
// rampa de 7 tonos: las sombras giran hacia el azul y las luces hacia el amarillo, como en el pixel art clásico
function hueRamp(c){ const [h,s2,l]=rgb2hsl(c[0],c[1],c[2]), out=[];
  for(let i=-3;i<=3;i++){ const t=i/3, tgt=i<0?0.66:0.16; let dh=((tgt-h+1.5)%1)-0.5; const nh=(h+dh*Math.abs(t)*0.12+1)%1;
    const nl=Math.max(0.04,Math.min(0.96,l+t*(i<0?l*0.8:(1-l)*0.8))), ns=Math.max(0,Math.min(1,s2*(i>0?1-t*0.25:1+Math.abs(t)*0.1)));
    out.push(toHex(hsl2rgb(nh,ns,nl))); }
  return [...new Set(out)]; }
function noteRecent(c){ if(!c||!c[3]) return; const h=toHex(c); ART.recent=[h,...(ART.recent||[]).filter(x=>x!==h)].slice(0,12); }
// paleta importada o sacada del dibujo: se añade como paleta base «Importada»
function usePalette(cols,label){ cols=[...new Set(cols.map(h=>h.toLowerCase()).filter(h=>/^#[0-9a-f]{6}$/.test(h)))].slice(0,64);
  if(!cols.length) return showHint('No se encontraron colores en ese archivo.',1800);
  PRESETS.imported=[byLum(cols)]; const sel=$('artPreset'); let o=[...sel.options].find(x=>x.value==='imported');
  if(!o){ o=document.createElement('option'); o.value='imported'; sel.appendChild(o); } o.textContent=label+' ('+cols.length+' colores)'; sel.value='imported';
  PAL_RAMPS=PRESETS.imported; buildShade(); renderPal(); showHint('Paleta de '+cols.length+' colores lista.',1800); }
function parsePalette(text){ const out=[];
  for(const line of String(text).split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')&&!/^#[0-9a-f]{6}\b/i.test(t)||/^(GIMP|Name|Columns)/i.test(t)) continue;
    const m=t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/); if(m){ out.push(toHex([+m[1],+m[2],+m[3]].map(v=>Math.min(255,v)))); continue; }
    for(const h of t.matchAll(/#?\b([0-9a-f]{6})\b/gi)) out.push('#'+h[1]); }
  return out; }
$('artPalFile').onchange=async()=>{ const f=$('artPalFile').files[0]; $('artPalFile').value=''; if(!f) return;
  if(f.type.startsWith('image/')){ const img=new Image(); img.src=URL.createObjectURL(f); try{ await img.decode(); }catch(e){ return showHint('No se pudo leer la imagen.',1600); }
    const c=mkCanvas(Math.min(256,img.width),Math.min(256,img.height)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(img.src);
    const px=c.getContext('2d').getImageData(0,0,c.width,c.height).data, cnt=new Map();
    for(let o=0;o<px.length;o+=4) if(px[o+3]>128){ const h=toHex([px[o],px[o+1],px[o+2]]); cnt.set(h,(cnt.get(h)||0)+1); }
    return usePalette([...cnt.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]),f.name.replace(/\.[^.]+$/,'').slice(0,20)); }
  usePalette(parsePalette(await f.text()),f.name.replace(/\.[^.]+$/,'').slice(0,20)); };
function thumbFor(f){ const c=document.createElement('canvas'), src=compCanvas(f); c.width=src.width; c.height=src.height; c.getContext('2d').drawImage(src,0,0); return c; }
function updateThumb(f){ const b=ART.thumbs[f]; if(!b) return; const old=b.querySelector('canvas'); const n=thumbFor(f); old.replaceWith(n); }
function renderFrames(){
  const el=$('artFrames'), d=ART.doc; el.textContent=''; ART.thumbs=[];
  const fixed=d.kind!=='obj';
  el.appendChild(lblEl(d.kind==='obj'?'Rebanadas (la 1 es la base)':(d.kind==='char'?'Vistas':'Cuadros')));
  d.frames.forEach((fr,f)=>{ const b=document.createElement('button'); b.className='t3d-fr'; b.setAttribute('aria-pressed',String(f===ART.frame)); b.appendChild(thumbFor(f));
    const sp=document.createElement('span'); sp.textContent=d.kind==='obj'?String(f+1):fr.name; b.appendChild(sp);
    b.onclick=()=>{ commitFloat(); ART.frame=f; renderFrames(); renderLayers(); artDraw(); artInfo(); }; ART.thumbs[f]=b; el.appendChild(b); });
  if(d.kind==='tile'&&d.frames.length>1) el.append(sepEl(),mkBtn(ART.play?'Pausar':'Animar',()=>{ ART.play=!ART.play; renderFrames(); },{pressed:ART.play}),
    mkBtn(ART.fps+' c/s',()=>{ ART.fps=ART.fps>=12?2:ART.fps+2; renderFrames(); },{title:'Cuadros por segundo de la vista previa (el tablero anima a 4)'}));
  if(!fixed){
    const maxS=d.res*4;
    el.append(sepEl(),
      mkBtn('Añadir',()=>{ if(d.frames.length>=maxS) return showHint('Máximo de rebanadas alcanzado.',1400); commitFloat(); pushDoc(); d.frames.splice(ART.frame+1,0,{name:'',cels:d.layers.map(()=>emptyCel(d))}); ART.frame++; renameSlices(); changed(true); }),
      mkBtn('Duplicar',()=>{ if(d.frames.length>=maxS) return showHint('Máximo de rebanadas alcanzado.',1400); commitFloat(); pushDoc(); d.frames.splice(ART.frame+1,0,{name:'',cels:d.frames[ART.frame].cels.map(c=>c.slice())}); ART.frame++; renameSlices(); changed(true); }),
      mkBtn('Borrar',()=>{ if(d.frames.length<=1) return; commitFloat(); pushDoc(); d.frames.splice(ART.frame,1); ART.frame=Math.min(ART.frame,d.frames.length-1); renameSlices(); changed(true); }),
      mkBtn('Bajar',()=>{ if(ART.frame<=0) return; pushDoc(); const f=ART.frame; [d.frames[f-1],d.frames[f]]=[d.frames[f],d.frames[f-1]]; ART.frame--; renameSlices(); changed(true); }),
      mkBtn('Subir',()=>{ if(ART.frame>=d.frames.length-1) return; pushDoc(); const f=ART.frame; [d.frames[f+1],d.frames[f]]=[d.frames[f],d.frames[f+1]]; ART.frame++; renameSlices(); changed(true); }));
  }
  const cur=ART.thumbs[ART.frame]; if(cur) cur.scrollIntoView({block:'nearest',inline:'nearest'});
}
function renameSlices(){ const d=ART.doc; if(d.kind==='obj') d.frames.forEach((fr,i)=>fr.name='Rebanada '+(i+1)); }
function renderLayers(){
  const el=$('artLayers'), d=ART.doc; el.textContent=''; el.appendChild(lblEl('Capas'));
  for(let li=d.layers.length-1;li>=0;li--){ const ly=d.layers[li];
    el.appendChild(mkBtn((ly.vis?'':'(oculta) ')+(ly.lock?'🔒 ':'')+ly.name+((ly.op??100)<100?' · '+ly.op+'%':''),()=>{ commitFloat(); ART.layer=li; renderLayers(); },{pressed:li===ART.layer})); }
  const cur=d.layers[ART.layer];
  const nm=document.createElement('input'); nm.type='text'; nm.maxLength=20; nm.value=cur.name; nm.className='t3d-layerName'; nm.setAttribute('aria-label','Nombre de la capa');
  nm.onchange=()=>{ cur.name=nm.value.trim().slice(0,20)||cur.name; ART.dirty=true; renderLayers(); };
  const op=document.createElement('input'); op.type='range'; op.min='0'; op.max='100'; op.step='5'; op.value=String(cur.op??100); op.title='Opacidad de la capa'; op.setAttribute('aria-label','Opacidad de la capa');
  op.oninput=()=>{ cur.op=+op.value; ART.cache.clear(); ART.dirty=true; artDraw(); }; op.onchange=()=>renderLayers();
  el.append(sepEl(),nm,op,mkBtn(cur.lock?'Desbloquear':'Bloquear',()=>{ cur.lock=!cur.lock; ART.dirty=true; renderLayers(); },{pressed:!!cur.lock,title:'Una capa bloqueada no se puede pintar'}),
    mkBtn('Nueva capa',()=>{ if(d.layers.length>=8) return showHint('Máximo 8 capas.',1200); commitFloat(); pushDoc(); const li=ART.layer+1; d.layers.splice(li,0,{name:'Capa '+(d.layers.length+1),vis:true,op:100,lock:false}); d.frames.forEach(fr=>fr.cels.splice(li,0,emptyCel(d))); ART.layer=li; changed(true); }),
    mkBtn('Borrar capa',()=>{ if(d.layers.length<=1) return; commitFloat(); pushDoc(); d.layers.splice(ART.layer,1); d.frames.forEach(fr=>fr.cels.splice(ART.layer,1)); ART.layer=Math.max(0,ART.layer-1); changed(true); }),
    mkBtn(d.layers[ART.layer].vis?'Ocultar':'Mostrar',()=>{ d.layers[ART.layer].vis=!d.layers[ART.layer].vis; changed(true); }),
    mkBtn('Subir capa',()=>{ const l=ART.layer; if(l>=d.layers.length-1) return; pushDoc(); [d.layers[l],d.layers[l+1]]=[d.layers[l+1],d.layers[l]]; d.frames.forEach(fr=>{ [fr.cels[l],fr.cels[l+1]]=[fr.cels[l+1],fr.cels[l]]; }); ART.layer++; changed(true); }),
    mkBtn('Bajar capa',()=>{ const l=ART.layer; if(l<=0) return; pushDoc(); [d.layers[l],d.layers[l-1]]=[d.layers[l-1],d.layers[l]]; d.frames.forEach(fr=>{ [fr.cels[l],fr.cels[l-1]]=[fr.cels[l-1],fr.cels[l]]; }); ART.layer--; changed(true); }),
    mkBtn('Unir con la de abajo',()=>{ const l=ART.layer; if(l<=0) return; commitFloat(); pushDoc();
      d.frames.forEach(fr=>{ const lo=fr.cels[l-1], hi=fr.cels[l], m=lo.slice(); for(let o=0;o<m.length;o+=4) if(hi[o+3]){ m[o]=hi[o]; m[o+1]=hi[o+1]; m[o+2]=hi[o+2]; m[o+3]=hi[o+3]; } fr.cels.splice(l-1,2,m); });
      d.layers.splice(l,1); ART.layer=l-1; changed(true); }));
}

/* ---- vista previa ---- */
function artPreview(t){
  const d=ART.doc; if(!d) return;
  const Wp=apv.width, Hp=apv.height; apx.setTransform(1,0,0,1,0,0); apx.imageSmoothingEnabled=false;
  apx.fillStyle=ENV.ambient<0.4?'#1b1630':'#8fb3c2'; apx.fillRect(0,0,Wp,Hp);
  let cap='';
  if(d.kind==='tile'){
    const f=d.frames.length>1&&ART.play?Math.floor(t*ART.fps)%d.frames.length:ART.frame, cv=compCanvas(f);
    const n=3, s=Math.max(0.25,Math.min(Wp,Hp)/(n*d.w)), tw=d.w*s, ox=(Wp-tw*n)/2, oy=(Hp-tw*n)/2;
    for(let j=0;j<n;j++) for(let i=0;i<n;i++) apx.drawImage(cv,Math.round(ox+i*tw),Math.round(oy+j*tw),Math.ceil(tw),Math.ceil(tw));
    cap=d.frames.length>1&&ART.play?'Animación a '+ART.fps+' cuadros por segundo':'Mosaico 3×3: revisa que no se vean costuras';
  } else if(d.kind==='char'){
    const s=Math.max(0.25,Math.min((Wp-10)/(4*d.w+15),(Hp-10)/d.h)), w=d.w*s, h=d.h*s, gap=(Wp-4*w)/5, y=(Hp-h)/2;
    const order=[[0,false],[2,false],[1,false],[2,true]];
    order.forEach(([f,mir],k)=>{ const x=gap+k*(w+gap); apx.save(); if(mir){ apx.translate(x+w,y); apx.scale(-1,1); apx.drawImage(compCanvas(f),0,0,w,h); } else apx.drawImage(compCanvas(f),x,y,w,h); apx.restore(); });
    cap='Frente, perfil, espalda y el otro perfil (espejo)';
  } else {
    const ang=ART.spin?t*0.8:ART.angle, n=d.frames.length;
    const s=Math.max(0.2,Math.min(Wp/(d.w*1.5),(Hp-8)/(d.w*1.5*SIN_E+n*COS_E)));
    const base=Hp-d.w*0.75*SIN_E*s-4;
    for(let f=0;f<n;f++){ apx.save(); apx.translate(Wp/2,base-f*COS_E*s); apx.scale(s,s*SIN_E); apx.rotate(ang); apx.drawImage(compCanvas(f),-d.w/2,-d.h/2);
      if(f===ART.frame&&n>1){ apx.strokeStyle='rgba(255,211,90,0.9)'; apx.lineWidth=1/s; apx.strokeRect(-d.w/2,-d.h/2,d.w,d.h); }
      const L=d.light&&typeof d.light==='object'?d.light:null;
      if(L&&f===Math.min(L.s,n-1)){ const g=apx.createRadialGradient(L.px+.5-d.w/2,L.py+.5-d.h/2,0,L.px+.5-d.w/2,L.py+.5-d.h/2,Math.max(2,d.w*0.3));
        g.addColorStop(0,L.c+'ee'); g.addColorStop(1,L.c+'00'); apx.fillStyle=g; apx.fillRect(-d.w/2,-d.h/2,d.w,d.h); }
      apx.restore(); }
    cap=ART.spin?'Arrastra para girar; doble toque para girar solo':'Doble toque para volver a girar solo';
  }
  if($('artPrevCap').textContent!==cap) $('artPrevCap').textContent=cap;
}

/* ---- documento desde el arte actual ---- */
function tileSource16(target){
  if(target==='water:top') return [16,17,18,19]; if(target==='water:fall') return [36];
  if(target==='l:top') return [37,38,39,40]; if(ROOF_KEY[target]!=null) return [ROOF_KEY[target]];
  const [t,face]=target.split(':'); return [face==='top'?ORIG_TERR[t].top[0]:ORIG_TERR[t].side[0]];
}
function tileCanvas16(i){ const c=mkCanvas(16,16); c.getContext('2d').drawImage(atlas,(i%AC)*16,((i/AC)|0)*16,16,16,0,0,16,16); return c; }
function docFromCurrent(kind,target,res,fp,ht,size){
  const k=res/16;
  if(kind==='tile'){
    const d=newDoc(kind,target,res), cu=CUSTOM.tiles[target];
    d.frames.forEach((fr,f)=>loadCanvasInto(d,f,cu?cu.canvases[f%cu.canvases.length]:upscale(tileCanvas16(tileSource16(target)[f]),k,true)));
    return d;
  }
  if(kind==='char'){
    const key=target==='new'?'knight':target, cu=CUSTOM.chars[key], d=newDoc(kind,target,res,0,0,size||artSizeId(key));
    // el arte actual a la resolución del dibujo, sin cambiar el tamaño de su texel, en el lienzo del tamaño elegido
    const src=cu?cu.canvases.map(c=>fitTo(c,Math.max(1,Math.round(c.width*res/(cu.res||32))),Math.max(1,Math.round(c.height*res/(cu.res||32))))):[CAN[key].front,CAN[key].back,CAN[key].right].map(c=>upscale(c,k,false));
    src.forEach((c,f)=>{ d.frames[f].cels[0]=placeCharCel(c,d.w,d.h); }); if(target==='new') d.name='Personaje'; return d;
  }
  if(target==='new') return newDoc(kind,target,res,fp,ht);
  const cu=CUSTOM.objs[target];
  let slices;
  if(cu) slices=cu.slices;
  else slices=factorySlices(target,k);
  const d={key:null,kind,target,res,w:slices[0].width,h:slices[0].width,light:cu?(cu.light||false):factoryLight(target,res,slices[0].width),name:OBJ_TARGETS.find(t=>t[0]===target)?OBJ_TARGETS.find(t=>t[0]===target)[1]:targetName(kind,target),layers:[{name:'Capa 1',vis:true,op:100,lock:false}],frames:[]};
  slices.forEach((c,i)=>{ d.frames.push({name:'Rebanada '+(i+1),cels:[new Uint8ClampedArray(c.getContext('2d').getImageData(0,0,d.w,d.h).data)]}); });
  return d;
}

// rebanadas del arte de fábrica de un objeto, a la resolución k (texeles por texel base)
function sheetSlices(c,cols,N,H){ const out=[]; for(let sl=0;sl<H;sl++){ const cv=mkCanvas(N,N); cv.getContext('2d').drawImage(c,(sl%cols)*N,Math.floor(sl/cols)*N,N,N,0,0,N,N); out.push(cv); } return out; }
function factorySlices(target,k){
  if(/^tree[012]$/.test(target)){ const v=+target.slice(4), st=stackTree(['round','round','pine'][v],[5,17,29][v],k), out=sheetSlices(st.c,st.cols,st.N,st.H); st.tex.dispose(); st.geo.dispose(); return out; }
  if(target==='brazier'){ const N=12*k, H=19*k, coal=hexRGB('#c2412b'), f1=hexRGB('#fff0b8'), f2=hexRGB('#ffc14a'), f3=hexRGB('#f07a2a'), r=mulberry32(40);
    const {c,cols}=paintStack(N,H,k,(dx,dz,s)=>{ const dh=Math.hypot(dx,dz), ax=Math.abs(dx), az=Math.abs(dz);
      if(s<5.5) return (ax>=3.2&&ax<=4.8&&az>=3.2&&az<=4.8)?Srgb[1]:null;
      if(s<8.5){ const R=s<6.5?4.2:5.4; if(dh>R) return null; return s>=7.5?(dh>4.2?Srgb[4]:coal):(dx+dz<0?Srgb[3]:Srgb[2]); }
      const t=(s-9)/10, R=3.6*(1-t)+Math.sin(Math.atan2(dz,dx)*3+s)*0.6+(r()-0.5)*0.6; if(R<=0.3||dh>R) return null;
      const q=dh/R; return (q<0.35&&t<0.6)?f1:(q<0.7?f2:f3); });
    return sheetSlices(c,cols,N,H); }
  const P=PROP3D[target], N=P.N*k, H=P.H*k, {c,cols}=paintStack(N,H,k,propFn(P)); return sheetSlices(c,cols,N,H);
}
// luz de fábrica del objeto (brasero, farol, antorcha) en píxeles y rebanadas del dibujo
function factoryLight(target,res,w){
  const mid=Math.floor((w-1)/2);
  if(target==='brazier') return {px:mid,py:mid,s:Math.round(0.8*res),r:6,c:WARM,f:1};
  const P=PROP3D[target]; if(P&&P.light) return {px:mid,py:mid,s:Math.round((P.lightS||16)/16*res),r:P.light,c:WARM,f:1};
  return false;
}

/* ---- abrir, crear, probar y guardar ---- */
function syncArtForm(){
  const k=$('artKind').value, sel=$('artTarget'), cur=sel.value; sel.textContent='';
  for(const [v,n] of artTargets(k)){ const o=document.createElement('option'); o.value=v; o.textContent=n; sel.appendChild(o); }
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
  const obj=k==='obj'; $('artFp').hidden=!obj||sel.value!=='new'; $('artHt').hidden=!obj||sel.value!=='new'; $('artLightL').hidden=!obj;
  $('charSizeL').hidden=k!=='char'; if(k==='char'&&sel.value!==ART.sizeFor){ ART.sizeFor=sel.value; $('artCharSize').value=sel.value==='new'?'medium':artSizeId(sel.value); }
}
$('artKind').onchange=syncArtForm; $('artTarget').onchange=syncArtForm;
for(const z of Fichas.SIZES){ const o=document.createElement('option'); o.value=z.id; o.textContent=z.name+' ('+z.art[0]+'×'+z.art[1]+' a 16 por casilla'+(z.size>1?', '+z.size+'×'+z.size+' casillas':'')+')'; $('artCharSize').appendChild(o); }
function setDoc(d){ $('artNewDlg').hidden=true; ART.doc=d; ART.frame=0; ART.layer=0; ART.sel=null; ART.flt=null; ART.undo=[]; ART.redo=[]; ART.cache.clear(); ART.dirty=false;
  $('artKind').value=d.kind; syncArtForm(); $('artTarget').value=d.target; $('artRes').value=String(d.res); $('artName').value=d.name; $('artLight').checked=!!d.light; ART.sizeFor=d.target; syncArtForm(); if(d.kind==='char') $('artCharSize').value=d.charSize||'medium';
  const r=d.kind==='char'?1.5:1, big=d.kind==='obj'?Math.max(1,d.frames.length/d.w):1; apv.width=d.kind==='char'?260:200; apv.height=Math.round(d.kind==='char'?150:Math.min(260,170*(d.kind==='obj'?Math.max(1,big*0.8):r)));
  renderTools(); renderOpts(); renderPal(); renderFrames(); renderLayers(); renderAdjust(); docInfo(); artFit(); artInfo(); }
function formArgs(){ return [$('artKind').value,$('artTarget').value,+$('artRes').value,+$('artFp').value,+$('artHt').value,$('artCharSize').value]; }
function confirmLose(btn,fn){ if(!ART.dirty||btn.dataset.armed==='1'){ btn.dataset.armed=''; fn(); return; } btn.dataset.armed='1'; const t=btn.textContent; btn.textContent='¿Descartar cambios?'; setTimeout(()=>{ btn.dataset.armed=''; btn.textContent=t; },2500); }
$('artNew').onclick=()=>confirmLose($('artNew'),()=>setDoc(newDoc(...formArgs())));
$('artFrom').onclick=()=>confirmLose($('artFrom'),()=>setDoc(docFromCurrent(...formArgs())));
$('artName').addEventListener('input',()=>{ if(ART.doc){ ART.doc.name=$('artName').value.trim()||ART.doc.name; ART.dirty=true; } });
$('artLight').onchange=()=>{ const d=ART.doc; if(!d) return; d.light=$('artLight').checked?(d.kind==='obj'?(typeof d.light==='object'&&d.light?d.light:defaultObjLight(d)):true):false; ART.dirty=true; renderOpts(); artDraw(); };
function openArt(){ ART.open=true; artEl.hidden=false; $('backToArt').hidden=true; $('sheet').hidden=true;
  if(!ART.doc){ $('artKind').value='tile'; syncArtForm(); $('artRes').value=String(TEX); setDoc(docFromCurrent('tile','g:top',TEX)); restoreDraft(); }
  else { artResize(); artFit(); }
  artResize(); }
function closeArt(){ commitFloat(); ART.open=false; artEl.hidden=true; layout(); }
$('artOpen').onclick=openArt; $('artClose').onclick=closeArt; $('backToArt').onclick=openArt;
on(window,'resize',()=>{ if(ART.open) artResize(); });
function assetKey(d){ if(d.key) return d.key;
  if(d.kind==='tile') return d.target;
  if(d.target!=='new') return d.target;
  return (d.kind==='char'?'c_':'o_')+Date.now().toString(36).slice(-6)+Math.random().toString(36).slice(2,6); }
function registerDoc(d){
  const comps=docComposites(d);
  if(d.kind==='tile') CUSTOM.tiles[d.key]={name:d.name,res:d.res,canvases:comps};
  else if(d.kind==='char') CUSTOM.chars[d.key]={name:d.name,res:d.res,size:d.charSize||'medium',canvases:comps};
  else CUSTOM.objs[d.key]={name:d.name,res:d.res,slices:comps,light:d.light?(typeof d.light==='object'?{...d.light}:true):false};
}
function applyCustom(kind){
  if(kind==='tile'){ const old=atlasTex; atlasCanvas=composeAtlas(); atlasTex=tex(atlasCanvas); uniforms.uMap.value=atlasTex; old.dispose(); if(M){ rebuild(); buildDecor(); buildRoofs(); } }
  else { if(M) syncMinis(); buildArt(); applyArtMaps(); if(M){ refreshEntities(); rebuild(); buildDecor(); } }
  renderPalette();
}
$('artTry').onclick=()=>{ commitFloat(); const d=ART.doc; d.key=assetKey(d); registerDoc(d); applyCustom(d.kind);
  if(d.kind==='char'&&d.key.startsWith('c_')){ state.miniKind=d.key; } if(d.kind==='obj'&&d.key.startsWith('o_')){ state.propSel=propOpts().findIndex(o=>o.custom===d.key); }
  closeArt(); $('backToArt').hidden=false;
  showHint(d.kind==='tile'?'Aplicado al tablero (sin guardar).':'Aplicado. Colócalo desde Editar, en '+(d.kind==='char'?'Personajes':'Objetos')+'.',2600); };

/* ---- biblioteca: guardado como hojas PNG por capa ---- */
const LSA='tablero:assets';
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}')||{}; }catch(e){ return {}; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
async function assetList(){
  if(DB){ try{ const q=await DB.collection('assets').orderBy('updated','desc').limit(120).get(); return q.docs.map(x=>({id:x.id,...x.data()})); }catch(e){} }
  return Object.entries(lsGet(LSA)).map(([id,o])=>({id,...o})).sort((a,b)=>(b.updated||0)-(a.updated||0));
}
async function assetPut(id,rec){
  if(DB){ try{ await DB.collection('assets').doc(id).set(rec); return 'db'; }catch(e){ if(e&&(e.code==='quota_exceeded'||e.code==='invalid_argument')) throw e; } }
  const all=lsGet(LSA); all[id]=rec; if(!lsSet(LSA,all)) throw {code:'local'}; return 'local';
}
async function assetDel(id){ if(DB){ try{ await DB.collection('assets').doc(id).delete(); }catch(e){} } const all=lsGet(LSA); if(all[id]){ delete all[id]; lsSet(LSA,all); } }
function docToRecord(d){
  const cols=Math.max(1,Math.min(d.frames.length,Math.floor(4096/d.w))), rows=Math.ceil(d.frames.length/cols);
  const layers=d.layers.map((ly,li)=>{ const c=mkCanvas(cols*d.w,rows*d.h), x=c.getContext('2d');
    d.frames.forEach((fr,f)=>x.putImageData(new ImageData(fr.cels[li].slice(),d.w,d.h),(f%cols)*d.w,Math.floor(f/cols)*d.h));
    return {name:ly.name,vis:ly.vis,op:ly.op??100,lock:!!ly.lock,sheet:c.toDataURL('image/png')}; });
  const L=d.kind==='obj'&&d.light&&typeof d.light==='object'?{px:d.light.px|0,py:d.light.py|0,s:d.light.s|0,r:d.light.r|0,c:d.light.c,f:d.light.f?1:0,...(OBJ_LIGHT_IDS.includes(d.light.preset)?{preset:d.light.preset}:{})}:null;
  return {key:d.key,kind:d.kind,target:d.target,name:d.name,res:d.res,w:d.w,h:d.h,...(d.kind==='char'?{charSize:d.charSize||'medium'}:{}),light:!!d.light,lightSpec:L,count:d.frames.length,cols,
    frameNames:d.frames.map(f=>f.name),layers,updated:Date.now()};
}
const KEY_OK=k=>typeof k==='string'&&(TILE_TARGETS.some(t=>t[0]===k)||CHAR_TARGETS.some(t=>t[0]===k)||OBJ_TARGETS.some(t=>t[0]===k)||/^(c_[a-z0-9]{4,16}|o_[a-z0-9]{4,16})$/.test(k));
// luz guardada de un objeto: la posición se recorta al tamaño del dibujo; sin posición, luz centrada
function recLight(rec,w,h,n){ if(rec.kind!=='obj'||!rec.light) return false; const L=rec.lightSpec, mid=Math.floor((w-1)/2);
  if(!L||typeof L!=='object') return {px:mid,py:mid,s:Math.round(n*0.8)-1<0?0:Math.round(n*0.8)-1,r:6,c:WARM,f:1};
  const cl=(v,a,b,dflt)=>Number.isFinite(+v)?Math.max(a,Math.min(b,Math.round(+v))):dflt;
  return {px:cl(L.px,0,w-1,mid),py:cl(L.py,0,h-1,mid),s:cl(L.s,0,n-1,0),r:cl(L.r,1,12,6),c:/^#[0-9a-f]{6}$/i.test(L.c||'')?L.c.toLowerCase():WARM,f:L.f===0?0:1,
    ...(OBJ_LIGHT_IDS.includes(L.preset)?{preset:L.preset}:{})}; }
async function recordToDoc(rec){
  if(!rec||!['tile','char','obj'].includes(rec.kind)||!KEY_OK(rec.key)) throw new Error('bad');
  const w=rec.w|0, h=rec.h|0, n=rec.count|0, cols=rec.cols|0;
  if(w<1||h<1||w>256||h>384||n<1||n>512||cols<1||!Array.isArray(rec.layers)||!rec.layers.length||rec.layers.length>8) throw new Error('bad');
  const d={key:rec.key,kind:rec.kind,target:String(rec.target||rec.key),res:[16,32,64].includes(rec.res)?rec.res:32,w,h,light:recLight(rec,w,h,n),name:String(rec.name||'Dibujo').slice(0,30),layers:[],frames:[]};
  if(d.kind==='char') d.charSize=Fichas.SIZE_IDS.includes(rec.charSize)?rec.charSize:'medium';   // los de antes: Mediano
  for(let f=0;f<n;f++) d.frames.push({name:(Array.isArray(rec.frameNames)&&typeof rec.frameNames[f]==='string')?rec.frameNames[f].slice(0,20):('Cuadro '+(f+1)),cels:[]});
  for(const ly of rec.layers){
    if(typeof ly.sheet!=='string'||!ly.sheet.startsWith('data:image/png')) throw new Error('bad');
    d.layers.push({name:String(ly.name||'Capa').slice(0,20),vis:ly.vis!==false,op:Number.isFinite(+ly.op)?Math.max(0,Math.min(100,Math.round(+ly.op))):100,lock:!!ly.lock});
    const img=new Image(); img.src=ly.sheet; await img.decode();
    const c=mkCanvas(img.width,img.height), x=c.getContext('2d'); x.drawImage(img,0,0);
    for(let f=0;f<n;f++) d.frames[f].cels.push(new Uint8ClampedArray(x.getImageData((f%cols)*w,Math.floor(f/cols)*h,w,h).data));
  }
  return d;
}
async function loadAllAssets(){
  let list=[]; try{ list=await assetList(); }catch(e){ return; }
  if(!list.length) return;
  const kinds=new Set();
  for(const rec of list.slice().reverse()){ try{ const d=await recordToDoc(rec); registerDoc(d); kinds.add(d.kind); }catch(e){} }
  if(kinds.has('char')||kinds.has('obj')) applyCustom('all'); else if(kinds.has('tile')) applyCustom('tile');
}
$('artSave').onclick=async()=>{
  commitFloat(); const d=ART.doc; d.key=assetKey(d); d.name=$('artName').value.trim()||d.name;
  const rec=docToRecord(d);
  try{ const where=await assetPut(d.key.replace(/[^a-zA-Z0-9_]/g,'_'),rec); ART.dirty=false; clearDraft(); registerDoc(d); applyCustom(d.kind);
    showHint('"'+d.name+'" guardado'+(where==='db'?'':' en este navegador')+' y aplicado al tablero.',2400); }
  catch(e){ showHint(e&&e.code==='quota_exceeded'?'Se llenó el almacén del tablero. Borra algo en la Biblioteca.':e&&e.message?'No se pudo guardar: '+e.message:'No se pudo guardar: el dibujo es demasiado grande o el almacenamiento no está disponible.',3600); }
};
const KIND_LABEL={tile:'Casilla',char:'Personaje',obj:'Objeto por capas'};
async function renderLib(){
  const el=$('artLibList'); el.textContent='Cargando…';
  const items=await assetList(); el.textContent='';
  if(!items.length){ const p=document.createElement('p'); p.className='empty'; p.textContent='Tu biblioteca está vacía. Dibuja algo y toca "Guardar".'; el.appendChild(p); return; }
  for(const it of items){
    const row=document.createElement('div'); row.className='item';
    const o=document.createElement('button'); o.className='t3d-open';
    const nm=document.createElement('span'); nm.textContent=it.name||'Dibujo'; o.appendChild(nm);
    const sm=document.createElement('small'); sm.textContent=(KIND_LABEL[it.kind]||'')+', '+(it.kind==='tile'?targetName('tile',it.target):(String(it.key).startsWith('c_')||String(it.key).startsWith('o_')?'nuevo':targetName(it.kind,it.target)))+', '+it.w+'×'+it.h+(it.kind==='obj'?' con '+it.count+' rebanadas':''); o.appendChild(sm);
    o.onclick=async()=>{ try{ const d=await recordToDoc(it); setDoc(d); $('artLibSheet').hidden=true; }catch(e){ showHint('Ese dibujo está dañado y no se puede abrir.'); } };
    const del=document.createElement('button'); del.textContent='Borrar';
    del.onclick=async()=>{ if(del.dataset.armed!=='1'){ del.dataset.armed='1'; del.textContent='¿Seguro?'; return; }
      await assetDel(it.id); const k=it.key;
      if(it.kind==='tile') delete CUSTOM.tiles[k]; else if(it.kind==='char') delete CUSTOM.chars[k]; else delete CUSTOM.objs[k];
      applyCustom(it.kind); renderLib(); showHint('Borrado. Se restauró el arte original donde aplicaba.',2000); };
    row.append(o,del); el.appendChild(row);
  }
}
$('artLib').onclick=()=>{ $('artLibSheet').hidden=false; libTab('mine'); };
/* ---- explorador de todo el arte: cualquier sprite del tablero se puede abrir, y el original se restaura ---- */
function artThumb(kind,key){
  if(kind==='tile'){ const cu=CUSTOM.tiles[key]; return cu?cu.canvases[0]:tileCanvas16(tileSource16(key)[0]); }
  if(kind==='char'){ const cu=CUSTOM.chars[key]; return cu?cu.canvases[0]:CAN[key].front; }
  const cu=CUSTOM.objs[key]; return stackThumb(cu?cu.slices:factorySlices(key,1));
}
const ART_GROUPS=[['tile','Casillas',TILE_TARGETS],['char','Personajes',CHAR_TARGETS],['obj','Objetos',OBJ_TARGETS]];
function renderAllArt(){
  const el=$('artAllList'); el.textContent='';
  for(const [kind,label,list] of ART_GROUPS){
    const h=document.createElement('h3'); h.textContent=label; el.appendChild(h);
    const grid=document.createElement('div'); grid.className='t3d-artGrid';
    for(const [key,name] of list){
      const mine=kind==='tile'?CUSTOM.tiles[key]:kind==='char'?CUSTOM.chars[key]:CUSTOM.objs[key];
      const cell=document.createElement('div'); cell.className='t3d-artCell'+(mine?' t3d-mod':'');
      const b=document.createElement('button'); b.className='t3d-open'; b.title='Editar '+name.toLowerCase();
      let th=null; try{ th=artThumb(kind,key); }catch(e){}
      if(th){ const c=document.createElement('canvas'); c.width=th.width; c.height=th.height; const x=c.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(th,0,0); b.appendChild(c); }
      const sp=document.createElement('span'); sp.textContent=name; b.appendChild(sp);
      if(mine){ const bd=document.createElement('small'); bd.className='t3d-badge'; bd.textContent='modificado'; b.appendChild(bd); }
      b.onclick=()=>confirmLose(b,()=>{ const res=+$('artRes').value||32; setDoc(docFromCurrent(kind,key,res)); $('artLibSheet').hidden=true; });
      cell.appendChild(b);
      if(mine){ const r=mkBtn('Restaurar',async()=>{ if(r.dataset.armed!=='1'){ r.dataset.armed='1'; r.textContent='¿Restaurar el original?'; return; }
          await assetDel(key.replace(/[^a-zA-Z0-9_]/g,'_'));
          if(kind==='tile') delete CUSTOM.tiles[key]; else if(kind==='char') delete CUSTOM.chars[key]; else delete CUSTOM.objs[key];
          applyCustom(kind); renderAllArt(); showHint('Se restauró el arte original de «'+name+'».',2000); },{title:'Borra tu versión y vuelve al arte de fábrica'});
        cell.appendChild(r); }
      grid.appendChild(cell);
    }
    el.appendChild(grid);
  }
}
function libTab(t){ $('artLibSheet').querySelectorAll('[data-ltab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ltab===t)));
  $('artLibList').hidden=t!=='mine'; $('artAllList').hidden=t!=='all'; if(t==='all') renderAllArt(); else renderLib(); }
$('artLibSheet').querySelectorAll('[data-ltab]').forEach(b=>b.onclick=()=>libTab(b.dataset.ltab));
$('artAll').onclick=()=>{ $('artLibSheet').hidden=false; libTab('all'); };

/* ---- borrador automático: lo último sin guardar sobrevive a un cierre ---- */
const LS_DRAFT='tablero:artDraft';
every(()=>{ if(!ART.doc||!ART.dirty) return; try{ const d=ART.doc, rec=docToRecord({...d,key:d.key||assetKey(d)}); localStorage.setItem(LS_DRAFT,JSON.stringify(rec)); }catch(e){} },5000);
function clearDraft(){ try{ localStorage.removeItem(LS_DRAFT); }catch(e){} }
async function restoreDraft(){ let rec=null; try{ rec=JSON.parse(localStorage.getItem(LS_DRAFT)||'null'); }catch(e){} if(!rec) return false;
  try{ const d=await recordToDoc(rec); setDoc(d); ART.dirty=true; showHint('Se recuperó tu borrador sin guardar de «'+d.name+'».',2600); return true; }catch(e){ clearDraft(); return false; } }
$('artLibClose').onclick=()=>{ $('artLibSheet').hidden=true; };
$('artImp').onclick=()=>$('artFile').click();
$('artFile').onchange=()=>{ const f=$('artFile').files&&$('artFile').files[0]; if(!f) return; const url=URL.createObjectURL(f), img=new Image();
  img.onload=()=>{ const d=ART.doc, s=Math.min(d.w/img.width,d.h/img.height,1)||1, w=Math.max(1,Math.round(img.width*s)), h=Math.max(1,Math.round(img.height*s));
    const c=mkCanvas(d.w,d.h), x=c.getContext('2d'); x.imageSmoothingEnabled=false; x.drawImage(img,Math.floor((d.w-w)/2),Math.floor((d.h-h)/2),w,h);
    commitFloat(); pushCel(); const data=x.getImageData(0,0,d.w,d.h).data, buf=curBuf();
    for(let o=0;o<buf.length;o+=4) if(data[o+3]>127){ buf[o]=data[o]; buf[o+1]=data[o+1]; buf[o+2]=data[o+2]; buf[o+3]=255; }
    URL.revokeObjectURL(url); $('artFile').value=''; changed(false); showHint('Imagen importada en la capa actual.',1600); };
  img.onerror=()=>{ showHint('No se pudo leer esa imagen.'); $('artFile').value=''; }; img.src=url; };
$('artExp').onclick=async()=>{ if(!DL) return; commitFloat(); const d=ART.doc, cols=Math.min(d.frames.length,16), rows=Math.ceil(d.frames.length/cols);
  const c=mkCanvas(cols*d.w,rows*d.h), x=c.getContext('2d'); d.frames.forEach((fr,f)=>x.drawImage(compCanvas(f),(f%cols)*d.w,Math.floor(f/cols)*d.h));
  const blob=await new Promise(r=>c.toBlob(r,'image/png')); const fname=(d.name||'dibujo').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g,'').trim().replace(/\s+/g,'-')||'dibujo';
  try{ await DL.save({filename:fname+'.png',data:blob}); showHint('Imagen exportada.'); }catch(e){ if(!(e&&e.code==='declined')) showHint('No se pudo exportar la imagen.'); } };


/* ============ fase 5: modo partida ============ */
const GM={active:false,order:[],turn:0,round:1,left:0,dashed:false,cur:null,hiddenOrder:false,log:[],dice:{n:1,mod:0,adv:0},meas:{mode:null,size:{circle:20,cone:15,line:30,cube:15},a:null,b:null,info:''}};
state.fog=false; state.fogDM=false; state.gameOpen=false;
const byId=id=>bills.find(b=>b.id===id);
// viva: con la vida que se sabe (de una ficha ajena sin vida, se da por viva; con la barra, si no está vacía)
const alive=b=>!!b&&!!b.sheet&&(withheld(b,'hp')?!b.sheet.hpBar||b.sheet.hpBar.cur>0:b.sheet.hp.cur>0);
// la ficha del turno: GM.cur (el tokenId de la entrada del turno; al jugador, la que el servidor le deja ver)
const curMini=()=>GM.active&&GM.cur?byId(GM.cur):null;
const sq=ft=>Math.floor(ft/5);
// ---- niebla de guerra ----
let FOG=null, fogTex=null, fogDirty=true, FOGV=null, fogAnim=false;
function fogSetup(){
  const n=M.w*M.d; if(!M.seen||M.seen.length!==n) M.seen=new Uint8Array(n); FOG=new Uint8Array(n); FOGV=new Float32Array(n).fill(-1);
  if(fogTex) fogTex.dispose(); fogTex=new THREE.DataTexture(new Uint8Array(n*4),M.w,M.d,THREE.RGBAFormat);
  // filtro lineal: el sombreador funde los bordes entre casillas
  fogTex.magFilter=THREE.LinearFilter; fogTex.minFilter=THREE.LinearFilter; fogTex.needsUpdate=true;
  fogU.uFog.value=fogTex; fogU.uFogSize.value.set(M.w,M.d); fogDirty=true;
}
// línea de visión: ver Vision.los (bloquean muros, desniveles, puertas y rendijas en diagonal)
const losClear=(x0,z0,x1,z1,eye)=>Vision.los(GRID,x0,z0,x1,z1,eye);
// quién ve: todo el grupo (fichas del bando Jugador con visión). En la mesa en vivo, con sharedVision apagado (JA-VTT), cada jugador
// ve sólo desde sus propios personajes (si no tiene ninguno, desde el grupo, como JA-VTT)
function fogViewers(){
  const pcs=bills.filter(b=>b.mini&&isPC(b)&&b.sheet.vision!==false&&alive(b));
  if(LIVE.on&&!LIVE.dm&&SETTINGS.sharedVision===false){ const mine=bills.filter(b=>b.mini&&alive(b)&&b.owner&&b.owner===LIVE.me); if(mine.length) return mine; }
  return pcs;
}
// sin ambiente que baste (noche, interior o zona interior), más allá de la visión en la oscuridad sólo se ve lo iluminado
const LIT_MIN=0.12;
function computeFog(){
  if(!M||!FOG) return; const n=M.w*M.d;
  for(let i=0;i<n;i++) FOG[i]=M.seen[i]?1:0;
  // cada ficha ve desde sus casillas (una grande, desde cualquiera de ellas); el alcance se mide desde su borde
  for(const b of fogViewers()){
    const r=Fichas.sightCells(b.sheet), dark=Fichas.darkCells(b.sheet), n=nOf(b), SZ=Fichas.sizeOf(b.sheet), eyes=Fichas.footprint(b.x,b.z,n).filter(([x,z])=>inb(x,z));
    const lift=Math.max(0,b.sheet.elevation||0)/5, eye=(x,z)=>EH[idx(x,z)]*STEP+1.2*SZ.scale+0.3+lift;
    for(let z=Math.max(0,b.z-r);z<=Math.min(M.d-1,b.z+n-1+r);z++) for(let x=Math.max(0,b.x-r);x<=Math.min(M.w-1,b.x+n-1+r);x++){
      const dx=Math.max(0,b.x-x,x-(b.x+n-1)), dz=Math.max(0,b.z-z,z-(b.z+n-1)), d2=dx*dx+dz*dz; if(d2>(r+0.5)**2) continue; const i=idx(x,z); if(FOG[i]===2||inDark(i)) continue;   // en la oscuridad mágica nadie ve
      if(!ambientLit(i)&&d2>(dark+0.5)**2&&d2>2){ const l=L?Math.max(L[i*3],L[i*3+1],L[i*3+2]):0; if(l<LIT_MIN) continue; }
      if(eyes.some(([ex,ez])=>losClear(ex,ez,x,z,eye(ex,ez)))){ FOG[i]=2; M.seen[i]=1; } } }
  HV=HAS_COVER?new Uint8Array(n):null;
  fogDirty=false; fogAnim=true; markMini();
}
/* Maleza (cover de JA-VTT): lo que se ve sólo a través de ella muestra el suelo, pero no las fichas ni los objetos pequeños que
   hay en la casilla. Una casilla está a la vista de las fichas si algún ojo la ve con la maleza tapando (Vision.los 'hide': la
   de la propia casilla y la del ojo no cuentan, así que se ve a quien está dentro de la hierba, no a quien está detrás).
   Se calcula al preguntar y se guarda hasta la próxima niebla (HV: 0 sin calcular, 1 oculta, 2 a la vista). */
let HV=null;
function hideOK(i){
  if(!HV||!state.fog||!FOG) return true; if(HV[i]) return HV[i]===2;
  const x=i%M.w, z=(i/M.w)|0; let ok=false;
  for(const b of fogViewers()){
    const r=Fichas.sightCells(b.sheet), n=nOf(b), SZ=Fichas.sizeOf(b.sheet), lift=Math.max(0,b.sheet.elevation||0)/5;
    const dx=Math.max(0,b.x-x,x-(b.x+n-1)), dz=Math.max(0,b.z-z,z-(b.z+n-1)); if(dx*dx+dz*dz>(r+0.5)**2) continue;
    if(Fichas.footprint(b.x,b.z,n).some(([ex,ez])=>inb(ex,ez)&&Vision.los(GRID,ex,ez,x,z,EH[idx(ex,ez)]*STEP+1.2*SZ.scale+0.3+lift,'hide'))){ ok=true; break; }
  }
  HV[i]=ok?2:1; return ok;
}
// fundido: lo que se descubre (o se deja de ver) cambia poco a poco
function fogTick(dt){
  if(!fogAnim||!FOG||!FOGV) return; const d=fogTex.image.data, n=FOG.length, k=reduceMotion?1:Math.min(1,dt*5); let moving=false;
  for(let i=0;i<n;i++){ const tgt=FOG[i]===2?1:FOG[i]===1?0.5:0; let v=FOGV[i];
    if(v<0) v=tgt; else if(v!==tgt){ v+=(tgt-v)*k; if(Math.abs(tgt-v)<0.02) v=tgt; else moving=true; }
    FOGV[i]=v; d[i*4]=Math.round(v*255); d[i*4+3]=255; }
  fogTex.needsUpdate=true; fogAnim=moving;
}
function fogVis(i){ return !state.fog||!FOG?2:FOG[i]; }
function setFog(on){ state.fog=on; M.fog=on; fogU.uFogOn.value=on?1:0; fogDirty=true; renderGame(); }
// ---- capas sobre casillas: alcance (azul) y plantillas (naranja) ----
const ovMats={range:new THREE.MeshBasicMaterial({color:0x3a7fb3,transparent:true,opacity:0.34,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),
  tmpl:new THREE.MeshBasicMaterial({color:0xf07a2a,transparent:true,opacity:0.42,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}),
  ruler:new THREE.MeshBasicMaterial({color:0xffd35a,transparent:true,opacity:0.5,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5})};
const ov={range:null,tmpl:null};
function setOverlay(kind,cells,mat){
  if(ov[kind]){ scene.remove(ov[kind]); ov[kind].geometry.dispose(); ov[kind]=null; }
  if(!cells||!cells.length) return; const pos=[];
  for(const i of cells){ const x=i%M.w, z=(i/M.w)|0, y=EH[i]*STEP+0.03, m=0.06;
    pos.push(x+m,y,z+m, x+m,y,z+1-m, x+1-m,y,z+1-m, x+m,y,z+m, x+1-m,y,z+1-m, x+1-m,y,z+m); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeBoundingSphere();
  ov[kind]=new THREE.Mesh(g,ovMats[mat||kind]); ov[kind].renderOrder=6; scene.add(ov[kind]);
}
// camino previsto: huellas sobre las casillas y el coste junto al cursor
const pathMat=new THREE.MeshBasicMaterial({color:0xffd35a,transparent:true,opacity:0.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
const pathMatBad=new THREE.MeshBasicMaterial({color:0xd9495f,transparent:true,opacity:0.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
let pathMesh=null, pathKey='';
const pathTip=document.createElement('div'); pathTip.className='t3d-pathTip'; pathTip.hidden=true; ($('stageWrap')||document.body).appendChild(pathTip);
function clearPath(){ if(pathMesh){ scene.remove(pathMesh); pathMesh.geometry.dispose(); pathMesh=null; } pathKey=''; pathTip.hidden=true; }
function showPath(b,c,cx,cy){
  const n=nOf(b), [tx,tz]=anchorAt(b,c.x,c.z), key=b.id+':'+b.x+','+b.z+'>'+tx+','+tz+':'+n+':'+(GM.active?GM.left:'');
  const wr=pathTip.parentElement.getBoundingClientRect();
  pathTip.style.left=(cx-wr.left+14)+'px'; pathTip.style.top=(cy-wr.top+10)+'px';
  if(key===pathKey) return; clearPath(); pathKey=key;
  if(tx===b.x&&tz===b.z) return;
  const pth=findPath(b.x,b.z,tx,tz,b);
  if(!pth){ pathTip.textContent='Sin camino'; pathTip.className='t3d-pathTip t3d-bad'; pathTip.hidden=false; return; }
  const over=GM.active&&b===curMini()&&pth.cost>GM.left, pos=[];
  // huellas: la del centro de la ficha en cada paso y, al final, todas las casillas que ocupará
  const foot=(x,z,m)=>{ const y=EH[idx(x,z)]*STEP+0.035; pos.push(x+m,y,z+m, x+m,y,z+1-m, x+1-m,y,z+1-m, x+m,y,z+m, x+1-m,y,z+1-m, x+1-m,y,z+m); }, half=(n-1)>>1;
  for(let k=1;k<pth.length;k++){ const [x,z]=pth[k];
    if(k===pth.length-1) for(const [fx,fz] of Fichas.footprint(x,z,n)) foot(fx,fz,0.2); else foot(x+half,z+half,0.36); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeBoundingSphere();
  pathMesh=new THREE.Mesh(g,over?pathMatBad:pathMat); pathMesh.renderOrder=7; scene.add(pathMesh);
  pathTip.textContent=pth.cost*5+' pies'+(over?' · quedan '+GM.left*5:''); pathTip.className='t3d-pathTip'+(over?' t3d-bad':''); pathTip.hidden=false;
}
let rangeKey='';
function updateRange(){
  const b=selected, show=state.gameOpen&&state.mode==='play'&&b&&b.mini&&alive(b)&&!b.path&&(!GM.active||b===curMini());
  const budget=show?(GM.active?GM.left:sq(b.sheet.speed)):0, key=show?[b.id,b.x,b.z,budget,M.w].join(':'):'';
  if(key===rangeKey) return; rangeKey=key;
  if(!show||budget<=0){ setOverlay('range',null); return; }
  const {dist}=dijkstra(b.x,b.z,b,budget,-1), cells=[]; for(let i=0;i<dist.length;i++) if(dist[i]>0&&dist[i]<=budget) cells.push(i);
  setOverlay('range',cells);
}
// ---- movimiento en combate: turno y presupuesto ----
const _moveMiniTo=moveMiniTo;
moveMiniTo=function(b,x,z,quiet){
  if(GM.active&&state.mode==='play'){
    if(b!==curMini()){ if(!quiet) showHint('No es el turno de '+miniName(b)+'.',1600); return false; }
    const path=findPath(b.x,b.z,x,z,b); if(!path){ if(!quiet) showHint('No hay camino hasta esa casilla.'); return false; }
    if(path.cost>GM.left){ if(!quiet) showHint('Fuera de alcance: cuesta '+path.cost*5+' pies y quedan '+GM.left*5+'.',2000); return false; }
    GM.left-=path.cost; renderGame();
  }
  return _moveMiniTo(b,x,z,quiet);
};
// ---- iniciativa y turnos ----
function roll(sides){ const a=new Uint32Array(1); crypto.getRandomValues(a); return 1+a[0]%sides; }
function startCombat(){
  syncMinis(); const ms=bills.filter(b=>b.mini&&alive(b)); if(!ms.length){ showHint('No hay personajes en el tablero.'); return; }
  GM.order=ms.map(b=>{ const r=roll(20); return {id:b.id,roll:r,total:r+b.sheet.init,init:b.sheet.init}; }).sort((p,q)=>q.total-p.total||q.init-p.init);
  GM.active=true; GM.round=1; GM.turn=-1; addLog('Iniciativa: '+GM.order.map(o=>miniName(byId(o.id))+' '+o.total).join(', ')); nextTurn();
}
function nextTurn(){
  if(!GM.active) return; let guard=0;
  do{ GM.turn++; if(GM.turn>=GM.order.length){ GM.turn=0; GM.round++; } }while(!alive(byId(GM.order[GM.turn].id))&&++guard<=GM.order.length);
  GM.cur=GM.order[GM.turn].id;
  const b=curMini(); if(!b){ endCombat(); return; }
  GM.left=sq(b.sheet.speed); GM.dashed=false; selected=b; focusSelected(); rangeKey=''; renderGame();
  showHint('Ronda '+GM.round+': turno de '+miniName(b)+'.',1600);
}
function endCombat(){ GM.active=false; GM.order=[]; GM.cur=null; rangeKey=''; renderGame(); showHint('Combate terminado.',1200); }
function dash(){ const b=curMini(); if(!b||GM.dashed) return; GM.left+=sq(b.sheet.speed); GM.dashed=true; rangeKey=''; renderGame(); showHint('Carrera: +'+b.sheet.speed+' pies este turno.',1400); }
// ---- dados: la notación y el formato de JA-VTT (dados.js). En la mesa en vivo tira el servidor: lo ven todos y queda en el chat
// del tablero (chat_messages, kind 'roll'); fuera de ella, el cliente. diceEnabled apagado: nadie tira.
function addLog(t){ GM.log.unshift(t); GM.log=GM.log.slice(0,12); }
function logRoll(body,who){ const t=Dados.text(body); if(!t) return; addLog((who?who+': ':'')+t); renderGame(); }
function rollFormula(formula,label,adv){
  if(!diceOn()){ showHint('Los dados están desactivados en este tablero.',2000); return false; }
  try{ Dados.parse(formula); }catch(e){ showHint(e.message,2400); return false; }
  if(LIVE.on&&LIVE.room&&LIVE.room.roll){ LIVE.room.roll(formula,label||'',adv||0).catch(e=>showHint(e&&e.message?e.message:'No se pudo tirar.',2400)); return true; }
  const b=Dados.roll(formula,{adv}); if(label) b.label=label; logRoll(b); return true;
}
function rollDice(sides){ const d=GM.dice; return rollFormula(d.n+'d'+sides+(d.mod?(d.mod>0?'+':'')+d.mod:''),'',sides===20&&d.n===1?d.adv:0); }
// ---- medir y plantillas de área ----
const MEAS_SIZES={circle:[10,15,20,30],cone:[15,30,60],line:[30,60,100],cube:[10,15,20]};
const MEAS_NAMES={ruler:'Regla',circle:'Círculo',cone:'Cono',line:'Línea',cube:'Cubo'};
// casillas de una plantilla (Ajustes.measure; la misma cuenta pinta los planos fijados, Ajustes.planCells)
function measureCells(mode,a,b){ return Ajustes.measure(mode,a,b,mode==='ruler'?0:sq(GM.meas.size[mode]),M.w,M.d); }
function updateMeasure(){
  const m=GM.meas; if(!m.mode||!M){ setOverlay('tmpl',null); m.info=''; return; }
  const origin=(m.mode==='cone'||m.mode==='line')?(selected?[selected.x,selected.z]:m.a):m.a;
  if(!origin){ setOverlay('tmpl',null); m.info=m.mode==='ruler'?'Toca la casilla de inicio.':(m.mode==='cone'||m.mode==='line'?'Elige al lanzador y apunta con el cursor o toca una casilla.':'Toca el centro del área.'); renderMeasureInfo(); return; }
  const tgt=m.b||(m.mode==='ruler'?null:origin); if(m.mode==='ruler'&&!tgt){ setOverlay('tmpl',[idx(origin[0],origin[1])],'ruler'); m.info='Ahora toca el destino.'; renderMeasureInfo(); return; }
  const cells=measureCells(m.mode,origin,tgt); setOverlay('tmpl',cells,m.mode==='ruler'?'ruler':'tmpl');
  if(m.mode==='ruler'){
    // de borde a borde como en 5.ª edición: si un extremo cae en una ficha, se mide desde la casilla de la ficha más cercana
    const at=c=>bills.find(b=>b.mini&&tokenShown(b)&&Fichas.covers(b.x,b.z,nOf(b),c[0],c[1])), A=at(origin), B=at(tgt);
    const g=Fichas.gap(A?A.x:origin[0],A?A.z:origin[1],A?nOf(A):1,B?B.x:tgt[0],B?B.z:tgt[1],B?nOf(B):1), a5=g.cells, v=g.alt;
    m.info='Distancia (regla 5e)'+(A||B?', de borde a borde':'')+': <b>'+a5*5+' pies</b>. Regla variante 5/10: '+v*5+' pies.'; }
  else { const set=new Set(cells), inside=bills.filter(b=>b.mini&&tokenShown(b)&&Fichas.footprint(b.x,b.z,nOf(b)).some(([x,z])=>inb(x,z)&&set.has(idx(x,z)))).map(b=>esc(miniName(b)));
    m.info=MEAS_NAMES[m.mode]+' de '+GM.meas.size[m.mode]+' pies. Dentro: <b>'+(inside.length?inside.join(', '):'nadie')+'</b>.'; }
  renderMeasureInfo();
}
function measureAt(c,final){ const m=GM.meas; if(!c) return;
  if(m.mode==='ruler'){ if(final){ if(!m.a||m.b){ m.a=[c.x,c.z]; m.b=null; } else m.b=[c.x,c.z]; } else if(m.a&&!m.b){ const keep=m.b; m.b=[c.x,c.z]; updateMeasure(); m.b=keep; return; } }
  else if(m.mode==='cone'||m.mode==='line'){ m.b=[c.x,c.z]; if(!selected) m.a=m.a||[c.x,c.z]; }
  else { if(final||!m.lock) m.a=[c.x,c.z]; if(final) m.lock=true; }
  updateMeasure(); }
/* ---- planos (type 'plan' de JA-VTT): las plantillas fijadas. Los del director van en la escena (M.plans) y los jugadores los ven
   si los publica (plansReleased); los de un jugador en la mesa en vivo (live/plans, con su dueño y su color) los ven todos. ---- */
let planMeshes=[], planKey='';
function visiblePlans(){ const scene0=(M&&M.plans||[]).filter(p=>gmView()||M.plansReleased||p.owner!=null); return scene0.concat(LIVE.on?Object.values(LIVE.plans||{}):[]); }
function drawPlans(){
  if(!M||!EH) return; const vp=visiblePlans(), key=JSON.stringify(vp)+M.w+'x'+M.d; if(key===planKey) return; planKey=key;
  for(const m of planMeshes){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); } planMeshes=[];
  for(const p of vp){ const pos=[];
    for(const i of Ajustes.planCells(p,M.w,M.d)){ const x=i%M.w, z=(i/M.w)|0, y=EH[i]*STEP+0.028, m=0.1;
      pos.push(x+m,y,z+m, x+m,y,z+1-m, x+1-m,y,z+1-m, x+m,y,z+m, x+1-m,y,z+1-m, x+1-m,y,z+m); }
    if(!pos.length) continue; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:p.color||Ajustes.PLAN_COLOR,transparent:true,opacity:0.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
    mesh.renderOrder=6; scene.add(mesh); planMeshes.push(mesh); }
}
const PLAN_NAMES={ruler:'Regla',line:'Línea',circle:'Círculo',cone:'Cono',cube:'Cubo'};
const planLabel=p=>PLAN_NAMES[Ajustes.planMode(p)]+' de '+Math.round(Ajustes.planSize(p)*5)+' pies'+(p.owner?' · '+nameOf(p.owner):'');
// fijar la medida actual como plano
function pinMeasure(){
  const m=GM.meas; if(!m.mode||!M) return;
  const origin=(m.mode==='cone'||m.mode==='line')?(selected?[selected.x,selected.z]:m.a):m.a, tgt=m.b||(m.mode==='ruler'?null:origin);
  if(!origin||!tgt){ showHint('Mide algo antes de fijarlo.',1600); return; }
  const base=Ajustes.planOf(m.mode,origin,tgt,m.mode==='ruler'?0:sq(GM.meas.size[m.mode]));
  if(LIVE.on&&!LIVE.dm){ const id=Ajustes.nextId(Object.values(LIVE.plans||{})), plan=Ajustes.normPlan({...base,id,owner:LIVE.me,color:LIVE.myColor},M.w,M.d);
    if(plan) DB.doc('live/plans').update({plans:{[id]:plan}}).catch(liveErr); }
  else { const plan=Ajustes.normPlan({...base,id:Ajustes.nextId(M.plans)},M.w,M.d); if(plan){ M.plans.push(plan); liveBoardSoon(); } }
  m.mode=null; m.a=null; m.b=null; m.lock=false; updateMeasure(); renderGame(); showHint('Plantilla fijada en el tablero.',1400);
}
function removePlan(p){
  if(p.owner){ if(LIVE.on&&(LIVE.dm||p.owner===LIVE.me)) DB.doc('live/plans').update({plans:{[p.id]:null}}).catch(liveErr); }
  else if(gmView()){ M.plans=M.plans.filter(q=>q!==p); liveBoardSoon(); }
  renderGame();
}
function setMeasure(mode){ const m=GM.meas; m.mode=m.mode===mode?null:mode; m.a=null; m.b=null; m.lock=false; updateMeasure(); renderGame(); }
function renderMeasureInfo(){ const el=$('gMeasInfo'); if(el) el.innerHTML=GM.meas.info||''; }
// ---- panel ----
// las secciones de partida viven en las pestañas del panel lateral (main.js)
function gTab(t){ ctx.reveal(t); }
function openGame(on){
  state.gameOpen=on;
  if(on&&state.mode==='edit') $('mode').click();
  if(!on){ GM.meas.mode=null; updateMeasure(); }
  rangeKey=''; renderGame(); layout();
}
$('mode').addEventListener('click',()=>{ openGame(state.mode!=='edit'); railSync(); });
const el=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; };
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// barra de vida del panel (sin números si sólo se ve la barra)
function hpBarEl(cur,max,temp){ const bar=el('div','t3d-hpbar'), fill=el('i'); fill.style.width=(100*cur/max)+'%'; if(cur/max<0.35) fill.style.background='var(--rust)'; bar.append(fill);
  if(temp>0){ const t=el('b','t3d-tmp'); t.style.width=Math.min(100,100*temp/max)+'%'; bar.append(t); } return bar; }
function statRow(label,val,dec,inc){ const r=el('div','t3d-stat'); r.append(el('span',null,label),mkBtn('−',dec),el('b',null,val),mkBtn('+',inc)); return r; }
/* ---- pestaña Fichas: sólo lo que usa la mesa (principio de producto), con los campos de JA-VTT ---- */
const KIND_BTNS=[['player','Jugador'],['enemy','Enemigo'],['neutral','Neutral']];
function numIn(label,val,min,max,step,set,k){ const l=el('label'); l.append(document.createTextNode(label)); const i=document.createElement('input'); i.type='number'; i.min=min; i.max=max; i.step=step; i.value=val; if(k) i.dataset.k=k;
  i.onchange=()=>{ const v=Math.round(+i.value); if(Number.isFinite(v)) set(Math.max(min,Math.min(max,v))); }; l.append(i); return l; }
function fieldEl(label,ctl){ const l=el('label','field'); l.append(el('span',null,label),ctl); return l; }
function checkEl(label,on,set,k){ const l=el('label','check'), i=document.createElement('input'); i.type='checkbox'; i.checked=on; if(k) i.dataset.k=k; i.onchange=()=>set(i.checked); l.append(i,document.createTextNode(' '+label)); return l; }
// estados: chapas con la abreviatura y el color de JA-VTT; pulsar pone o quita
function condChips(sh,onToggle){ const box=el('div','t3d-conds'); box.setAttribute('role','group'); box.setAttribute('aria-label','Estados');
  for(const id of Fichas.CONDITION_IDS){ const C=Fichas.CONDITIONS[id], on=sh.conditions.includes(id); if(!onToggle&&!on) continue;
    const b=document.createElement('button'); b.type='button'; b.className='t3d-cond'; b.dataset.cond=id; b.title=C.name; b.setAttribute('aria-pressed',String(on)); if(!onToggle) b.disabled=true;
    const ab=el('span','t3d-abbr',C.abbr); ab.style.background=C.color; ab.style.color=luma(C.color)>0.55?INK:'#f4eee2'; b.append(ab,el('span',null,C.name));
    if(onToggle) b.onclick=()=>onToggle(id); box.append(b); }
  return box; }
// cambiar el tamaño: la ficha crece hacia donde quepa (todas sus casillas libres y pisables) o no cambia
function setTokenSize(b,id){
  const Z=Fichas.SIZES.find(z=>z.id===id); if(!Z) return false; const n=Z.size, taken=takenBy(b), cand=[];
  for(let dz=0;dz<n;dz++) for(let dx=0;dx<n;dx++) cand.push([b.x-dx,b.z-dz,dx+dz]);
  cand.sort((p,q)=>p[2]-q[2]); const at=cand.find(([x,z])=>Fichas.fits(PATHG,x,z,n,taken));
  if(!at){ showHint('No cabe: '+Z.name.toLowerCase()+' necesita '+n+'×'+n+' casillas libres aquí.',2200); return false; }
  Fichas.setSize(b.sheet,id); b.path=null; b.pending=null; b.x=at[0]; b.z=at[1]; placeBill(b); fogDirty=true; lightDirty=true; rangeKey=''; return true; }
function renderSheet(p){
  p.textContent=''; const s2=selected&&selected.mini?selected:null;
  if(!s2){ p.append(el('div','t3d-ginfo','Elige un personaje en el tablero para ver su ficha.')); return; }
  const sh=s2.sheet, SZ=Fichas.sizeOf(sh), gm=!LIVE.on||LIVE.dm, hp=sh.hp;
  if(!canControl(s2)||withheld(s2,'ac')||withheld(s2,'hp')){
    // lo que se sabe de una ficha ajena: sin la vida ni la CA que el servidor no manda (ni lo que el tablero apaga)
    const bits=[miniName(s2)+(sh.kind==='enemy'&&!sh.neutral?' (enemigo)':'')+', '+SZ.name.toLowerCase()];
    if(hpOn()&&!withheld(s2,'hp')) bits.push(hp.cur+'/'+hp.max+' PV'+(hp.temp?' (+'+hp.temp+')':''));
    if(acOn()&&!withheld(s2,'ac')) bits.push('CA '+sh.ac);
    bits.push('velocidad '+sh.speed+' pies');
    const inf=el('div','t3d-ginfo',bits.join(', ')+'. Lo controla otra persona.'); inf.dataset.k='others'; p.append(inf);
    if(hpOn()&&withheld(s2,'hp')&&sh.hpBar){ const bb=hpBarEl(sh.hpBar.cur,1,sh.hpBar.temp); bb.dataset.k='hpBarOnly'; bb.title='Vida (el director sólo deja ver la barra)'; p.append(bb); }
    if(condsOn()&&sh.conditions.length) p.append(condChips(sh,null)); return; }
  const upd=()=>{ rangeKey=''; fogDirty=true; lightDirty=true; liveTok(s2); renderGame(); };
  const nm=el('input','t3d-gname'); nm.value=sh.name; nm.maxLength=40; nm.setAttribute('aria-label','Nombre'); nm.oninput=()=>{ sh.name=nm.value||sh.name; };
  nm.onchange=()=>{ liveTok(s2); renderGame(); }; p.append(nm);
  const kind=sh.neutral?'neutral':sh.kind;
  if(gm) p.append(...KIND_BTNS.map(([k,n])=>mkBtn(n,()=>{ sh.kind=k==='player'?'player':'enemy'; if(k==='neutral') sh.neutral=true; else delete sh.neutral; upd(); },{pressed:kind===k})));
  if(gm){ const sel=document.createElement('select'); sel.dataset.k='size'; sel.setAttribute('aria-label','Tamaño');
    for(const z of Fichas.SIZES){ const o=document.createElement('option'); o.value=z.id; o.textContent=z.name+(z.size>1?' ('+z.size+'×'+z.size+')':''); sel.append(o); }
    sel.value=SZ.id; sel.onchange=()=>{ if(setTokenSize(s2,sel.value)) upd(); else sel.value=Fichas.sizeOf(sh).id; }; p.append(fieldEl('Tamaño',sel)); }
  // el arte no se agranda: si es de otro tamaño, se ve a su escala de píxel sobre la peana de la ficha
  if(gm&&artSizeId(s2.kind)!==SZ.id){ const w=el('div','t3d-ginfo t3d-artWarn','El arte es de tamaño '+Fichas.SIZES.find(z=>z.id===artSizeId(s2.kind)).name+': se ve a su escala de píxel, sin agrandarlo. Dibuja uno de tamaño '+SZ.name+' en el editor de dibujo.'); w.dataset.k='artWarn'; p.append(w); }
  // vida: − y + quitan y curan (el daño se lleva antes la vida temporal). Vida, CA y estados con altura, si el tablero los usa
  if(hpOn()){ p.append(statRow('Puntos de vida',hp.cur+' / '+hp.max+(hp.temp?' +'+hp.temp:''),()=>{ if(hp.temp>0) hp.temp--; else hp.cur=Math.max(0,hp.cur-1); if(!hp.cur) showHint(miniName(s2)+' cae inconsciente.',1500); upd(); },()=>{ hp.cur=Math.min(hp.max,hp.cur+1); upd(); }));
    p.append(hpBarEl(hp.cur,hp.max,hp.temp)); }
  const g1=el('div','numPair t3d-num3');
  if(hpOn()) g1.append(numIn('Vida máx.',hp.max,1,9999,1,v=>{ hp.max=v; hp.cur=Math.min(hp.cur,v); upd(); },'hpMax'),numIn('Temporal',hp.temp,0,9999,1,v=>{ hp.temp=v; upd(); },'hpTemp'));
  if(acOn()) g1.append(numIn('CA',sh.ac,0,99,1,v=>{ sh.ac=v; upd(); },'ac'));
  const g2=el('div','numPair t3d-num3');
  g2.append(numIn('Iniciativa',sh.init,-10,20,1,v=>{ sh.init=v; upd(); },'init'),numIn('Velocidad',sh.speed,0,120,5,v=>{ sh.speed=v; upd(); },'speed'));
  if(condsOn()) g2.append(numIn('Altura',sh.elevation,-9999,9999,5,v=>{ sh.elevation=v; upd(); },'elevation'));
  if(g1.children.length) p.append(g1); p.append(g2);
  if(gm){ const g3=el('div','numPair'); g3.append(numIn('Visión (pies, 0 = sin límite)',sh.sight,0,300,5,v=>{ sh.sight=v; upd(); },'sight'),numIn('En la oscuridad (pies)',sh.darkvision,0,300,5,v=>{ sh.darkvision=v; upd(); },'darkvision')); p.append(g3); }
  const ls=document.createElement('select'); ls.dataset.k='light'; ls.setAttribute('aria-label','Luz que lleva');
  const lopts=Fichas.TOKEN_LIGHTS.map(id=>[id,id==='none'?'Ninguna':LIGHT_TYPES[id].name]); if(!Fichas.TOKEN_LIGHTS.includes(sh.light.preset)) lopts.push([sh.light.preset,lightTypeName(sh.light)]);
  for(const [v,n] of lopts){ const o=document.createElement('option'); o.value=v; o.textContent=n; ls.append(o); }
  ls.value=Fichas.lightOn(sh.light)||!Fichas.TOKEN_LIGHTS.includes(sh.light.preset)?sh.light.preset:'none'; ls.onchange=()=>{ if(Fichas.TOKEN_LIGHTS.includes(ls.value)){ sh.light=Fichas.tokenLight(ls.value,ls.value!=='none'); upd(); } };
  p.append(fieldEl('Luz que lleva',ls));
  if(condsOn()) p.append(lblEl('Estados'),condChips(sh,id=>{ const i=sh.conditions.indexOf(id); if(i>=0) sh.conditions.splice(i,1); else sh.conditions.push(id); upd(); }));
  if(gm) p.append(checkEl('Tiene visión propia (revela lo que ve)',sh.vision!==false,v=>{ sh.vision=v; upd(); },'vision'),checkEl('Oculta para los jugadores',!!sh.hidden,v=>{ sh.hidden=v; upd(); },'hidden'));
  p.append(mkBtn('Centrar la cámara',focusSelected),mkBtn('Tirar iniciativa',()=>{ if(rollFormula('1d20'+(sh.init?(sh.init>0?'+':'')+sh.init:''),'Iniciativa de '+miniName(s2))) gTab('dice'); },{disabled:!diceOn()}));
}
function renderGame(){
  if(!state.gameOpen||!M) return;
  // turnos
  let p=$('gTurns'); p.textContent='';
  const noDM=LIVE.on&&!LIVE.dm;
  p.append(mkBtn('Niebla de guerra',()=>setFog(!state.fog),{pressed:state.fog,disabled:noDM,title:'Oculta lo que no ven los personajes jugadores'}),
           mkBtn('Vista del DM',()=>{ state.fogDM=!state.fogDM; fogU.uFogDM.value=state.fogDM?1:0; renderGame(); },{pressed:state.fogDM,disabled:noDM,title:'Ver todo el mapa aunque haya niebla'}));
  if(state.fog) p.append(mkBtn('Olvidar lo explorado',()=>{ M.seen.fill(0); fogDirty=true; }));
  p.append(sepEl());
  if(!GM.active){ p.append(mkBtn('Tirar iniciativa y empezar combate',startCombat,{disabled:noDM})); p.append(el('div','t3d-ginfo','Fuera de combate, cualquier personaje se mueve libremente. En combate, cada uno tiene su turno y su velocidad.')); }
  else {
    const b=curMini();
    const info=el('div','t3d-ginfo'); info.innerHTML='Ronda <b>'+GM.round+'</b>. '+(b?'Turno de <b>'+esc(miniName(b))+'</b>. Movimiento: <b>'+GM.left*5+'</b> pies.':'Turno de otro personaje.'); p.append(info);
    const mine=!!b&&canControl(b);
    p.append(mkBtn('Siguiente turno',nextTurn,{disabled:!mine}),mkBtn('Carrera',dash,{disabled:GM.dashed||!mine,title:'Suma otra vez su velocidad este turno'}),mkBtn('Terminar combate',endCombat,{disabled:noDM}));
    // el orden de iniciativa (JA-VTT: los jugadores sólo lo ven con initiativeShown; las fichas ocultas no salen)
    if(GM.hiddenOrder){ const h=el('div','t3d-ginfo','El director no muestra el orden de iniciativa.'); h.dataset.k='initiativeHidden'; p.append(h); }
    const ol=el('div','t3d-order'); ol.dataset.k='initiative';
    GM.order.forEach((o,k)=>{ const m=o.id?byId(o.id):null; if(o.id&&!m) return; const bt=el('button'), nm=m?miniName(m)+(m.sheet.kind==='enemy'&&!m.sheet.neutral?' (enemigo)':''):o.name;
      bt.append(el('span','t3d-ini',String(o.total)),el('span',null,nm),el('span','t3d-hp',m?hpText(m):''));
      if(k===GM.turn&&(!m||m===b)) bt.setAttribute('aria-current','true'); if(m&&!alive(m)) bt.classList.add('t3d-down');
      if(m) bt.onclick=()=>{ selected=m; focusSelected(); renderGame(); }; ol.append(bt); });
    if(GM.order.length) p.append(ol);
  }
  // ficha
  renderSheet($('gSheet'));
  // dados (diceEnabled de JA-VTT: apagado, nadie tira)
  p=$('gDice'); p.textContent=''; const d=GM.dice;
  if(!diceOn()){ const off=el('div','t3d-ginfo','Los dados están desactivados en este tablero.'); off.dataset.k='diceOff'; p.append(off); }
  else {
    Dados.SIDES.forEach(k=>p.append(mkBtn('d'+k,()=>rollDice(k))));
    p.append(statRow('Cantidad',String(d.n),()=>{ d.n=Math.max(1,d.n-1); renderGame(); },()=>{ d.n=Math.min(20,d.n+1); renderGame(); }),
      statRow('Modificador',(d.mod>=0?'+':'−')+Math.abs(d.mod),()=>{ d.mod=Math.max(-20,d.mod-1); renderGame(); },()=>{ d.mod=Math.min(20,d.mod+1); renderGame(); }),
      mkBtn('Ventaja',()=>{ d.adv=d.adv>0?0:1; renderGame(); },{pressed:d.adv>0,title:'Tira 2d20 y usa el mayor (solo 1d20)'}),
      mkBtn('Desventaja',()=>{ d.adv=d.adv<0?0:-1; renderGame(); },{pressed:d.adv<0,title:'Tira 2d20 y usa el menor (solo 1d20)'}));
    // fórmula con la notación de JA-VTT: «2d6+3», «d20», «4d6 + 2d8»
    const fr=el('div','row t3d-formula'), fi=document.createElement('input'); fi.dataset.k='formula'; fi.maxLength=60; fi.placeholder='Fórmula: 2d6+3'; fi.setAttribute('aria-label','Fórmula de dados'); fi.value=d.formula||'';
    const go=()=>{ d.formula=fi.value.trim(); if(d.formula) rollFormula(d.formula); };
    fi.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } }; fi.oninput=()=>{ d.formula=fi.value; };
    fr.append(fi,mkBtn('Tirar',go)); p.append(fr);
  }
  const lg=el('div','t3d-log'); lg.setAttribute('aria-live','polite'); (GM.log.length?GM.log:['Todavía no hay tiradas.']).forEach(t=>lg.append(el('div',null,t))); p.append(lg);
  // medir
  p=$('gMeasure'); p.textContent='';
  for(const k of ['ruler','circle','cone','line','cube']) p.append(mkBtn(MEAS_NAMES[k],()=>setMeasure(k),{pressed:GM.meas.mode===k}));
  const mm=GM.meas.mode; if(mm&&mm!=='ruler'){ const opts=MEAS_SIZES[mm]; p.append(mkBtn('Tamaño: '+GM.meas.size[mm]+' pies',()=>{ const i=opts.indexOf(GM.meas.size[mm]); GM.meas.size[mm]=opts[(i+1)%opts.length]; updateMeasure(); renderGame(); })); }
  if(mm) p.append(mkBtn('Borrar medida',()=>{ GM.meas.a=null; GM.meas.b=null; GM.meas.lock=false; updateMeasure(); }),mkBtn('Fijar plantilla',pinMeasure,{title:'La deja en el tablero como un plano (JA-VTT)'}));
  renderTable(); renderCamp();
  const inf=el('div','t3d-ginfo'); inf.id='t3d-gMeasInfo'; inf.innerHTML=mm?(GM.meas.info||''):'Elige una herramienta. El cono y la línea salen del personaje elegido.'; p.append(inf);
  // planos fijados: el director decide si los suyos los ven los jugadores (plansReleased); cada cual quita los suyos
  if(M&&gmView()) p.append(mkBtn('Planos visibles para los jugadores',()=>{ M.plansReleased=!M.plansReleased; liveBoardSoon(); renderGame(); },{pressed:!!M.plansReleased,title:'Los jugadores ven tus planos fijados'}));
  const vp=visiblePlans();
  if(vp.length){ p.append(el('span','t3d-lbl','Planos fijados')); const box=el('div','t3d-plans'); box.dataset.k='plans';
    for(const pl of vp){ const r=el('div','t3d-plan-row'), sw=el('i'), lb=el('span'); sw.style.background=pl.color||Ajustes.PLAN_COLOR; lb.append(sw,document.createTextNode(planLabel(pl)));
      r.append(lb); if(gmView()||pl.owner===LIVE.me) r.append(mkBtn('Quitar',()=>removePlan(pl))); box.append(r); }
    p.append(box); }
}


/* ============ fase 7: techos, puertas y el pueblo de ejemplo ============ */
// --- techos: cada uno con su material (una casilla del atlas, editable en «Todo el arte») y su forma: a dos aguas, a cuatro
// aguas, plano con almenas, cónico o a un agua. Se abren (y recortan los muros) para ver el interior. El material se muestrea en
// el sombreador con coordenadas del mundo (1 casilla de textura por unidad, la densidad del terreno) y se repite en cada faldón.
let RCAP=null, roofKey=null, roofMeshes=[]; state.roofMode='auto';
const ROOF_NAMES={auto:'Techos: automáticos (I)',show:'Techos: siempre visibles (I)',hide:'Techos: ocultos (I)'};
function roofOf(x,z){ return (M.roofs||[]).findIndex(r=>x>=r.x&&z>=r.z&&x<r.x+r.w&&z<r.z+r.d); }
const roofMat=new THREE.ShaderMaterial({ side:THREE.DoubleSide,
  uniforms:{ ...fogU, ...ambU, uMap:uniforms.uMap, uFlicker:uniforms.uFlicker, uMode:uniforms.uMode, uTexN:{value:TEX} },
  vertexShader:`
    attribute float aShade; attribute vec3 aTorch; attribute vec2 aTile; attribute vec2 aRUv;
    varying vec2 vR; varying vec2 vTile; varying float vShade; varying vec3 vTorch; varying vec2 vCell;
    void main(){ vR = aRUv; vTile = aTile; vShade = aShade; vTorch = aTorch; vCell = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader:`
    uniform sampler2D uMap; uniform float uTexN;
    varying vec2 vR; varying vec2 vTile; varying float vShade; varying vec3 vTorch; varying vec2 vCell;
    ${LIGHT_GLSL}
    ${FOG_GLSL}
    void main(){
      float e = 0.5/uTexN; vec2 f = clamp(fract(vR), e, 1.0-e);
      vec4 t = texture2D(uMap, vec2((vTile.x + f.x)/${AC}.0, 1.0 - (vTile.y + 1.0 - f.y)/${AR}.0));
      gl_FragColor = vec4(applyFog(t.rgb * lightFor(vShade, vTorch, 1.0), vCell), 1.0);   // el tejado está fuera: todo el ambiente
    }`
});
const RL=[0.35,0.8,0.5], RLn=Math.hypot(...RL);
const v3sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], v3dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const v3cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], v3n=a=>{ const l=Math.hypot(...a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const tileRC=i=>[i%AC,(i/AC)|0];
// alto de la base del techo: la cima de sus muros; sin muros (un cobertizo sobre postes), el suelo más alto + 4 pasos, lo de una casa
function roofBase(r){ let wall=-1, floor=0; for(let z=r.z;z<r.z+r.d;z++) for(let x=r.x;x<r.x+r.w;x++){ const i=idx(x,z); if(M.t[i]==='w') wall=Math.max(wall,M.h[i]); else floor=Math.max(floor,M.h[i]); }
  return (wall>=0?wall:Math.min(16,floor+4))*STEP; }
// eje de la cumbrera ('x' o 'z') y, en el techo a un agua, hacia qué lado cae (flip: cae hacia el lado de menor coordenada)
function roofAxis(r){ const auto=r.w>=r.d?'x':'z'; if(!Number.isInteger(r.rot)) return {along:auto,flip:false}; return {along:r.rot%2?'z':'x',flip:r.rot>=2}; }
function roofGeo(r){
  const pos=[],ruv=[],til=[],sh=[];
  const mat=ROOF_MATS[r.mat]||ROOF_MATS.tile, shape=ROOF_SHAPES[r.shape]?r.shape:'gable', base=roofBase(r);
  const TOP=tileRC(mat.slot), END=tileRC((TERR[mat.end]||TERR.o).side[0]), STONE=tileRC(TERR.s.top[0]), WSIDE=tileRC(TERR.w.side[0]), WTOP=tileRC(TERR.w.top[0]);
  // polígono plano convexo: U = dirección de las hileras (a lo largo del alero); V sube por el faldón; out = hacia fuera
  const face=(pts,U,tile,out,k)=>{ let n=v3n(v3cross(v3sub(pts[1],pts[0]),v3sub(pts[2],pts[0]))); if(v3dot(n,out)<0) n=n.map(v=>-v);
    const Uu=v3n(U); let V=v3n(v3cross(n,Uu)); if(V[1]<0||(Math.abs(V[1])<1e-6&&v3dot(V,[1,0,1])<0)) V=V.map(v=>-v);
    const o=pts[0], s2=Math.min(1.08,(0.5+0.56*Math.max(0,v3dot(n,RL)/RLn))*(k||1));
    for(let i=1;i<pts.length-1;i++) for(const p of [pts[0],pts[i],pts[i+1]]){ pos.push(p[0],p[1],p[2]); const d=v3sub(p,o); ruv.push(v3dot(d,Uu),v3dot(d,V)); til.push(tile[0],tile[1]); sh.push(s2); } };
  const box=(x0,y0,z0,x1,y1,z1,side,top)=>{
    face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],[1,0,0],top,[0,1,0]);
    face([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],[1,0,0],side,[0,0,-1]); face([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[1,0,0],side,[0,0,1]);
    face([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[0,0,1],side,[-1,0,0]); face([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],[0,0,1],side,[1,0,0]); };
  const X0=r.x, X1=r.x+r.w, Z0=r.z, Z1=r.z+r.d, o=0.25, cc=[r.x+r.w/2,r.z+r.d/2];
  if(shape==='flat'){
    // azotea de losas con pretil y almenas de muro (el material no cuenta: es piedra)
    const y1=base+0.125, py=y1+0.3125, my=py+0.3125, t=0.25;
    box(X0,base,Z0,X1,y1,Z1,WSIDE,STONE);
    box(X0,y1,Z0,X1,py,Z0+t,WSIDE,WTOP); box(X0,y1,Z1-t,X1,py,Z1,WSIDE,WTOP); box(X0,y1,Z0+t,X0+t,py,Z1-t,WSIDE,WTOP); box(X1-t,y1,Z0+t,X1,py,Z1-t,WSIDE,WTOP);
    const merl=(a0,a1,fixed,alongX)=>{ const len=a1-a0, n=Math.max(1,Math.round(len/0.625)), step=len/n, w=Math.min(step*0.6,0.4);
      for(let i=0;i<n;i++){ const c=a0+step*(i+0.5); if(alongX) box(c-w/2,py,fixed[0],c+w/2,my,fixed[1],WSIDE,WTOP); else box(fixed[0],py,c-w/2,fixed[1],my,c+w/2,WSIDE,WTOP); } };
    merl(X0,X1,[Z0,Z0+t],true); merl(X0,X1,[Z1-t,Z1],true); merl(Z0+t,Z1-t,[X0,X0+t],false); merl(Z0+t,Z1-t,[X1-t,X1],false);
  } else if(shape==='cone'){
    const R=Math.max(r.w,r.d)/2+0.3, H=Math.max(1.6,R*1.9), n=R>2.2?16:12, cy=base+0.04, ap=[cc[0],base+H,cc[1]];
    const P=i=>{ const a=(i+0.5)/n*Math.PI*2; return [cc[0]+R*Math.cos(a),cy,cc[1]+R*Math.sin(a)]; };
    for(let i=0;i<n;i++){ const a=P(i), b=P(i+1), m=[(a[0]+b[0])/2-cc[0],0,(a[2]+b[2])/2-cc[1]];
      face([a,b,ap],v3sub(b,a),TOP,[m[0],1,m[2]]);
      face([a,b,[b[0],cy-0.14,b[2]],[a[0],cy-0.14,a[2]]],v3sub(b,a),TOP,m,0.62); }
    box(ap[0]-0.05,ap[1]-0.2,ap[2]-0.05,ap[0]+0.05,ap[1]+0.32,ap[2]+0.05,WSIDE,WTOP);
  } else {
    const {along,flip}=roofAxis(r), AX=along==='x';
    const W3=(a,y,s)=>AX?[a,y,s]:[s,y,a], Ua=AX?[1,0,0]:[0,0,1], Us=AX?[0,0,1]:[1,0,0];
    const A0=(AX?X0:Z0)-o, A1=(AX?X1:Z1)+o, S0=(AX?Z0:X0)-o, S1=(AX?Z1:X1)+o, a0=A0+o, a1=A1-o, s0=S0+o, s1=S1-o;
    const span=S1-S0, mid=(S0+S1)/2, fa=0.1;
    const strip=(p,q,out)=>face([p,q,[q[0],q[1]-fa,q[2]],[p[0],p[1]-fa,p[2]]],v3sub(q,p),TOP,out,0.55);
    if(shape==='shed'){
      const rise=span*0.3, hS=s=>flip?base+rise*(s-S0)/span:base+rise*(S1-s)/span, sh0=flip?S1:S0, sl=flip?S0:S1, sw=flip?s1:s0;
      face([W3(A0,hS(sh0),sh0),W3(A1,hS(sh0),sh0),W3(A1,base,sl),W3(A0,base,sl)],Ua,TOP,[0,1,0]);
      face([W3(a0,base,sw),W3(a1,base,sw),W3(a1,hS(sw),sw),W3(a0,hS(sw),sw)],Ua,END,flip?Us:Us.map(v=>-v));
      for(const [a,dir] of [[a0,-1],[a1,1]]) face([W3(a,base,s0),W3(a,base,s1),W3(a,hS(s1),s1),W3(a,hS(s0),s0)],Us,END,Ua.map(v=>v*dir));
      strip(W3(A0,base,sl),W3(A1,base,sl),flip?Us.map(v=>-v):Us); strip(W3(A0,hS(sh0),sh0),W3(A1,hS(sh0),sh0),flip?Us:Us.map(v=>-v));
      strip(W3(A0,hS(sh0),sh0),W3(A0,base,sl),Ua.map(v=>-v)); strip(W3(A1,hS(sh0),sh0),W3(A1,base,sl),Ua);
    } else {
      const rise=span*0.42, ridge=base+rise, hS=s=>ridge-rise*Math.abs(s-mid)/(span/2);
      let ra0=A0, ra1=A1;
      if(shape==='hip'){ ra0=A0+span/2; ra1=A1-span/2; if(ra0>ra1) ra0=ra1=(A0+A1)/2; }
      for(const [se,sg] of [[S0,-1],[S1,1]]){
        face([W3(A0,base,se),W3(A1,base,se),W3(ra1,ridge,mid),W3(ra0,ridge,mid)],Ua,TOP,[0,1,0]);
        strip(W3(A0,base,se),W3(A1,base,se),Us.map(v=>v*sg)); }
      if(shape==='hip') for(const [ae,ra,sg] of [[A0,ra0,-1],[A1,ra1,1]]){ face([W3(ae,base,S0),W3(ae,base,S1),W3(ra,ridge,mid)],Us,TOP,[0,1,0]); strip(W3(ae,base,S0),W3(ae,base,S1),Ua.map(v=>v*sg)); }
      else for(const [a,ae,sg] of [[a0,A0,-1],[a1,A1,1]]){
        face([W3(a,base,s0),W3(a,base,s1),W3(a,hS(s1),s1),W3(a,ridge,mid),W3(a,hS(s0),s0)],Us,END,Ua.map(v=>v*sg));
        strip(W3(ae,base,S0),W3(ae,ridge,mid),Ua.map(v=>v*sg)); strip(W3(ae,ridge,mid),W3(ae,base,S1),Ua.map(v=>v*sg)); }
      // caballete: una hilada oscura sobre la cumbrera
      if(ra1>ra0) for(const sg of [-1,1]) face([W3(ra0,ridge-0.04,mid+sg*0.14),W3(ra1,ridge-0.04,mid+sg*0.14),W3(ra1,ridge+0.06,mid),W3(ra0,ridge+0.06,mid)],Ua,TOP,[0,1,0],0.78);
    }
  }
  const n=pos.length/3, g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('aRUv',new THREE.Float32BufferAttribute(ruv,2));
  g.setAttribute('aTile',new THREE.Float32BufferAttribute(til,2)); g.setAttribute('aShade',new THREE.Float32BufferAttribute(sh,1));
  g.setAttribute('aTorch',new THREE.Float32BufferAttribute(new Float32Array(n*3),3));
  g.computeBoundingSphere(); return {g,base};
}
function buildRoofs(){
  for(const m of roofMeshes){ scene.remove(m); m.geometry.dispose(); } roofMeshes=[];
  if(!M||!M.roofs) return;
  roofMat.uniforms.uTexN.value=TEX;
  for(const r of M.roofs){ const {g,base}=roofGeo(r); const m=new THREE.Mesh(g,roofMat); m.userData={r,base}; scene.add(m); roofMeshes.push(m); }
  roofLight(); roofKey=null; markMini(); if(EH) computeAmbient();   // cada techo es una zona interior
}
// la luz de la calle llega a los aleros: cada vértice toma la de la casilla de fuera más cercana, menos cuanto más alto
function roofLight(){ if(!L||!M) return;
  for(const m of roofMeshes){ const {r,base}=m.userData, P=m.geometry.attributes.position, T=m.geometry.attributes.aTorch;
    for(let v=0;v<P.count;v++){ const px=P.getX(v), py=P.getY(v), pz=P.getZ(v); let cx=Math.floor(px), cz=Math.floor(pz);
      if(cx>=r.x&&cz>=r.z&&cx<r.x+r.w&&cz<r.z+r.d){ const dl=cx-r.x, dr=r.x+r.w-1-cx, dt=cz-r.z, db=r.z+r.d-1-cz, mn=Math.min(dl,dr,dt,db);
        if(mn===dl) cx=r.x-1; else if(mn===dr) cx=r.x+r.w; else if(mn===dt) cz=r.z-1; else cz=r.z+r.d; }
      cx=Math.max(0,Math.min(M.w-1,cx)); cz=Math.max(0,Math.min(M.d-1,cz));
      const k=Math.max(0.06,Math.min(0.38,0.38-(py-base)/3.5)), j=idx(cx,cz)*3;
      T.setXYZ(v,Math.max(0,L[j])*k,Math.max(0,L[j+1])*k,Math.max(0,L[j+2])*k); }
    T.needsUpdate=true; } }
function roofTick(){
  if(!M||!M.roofs||!M.roofs.length){ if(RCAP){ RCAP=null; rebuild(); } return; }
  const open=new Set(), mode=state.roofMode;
  // al editar se ocultan, salvo con la herramienta Techos, que los enseña para ver material y forma
  if(mode==='hide'||(state.mode==='edit'&&state.tool!=='roof')) M.roofs.forEach((r,i)=>open.add(i));
  else if(mode==='auto'){
    const doors=M.props.filter(p=>Catalogo.isDoor(p,PIECES));
    for(const b of [selected,curMini()]) if(b&&b.mini){
      const n=nOf(b); for(const [fx,fz] of Fichas.footprint(b.x,b.z,n)){ const i=roofOf(fx,fz); if(i>=0) open.add(i); }
      // en el umbral: a una casilla de una puerta (afuera o adentro) también se abre esa casa
      for(const d of doors) if(Fichas.gap(b.x,b.z,n,d.x,d.z,1).cells<=1){ const k=roofOf(d.x,d.z); if(k>=0) open.add(k); }
    } }
  const key=[...open].sort().join(','); if(key===roofKey) return; roofKey=key;
  roofMeshes.forEach((m,i)=>{ m.visible=!open.has(i); });
  const n=M.w*M.d; RCAP=open.size?new Int8Array(n):null;
  for(const i of open){ const r=M.roofs[i]; let floor=99;
    for(let z=r.z;z<r.z+r.d;z++) for(let x=r.x;x<r.x+r.w;x++){ const k=idx(x,z); if(M.t[k]!=='w') floor=Math.min(floor,M.h[k]); }
    if(floor===99) floor=2;
    for(let z=r.z;z<r.z+r.d;z++) for(let x=r.x;x<r.x+r.w;x++){ const k=idx(x,z); if(M.t[k]==='w') RCAP[k]=floor+1; } }
  rebuild(); markMini();
}
$('roofsBtn').onclick=()=>{ const o=['auto','show','hide']; state.roofMode=o[(o.indexOf(state.roofMode)+1)%3]; $('roofsBtn').textContent=ROOF_NAMES[state.roofMode]; roofKey=null; };
// --- puertas ---
function doorPose(b){ const base=((b.prop&&b.prop.v)|0)*HALF_PI, open=!!(b.prop&&b.prop.open), D=b.prop&&Catalogo.defOf(b.prop,PIECES), lift=(D&&D.components.door&&D.components.door.lift)||0;
  if(lift){ b.mesh.rotation.y=base; b.ox=0; b.oz=0; b.oy=open?lift:0; return; }   // el rastrillo sube dentro del arco
  b.mesh.rotation.y=base+(open?HALF_PI:0); const c=Math.cos(base), s2=Math.sin(base);
  const lx=open?-0.42:0, lz=open?-0.42:0; b.ox=lx*c+lz*s2; b.oz=-lx*s2+lz*c; }
function toggleDoor(p,remote,batch){
  if(!remote&&!canOpenDoor(p)){ showHint(p.locked?'Esa puerta está cerrada con llave.':'El director no deja a los jugadores abrir puertas.',1800); return false; }
  p.open=!p.open; p.state=Object.assign({},p.state,{open:!!p.open,locked:!!p.locked});
  for(const i of doorCells(p)) recalcCell(i);   // P-48: al abrir no se libera lo que otra pieza de la casilla sigue bloqueando
  const b=bills.find(q=>q.prop===p); if(b) doorPose(b);
  fogDirty=true; rangeKey=''; computeAmbient();   // por una puerta abierta entra la luz de fuera
  if(batch) batch.push(p); else doorRelight(p);   // y la de las fuentes de detrás de la puerta (§6); en un lote, una vez al final (M6)
  if(!remote&&LIVE.on) DB.doc('live/doors').update({d:{[p.x+'_'+p.z]:p.open?1:0}}).catch(e=>{ liveErr(e); if(!LIVE.dm) toggleDoor(p,true); });
  return true;
}
// el director echa o quita la llave (cerrar con llave también cierra), con deshacer; en la mesa en vivo se reparte con la escena
function lockDoor(p,on){ beginStroke(); if(on&&p.open) toggleDoor(p); p.locked=!!on; if(!on) delete p.locked; p.state=Object.assign({},p.state,{open:!!p.open,locked:!!p.locked}); stroke.ents=true; stroke.changed=true; flushEdit(); endStroke();
  if(LIVE.on&&LIVE.dm) liveBoardNow(); showHint(on?'Puerta cerrada con llave: los jugadores no la abren.':'Puerta sin llave.',1600); }
// puerta de la casilla (x,z): la que tiene ahí su esquina o, si no, una de varias casillas que la cubre (P-48 a)
function doorAt(x,z){ let hit=null;
  for(const p of M.props){ if(p.x>x||p.z>z||!Catalogo.isDoor(p,PIECES)) continue; if(p.x===x&&p.z===z) return p; if(!hit&&propCovers(p,x,z)) hit=p; }
  return hit; }
// rehace blocked/doorShut/doorSeal de una casilla con todas las piezas que la cubren (lo mismo que refreshEntities para ella)
function recalcCell(i){ const x=i%M.w, z=(i/M.w)|0; let bl=false, sh=false, se=false;
  for(const q of M.props){ if(q.x>x||q.z>z||!propCovers(q,x,z)) continue; const op=opaque(q), D=op?null:Catalogo.defOf(q,PIECES);
    if(D&&D.components.door){ if(!q.open){ bl=sh=true; if(Muros.kindOf(q)==='door') se=true; } } else if(op||Catalogo.blocksMove(q,PIECES)) bl=true; }
  const put=(S,v)=>{ if(v) S.add(i); else S.delete(i); }; put(blocked,bl); put(doorShut,sh); put(doorSeal,se); }
// índices de las casillas (dentro del mapa) que ocupa una puerta
function doorCells(p){ const out=[]; for(const [x,z] of propCells(p)) if(inb(x,z)) out.push(idx(x,z)); return out; }

/* ============ fase 8: campañas ============ */
// Una campaña guarda varios tableros (serializados), los pasos entre ellos y notas del DM por casilla, solo para el DM.
let CAMP=null;
const newCid=()=>'t'+Math.random().toString(36).slice(2,9);
function campNotes(){ if(!CAMP) return []; return CAMP.notes[CAMP.cur]||(CAMP.notes[CAMP.cur]=[]); }
function campStore(){ if(CAMP&&CAMP.cur&&M){ syncMinis(); CAMP.boards[CAMP.cur].data=JSON.parse(JSON.stringify(serialize())); CAMP.boards[CAMP.cur].name=M.name; } }
function campGo(id,arrive){
  if(!CAMP||!CAMP.boards[id]) return; const prev=CAMP.cur; campStore();
  const travellers=arrive?arrive.minis:[]; let m;
  try{ m=deserialize(CAMP.boards[id].data); }catch(e){ showHint('Ese tablero de la campaña está dañado.'); return; }
  const moved=[];
  if(travellers.length){ // llegan junto al portal de destino, del lado por el que se anda (Muros.arrival, como el servidor)
    m.minis=m.minis.filter(q=>!travellers.some(t=>t.id===q.id));
    const tp=m.props.find(q=>FT(q)==='portal'&&q.id===arrive.portal), at=tp?[tp.x,tp.z]:m.start;
    const cells=Muros.arrival(Muros.gridOf(m,PIECES),at[0],at[1],travellers.map(t=>Fichas.cellsOf(t.sheet)),m.start);
    travellers.forEach((t,i)=>{ if(cells[i]){ m.minis.push({...t,x:cells[i][0],z:cells[i][1]}); moved.push(t.id); } });
    if(moved.length){ const f=m.minis.find(q=>q.id===moved[0]); m.start=[f.x,f.z]; }
    const pd=CAMP.boards[prev].data; pd.minis=pd.minis.filter(q=>!moved.includes(q.id));   // quien llega deja el tablero de origen
  }
  CAMP.cur=id; loadMap(m); if(moved.length){ const s2=bills.find(b=>b.id===moved[0]); if(s2){ selected=s2; } }
  if(LIVE.on&&LIVE.dm) liveBoardNow(); drawNotes(); renderGame(); showHint('Ahora en: '+m.name+(moved.length<travellers.length?' (alguien no cupo y se quedó)':''),1800);
}
// al llegar junto a un portal que lleva a algún sitio, se ofrece cruzar (sólo a quien mueve esa ficha)
function arrived(b){
  if(!b.mini||b!==selected||!canControl(b)) return; const p=M.props.find(q=>FT(q)==='portal'&&q.target&&Muros.near(b.x,b.z,nOf(b),q)); if(!p) return;
  if(!portalDest(p)) return; travelDialog(p,b);
}
// crear portales de ida y vuelta entre dos tableros de la campaña (con aspecto de escalera, como los pasos de antes)
function campLink(x,z,toId){
  if(!CAMP||!CAMP.boards[toId]) return; const tgt=CAMP.boards[toId].data;
  let tx=Array.isArray(tgt.start)?tgt.start[0]:(tgt.w>>1), tz=Array.isArray(tgt.start)?tgt.start[1]:(tgt.d>>1);
  // en el tablero destino, la vuelta va en una casilla libre cercana
  const free=(xx,zz)=>xx>=0&&zz>=0&&xx<tgt.w&&zz<tgt.d&&tgt.t[zz*tgt.w+xx]!=='w'&&tgt.t[zz*tgt.w+xx]!=='l'&&!tgt.props.some(p=>p.x===xx&&p.z===zz)&&!(tgt.minis||[]).some(q=>q.x===xx&&q.z===zz);
  outer: for(let r=0;r<6;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){ if(free(tx+dx,tz+dz)){ tx+=dx; tz+=dz; break outer; } }
  // normProp deja sólo lo del muro: el uid de cada pieza se conserva (es su id fijo en la escena)
  tgt.props=Muros.fixPortalIds(tgt.props.filter(p=>!(p.x===tx&&p.z===tz)).map(p=>{ const w=Muros.normProp(p); return w?Object.assign(w,typeof p.uid==='string'?{uid:p.uid}:{}):p; }));
  const here={type:'portal',x,z,v:0,uid:Catalogo.newUid(),id:Muros.nextPortalId(M.props),look:'stairs'}, back={type:'portal',x:tx,z:tz,v:0,uid:Catalogo.newUid(),id:Muros.nextPortalId(tgt.props),look:'stairs',target:{scene:CAMP.cur,portal:here.id}};
  here.target={scene:toId,portal:back.id};
  M.props=M.props.filter(p=>!(p.x===x&&p.z===z)); M.props.push(here); tgt.props.push(back);
  refreshEntities(); showHint('Portal creado, con su vuelta en '+CAMP.boards[toId].name+'.',2200); renderGame();
}
// --- notas del DM ---
let noteMeshes=[];
function drawNotes(){
  for(const m of noteMeshes){ scene.remove(m); m.material.dispose(); } noteMeshes=[];
  if(!CAMP||!M||(LIVE.on&&!LIVE.dm)) return;
  for(const n of campNotes()){ if(!inb(n.x,n.z)) continue; const m=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:SPR.sel,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
    m.material.color.set('#9a7fd6'); m.scale.set(0.7,1,0.7); m.position.set(n.x+.5,topY(n.x,n.z)+0.035,n.z+.5); scene.add(m); noteMeshes.push(m); }
}
function noteEditor(x,z,existing){
  closeCtx(); ctxEl.textContent=''; const h=document.createElement('strong'); h.textContent='Nota del DM en '+x+', '+z; ctxEl.appendChild(h);
  const ta=document.createElement('textarea'); ta.maxLength=500; ta.value=existing?existing.text:''; ta.setAttribute('aria-label','Texto de la nota'); ctxEl.appendChild(ta);
  const save=document.createElement('button'); save.textContent='Guardar nota'; save.onclick=()=>{ const t=ta.value.trim(); const ns=campNotes();
    if(existing){ if(t) existing.text=t; else ns.splice(ns.indexOf(existing),1); } else if(t) ns.push({x,z,text:t}); closeCtx(); drawNotes(); renderGame(); };
  ctxEl.appendChild(save); ctxEl.hidden=false; ta.focus();
}
// --- guardar, abrir, exportar ---
const LSC='tablero:campaigns';
async function campSave(){ if(!CAMP||!piecesGate()) return; campStore(); CAMP.updated=Date.now(); const rec=JSON.parse(JSON.stringify(CAMP));
  try{ if(DB){ await DB.collection('campaigns').doc(CAMP.id).set(rec); } else { const all=lsGet(LSC); all[CAMP.id]=rec; if(!lsSet(LSC,all)) throw 0; }
    showHint('Campaña guardada.',1400); }catch(e){ showHint('No se pudo guardar la campaña: puede ser demasiado grande.',2600); } }
async function campList(){ if(DB){ try{ const q=await DB.collection('campaigns').orderBy('updated','desc').limit(30).get(); return q.docs.map(d=>d.data()); }catch(e){} } return Object.values(lsGet(LSC)); }
function campValid(o){ return Escena.campValid(o,escenaDeps()); }
async function campOpen(o){ await PIECES_READY; const c=campValid(o); if(!c){ showHint('Esa campaña está dañada.'); return; } CAMP=null; CAMP=c; const id=c.cur; const m=deserialize(c.boards[id].data); loadMap(m); drawNotes(); renderGame(); showHint('Campaña "'+c.name+'" abierta.',1600); }
function campNew(){ syncMinis(); const id=newCid(); CAMP={id:'c'+Math.random().toString(36).slice(2,9),name:'Campaña nueva',boards:{[id]:{name:M.name,data:JSON.parse(JSON.stringify(serialize()))}},notes:{[id]:[]},cur:id}; drawNotes(); renderGame(); }
function campAddBoard(m){ if(!CAMP) return; campStore(); const id=newCid(); CAMP.boards[id]={name:m.name,data:JSON.parse(JSON.stringify((()=>{ const keep=M; M=m; const o=serializeOf(m); M=keep; return o; })()))}; CAMP.notes[id]=[]; renderGame(); return id; }
// serializar un mapa que no es el actual (para añadirlo a la campaña)
function serializeOf(m){ return {v:2,name:m.name,w:m.w,d:m.d,h:Array.from(m.h,n=>n.toString(36)).join(''),t:m.t.join(''),wsrc:m.src?Array.from(m.src).join(''):Array.from(m.t,c=>c==='~'?'2':'0').join(''),
  start:m.start,props:m.props.map(p=>Catalogo.complete(p,PIECES)),minis:(m.minis||[]).map(q=>({...q,sheet:normSheet(q.sheet,q.kind),id:q.id||('m'+Math.random().toString(36).slice(2,9))})),roofs:(m.roofs||[]).map(r=>({...r})),...Ambiente.norm(m),...(m.zoneCells?{zoneCells:m.zoneCells}:{}),fog:false,seen:'',...sceneExtras(m)}; }
function campExample(){
  const town=townMap(), dung=dungeonMap(40,4242); dung.name='Catacumbas bajo el pozo';
  const tId='tbrezo', dId='tcatac'; CAMP={id:'cbrezo',name:'Campaña de Brezo',boards:{},notes:{},cur:tId};
  CAMP.boards[tId]={name:town.name,data:serializeOf(town)}; CAMP.boards[dId]={name:dung.name,data:serializeOf(dung)};
  const d0=CAMP.boards[dId].data; d0.minis=d0.minis.filter(q=>q.kind!=='knight');   // los héroes llegan desde el pueblo
  CAMP.notes[tId]=[{x:21,z:14,text:'El pregonero habla de ruidos que salen del pozo por las noches.'},{x:27,z:10,text:'Olga paga 50 monedas de oro a quien averigüe qué pasa bajo el pozo.'}];
  CAMP.notes[dId]=[{x:dung.start[0],z:dung.start[1],text:'Huele a humedad. Se oyen pasos y huesos que crujen más adelante.'}];
  loadMap(deserialize(CAMP.boards[tId].data)); campLink(16,15,dId); drawNotes(); renderGame();
  showHint('Campaña de Brezo: lleva a un héroe junto a la bajada que hay al lado del pozo (el portal con escalones) para descender.',4000);
}
$('campFile').onchange=()=>{ const f=$('campFile').files&&$('campFile').files[0]; if(!f) return; const rd=new FileReader();
  rd.onload=()=>{ try{ campOpen(JSON.parse(rd.result)).catch(()=>showHint('Esa campaña está dañada.')); }catch(e){ showHint('Ese archivo no es una campaña válida.'); } $('campFile').value=''; }; rd.readAsText(f); };
function renderCamp(){
  const p=$('gCamp'); if(!p) return; p.textContent='';
  if(LIVE.on&&!LIVE.dm){ p.append(el('div','t3d-ginfo','La campaña la lleva el DM; cuando cambie de tablero lo verás aquí automáticamente.')); return; }
  if(!CAMP){ p.append(el('div','t3d-ginfo','Una campaña une varios tableros con pasos entre ellos y guarda notas del DM que los jugadores no ven.'),
      mkBtn('Crear campaña con este tablero',campNew),mkBtn('Abrir el ejemplo: Campaña de Brezo',campExample),mkBtn('Mis campañas',async()=>{ const L=await campList(); const box=$('gCamp');
        const t=el('span','t3d-lbl',L.length?'Tus campañas':'Aún no guardas campañas.'); box.append(t); for(const c of L) box.append(mkBtn((c.name||'Campaña')+' ('+Object.keys(c.boards||{}).length+' tableros)',()=>campOpen(c))); }),
      mkBtn('Importar campaña',()=>$('campFile').click()));
    return; }
  const nm=el('input','t3d-gname'); nm.value=CAMP.name; nm.maxLength=40; nm.setAttribute('aria-label','Nombre de la campaña'); nm.oninput=()=>{ CAMP.name=nm.value||CAMP.name; }; p.append(nm);
  p.append(el('span','t3d-lbl','Tableros'));
  for(const [id,bd] of Object.entries(CAMP.boards)){ const here=id===CAMP.cur; p.append(mkBtn((here?'Aquí: ':'')+bd.name,()=>{ if(!here) campGo(id); },{pressed:here,title:here?'Tablero actual':'Ir a este tablero'})); }
  p.append(mkBtn('Añadir tablero vacío 24×24',()=>{ const m=blankMap(24); m.name='Tablero '+(Object.keys(CAMP.boards).length+1); m.minis=[]; campAddBoard(m); }),
    mkBtn('Añadir mazmorra',()=>{ const m=dungeonMap(40,(Math.random()*1e9)|0); m.name='Mazmorra '+(Object.keys(CAMP.boards).length+1); campAddBoard(m); }),
    mkBtn('Añadir el pueblo de ejemplo',()=>campAddBoard(townMap())));
  p.append(el('div','t3d-ginfo','Para unir tableros: en Editar, clic derecho (o mantener pulsado) sobre una casilla y elige "Crear portal a...". Se crea también la vuelta. También con la herramienta Muros (M), Portal.'));
  p.append(el('span','t3d-lbl','Notas del DM en este tablero'));
  const ns=campNotes(); if(!ns.length) p.append(el('div','t3d-ginfo','Sin notas. Añádelas con el menú contextual de cualquier casilla.'));
  for(const n of ns){ const r=el('div','t3d-note-row'); r.append(el('span',null,n.x+', '+n.z+': '+n.text),mkBtn('Ir',()=>{ state.camGoal={x:n.x+.5,z:n.z+.5}; }),mkBtn('Editar',()=>{ const c=canvas.getBoundingClientRect(); noteEditor(n.x,n.z,n); ctxEl.style.left=(c.left+16)+'px'; ctxEl.style.top=(c.top+80)+'px'; })); p.append(r); }
  p.append(sepEl(),mkBtn('Guardar campaña',campSave),mkBtn('Exportar campaña',async()=>{ if(!DL){ showHint('Exportar no está disponible aquí.'); return; } campStore();
      try{ await DL.save({filename:(CAMP.name||'campaña').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g,'').trim().replace(/\s+/g,'-')+'.json',data:JSON.stringify(CAMP)}); }catch(e){} }),
    mkBtn('Cerrar campaña',()=>{ CAMP=null; drawNotes(); renderGame(); }));
}

/* ============ fase 6: mesa en vivo ============ */
// Estado compartido (db): live/board (tablero), live/tokens (personajes), live/combat (turnos).
// Momentos (room): tiradas y señales; presencia: cursor de cada persona. Nombres: user.profiles, nunca guardados.
const LIVE={cap:false,on:false,dm:!0,me:null,myColor:null,room:null,user:null,uns:[],rev:0,wT:0,names:new Map(),colors:new Map(),peers:[],exists:false,lastTokens:null,lastCombat:null,pings:[],cur:new Map(),plans:{}};
const TOK_ID=/^[a-z0-9]{2,12}$/, UID=/^[A-Za-z0-9_\-]{1,64}$/;
function canControl(b){ return !LIVE.on||LIVE.dm||(!!b&&!!b.owner&&b.owner===LIVE.me); }
function nameOf(id){ return (id&&LIVE.names.get(id))||'Alguien'; }
async function resolveNames(){ if(!LIVE.user) return; const ids=[...new Set(LIVE.peers.map(p=>p.by).filter(Boolean))]; if(!ids.length) return;
  try{ const ps=await LIVE.user.profiles(ids); for(const id of ids){ const pr=ps&&ps[id]; if(pr){ LIVE.names.set(id,pr.name||'Alguien'); if(pr.color) LIVE.colors.set(id,pr.color); } } renderGame(); drawPeers(); }catch(e){} }
async function liveInit(c){
  try{ LIVE.room=await c.use('room'); }catch(e){ LIVE.room=null; }
  try{ LIVE.user=await c.use('user'); }catch(e){ LIVE.user=null; }
  LIVE.cap=!!(DB&&LIVE.room);
  if(LIVE.user){ try{ const me=await LIVE.user.me(); LIVE.me=me.id; LIVE.myColor=me.color; LIVE.dm=!!me.canEdit; }catch(e){} }
  if(!LIVE.cap){ renderGame(); return; }
  LIVE.room.onPeers(()=>{ LIVE.peers=LIVE.room.peers(); resolveNames(); drawPeers(); if(state.gameOpen) renderGame(); });
  // tiradas: las hace el servidor y llegan a todos, también a quien tira (el cuerpo de JA-VTT, ver dados.js)
  LIVE.room.on('roll',m=>{ if(!LIVE.on) return; const d=m.data; if(d&&Array.isArray(d.dice)) logRoll(d,m.sameTab?'':nameOf(m.by)); });
  // un jugador pide cruzar un portal con su ficha: el director decide (la mesa sigue su escena)
  LIVE.room.on('travelAsk',m=>{ if(!LIVE.on||!LIVE.dm||!M) return; const d=m.data||{}, p=M.props.find(q=>FT(q)==='portal'&&q.id===d.portal), b=byId(d.token); if(!p||!b) return;
    const dst=portalDest(p); travelDialog(p,b,nameOf(m.by)+' quiere cruzar el portal «'+portalLabel(p)+'» con '+miniName(b)+(dst?' hacia '+dst.name:'')+'.'); });
  LIVE.room.on('ping',m=>{ if(!LIVE.on) return; const d=m.data; if(d&&Number.isInteger(d.x)&&Number.isInteger(d.z)&&M&&inb(d.x,d.z)) showPing(d.x,d.z,LIVE.colors.get(m.by)||'#ffd35a',m.isMe?'Señalaste':nameOf(m.by)+' señala'); });
  await liveCheck(); if(LIVE.exists&&!LIVE.on) showHint('Hay una mesa en vivo abierta. Únete en la pestaña Mesa.',4500);
  // en tiempo real: quien no está en la mesa se entera en cuanto el director la abre o la cierra
  DB.doc('live/board').onSnapshot(sn=>{ const d=sn.exists?sn.data():null, ex=!!(d&&d.open);
    if(ex&&!LIVE.exists&&!LIVE.on&&!LIVE.dm) showHint('El director abrió la mesa en vivo. Únete en la pestaña Mesa.',4000);
    LIVE.exists=ex; if(!LIVE.on) renderGame(); },()=>{});
  renderGame();
}
async function liveCheck(){ try{ const s=await DB.doc('live/board').get(); const d=s.exists?s.data():null; LIVE.exists=!!(d&&d.open); }catch(e){ LIVE.exists=false; } }
function tokData(b){ const d=b.path?b.path[b.path.length-1]:[b.x,b.z]; return {kind:b.kind,x:d[0],z:d[1],fx:b.fx,fz:b.fz,sheet:cloneSheet(b.sheet),owner:b.owner||null}; }
// el combate con la iniciativa de JA-VTT ({ entries, turn, round }): una entrada por ficha (tokenId), con su nombre y su total
function combatState(){ const on=GM.active&&GM.order.length;
  const entries=on?GM.order.map((o,k)=>{ const m=byId(o.id); return {id:k+1,name:(m?miniName(m):o.name||'').slice(0,40),value:o.total,tokenId:o.id,roll:Math.max(1,o.roll|0),init:o.init|0}; }):[];
  return {initiative:{entries,turn:on?Math.max(0,GM.turn):0,round:on?GM.round:1},left:GM.left,dashed:GM.dashed}; }
function liveErr(e){ if(e&&e.code==='invalid_argument'&&!LIVE.dm) showHint(e.message||'No tienes permiso para cambiar eso: solo el director puede.',3000); }
function liveTok(b){ if(!LIVE.on||!b||!b.id) return; DB.doc('live/tokens').update({tokens:{[b.id]:tokData(b)}}).catch(liveErr); }
// el director pone el combate entero; un jugador, en el turno de su ficha, sólo lo que le queda de movimiento (y pasa el turno
// pidiéndoselo al servidor, que es quien sabe el orden completo)
function liveCombat(){ if(!LIVE.on) return; if(LIVE.dm) DB.doc('live/combat').set(combatState()).catch(liveErr); else DB.doc('live/combat').update({left:GM.left,dashed:GM.dashed}).catch(liveErr); }
function liveBoardNow(){
  if(!LIVE.on||!LIVE.dm||!PIECES_OK) return Promise.resolve(); syncMinis(); const o=serialize(); delete o.minis; LIVE.rev=Date.now();
  const tokens={}; for(const b of bills) if(b.mini) tokens[b.id]=tokData(b);
  return Promise.all([DB.doc('live/board').set({open:true,rev:LIVE.rev,board:o,...(!CAMP&&M.boardId?{scene:M.boardId}:{})}),DB.doc('live/tokens').set({tokens})]).catch(liveErr);
}
function liveBoardSoon(){ if(!LIVE.on||!LIVE.dm) return; clearTimeout(LIVE.wT); LIVE.wT=setTimeout(liveBoardNow,700); }
async function liveHost(){
  if(!LIVE.cap||!LIVE.dm) return; LIVE.on=true;
  try{ await liveBoardNow(); await DB.doc('live/combat').set(combatState()); await DB.doc('live/doors').set({d:{}}); await DB.doc('live/plans').set({plans:{}}); }catch(e){ LIVE.on=false; liveErr(e); return; }
  liveSubscribe(); showHint('Mesa abierta: los miembros del tablero se unen desde la pestaña Mesa.',3000);
}
function liveSubscribe(){
  liveUnsub(); LIVE.on=true;
  LIVE.uns.push(DB.doc('live/board').onSnapshot(sn=>{ const d=sn.exists?sn.data():null;
    if(!d||!d.open){ if(LIVE.on&&!LIVE.dm){ liveLeave(); showHint('El DM cerró la mesa.',2500); } return; }
    if(d.rev===LIVE.rev) return; LIVE.rev=d.rev;
    try{ const m=deserialize(d.board); m.minis=[]; if(typeof d.scene==='string') m.boardId=d.scene; const keep=selected&&selected.id, moved=M&&M.boardId&&m.boardId&&m.boardId!==M.boardId; loadMap(m,!moved);
      if(moved) showHint('La mesa pasa a «'+m.name+'».',2000); if(LIVE.lastTokens) applyTokens(LIVE.lastTokens,keep); if(LIVE.lastCombat) applyCombat(LIVE.lastCombat); roleUI(); }
    catch(e){ showHint('No se pudo leer el tablero de la mesa.'); } },()=>{}));
  LIVE.uns.push(DB.doc('live/tokens').onSnapshot(sn=>{ const d=sn.exists?sn.data():null; if(d&&d.tokens&&typeof d.tokens==='object') applyTokens(d.tokens); },()=>{}));
  LIVE.uns.push(DB.doc('live/combat').onSnapshot(sn=>{ const d=sn.exists?sn.data():null; if(d) applyCombat(d); },()=>{}));
  // planos de los jugadores (los del director van con la escena)
  LIVE.uns.push(DB.doc('live/plans').onSnapshot(sn=>{ const d=sn.exists?sn.data():null, out={};
    if(d&&d.plans&&typeof d.plans==='object') for(const [k,v] of Object.entries(d.plans)){ const pl=Ajustes.normPlan(Object.assign({},v,{id:+k}),160,160); if(pl&&pl.owner) out[k]=pl; }
    LIVE.plans=out; if(state.gameOpen) renderGame(); },()=>{}));
  LIVE.uns.push(DB.doc('live/doors').onSnapshot(sn=>{ const d=sn.exists?sn.data():null; if(!d||!d.d||!M) return;
    const lot=[]; for(const [k,v] of Object.entries(d.d)){ const m=/^(\d{1,3})_(\d{1,3})$/.exec(k); if(!m) continue; const p=doorAt(+m[1],+m[2]); if(p&&!!p.open!==!!v) toggleDoor(p,true,lot); }
    if(lot.length) doorRelight(lot); },()=>{}));
  LIVE.room.presence({role:LIVE.dm?'dm':'player',uid:LIVE.me&&UID.test(LIVE.me)?LIVE.me:null}).catch(()=>{});
  roleUI(); renderGame();
}
function liveUnsub(){ LIVE.uns.forEach(u=>{ try{ u(); }catch(e){} }); LIVE.uns=[]; }
function liveLeave(){ liveUnsub(); LIVE.on=false; LIVE.rev=0; LIVE.lastTokens=null; LIVE.lastCombat=null; LIVE.plans={}; if(LIVE.room) LIVE.room.presence({role:null,cell:null}).catch(()=>{}); drawPeers(); roleUI(); renderGame(); }
async function liveClose(){ if(!LIVE.dm) return; try{ await DB.doc('live/board').update({open:false}); }catch(e){} liveLeave(); LIVE.exists=false; renderGame(); showHint('Mesa cerrada.',1400); }
function placeBill(b){ const n=nOf(b); b.px=b.x+n/2; b.pz=b.z+n/2; b.gy=billY(b); }
function teleport(b,x,z){ const n=nOf(b); b.path=null; b.pending=null; b.x=x; b.z=z; b.px=x+n/2; b.pz=z+n/2; b.gy=billY(b); }
function applyTokens(tk,keepSel){
  LIVE.lastTokens=tk; if(!M) return; lightDirty=true;
  const ids=Object.keys(tk).filter(id=>TOK_ID.test(id)&&tk[id]&&typeof tk[id]==='object');
  const valid=id=>{ const t=tk[id]; return typeof t.kind==='string'&&(MINI_KINDS.includes(t.kind)||/^c_[a-z0-9]{4,16}$/.test(t.kind))&&inb(t.x|0,t.z|0); };
  const cur=bills.filter(b=>b.mini), want=ids.filter(valid);
  if(cur.length!==want.length||!cur.every(b=>tk[b.id])){
    const sel=keepSel||(selected&&selected.id);
    M.minis=want.map(id=>{ const t=tk[id]; return {id,kind:t.kind,x:t.x|0,z:t.z|0,fx:Math.sign(t.fx|0),fz:Math.sign(t.fz|0)||1,sheet:normSheet(t.sheet,t.kind),owner:typeof t.owner==='string'&&UID.test(t.owner)?t.owner:null}; });
    refreshEntities(); const s2=sel&&bills.find(b=>b.id===sel); if(s2) selected=s2;
  } else for(const b of cur){ const t=tk[b.id], n0=nOf(b); b.sheet=normSheet(t.sheet,b.kind); b.owner=typeof t.owner==='string'&&UID.test(t.owner)?t.owner:null;
    if(nOf(b)!==n0&&!b.path) placeBill(b);
    const x=t.x|0, z=t.z|0, d=b.path?b.path[b.path.length-1]:[b.x,b.z];
    if(d[0]!==x||d[1]!==z){ if(!_moveMiniTo(b,x,z,true)) teleport(b,x,z); }
    if(!b.path&&(t.fx|t.fz)){ b.fx=Math.sign(t.fx|0); b.fz=Math.sign(t.fz|0); } }
  fogDirty=true; rangeKey=''; if(state.gameOpen) renderGame();
}
// el combate que llega (Ajustes.readCombat: el del director, la vista del jugador —sin orden si el director no lo muestra— o uno de antes)
function applyCombat(d){
  LIVE.lastCombat=d; if(!d||typeof d!=='object') return;
  const prev=GM.active?GM.cur:null, c=Ajustes.readCombat(d);
  GM.active=c.active; GM.hiddenOrder=c.hiddenOrder; GM.turn=c.turn; GM.round=c.round; GM.left=c.left; GM.dashed=c.dashed; GM.cur=c.active?c.current:null;
  GM.order=c.entries.map(e=>({id:typeof e.tokenId==='string'?e.tokenId:null,roll:e.roll||0,total:e.value,init:e.init||0,name:e.name}));
  const now=GM.cur;
  if(now&&now!==prev){ const b=byId(now); if(b){ selected=b; if(canControl(b)) focusSelected(); showHint('Ronda '+GM.round+': turno de '+miniName(b)+(b.owner===LIVE.me&&!LIVE.dm?' (tú)':'')+'.',1800); } }
  rangeKey=''; if(state.gameOpen) renderGame();
}
// ---- permisos y escritura en las acciones de juego ----
const _mvCombat=moveMiniTo;
moveMiniTo=function(b,x,z,quiet){
  if(LIVE.on&&!canControl(b)){ if(!quiet) showHint(miniName(b)+' lo controla otra persona.',1600); return false; }
  const okm=_mvCombat(b,x,z,quiet); if(okm&&LIVE.on){ liveTok(b); if(GM.active) liveCombat(); } return okm;
};
const _loadMap=loadMap;
loadMap=function(...a){ const r=_loadMap(...a); AUTO.at=0; autoBaseline(); return r; };   // lo que se abre no se guarda hasta que cambie
const _start=startCombat, _next=nextTurn, _end=endCombat, _dash=dash, _undo=undo, _redo=redo, _endStroke=endStroke, _setFog=setFog;
startCombat=function(){ if(LIVE.on&&!LIVE.dm) return; _start(); liveCombat(); };
nextTurn=function(){ const b=curMini(); if(LIVE.on&&(!b||!canControl(b))){ showHint(b?'Solo el DM o quien controla a '+miniName(b)+' puede pasar el turno.':'No es tu turno.',2000); return; }
  if(LIVE.on&&!LIVE.dm){ DB.doc('live/combat').update({next:true}).catch(liveErr); return; } _next(); liveCombat(); };
endCombat=function(){ if(LIVE.on&&!LIVE.dm) return; _end(); liveCombat(); };
dash=function(){ if(LIVE.on&&!canControl(curMini())) return; _dash(); liveCombat(); };
undo=function(){ _undo(); liveBoardSoon(); }; redo=function(){ _redo(); liveBoardSoon(); };
endStroke=function(){ _endStroke(); liveBoardSoon(); };
setFog=function(on){ if(LIVE.on&&!LIVE.dm) return; _setFog(on); liveBoardSoon(); };
function roleUI(){ const player=LIVE.on&&!LIVE.dm; $('mode').hidden=player; if(player&&state.mode==='edit') $('mode').click();
  $('mapName').textContent=M?M.name+(LIVE.on?' · en vivo':''):''; layout(); }
// ---- presencia: cursores de los demás ----
let lastPres=0;
function livePresence(p){ if(!LIVE.on||!LIVE.room) return; const now=performance.now(); if(now-lastPres<60) return; lastPres=now; LIVE.room.presence(p).catch(()=>{}); }
function drawPeers(){
  const seen=new Set();
  if(LIVE.on) for(const pe of LIVE.peers){ if(pe.sameTab||pe.kind!=='viewer') continue; const c=pe.presence&&pe.presence.cell;
    if(!Array.isArray(c)||!Number.isInteger(c[0])||!Number.isInteger(c[1])||!M||!inb(c[0],c[1])) continue;
    seen.add(pe.peer); let m=LIVE.cur.get(pe.peer);
    if(!m){ m=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:SPR.sel,transparent:true,opacity:0.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})); scene.add(m); LIVE.cur.set(pe.peer,m); }
    m.material.color.set(LIVE.colors.get(pe.by)||'#9fd0ff'); m.position.set(c[0]+.5,topY(c[0],c[1])+0.025,c[1]+.5); m.visible=true; }
  for(const [k,m] of LIVE.cur) if(!seen.has(k)){ scene.remove(m); m.material.dispose(); LIVE.cur.delete(k); }
}
// ---- señales ----
function livePing(x,z){ if(!LIVE.on||!LIVE.room) return; LIVE.room.emit('ping',{x,z}).catch(()=>{}); }
function showPing(x,z,color,label){
  const m=new THREE.Mesh(GEO.cursor,new THREE.MeshBasicMaterial({map:SPR.sel,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  m.material.color.set(color); m.position.set(x+.5,topY(x,z)+0.03,z+.5); scene.add(m); LIVE.pings.push({m,t:0});
  showHint(label+' la casilla '+x+', '+z+'.',1600);
}
function liveTick(dt){ for(const p of LIVE.pings){ p.t+=dt; const k=1+((p.t*2)%1)*1.2; p.m.scale.set(k,1,k); p.m.material.opacity=Math.max(0,1-p.t/2.5); }
  LIVE.pings=LIVE.pings.filter(p=>{ if(p.t<2.5) return true; scene.remove(p.m); p.m.material.dispose(); return false; }); }
// ---- pestaña Mesa ----
function renderTable(){
  const p=$('gTable'); if(!p) return; p.textContent='';
  if(!LIVE.cap){ p.append(el('div','t3d-ginfo','Sin conexión con el servidor. La mesa en vivo vuelve en cuanto se recupere la conexión.')); return; }
  if(!LIVE.on){
    if(LIVE.dm){ p.append(el('div','t3d-ginfo','Eres el DM. Abre la mesa y tus jugadores verán este tablero en tiempo real.'),mkBtn('Abrir mesa con este tablero',liveHost));
      if(LIVE.exists) p.append(mkBtn('Unirse a la mesa abierta',liveSubscribe)); }
    else if(LIVE.exists) p.append(el('div','t3d-ginfo','El DM tiene una mesa abierta.'),mkBtn('Unirse a la mesa',liveSubscribe));
    else p.append(el('div','t3d-ginfo','Todavía no hay una mesa abierta. Cuando el DM la abra, podrás unirte aquí.'),mkBtn('Buscar de nuevo',async()=>{ await liveCheck(); renderGame(); }));
    return;
  }
  const info=el('div','t3d-ginfo'); info.innerHTML='Mesa en vivo. '+(LIVE.dm?'Eres el <b>DM</b>.':'Juegas como <b>jugador</b>.')+' Para señalar una casilla, usa el menú contextual o la tecla P.'; p.append(info);
  p.append(el('span','t3d-lbl','En la mesa'));
  const people=LIVE.peers.filter(pe=>pe.kind==='viewer'&&pe.presence&&pe.presence.role);
  for(const pe of people){ const r=el('div','t3d-peer'), sw=el('i'); sw.style.background=LIVE.colors.get(pe.by)||'#9fd0ff';
    r.append(sw,el('span',null,nameOf(pe.by)+(pe.presence.role==='dm'?' (DM)':'')+(pe.isMe&&pe.sameTab?' (tú)':''))); p.append(r); }
  if(LIVE.dm){
    const players=[...new Set(people.filter(pe=>pe.presence.role==='player'&&pe.by).map(pe=>pe.by))];
    p.append(el('span','t3d-lbl','Quién controla a cada personaje'));
    for(const b of bills.filter(x=>x.mini)){ const opts=[null,...players], i=Math.max(0,opts.indexOf(b.owner));
      p.append(mkBtn(miniName(b)+': '+(b.owner?nameOf(b.owner):'solo el DM'),()=>{ b.owner=opts[(i+1)%opts.length]; liveTok(b); renderGame(); },{title:'Toca para asignar este personaje a otro jugador'})); }
    p.append(sepEl(),mkBtn('Enviar el tablero actual',liveBoardNow),mkBtn('Cerrar la mesa',liveClose));
  } else p.append(sepEl(),mkBtn('Salir de la mesa',liveLeave));
}

/* ============ interfaz: paneles, pestañas y asistente ============ */
// hojas del tablero (Vista, Mapas): una a la vez
const SHEETS=['helpSheet'];
$('helpBtn').onclick=()=>{ SHEETS.forEach(k=>{ $(k).hidden=true; }); $('helpSheet').hidden=false; };
$('helpSheet').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{ $(b.dataset.close).hidden=true; });
canvas.addEventListener('pointerdown',()=>{ SHEETS.forEach(k=>{ $(k).hidden=true; }); $('sheet').hidden=true; },true);
// pestañas y plegado del editor de tablero
$('rail').querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>ctx.reveal('tool')));
// pestañas del editor de dibujo
function artTab(t){ $('art').querySelectorAll('[data-atab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.atab===t)));
  $('art').querySelectorAll('[data-apane]').forEach(p=>p.hidden=p.dataset.apane!==t); }
$('art').querySelectorAll('[data-atab]').forEach(b=>b.onclick=()=>artTab(b.dataset.atab));
// el lienzo se adapta cuando cambia el espacio disponible
observe($('artStage'),()=>{ if(ART.open) artResize(); });
$('zOut').onclick=()=>{ const r=acv.getBoundingClientRect(); artZoomAt(ART.zoom/1.5,r.width/2,r.height/2); };
$('zIn').onclick=()=>{ const r=acv.getBoundingClientRect(); artZoomAt(ART.zoom*1.5+0.5,r.width/2,r.height/2); };
$('zFit').onclick=()=>artFit();
$('prevT').onclick=()=>{ const on=$('artPrevBox').hidden; $('artPrevBox').hidden=!on; $('prevT').setAttribute('aria-pressed',String(on)); };
$('artUndoB').onclick=()=>artUndo(); $('artRedoB').onclick=()=>artRedo();
$('artPreset').onchange=()=>{ PAL_RAMPS=PRESETS[$('artPreset').value]||BOARD_RAMPS; buildShade(); renderPal();
  if($('artPreset').value!=='board') showHint('Con esta paleta, el sombreado avanza por luminosidad.',2200); };
function docInfo(){ const d=ART.doc; if(!d) return;
  const kind={tile:'Casilla',char:'Personaje',obj:'Objeto 3D'}[d.kind];
  $('artDocInfo').textContent=kind+', '+targetName(d.kind,d.target).replace('Reemplazar ','reemplaza ')+', '+d.w+'×'+d.h+(d.kind==='obj'?', '+d.frames.length+' rebanadas':'')+(d.kind==='char'?', '+Fichas.SIZES.find(z=>z.id===(d.charSize||'medium')).name.toLowerCase():''); }

// asistente de nuevo dibujo
function syncKindSeg(){ const k=$('artKind').value; $('kindSeg').querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===k)));
  $('objSize').hidden=k!=='obj'||$('artTarget').value!=='new'; dlgPreview(); }
$('kindSeg').querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{ $('artKind').value=b.dataset.kind; syncArtForm(); syncKindSeg(); });
$('artTarget').addEventListener('change',syncKindSeg);
function dlgPreview(){
  const cv=$('artDlgPrev'), x=cv.getContext('2d'), k=$('artKind').value, t=$('artTarget').value; let src=null, cap='';
  try{
    if(k==='tile'){ const cu=CUSTOM.tiles[t]; src=cu?cu.canvases[0]:tileCanvas16(tileSource16(t)[0]); cap=cu?'Ahora usa tu dibujo.':'Así se ve ahora.'; }
    else if(k==='char'){ const key=t==='new'?'knight':t, cu=CUSTOM.chars[key]; src=cu?cu.canvases[0]:CAN[key].front; cap=t==='new'?'Un personaje nuevo; se añade a la paleta de Personajes.':'Así se ve ahora.'; }
    else if(t==='new'){ cap='Un objeto nuevo; se añade a la paleta de Objetos.'; }
    else { src=artThumb('obj',t); cap=CUSTOM.objs[t]?'Ahora usa tu dibujo.':'Así se ve ahora.'; }
  }catch(e){ src=null; }
  if(src){ cv.width=src.width; cv.height=src.height; x.imageSmoothingEnabled=false; x.clearRect(0,0,cv.width,cv.height); x.drawImage(src,0,0); cv.hidden=false; } else cv.hidden=true;
  $('artDlgCap').textContent=cap;
}
function openNewDlg(){ $('artNewDlg').hidden=false; syncArtForm(); syncKindSeg(); }
$('artNewB').onclick=openNewDlg;
$('artNewCancel').onclick=()=>{ $('artNewDlg').hidden=true; };
$('artNewDlg').addEventListener('pointerdown',e=>{ if(e.target===$('artNewDlg')) $('artNewDlg').hidden=true; });
$('artFromImg').onclick=()=>confirmLose($('artFromImg'),()=>{ setDoc(newDoc(...formArgs())); $('artFile').click(); });

/* ---- ajustes de creación ---- */
function rgb2hsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0, s=0; const l=(mx+mn)/2;
  if(mx!==mn){ const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h/=6; } return [h,s,l]; }
function hsl2rgb(h,s,l){ if(!s){ const v=Math.round(l*255); return [v,v,v]; } const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{ t=(t+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p; }; return [f(h+1/3),f(h),f(h-1/3)].map(v=>Math.round(v*255)); }
// aplica fn(r,g,b)->[r,g,b] a los píxeles de la capa (o selección) actual; all=true: a todos los cuadros
function mapPixels(fn,all){
  commitFloat(); const d=ART.doc; all?pushDoc():pushCel();
  const frames=all?d.frames.map((f,i)=>i):[ART.frame];
  for(const f of frames){ const buf=d.frames[f].cels[ART.layer];
    for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ if(!inSel(x,y)) continue; const o=(y*d.w+x)*4; if(!buf[o+3]) continue;
      const c=fn(buf[o],buf[o+1],buf[o+2]); if(c){ buf[o]=c[0]; buf[o+1]=c[1]; buf[o+2]=c[2]; } } }
  changed(all);
}
const adjHSL=(dh,ds,dl)=>mapPixels((r,g,b)=>{ let [h,s2,l]=rgb2hsl(r,g,b); h=(h+dh+1)%1; s2=Math.max(0,Math.min(1,s2+ds)); l=Math.max(0,Math.min(1,l+dl)); return hsl2rgb(h,s2,l); },ART.adjAll);
function paletteList(){ return [...new Set([...PAL_RAMPS.flat(),...ART.custom])].map(h=>hexRGB(h)); }
function reduceToPalette(){ const pal=paletteList();
  mapPixels((r,g,b)=>{ let best=pal[0], bd=1e9; for(const p of pal){ const dr=r-p[0], dg=g-p[1], db=b-p[2], dd=dr*dr*0.3+dg*dg*0.59+db*db*0.11; if(dd<bd){ bd=dd; best=p; } } return best; },ART.adjAll);
  showHint('Colores ajustados a la paleta activa.',1500); }
function replaceColor(){ const a=ART.prim, b=ART.sec; if(!a[3]){ showHint('Elige como color principal el color que quieres reemplazar.',2200); return; }
  commitFloat(); const d=ART.doc; ART.adjAll?pushDoc():pushCel(); let n=0;
  for(const f of (ART.adjAll?d.frames.map((x,i)=>i):[ART.frame])){ const buf=d.frames[f].cels[ART.layer];
    for(let o=0;o<buf.length;o+=4){ const x=(o/4)%d.w, y=((o/4)/d.w)|0; if(!inSel(x,y)) continue;
      if(buf[o+3]&&buf[o]===a[0]&&buf[o+1]===a[1]&&buf[o+2]===a[2]){ buf[o]=b[0]; buf[o+1]=b[1]; buf[o+2]=b[2]; buf[o+3]=b[3]; n++; } } }
  changed(true); showHint(n?n+' píxeles cambiados del color principal al secundario.':'No hay píxeles del color principal.',2000); }
function innerShade(){ // oscurece un paso los píxeles del borde interior: da volumen
  commitFloat(); const d=ART.doc; pushCel(); const buf=curBuf(), src=buf.slice(), op=(x,y)=>x>=0&&y>=0&&x<d.w&&y<d.h&&src[(y*d.w+x)*4+3]>0, ramps=[...PAL_RAMPS,ART.custom];
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){ if(!op(x,y)||!inSel(x,y)) continue; if(op(x+1,y)&&op(x,y+1)) continue;
    const o=(y*d.w+x)*4, e=SHADE.get(src[o]+','+src[o+1]+','+src[o+2]); if(!e) continue; const rp=ramps[e[0]]; if(e[1]>0){ const c=hexRGB(rp[e[1]-1]); buf[o]=c[0]; buf[o+1]=c[1]; buf[o+2]=c[2]; } }
  changed(false); }
let frameClip=null;
function copyFrame(){ commitFloat(); frameClip=ART.doc.frames[ART.frame].cels.map(c=>c.slice()); showHint('Cuadro copiado con todas sus capas.',1300); renderAdjust(); }
function pasteFrame(){ if(!frameClip) return; const d=ART.doc; if(frameClip[0].length!==d.w*d.h*4){ showHint('Ese cuadro tiene otro tamaño.',1500); return; }
  commitFloat(); pushDoc(); d.frames[ART.frame].cels=d.layers.map((l,i)=>frameClip[i]?frameClip[i].slice():emptyCel(d)); changed(true); }
function extrude(n){ const d=ART.doc, maxS=d.res*4; commitFloat(); pushDoc(); let k=0;
  for(;k<n&&d.frames.length<maxS;k++) d.frames.splice(ART.frame+1,0,{name:'',cels:d.frames[ART.frame].cels.map(c=>c.slice())});
  ART.frame+=k; renameSlices(); changed(true); showHint(k?'Rebanada repetida '+k+' veces hacia arriba.':'Máximo de rebanadas alcanzado.',1500); }
// imagen de referencia: se ve bajo el dibujo, no se guarda
ART.ref=null; ART.refA=0.35; ART.adjAll=false;
$('artRefFile').onchange=()=>{ const f=$('artRefFile').files&&$('artRefFile').files[0]; if(!f) return; const url=URL.createObjectURL(f), img=new Image();
  img.onload=()=>{ ART.ref=img; $('artRefFile').value=''; renderAdjust(); artDraw(); showHint('Referencia cargada: se ve bajo tu dibujo y no se guarda.',2200); };
  img.onerror=()=>{ showHint('No se pudo leer esa imagen.'); $('artRefFile').value=''; }; img.src=url; };
function renderAdjust(){
  const el=$('artAdjust'), d=ART.doc; if(!el||!d) return; el.textContent=''; const add=(...a)=>a.forEach(x=>el.appendChild(x));
  add(lblEl('Color de la capa'+(ART.sel?' (solo la selección)':'')),
    mkBtn('Brillo −',()=>adjHSL(0,0,-0.06)),mkBtn('Brillo +',()=>adjHSL(0,0,0.06)),
    mkBtn('Tono ←',()=>adjHSL(-1/24,0,0)),mkBtn('Tono →',()=>adjHSL(1/24,0,0)),
    mkBtn('Saturación −',()=>adjHSL(0,-0.08,0)),mkBtn('Saturación +',()=>adjHSL(0,0.08,0)),
    mkBtn('Aplicar a todos los cuadros',()=>{ ART.adjAll=!ART.adjAll; renderAdjust(); },{pressed:ART.adjAll}),
    sepEl(),
    mkBtn('Reemplazar color',replaceColor,{title:'Cambia el color principal por el secundario'}),
    mkBtn('Reducir a la paleta',reduceToPalette,{title:'Ajusta cada color al más cercano de la paleta activa; útil tras importar una imagen'}),
    mkBtn('Sombra interior',innerShade,{title:'Oscurece el borde inferior y derecho para dar volumen'}),
    mkBtn('Contorno exterior',addOutline),
    lblEl('Referencia'),
    mkBtn(ART.ref?'Cambiar referencia':'Cargar imagen de referencia',()=>$('artRefFile').click()));
  if(ART.ref) add(mkBtn('Opacidad '+Math.round(ART.refA*100)+'%',()=>{ ART.refA=ART.refA>=0.6?0.15:ART.refA+0.15; renderAdjust(); artDraw(); }),
    mkBtn('Quitar referencia',()=>{ ART.ref=null; renderAdjust(); artDraw(); }));
  add(lblEl(d.kind==='obj'?'Rebanadas':'Cuadros'), mkBtn('Copiar cuadro',copyFrame), mkBtn('Pegar cuadro',pasteFrame,{disabled:!frameClip}));
  if(d.kind==='obj') add(mkBtn('Extruir ×2',()=>extrude(2)),mkBtn('Extruir ×4',()=>extrude(4)),mkBtn('Extruir ×8',()=>extrude(8)));
}

/* ---- teclado del editor ---- */
function artKey(e){
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')) return;
  const k=e.key.toLowerCase(), mod=e.ctrlKey||e.metaKey;
  if(mod&&k==='z'){ e.preventDefault(); e.shiftKey?artRedo():artUndo(); return; }
  if(mod&&k==='y'){ e.preventDefault(); artRedo(); return; }
  if(mod&&k==='c'){ e.preventDefault(); artCopy(); return; }
  if(mod&&k==='v'){ e.preventDefault(); artPaste(); return; }
  if(k==='delete'||k==='backspace'){ e.preventDefault(); artDelete(); return; }
  if(k==='escape'){ commitFloat(); ART.sel=null; artDraw(); return; }
  if(k===' '){ ART.space=true; return; }
  if(k==='x'){ [ART.prim,ART.sec]=[ART.sec,ART.prim]; renderPal(); return; }
  if(k==='['){ ART.size=Math.max(1,ART.size-1); renderOpts(); return; }
  if(k===']'){ ART.size=Math.min(8,ART.size+1); renderOpts(); return; }
  if(ART.flt&&['arrowleft','arrowright','arrowup','arrowdown'].includes(k)){ e.preventDefault(); const st=e.shiftKey?4:1; ART.flt.x+=k==='arrowleft'?-st:k==='arrowright'?st:0; ART.flt.y+=k==='arrowup'?-st:k==='arrowdown'?st:0; artDraw(); return; }
  if(ART.sel&&!ART.flt&&['arrowleft','arrowright','arrowup','arrowdown'].includes(k)&&(ART.tool==='move'||ART.tool==='select')){ e.preventDefault(); liftSel(); const st=e.shiftKey?4:1; ART.flt.x+=k==='arrowleft'?-st:k==='arrowright'?st:0; ART.flt.y+=k==='arrowup'?-st:k==='arrowdown'?st:0; artDraw(); return; }
  if(mod&&k==='a'){ e.preventDefault(); commitFloat(); ART.sel={x:0,y:0,w:ART.doc.w,h:ART.doc.h}; renderOpts(); artDraw(); return; }
  if(mod&&k==='i'){ e.preventDefault(); invertSel(); return; }
  if(k==='+'||k==='='){ const r=acv.getBoundingClientRect(); artZoomAt(ART.zoom*1.5+0.5,r.width/2,r.height/2); return; }
  if(k==='-'){ const r=acv.getBoundingClientRect(); artZoomAt(ART.zoom/1.5,r.width/2,r.height/2); return; }
  if(k==='arrowleft'||k===','){ if(ART.frame>0){ commitFloat(); ART.frame--; renderFrames(); artDraw(); } return; }
  if(k==='arrowright'||k==='.'){ if(ART.frame<ART.doc.frames.length-1){ commitFloat(); ART.frame++; renderFrames(); artDraw(); } return; }
  const t=ATOOLS.find(a=>a[2]===k); if(t&&!mod) setTool(t[0]);
}
on(window,'keyup',e=>{ if(e.key===' ') ART.space=false; });

/* ============ bucle ============ */
const statsEl=$('stats'); let last=performance.now(), fAcc=0, fN=0, simAcc=0, cpuAcc=0;
// lo último medido (cada medio segundo), para Mesa → Conexión del anfitrión: fps, ms de CPU por fotograma, llamadas y triángulos
const RSTATS={fps:0,ms:0,calls:0,triangles:0};
function ease(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
function loop(now){
  if(stopped) return;
  const t0=performance.now();
  const dt=Math.max(0,Math.min(0.05,(now-last)/1000)); last=now; state.time+=dt;   // el primer cuadro puede llegar marcado antes: nunca retroceder
  if(state.rotT<1){ state.rotT=Math.min(1,state.rotT+dt/0.3); state.yaw=state.yawFrom+(state.yawTarget-state.yawFrom)*ease(state.rotT); }
  // animate (JA-VTT, ajuste de escena) y movimiento reducido: sin él, agua, lava, llamas, halos y fichas quietos
  const anim=animOn();
  uniforms.uFrame.value=anim?((Math.floor(state.time*4)%4)+4)%4:0;
  if(anim) state.animT=state.time;
  waterUniforms.uTime.value=state.animT||0; waterUniforms.uTexN.value=TEX;
  if(M&&state.simActive&&WL){ simAcc+=dt; if(simAcc>=0.09){ simAcc=0;
    lakeProg+=3+lakeProg*0.15;                         // los lagos se llenan desde el fondo
    const [nx,ch]=wStep(WS,false); WS=nx;
    const filling=lakeProg<=WMAXR+1;
    if(ch||filling) buildWater();
    if(!ch&&!filling){ state.simActive=false; buildDecor(); } } }
  envTick(dt);
  const t=state.time; uniforms.uFlicker.value=anim?0.9+0.1*(Math.sin(t*11)*0.5+Math.sin(t*23.7)*0.3+Math.sin(t*5.3)*0.2):1;
  if(M&&gridDirty) buildGrid();
  if(!ART.open){
    const KP={w:[0,1],s:[0,-1],a:[1,0],d:[-1,0],arrowup:[0,1],arrowdown:[0,-1],arrowleft:[1,0],arrowright:[-1,0]};
    let vx=0, vy=0; for(const k of keysDown){ const v=KP[k]; if(v){ vx+=v[0]; vy+=v[1]; } }
    if(vx||vy){ const sp=(keysDown.has('shift')?900:450)*dt; panBy(vx*sp,vy*sp); state.camGoal=null; }
    const g=state.camGoal; if(g){ const t=state.target, k=Math.min(1,dt*9); t.x+=(g.x-t.x)*k; t.z+=(g.z-t.z)*k; if(Math.hypot(g.x-t.x,g.z-t.z)<0.01) state.camGoal=null; }
  }
  if(Math.abs(ELEV-state.elevTarget)>1e-4){ const d=state.elevTarget-ELEV; setElev(Math.abs(d)<0.01?state.elevTarget:ELEV+d*Math.min(1,dt*8)); }
  if(M&&lightDirty&&state.time-lastRelight>0.15) relight();
  if(state.fog&&fogDirty) computeFog();
  if(state.fog) fogTick(dt);
  if(selected!==GM.lastSel){ GM.lastSel=selected; if(state.gameOpen) renderGame(); }
  roofTick(); updateRange(); drawPlans(); liveTick(dt);
  updateCamera(); updateBills(dt); drawMini();
  if(ART.open){ artPreview(state.time); requestAnimationFrame(loop); return; }
  renderer.info.reset();
  if(canPost){
    renderer.setRenderTarget(rt); renderer.render(scene,camera);
    renderer.setRenderTarget(null); renderer.render(postScene,postCam);
  } else renderer.render(scene,camera);
  fAcc+=dt; fN++; cpuAcc+=performance.now()-t0;
  if(fAcc>=0.5){
    const info=renderer.info.render, tri=info.triangles;
    statsEl.textContent=`${Math.round(fN/fAcc)} fps · ${info.calls} llamadas · ${tri>=1000?(tri/1000).toFixed(1)+' mil':tri} triángulos`;
    Object.assign(RSTATS,{fps:Math.round(fN/fAcc),ms:+(cpuAcc/fN).toFixed(1),calls:info.calls,triangles:tri});
    fAcc=0; fN=0; cpuAcc=0;
  }
  requestAnimationFrame(loop);
}
resize();
loadMap(Object.assign(blankMap(16),{initial:true}));
layout(); railSync(); openGame(true);
if(matchMedia('(pointer: fine)').matches) showHint('Arrastra para moverte, clic derecho para girar y rueda para acercar. Pulsa ? para ver todos los atajos.',6500);
requestAnimationFrame(loop);
/* Consulta de sólo lectura para las pruebas (test/e2e/ui.mjs, vía `mount(...).probe`): las fichas en juego, si
   una de ellas tiene camino hasta una esquina, los techos (y si se ven), los objetos (con su tipo de muro), la línea de visión,
   la niebla de una casilla, dónde cae una casilla en pantalla y la escena abierta. No cambia nada del tablero. */
function probe(q,...a){
  if(q==='tokens') return bills.filter(b=>b.mini).map(b=>({id:b.id,name:miniName(b),sprite:b.kind,x:b.x,z:b.z,cells:nOf(b),size:Fichas.sizeOf(b.sheet).id,scale:+b.mesh.scale.x.toFixed(2),art:artSizeId(b.kind),worldH:+spriteDims(b.kind).h.toFixed(4),texel:+(spriteDims(b.kind).w/b.mat.map.image.width).toFixed(5),terrainTexel:+(1/TEX).toFixed(5),
    base:+(b.parts?b.parts.diam:0).toFixed(2),selected:b===selected,status:!!(b.parts&&b.parts.stat&&b.parts.stat.mesh.visible),chips:b.parts&&b.parts.stat&&b.parts.stat.mesh.visible?b.parts.stat.key.split('|')[0].split(';').filter(Boolean).length:0,conditions:b.sheet.conditions.slice(),visible:b.mesh.visible,
    // T6d: lo que este cliente sabe de la ficha (el servidor no manda al jugador la CA ni, según hpVisibility, la vida de las ajenas)
    owner:b.owner||null,hp:withheld(b,'hp')?null:{...b.sheet.hp},hpBar:b.sheet.hpBar||null,ac:withheld(b,'ac')?null:b.sheet.ac,withheld:(b.sheet.withheld||[]).slice(),hidden:!!b.sheet.hidden,alive:alive(b)}));
  if(q==='route'){ const b=byId(a[0]); if(!b) return null; const p=findPath(b.x,b.z,a[1],a[2],b); return p?p.cost:null; }
  if(q==='roofs') return (M.roofs||[]).map((r,i)=>({...r,shown:!!(roofMeshes[i]&&roofMeshes[i].visible)}));
  if(q==='props') return M.props.map(p=>{ const b=bills.find(q2=>q2.prop===p); return {type:p.type,x:p.x,z:p.z,v:p.v|0,kind:Muros.kindOf(p),open:!!p.open,locked:!!p.locked,id:p.id,look:p.look,target:p.target||null,shown:!!(b&&b.mesh.visible)}; });
  // T6b: ¿ve un ojo a 1,5 sobre (x0,z0) la casilla (x1,z1)? kind 'sight' o 'hide'; niebla de una casilla; dónde cae en pantalla; escena abierta
  if(q==='los') return Vision.los(GRID,a[0],a[1],a[2],a[3],EH[idx(a[0],a[1])]*STEP+1.5,a[4]);
  if(q==='fog') return fogVis(idx(a[0],a[1]));
  // P-48: lo que el cliente sabe de una casilla para moverse (bloqueada, puerta cerrada, con llave)
  if(q==='cell'){ if(!inb(a[0],a[1])) return null; const i=idx(a[0],a[1]); return {blocked:blocked.has(i),shut:doorShut.has(i),seal:doorSeal.has(i),locked:lockedDoors.has(i)}; }
  if(q==='screen'){ const v=new THREE.Vector3(a[0]+.5,topY(a[0],a[1])+0.05,a[1]+.5).project(camera), r=canvas.getBoundingClientRect(); return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height}; }
  if(q==='scene') return {id:M.boardId||null,name:M.name,w:M.w,d:M.d,settings:{...SETTINGS},...Ajustes.sceneFlags(M),grid3d:!!(gridMesh&&gridMesh.visible),anim:animOn()};
  // T6d: combate (iniciativa de JA-VTT tal como la ve este cliente), planos y anotaciones que ve, y el registro de tiradas
  if(q==='combat') return {active:GM.active,order:GM.order.map(o=>o.id||o.name),turn:GM.turn,round:GM.round,cur:GM.cur,hiddenOrder:GM.hiddenOrder,left:GM.left};
  if(q==='plans') return visiblePlans().map(p=>({...p,cells:Ajustes.planCells(p,M.w,M.d).length}));
  if(q==='notes') return (M.notes||[]).map(n=>({...n}));   // todas las que tiene este cliente (al jugador, el servidor no le manda las gmOnly)
  if(q==='log') return GM.log.slice();
  // T6c: momento de la escena (env, ambient, darkColor; lo que se pinta ahora y si se está fundiendo), cuánto ambiente llega a una
  // casilla (1 fuera, 0 dentro de una zona interior, lo que entre por las ventanas), si es interior y la luz de un sprite allí (0–1,3)
  if(q==='env') return {...ENV,shown:{level:+LOOK.level.toFixed(3),amb:LOOK.amb.map(v=>+v.toFixed(3)),sky:LOOK.sky[1].map(v=>+v.toFixed(3))},fading:!!envAnim,zoneCells:M.zoneCells||''};
  if(q==='ambient') return +ambAt(idx(a[0],a[1])).toFixed(3);
  if(q==='interior') return isInterior(idx(a[0],a[1]));
  if(q==='light'){ const c=lightAt(a[0],a[1]); return +((c.r+c.g+c.b)/3).toFixed(3); }
  if(q==='sprite'){ const t=SPR[a[0]]&&SPR[a[0]].front, im=t&&t.image; if(!im||!im.getContext) return null; const d=im.getContext('2d').getImageData(0,0,im.width,im.height).data; let sum=0;
    for(let i=0;i<d.length;i++) sum=(sum*31+d[i])>>>0; return {custom:!!CUSTOM.chars[a[0]],w:im.width,h:im.height,sum}; }
  // refactor (red de seguridad): la escena tal como se guarda (sin la semilla, que es azar) y la suma del atlas de casillas
  if(q==='serialized'){ const o=JSON.parse(JSON.stringify(serialize())); delete o.seed; return o; }
  if(q==='atlas'){ const d=atlasCanvas.getContext('2d').getImageData(0,0,atlasCanvas.width,atlasCanvas.height).data; let sum=0;
    for(let i=0;i<d.length;i++) sum=(sum*31+d[i])>>>0; return {w:atlasCanvas.width,h:atlasCanvas.height,sum}; }
  return null;
}
return {probe,stats:()=>({...RSTATS}),destroy(){
  stopped=true; offs.forEach(f=>{ try{ f(); }catch(e){} }); offs.length=0;
  try{ renderer.dispose(); renderer.forceContextLoss(); }catch(e){}
}};
};
})();
