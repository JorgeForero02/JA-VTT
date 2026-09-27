/* Arte procedural del tablero 3D (Tablero3D.ArteProcedural): paleta, atlas de casillas 16×4, sprites (árboles, brasero,
   personajes de fábrica pintados a mano y esculpidos), ampliación EPX, volúmenes por capas (sprite stacking) y el arte
   propio (CUSTOM) que se superpone al procedural. Extraído literalmente de tablero3d.js (refactor, tarea 6).

   Es una FÁBRICA de navegador (usa document para los lienzos y THREE para las texturas): el motor la invoca una vez, en el
   punto de su cierre donde antes estaba este código, así que lo que se pinta al cargar (paint(), CAN, buildArt()) se
   ejecuta en el mismo orden. En node se construye con un lienzo falso (test/t3d/helpers/arte.js).

   deps = { THREE, Personajes, Objetos3D, Base, getTEX }
     THREE        three.js (CanvasTexture, BufferGeometry…)
     Personajes   Tablero3D.Personajes (personajes medianos pintados a mano)
     Objetos3D    Tablero3D.Objetos3D (rampas G…CU, Grgb/Drgb/Srgb y PROP3D)
     Base         Tablero3D.Base (mulberry32, hash, hexRGB)
     getTEX()     resolución actual (texeles por casilla): la cambia el motor (botón «Resolución»), se lee en cada uso

   Devuelve:
     estado que buildArt() y el motor REASIGNAN, sólo por getter (el motor lee ART3.X en cada uso, nunca lo desestructura):
       SPR, STACK, STK, CSTACK, PSTACK; atlasTex, atlasCanvas y PLACEHOLDER también con setter (applyCustom y addBill los cambian)
     objetos que no cambian de identidad (el motor los desestructura; CUSTOM, TERR y los Map se mutan en el sitio):
       CUSTOM, TERR, ORIG_TERR, ROOF_MATS, ROOF_KEY, ROOF_SHAPES, atlas (y su contexto ac), AC, AR, CAN, CHARS, CHAR_ART, HANDART,
       spriteDimC, baseTexCache, artTops, BAYER y la paleta FL, INK, EXTRA_RAMPS, OGS, TRS, BONE, RUNE
     funciones: mkCanvas, outline, tex, selout, uvc, edgeUV, drawTree, drawPine, drawRing, upscale, paintStack, stackTree,
       stackGeo, fitTo, composeAtlas, applyTileOverrides, buildCharTex, stackFromSlices, placeholderStack, propFn, pstack,
       propSlices, buildArt */
(function (root) {
'use strict';
function ArteProcedural(deps){
const {THREE,Personajes,Objetos3D,Base,getTEX}=deps;
const {mulberry32,hash,hexRGB}=Base;
const {G,D,S,B,W,SA,WA,SL,TH,SH,CU,Grgb,Drgb,Srgb,PROP3D}=Objetos3D;
const DIR4=[[1,0],[-1,0],[0,1],[0,-1]];   // la misma constante que el motor (vecinos en cruz), para los pliegues de sculpt

/* ============ utilidades de lienzo ============ */
function mkCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d',{willReadFrequently:true}); return c; }   // mantener igual que mkCanvas de ui3d.js
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
  const EU=0.02/(getTEX()*AC), EV=0.02/(getTEX()*AR);
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
  const pos=[], uv=[], half=N/(2*getTEX()), eu=0.02/cw, ev=0.02/ch;
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
  return {tex:tex(c), geo:stackGeo(N,H,1/getTEX(),cols,c.width,c.height), c, cols, N, H};
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
    if(!geo) geo=stackGeo(N,H,1/getTEX(),cols,c.width,c.height);
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
function drawTileAt(ctx,src,index){ const T=getTEX(), x=(index%AC)*T, y=((index/AC)|0)*T; ctx.clearRect(x,y,T,T); ctx.imageSmoothingEnabled=false; ctx.drawImage(src,0,0,src.width,src.height,x,y,T,T); }
function makeFringe(ctx,slot,dst){
  const T=getTEX(), sx=(slot%AC)*T, sy=((slot/AC)|0)*T, dx=(dst%AC)*T, dy=((dst/AC)|0)*T;
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
  if(!baseAtlas[getTEX()]) baseAtlas[getTEX()]=upscaleAtlas(getTEX()/16);
  const b=baseAtlas[getTEX()], c=mkCanvas(b.width,b.height); c.getContext('2d').drawImage(b,0,0);
  applyTileOverrides(c); return c;
}
function buildCharTex(key){
  const ch=CUSTOM.chars[key]; artTops.delete(key); spriteDimC.delete(key); if(!ch) return;
  if(SPR[key]) Object.values(SPR[key]).forEach(t=>t.dispose());
  // a la resolución del tablero, píxel a píxel del dibujo: el texel mide lo mismo que el del terreno
  const f=getTEX()/(ch.res||32), w=Math.max(1,Math.round(ch.canvases[0].width*f)), h=Math.max(1,Math.round(ch.canvases[0].height*f)), right=fitTo(ch.canvases[2],w,h);
  SPR[key]={front:tex(fitTo(ch.canvases[0],w,h)),back:tex(fitTo(ch.canvases[1],w,h)),right:tex(right),left:tex(mirror(right))};
}
function stackFromSlices(slices,srcRes){
  const f=getTEX()/srcRes, N=Math.max(1,Math.round(slices[0].width*f)), H=Math.max(1,Math.round(slices.length*f));
  const {c,cols}=stackCanvas(N,H), ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
  for(let sl=0;sl<H;sl++){ const src=slices[Math.min(slices.length-1,Math.floor(sl/f))]; ctx.drawImage(src,0,0,src.width,src.height,(sl%cols)*N,Math.floor(sl/cols)*N,N,N); }
  return {tex:tex(c), geo:stackGeo(N,H,1/getTEX(),cols,c.width,c.height)};
}
function placeholderStack(){
  const k=getTEX()/16, box=mkCanvas(16*k,16*k), x=box.getContext('2d');
  x.fillStyle=W[3]; x.fillRect(2*k,2*k,12*k,12*k); x.fillStyle=W[1]; x.fillRect(2*k,2*k,12*k,k); x.fillRect(2*k,2*k,k,12*k);
  return stackFromSlices(new Array(12*k).fill(box),getTEX());
}

let PSTACK={}, PSLICES={};
// cada rebanada de alta resolución toma la rebanada base que le toca: los objetos tienen en vertical la misma densidad de píxel que el terreno
const propFn=P=>(x,z,s)=>P.fn(x,z,Math.round(s));
function buildProp(kind,k){ const P=PROP3D[kind], N=P.N*k, H=P.H*k, {c,cols}=paintStack(N,H,k,propFn(P)); return {tex:tex(c),geo:stackGeo(N,H,1/getTEX(),cols,c.width,c.height)}; }
// volumen de un objeto de fábrica o dibujado, hecho la primera vez que se usa
function pstack(kind){ let st=PSTACK[kind]; if(st) return st; const co=CUSTOM.objs[kind]; st=PSTACK[kind]=co?stackFromSlices(co.slices,co.res):buildProp(kind,getTEX()/16); return st; }
function propSlices(kind){ if(PSLICES[kind]) return PSLICES[kind]; const P=PROP3D[kind], {c,cols}=paintStack(P.N,P.H,1,propFn(P)), out=[];
  for(let sl=0;sl<P.H;sl++){ const cv=mkCanvas(P.N,P.N); cv.getContext('2d').drawImage(c,(sl%cols)*P.N,Math.floor(sl/cols)*P.N,P.N,P.N,0,0,P.N,P.N); out.push(cv); } return PSLICES[kind]=out; }
function buildArt(){
  const k=getTEX()/16, U=c=>tex(upscale(c,k,false));
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

return {
  get SPR(){ return SPR; }, get STACK(){ return STACK; }, get STK(){ return STK; }, get CSTACK(){ return CSTACK; }, get PSTACK(){ return PSTACK; },
  get atlasTex(){ return atlasTex; }, set atlasTex(v){ atlasTex=v; },
  get atlasCanvas(){ return atlasCanvas; }, set atlasCanvas(v){ atlasCanvas=v; },
  get PLACEHOLDER(){ return PLACEHOLDER; }, set PLACEHOLDER(v){ PLACEHOLDER=v; },
  CUSTOM, TERR, ORIG_TERR, ROOF_MATS, ROOF_KEY, ROOF_SHAPES, atlas, ac, AC, AR, CAN, CHARS, CHAR_ART, HANDART,
  spriteDimC, baseTexCache, artTops, BAYER, FL, INK, EXTRA_RAMPS, OGS, TRS, BONE, RUNE,
  mkCanvas, outline, tex, selout, uvc, edgeUV, drawTree, drawPine, drawRing, upscale, paintStack, stackTree, stackGeo,
  fitTo, composeAtlas, applyTileOverrides, buildCharTex, stackFromSlices, placeholderStack, propFn, pstack, propSlices, buildArt
};
}
if (typeof module === 'object' && module.exports) module.exports = ArteProcedural;
else (root.Tablero3D = root.Tablero3D || {}).ArteProcedural = ArteProcedural;
})(typeof window !== 'undefined' ? window : globalThis);
