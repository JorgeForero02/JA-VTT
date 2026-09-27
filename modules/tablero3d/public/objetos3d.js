/* Objetos por capas del tablero 3D (Tablero3D.Objetos3D en el navegador; require() en node): los datos de PROP3D
   (nombre, tamaño N×H, banderas y fn(x,z,s) → color RGB de cada texel) y la paleta con la que pintan: las rampas
   G…CU y sus versiones RGB. Extraído literalmente de tablero3d.js (refactor, tarea 4). Sólo datos y funciones
   puras (ningún lienzo): lo que pinta (paintStack, buildProp, pstack, propSlices) sigue en el motor. La paleta
   la usa también el motor (atlas, sprites), que la toma de aquí con un alias. HALF_PI es copia de la del motor. */
(function (root) {
  'use strict';
  const Base = typeof module === 'object' && module.exports ? require('./base') : root.Tablero3D.Base;
  const { hash, hexRGB } = Base;
  const HALF_PI = Math.PI / 2;
const G=['#1e3b2f','#2b5a37','#3f7c3e','#5f9e48','#8fc657','#c7e07a'];
const D=['#2e1f2b','#4d2f2c','#6e4331','#8e5d3b','#b07f4f','#cfa46c'];
const S=['#1f1d2e','#34324a','#4b4a64','#666680','#8a8aa0','#b3b4c4'];
const B=['#2a1c2a','#48303c','#6a4a50','#8a6564','#a8857b','#c4a595'];
const W=['#2c1a1e','#4e2c28','#7a4630','#a0653c','#c48a50','#e0b574'];
const SA=['#6e5a48','#a08563','#c9ae7c','#e2cf98','#f3e6bb'];
const WA=['#16213e','#1f3a66','#2a5a8f','#3a7fb3','#6cb3d9','#b8e6f2'];
const SL=['#1b1d2c','#2a3044','#3b465e','#526079','#72819b','#9aa7bd'];
const TH=['#3d2b1a','#634524','#8c6a33','#b38f45','#d4b35f','#ecd58c'];
const SH=['#2b1f22','#4b3431','#6e4d3b','#8f6a4b','#ad8a60','#c9aa7a'];
const CU=['#173634','#23544e','#347866','#4f9c82','#7cc2a0','#b6e3c2'];
const Grgb=G.map(hexRGB), Drgb=D.map(hexRGB), Srgb=S.map(hexRGB);
/* ---- objetos del pueblo: volúmenes por capas; fn(x,z,s) en texeles base desde el centro ---- */
const Wr=W.map(hexRGB), Srr=S.map(hexRGB), RFr=['#3b1f2b','#6b2f3a','#a33b3b','#d9574a','#f08a5d'].map(hexRGB);
const GOLDc=hexRGB('#e8c05a'), WHITEc=hexRGB('#ece6f5'), BLUEc=hexRGB('#3b5dc9'), BLUEd=hexRGB('#29366f'), WATc=hexRGB(WA[2]);
const BOOKS=['#b83a4b','#3b5dc9','#38b764','#e8c05a','#9a7fd6'].map(hexRGB), FLc=['#fff0b8','#ffc14a','#f07a2a'].map(hexRGB);
const SHr=SH.map(hexRGB), CUr=CU.map(hexRGB), Br=B.map(hexRGB), SAr=SA.map(hexRGB), IRON=['#161222','#1f1d2e','#34324a','#4b4a64'].map(hexRGB);
const REDc=hexRGB('#c73a4a'), ROSEc=hexRGB('#f07a7a'), ORc=hexRGB('#e8872a'), YELc=hexRGB('#f2c14a'), CREAMc=hexRGB('#f3e6bb'), CREAMd=hexRGB('#c9ae7c');
const PLAST=['#8f8778','#b3aa98','#d6cdb8','#ece6d6'].map(hexRGB), SAILc=['#e2dccb','#bdb49e'].map(hexRGB), BRONZE=['#6b4a2a','#b08a3a'].map(hexRGB);
const CLOTH=[['#9a7fd6','#6b4a99'],['#38b764','#2d6b5e'],['#e8c05a','#b08a3a'],['#b83a4b','#6b2f3a'],['#6cb3d9','#2a5a8f']].map(p=>p.map(hexRGB));
// tramo de puente de 1 casilla de largo (se empalma con otros a lo largo de z) y media anchura hw: tablones, vigas, pilotes y barandal
function bridgeFn(x,z,s,hw){ const ax=Math.abs(x), az=Math.abs(z), ex=hw-1; if(az>8) return null;
  if(Math.abs(ax-ex)<1.3&&Math.abs(az-5)<1.3&&s<=22) return s>=22?Wr[4]:s>=16?(x+z>0?Wr[3]:Wr[2]):Wr[1];
  if(Math.abs(ax-ex)<0.9&&(s===20||s===21)) return s===21?Wr[4]:Wr[2];
  if(ax<=hw&&s>=13&&s<=15){ if(s<15) return Wr[1]; if(((z+8)%4)<0.6) return Wr[0]; if(ax>hw-0.6) return Wr[2]; return (Math.floor((z+8)/4)%2)?Wr[3]:Wr[4]; }
  if(Math.abs(ax-(hw-3))<1&&s>=11&&s<13) return Wr[1]; if(hw>8&&ax<1&&s>=11&&s<13) return Wr[1]; return null; }
// puesto de mercado (2×1): postes, toldo a rayas que cae hacia el frente con faldón festoneado, mostrador y género
function stallFn(x,z,s,aw1,aw2,goods){ const ax=Math.abs(x);
  if(Math.abs(ax-14)<1.1&&Math.abs(Math.abs(z)-6)<1.1&&s<(z<0?27:22)) return (x+z>0)?Wr[3]:Wr[2];
  const sa=Math.round(28-(z+8.5)*7/18), st=Math.floor((x+16)/4)%2;
  if(ax<=15.5&&z>=-8.5&&z<=9.5){ if(s===sa) return st?aw1[0]:aw2[0]; if(s===sa-1) return st?aw1[1]:aw2[1];
    if(z>=8.2&&s<sa-1&&s>=sa-2-(((x+16)%4)<2?1:0)) return st?aw1[1]:aw2[1]; }
  if(ax<=13&&z>=1&&z<=7&&s<=11){ if(s>=10) return (ax>12.3||z>6.3||z<1.7)?Wr[3]:Wr[4]; if(s===0) return Wr[1]; return (Math.floor((x+14)/3)%2)?Wr[2]:Wr[3]; }
  if(s>=12&&s<=13&&ax<=12&&z>=2&&z<=6) return (s===13&&(z<2.6||z>5.4))?null:goods(x,z);
  if(Math.abs(ax-8)<=3.5&&z>=-6.5&&z<=-1.5&&s<=7) return s===7?Wr[4]:((Math.abs(ax-8)>3||z<-6||z>-2)?Wr[1]:Wr[3]);
  return null; }
/* ---- muros de JA-VTT por casilla (T6b): ventana, velo, maleza, barrera y los aspectos del portal ---- */
const GLASS=['#2a5a8f','#6cb3d9','#b8e6f2'].map(hexRGB), VEILr=['#3e2f5c','#5f4a86','#8a70b3','#b79bd8','#d8c6ef'].map(hexRGB);
const PINK=['#6b2f55','#a8527f','#e8a0bf','#fbd6e6'].map(hexRGB), BARR=['#5d6464','#a7afaf'].map(hexRGB), VOIDc=hexRGB('#0e0b16'), CAVEd=hexRGB('#1c1726');
// ladrillo del muro con llagas al tresbolillo (hiladas de 3 texeles y junta de 1, como el terreno Muro), un tono más oscuro
function brickAt(x,z,s){ const row=Math.floor(s/4), X=Math.floor(x+8+(row%2)*4); if(s%4===3||X%8===7) return Br[0]; const h=hash(Math.floor(X/8),row,Math.floor(z+8)>>2);
  if(s%4===2) return Br[1]; return h<0.3?Br[1]:h<0.85?Br[2]:Br[3]; }
// arco de piedra en el plano x–s: por dentro del hueco null; sillares con junta
function archStone(x,s,top,hw){ const ax=Math.abs(x); if(ax<hw&&s<top+hw*Math.sqrt(Math.max(0,1-(x/hw)**2))) return null;
  const row=Math.floor(s/4), X=Math.floor(x+8+(row%2)*2); if(s%4===3||X%4===3) return Srr[1]; return (hash(X>>2,row,3)<0.5)?Srr[3]:Srr[2]; }
const PROP3D={
  window:{name:'Ventana',N:16,H:32,orient:true,block:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z); if(az>4.5||ax>7.99) return null;
    if(s===10&&ax<=5.5&&az<=5) return az>4?Srr[3]:Srr[4];                    // alféizar
    if(s===25&&ax<=5.5) return az>4?Srr[2]:Srr[3];                            // dintel
    if(s>=11&&s<=24&&ax<5){ if(az<0.8){ if(Math.abs(x)<0.6||s===17||s===18) return s===18?Wr[2]:Wr[1];   // parteluz y travesaño
        const hl=((Math.floor(x+8)+(24-s))%9)<2; return hl?GLASS[2]:(x+s*0.3>6?GLASS[0]:GLASS[1]); }
      return (az<1.4&&(ax>4.2||s===11||s===24))?Wr[1]:null; }                   // marco; el hueco se ve de lado
    if(s===31) return hash(Math.floor(x+8)>>2,Math.floor(z+8)>>2,7)<0.5?Srr[2]:Srr[3]; return brickAt(x,z,s); }},
  veil:{name:'Velo',N:16,H:30,orient:true,walk:true,noShadow:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x); if(ax>7.99) return null;
    if(s>=28){ if(Math.abs(z)<0.7&&s===28) return IRON[2]; if(Math.abs(z)<1.2&&s===29&&(Math.floor(x+8)%4===1)) return IRON[3]; return null; }   // barra y anillas
    const fold=Math.sin((x+8)*0.95)*1.1, dz=z-fold; if(Math.abs(dz)>0.75||s<1) return null;
    if(ax<1.1&&s<9-ax*4) return null;                                              // se entreabre abajo, en el centro
    const lit=Math.cos((x+8)*0.95); if(s<=2) return VEILr[lit>0?1:0];                // bajo más oscuro
    return VEILr[lit>0.55?4:lit>0?3:lit>-0.55?2:1]; }},
  cover:{name:'Maleza',N:16,H:17,walk:true,rand:true,noShadow:true,cat:'nature',hidden:true,fn:(x,z,s)=>{ if(Math.abs(x)>7.99||Math.abs(z)>7.99) return null;
    const X=Math.floor(x+8), Z=Math.floor(z+8), h0=hash(X,Z,11); if(s===0) return h0<0.8?Grgb[1]:Grgb[0];        // mata al pie
    if(h0>0.5) return null;
    const clump=0.5+0.5*Math.cos(Math.hypot(x,z)*0.35+hash(X>>2,Z>>2,15)*2), top=Math.round(6+clump*6+hash(X,Z,12)*5); if(s>top) return null;
    const f=s/top, lt=(x+z)<0?1:0;                                               // lado de la luz (arriba a la izquierda)
    if(s===top&&hash(X,Z,14)<0.3) return hash(X,Z,16)<0.5?SAr[2]:Grgb[4];          // espigas
    return f>0.75?Grgb[3+lt]:f>0.45?Grgb[2+lt]:f>0.2?Grgb[1+lt]:Grgb[1]; }},
  barrier:{name:'Barrera',N:16,H:32,orient:true,block:true,noShadow:true,gmOnly:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x); if(Math.abs(z)>0.7||ax>7.6) return null;
    const edgeV=ax>=5.9, edgeH=s<=1||s>=30||s===15||s===16; if(!edgeV&&!edgeH) return null;   // sólo el contorno y un travesaño, a trazos como en JA-VTT
    const k=edgeV?s:Math.floor(x+8); if((k%5)>=3) return (edgeV&&edgeH)?BARR[0]:null; return (x+z<0)?BARR[1]:BARR[0]; }},
  portal:{name:'Portal: puerta',N:16,H:36,orient:true,block:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z); if(az>2.5||ax>7.99||s>35) return null;
    if(s>=34) return ax<7.5?(s===35?Srr[4]:Srr[3]):null;
    const st=archStone(x,s,21,5.5); if(st) return (ax<1.3&&s>=26&&s<=28)?PINK[2+(s===27?1:0)]:st;   // sillares y clave con la gema
    if(az>1) return null; if(s===0) return Wr[1];
    if(ax<0.5) return Wr[0];                                                      // junta de las dos hojas
    if(s===6||s===16) return IRON[2]; if(ax>1.5&&ax<2.5&&s>=10&&s<=12) return PINK[1];   // bandas y aldabas
    return (Math.floor((x+8)/2.5)%2)?Wr[1]:Wr[2]; }},
  portal_stairs:{name:'Portal: escalera',N:16,H:7,orient:true,block:true,noShadow:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z); if(ax>7.6||az>7.6) return null;
    const rim=ax>=6.2||az>=6.2;
    if(rim){ if((ax>=6.2&&az>=6.2)&&s<=6) return s>=5?PINK[s===6?3:2]:Srr[2];          // postes de las esquinas con remate rosa
      if(s<=1) return s===1?(Math.floor(x+z+16)%3===0?Srr[3]:Srr[4]):Srr[2]; return null; }
    if(s!==0) return null; const step=Math.floor((z+6.2)/2.5);                    // escalones que bajan hacia el fondo
    if(((z+6.2)%2.5)<0.6) return Srr[Math.max(0,3-step)]; return [Srr[3],Srr[2],Srr[1],CAVEd,VOIDc][Math.min(4,step)]; }},
  portal_cave:{name:'Portal: boca de cueva',N:16,H:19,orient:true,block:true,big:true,cat:'build',hidden:true,fn:(x,z,s)=>{
    const X=Math.floor(x+8), Z=Math.floor(z+8), r=7.9*Math.sqrt(Math.max(0,1-(s/19)**2))-hash(X,Z,Math.floor(s/3))*0.9, d=Math.hypot(x,(z+1)*1.1);
    if(d>r) return null; const mouth=z>-1&&Math.abs(x)<4.3*Math.sqrt(Math.max(0,1-(s/12)**2));
    if(mouth) return d>r-1.3?VOIDc:null;                                           // la boca: oscura en la cara, hueca dentro
    if(d>r-1.2&&s>=r*0.9&&hash(X,Z,s)<0.55) return Grgb[2+(hash(X,Z,5)<0.4?1:0)];   // musgo arriba
    const lt=(x*-0.5+z*-0.6+s*0.6)/12; return lt>0.55?Srr[4]:lt>0.2?Srr[3]:lt>-0.1?Srr[2]:Srr[1]; }},
  portal_trap:{name:'Portal: trampilla',N:16,H:3,orient:true,block:true,noShadow:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z); if(ax>7||az>7) return null;
    if(s===0) return (ax>6||az>6)?Srr[2]:Wr[0];
    if(s===1){ if(ax>6||az>6) return Srr[3]; if(Math.abs(az-3.5)<0.6) return IRON[2]; if(Math.floor(x+6.5)%3===0) return Wr[1]; return (Math.floor((x+6.5)/3)%2)?Wr[3]:Wr[2]; }
    if(s===2){ if(Math.abs(Math.hypot(x,z-4.5)-1.2)<0.5) return IRON[3]; if(ax<0.8&&Math.abs(z+1)<0.8) return PINK[2]; } return null; }},
  portal_magic:{name:'Portal mágico',N:16,H:34,orient:true,block:true,cat:'build',hidden:true,fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z);
    if(s<2) return (ax<7.4&&az<3)?(s===1?Srr[3]:Srr[2]):null;                      // peana
    const cy=18, d=Math.hypot(x,s-cy), a=Math.atan2(s-cy,x);
    if(d>=5.6&&d<=7.9&&az<1.6){ const k=Math.floor((a+Math.PI)/(Math.PI/6)); if(d<6.3&&k%2===0) return PINK[2];   // runas del aro
      return (x+(s-cy))<0?Srr[4]:Srr[2]; }
    if(s>=2&&s<11&&ax>=5.4&&ax<=7.6&&az<1.6) return Srr[2];                          // pies del aro
    if(d<5.6&&az<0.6){ const sw=(a*2+d*0.9)%(Math.PI*2), v=(Math.sin(sw*2)+1)/2;       // remolino
      return d<1.3?PINK[3]:v>0.75?PINK[3]:v>0.45?PINK[2]:v>0.2?PINK[1]:PINK[0]; }
    return null; }},
  door:{name:'Puerta',N:16,H:32,orient:true,block:true,door:true,fn:(x,z,s)=>{ if(Math.abs(z)>1.1||Math.abs(x)>7.5) return null;
    if(s===0||s>=31||Math.abs(x)>6.5) return Wr[1]; if(s===11||s===22) return Srr[1]; if(x>3.5&&x<5.5&&s>=14&&s<=16) return GOLDc;
    return (Math.floor((x+7)/3.5)%2)?Wr[2]:Wr[3]; }},
  chest:{name:'Cofre',N:16,H:10,block:true,rand:true,fn:(x,z,s)=>{ if(Math.abs(x)>6.5||Math.abs(z)>4.5) return null;
    if(s>=9) return (Math.abs(x)>6||Math.abs(z)>4)?null:Wr[4]; if(s===6) return Srr[2]; if(Math.abs(x)<1.2&&z>3.5&&s>=4&&s<=6) return GOLDc;
    return (Math.abs(x)>5.5||Math.abs(z)>3.5)?Srr[2]:(s>6?Wr[3]:Wr[2]); }},
  barrel:{name:'Barril',N:12,H:15,block:true,rand:true,fn:(x,z,s)=>{ const r=4.4+0.8*Math.sin(Math.PI*s/14), d=Math.hypot(x,z); if(d>r) return null;
    if(s===2||s===12) return Srr[1]; if(s===14) return d>r-1?Wr[1]:Wr[2]; const a=Math.atan2(z,x); return (Math.floor((a+Math.PI)/(Math.PI/6))%2)?Wr[3]:Wr[2]; }},
  table:{name:'Mesa',N:20,H:12,orient:true,block:true,fn:(x,z,s)=>{ if(s>=10){ if(Math.abs(x)>8.5||Math.abs(z)>5.5) return null;
      return s===11?((Math.abs(x)>7.5||Math.abs(z)>4.5)?Wr[2]:Wr[4]):Wr[2]; }
    return (Math.abs(Math.abs(x)-7)<1&&Math.abs(Math.abs(z)-4)<1)?Wr[1]:null; }},
  bed:{name:'Cama',N:24,H:9,orient:true,block:true,big:true,fn:(x,z,s)=>{ if(Math.abs(x)>6.5||Math.abs(z)>11) return null;
    if(z<-10) return s<=8?Wr[1]:null; if(s<3) return (Math.abs(x)>5.5&&Math.abs(z)>9.5)?Wr[1]:null; if(s===3) return Wr[2];
    if(s<=5) return z<-7?WHITEc:(Math.abs(x)>5.5||z>9.5?BLUEd:BLUEc); if(s===6&&z<-7&&z>-10&&Math.abs(x)<4.5) return WHITEc; return null; }},
  shelf:{name:'Estantería',N:16,H:30,orient:true,block:true,fn:(x,z,s)=>{ if(Math.abs(x)>7||z<-4||z>5) return null;
    if(z>=3.5) return Wr[1]; if(Math.abs(x)>6) return Wr[2]; if(s%7===0) return Wr[3];
    if(s%7<=5&&z>=-3&&z<=2){ const col=Math.floor((x+7)/2); if((col+Math.floor(s/7))%5===4) return null; return BOOKS[(col*3+Math.floor(s/7))%5]; } return null; }},
  fence:{name:'Valla',N:16,H:12,orient:true,block:true,fn:(x,z,s)=>{ if(Math.abs(x)>=6&&Math.abs(x)<=7.8&&Math.abs(z)<=1) return s===11?Wr[3]:Wr[2];
    if(Math.abs(z)<=0.7&&(s===4||s===5||s===8||s===9)) return s%4===1?Wr[2]:Wr[3]; return null; }},
  well:{name:'Pozo',N:22,H:26,block:true,big:true,cat:'build',fn:(x,z,s)=>{ const d=Math.hypot(x,z), a=Math.atan2(z,x);
    if(s<7&&d>=6.5&&d<=9.5){ if(s===6) return d>8.8?Srr[3]:Srr[4]; if(s%3===2) return Srr[1]; const st=((Math.floor(a*3)+(s>>1)*2)%2+2)%2, lt=(x+z)/13;
      if(hash(Math.floor(x+11),Math.floor(z+11),s)<0.12) return Grgb[2]; return lt>0.3?Srr[4]:(st?Srr[2]:Srr[3]); }
    if(s===4&&d<6.5) return hash(Math.floor(x+11),Math.floor(z+11),9)<0.1?hexRGB(WA[4]):WATc;
    if(s<22&&Math.abs(Math.abs(x)-8)<0.8&&Math.abs(z)<0.9) return (x>0)?Wr[3]:Wr[2];
    if(s===16&&Math.abs(x)<8&&Math.abs(z)<0.6) return Wr[1]; if(s>=15&&s<=16&&x>8.5&&x<10.5&&z>=0&&z<2.2) return IRON[2];
    if(s>=13&&s<=15&&Math.abs(x)<0.45&&Math.abs(z)<0.45) return SAr[2];
    if(s>=9&&s<=12&&d<1.9) return s===11?IRON[1]:(s===12?Wr[1]:Wr[2]);
    if(s>=20&&Math.abs(x)<=10&&Math.abs(z)<=(25.5-s)*2) return RFr[(s+Math.floor(Math.abs(z)))%2?2:3]; return null; }},
  lamp:{name:'Farol',N:8,H:38,block:true,light:5,lightS:34,rand:true,fn:(x,z,s)=>{ const d=Math.hypot(x,z);
    if(s<2) return d<2.6?Srr[2]:null; if(s<31) return d<1.2?Srr[1]:null; if(s<37){ if(d>3) return null; return (Math.abs(x)>2.2||Math.abs(z)>2.2||s===31)?Srr[1]:FLc[s%2]; }
    return d<3.2?Srr[1]:null; }},
  stairs:{name:'Paso a otro tablero',N:16,H:8,walk:true,rand:false,fn:(x,z,s)=>{ if(Math.abs(x)>7.5||Math.abs(z)>7.5) return null; const st=Math.floor((x+8)/4);
    if(s>st*2+1) return null; if(Math.abs(z)>6.5) return Srr[1]; return s===st*2+1?Srr[4]:Srr[2]; }},
  torch:{name:'Antorcha',N:6,H:20,block:true,light:4,lightS:18,rand:true,fn:(x,z,s)=>{ const d=Math.hypot(x,z);
    if(s<14) return d<1?Wr[2]:null; if(s<16) return d<2?Srr[1]:null; const r=(19.5-s)*0.7+0.4; return d<r?FLc[Math.min(2,Math.floor((s-16)/1.4))]:null; }},
  bridge:{name:'Puente de madera',N:16,H:23,orient:true,walk:true,deck:16,cat:'build',fn:(x,z,s)=>bridgeFn(x,z,s,7.5)},
  bridge2:{name:'Puente ancho',N:32,H:23,orient:true,walk:true,deck:16,span:[2,1],cat:'build',fn:(x,z,s)=>bridgeFn(x,z,s,15.5)},
  gate:{name:'Puerta de la muralla',N:16,H:40,orient:true,block:true,door:true,lift:1.5,frame:'gatearch',cat:'build',fn:(x,z,s)=>{ const ax=Math.abs(x);
    if(Math.abs(z)>1||ax>6.3) return null; const bar=(Math.floor(x+8)%3)===1;
    if(s>=38) return s===39?Wr[4]:Wr[2]; if(s<=1) return bar&&(s===1||Math.abs(z)<0.5)?IRON[1]:null;
    if(bar) return (x+z>0)?IRON[3]:IRON[2]; if(s%5===2) return IRON[1]; return null; }},
  gatearch:{name:'Arco de la muralla',N:16,H:64,orient:true,hidden:true,cat:'build',fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z), X=Math.floor(x+8);
    if(ax>8||az>8||s>62) return null;
    const arch=31+8*Math.sqrt(Math.max(0,1-(x/6.5)**2));
    if(ax<6.5&&s<arch) return null;
    if(ax<6.5&&az<1.4&&s<56) return null;
    if(s>=56){ if(az<5.5) return null; const m=X<4||(X>=6&&X<10)||X>=12; if(!m) return null; return s===62?Srr[3]:(s%4===3?Br[1]:(x+z>0?Br[3]:Br[2])); }
    if(s===55) return az>7.3?Srr[2]:Srr[3];
    if(ax<6.5&&s<arch+2.2) return (Math.floor(Math.atan2(s-31,x)*5)%2)?Srr[3]:Srr[2];
    const row=s>>2, off=row%2?4:0; if(s%4===3||(X+off)%8===7||(Math.floor(z+8)+off)%8===7) return Br[1];
    return hash((X+off)>>3,row,Math.floor(z+8)>>3)<0.35?Br[2]:Br[3]; }},
  stall:{name:'Puesto de fruta',N:32,H:30,orient:true,block:true,span:[2,1],cat:'build',fn:(x,z,s)=>stallFn(x,z,s,[RFr[2],RFr[1]],[WHITEc,Srr[4]],(x,z)=>{ const b=Math.floor((x+12)/8), ex=((x+12)%8), X=Math.floor(x+16), Z=Math.floor(z+8);
    if(ex<0.8||ex>7.2||z<2.6||z>5.4) return Wr[3]; const hl=hash(X,Z,4)<0.25; return [[REDc,ROSEc],[ORc,YELc],[Grgb[3],Grgb[4]]][Math.min(2,b)][hl?1:0]; })},
  stall2:{name:'Puesto de telas',N:32,H:30,orient:true,block:true,span:[2,1],cat:'build',fn:(x,z,s)=>stallFn(x,z,s,[BLUEc,BLUEd],[CREAMc,CREAMd],(x,z)=>{ const b=Math.floor((x+12)/4), ex=(x+12)%4;
    if(ex<0.6) return Wr[1]; const c=CLOTH[(b*3)%CLOTH.length]; return (z>5||z<2.8)?c[1]:c[0]; })},
  windmill:{name:'Molino de viento',N:64,H:106,orient:true,block:true,span:[3,3],cat:'build',fn:(x,z,s)=>{
    if(z>=17.5&&z<=21){ const ds=s-74, rr=Math.hypot(x,ds);
      if(rr<2.8) return rr<1.3?Wr[3]:Wr[0];
      if(rr<=31) for(let i=0;i<4;i++){ const a=Math.PI/4+i*HALF_PI, ca=Math.cos(a), sa=Math.sin(a), al=x*ca+ds*sa, pp=-x*sa+ds*ca;
        if(al<1||al>31) continue; if(Math.abs(pp)<1) return Wr[1];
        if(pp>=1&&pp<=7&&al>=6){ if(al%4.8<0.9||pp>6.1) return Wr[2]; return (pp<4)?SAILc[0]:SAILc[1]; } } }
    if(Math.abs(x)<1.2&&Math.abs(s-74)<1.2&&z>=12&&z<17.5) return Wr[1];
    if(s<70){ const ax=Math.abs(x), az=Math.abs(z), R=s<36?21.5:s<60?19.5:17.5, d8=Math.max(ax,az,(ax+az)*0.7071); if(d8>R) return null;   // tres cuerpos: sin escalones de un texel que el contorno marcaría
      const lt=(x+z)/(R*1.42);
      if(s<8){ const ang=Math.atan2(z,x)*8/Math.PI+(Math.floor(s/3)%2?0.5:0); if(s%3===2||(d8>R-1.2&&((ang%1)+1)%1<0.14)) return Srr[1]; return lt>0.2?Srr[4]:lt>-0.3?Srr[3]:Srr[2]; }
      if(s===8||s===36||s===60) return Wr[1];
      if(z>0&&ax<3.8&&s<23&&d8>R-2.5) return (s>=22||ax>3.1)?Wr[1]:((Math.floor(x+32)%2)?Wr[2]:Wr[3]);
      if(s>=44&&s<=49&&d8>R-1.5&&((ax<1.5&&az>7)||(az<1.5&&ax>7))) return s===44?Wr[1]:IRON[0];
      const b=Math.max(0,Math.min(3,Math.floor(2+lt*1.7))), ph=s%3; return PLAST[Math.max(0,b-(ph===0?1:0)-(ph===2&&b<3?0:0))]; }   // tablas encaladas
    if(s<=88){ const R2=18.5*(1-(s-70)/19), dh=Math.hypot(x,z); if(dh>R2) return null; if(s===88) return Wr[1];
      const lt=(x+z)/(Math.max(R2,1)*1.42), row=Math.floor((s-70)/2.5), seam=((Math.floor(Math.atan2(z,x)*6/Math.PI+row*0.5)%2)+2)%2;
      if(dh>R2-1.5&&(s-70)%2.5<1) return SHr[1]; return lt>0.25?SHr[seam?4:3]:lt>-0.3?SHr[seam?3:2]:SHr[2]; }
    return null; }},
  belfry:{name:'Campanario',N:20,H:108,block:true,cat:'build',fn:(x,z,s)=>{ const ax=Math.abs(x), az=Math.abs(z), m=Math.max(ax,az), X=Math.floor(x+10), Z=Math.floor(z+10);
    if(s<68){ if(m>6.5) return null;
      if(z>5.5&&ax<2.6&&s<12) return (s>=11||ax>1.9)?Srr[1]:((X%2)?Wr[2]:Wr[3]);
      if(s>=40&&s<=46&&((ax<0.9&&az>5.5)||(az<0.9&&ax>5.5))) return IRON[0];
      if(ax>5.5&&az>5.5) return (s%8<4)?Srr[4]:Srr[3];
      const row=s>>2, off=row%2?3:0; if(s%4===3||(X+off)%6===5||(Z+off)%6===5) return Srr[1];
      return (x+z>0)?(hash((X+off)/6|0,row,Z)<0.3?Srr[3]:Srr[4]):(hash((X+off)/6|0,row,Z)<0.3?Srr[2]:Srr[3]); }
    if(s<70){ if(m>7.5) return null; return s===69?Srr[4]:Srr[2]; }
    if(s<82){ if(m<=6.5&&ax>4.3&&az>4.3) return (x+z>0)?Srr[3]:Srr[2];
      const bs=s-71; if(bs>=0&&bs<=9){ const br=1.4+(9-bs)*0.34; if(Math.hypot(x,z)<=br) return bs<1?BRONZE[0]:(x+z>0?GOLDc:BRONZE[1]); }
      if(s>=80&&ax<0.8&&az<4.5) return Wr[1]; return null; }
    if(s<86){ if(m>7.5) return null; return s===85?Srr[4]:(s===82?Srr[1]:Srr[3]); }
    if(s<105){ const t=(s-86)/19, R=7.2*(1-t), d8=Math.max(ax,az,(ax+az)*0.7071); if(d8>R) return null;
      const lt=(x+z)/(Math.max(R,1)*1.42); if((s-86)%3===2&&d8>R-1.2) return CUr[1]; return lt>0.3?CUr[4]:lt>-0.2?CUr[3]:CUr[2]; }
    if(ax<0.6&&az<0.6) return GOLDc; if(s===106&&ax<1.9&&az<0.6) return GOLDc; return null; }},
  post:{name:'Poste',N:16,H:32,block:true,cat:'build',fn:(x,z,s)=>{ const d=Math.max(Math.abs(x),Math.abs(z));
    if(s<1&&d<2.4) return Srr[2]; if(d<1.6) return s===31?Wr[4]:((x+z)>0?Wr[3]:Wr[2]); return null; }},
  cart:{name:'Carreta',N:32,H:17,orient:true,block:true,span:[2,1],cat:'decor',fn:(x,z,s)=>{ const az=Math.abs(z);
    if(Math.abs(az-7.2)<1.1){ const dx=x+3, ds=s-5.5, r=Math.hypot(dx,ds); if(r<=6.2){ if(r>4.8) return (dx+ds>0)?Wr[2]:Wr[1]; if(r<1.4) return IRON[2];
      const a=Math.atan2(ds,dx); return Math.abs(Math.sin(a*3))<0.2?Wr[3]:null; } }
    if(x>9&&x<16&&Math.abs(az-3)<0.8&&Math.abs(s-(8-(x-9)*0.5))<0.9) return Wr[2];
    if(x>=-12&&x<=10&&az<=6){ if(s===7) return Wr[1];
      if(s>=8&&s<=11&&(az>5.2||x<-11.3||x>9.3)) return s===11?Wr[4]:((Math.floor(x+16)%4)?Wr[3]:Wr[2]);
      if(s>=8) for(const [cx,cz] of [[-7,-2],[-1,2],[5,-2]]){ const q=((x-cx)/3.3)**2+((z-cz)/2.8)**2+((s-10)/3)**2; if(q<=1) return s>=12?SAr[3]:(q>0.7?SAr[1]:SAr[2]); } }
    return null; }},
  crates:{name:'Cajas y barriles',N:16,H:16,block:true,rand:true,cat:'decor',fn:(x,z,s)=>{
    const crate=(x0,x1,z0,z1,s0,s1)=>{ if(x<x0||x>x1||z<z0||z>z1||s<s0||s>s1) return null; const ex=x<x0+1||x>x1-1, ez=z<z0+1||z>z1-1, top=s===s1;
      if((ex&&ez)||(top&&(ex||ez))||(s===s0&&(ex||ez))) return Wr[1]; if(top) return (Math.floor(x+8)%3)?Wr[4]:Wr[3]; return ((s-s0)%3===2)?Wr[2]:Wr[3]; };
    const d=Math.hypot(x-4,z-4); if(s<=10&&d<=3.2+0.5*Math.sin(Math.PI*s/10)){ if(s===2||s===8) return IRON[1]; if(s===10) return d>2.4?Wr[1]:Wr[2]; return (Math.floor(Math.atan2(z-4,x-4)*3)%2)?Wr[3]:Wr[2]; }
    return crate(-7,1,-7,1,0,7)||crate(-6,0,-6,0,8,14)||crate(1.5,7,-7,-2,0,4); }},
  bench:{name:'Banco',N:16,H:14,orient:true,block:true,cat:'furniture',fn:(x,z,s)=>{ const ax=Math.abs(x); if(ax>7) return null;
    if(s>=6&&s<=7&&z>=-3&&z<=2.5) return s===7?((Math.floor(z+8)%3)?Wr[4]:Wr[3]):Wr[2];
    if(z>=-4.2&&z<=-2.8&&s>=8&&s<=13) return s===13?Wr[4]:((s%3)?Wr[3]:Wr[1]);
    if(Math.abs(ax-5.5)<1&&s<6&&(Math.abs(z-1)<1||Math.abs(z+3)<1)) return Wr[1]; return null; }},
  picket:{name:'Valla de estacas',N:16,H:11,orient:true,block:true,noShadow:true,cat:'decor',fn:(x,z,s)=>{ const X=Math.floor(x+8), px=X%4;
    if(z>=-1.8&&z<=-0.8&&(s===3||s===7)) return Wr[2];
    if(Math.abs(z)<=0.9&&(px===1||px===2)){ if(s===10) return px===1?PLAST[3]:null; return s<1?PLAST[1]:(px===1?PLAST[3]:PLAST[2]); } return null; }},
  stonewall:{name:'Murete de piedra',N:16,H:9,orient:true,block:true,noShadow:true,cat:'decor',fn:(x,z,s)=>{ const X=Math.floor(x+8), az=Math.abs(z); if(az>3.3-s*0.15) return null;
    if(s===8) return hash(X,Math.floor(z+8),3)<0.55?Grgb[2]:Grgb[3];
    const row=Math.floor(s/3), off=row%2?3:0, h=hash(Math.floor((X+off)/5),row,11); if(s%3===2||(X+off)%5===4) return Srr[1]; return h<0.3?Srr[2]:h<0.8?Srr[3]:Srr[4]; }},
  sign:{name:'Letrero',N:16,H:26,orient:true,block:true,cat:'decor',fn:(x,z,s)=>{ const az=Math.abs(z);
    if(s<1&&Math.abs(x+6)<2&&az<2) return Srr[2]; if(Math.abs(x+6)<1&&az<1) return s>=25?Wr[4]:Wr[2];
    if(s>=23&&s<=24&&x>-6&&x<6&&az<0.8) return Wr[1];
    if(s>=20&&s<=22&&az<0.6&&(Math.abs(x+1.5)<0.5||Math.abs(x-4.5)<0.5)) return IRON[1];
    if(s>=12&&s<=19&&x>=-3&&x<=6&&az<=1){ if(x<-2.4||x>5.4||s===12||s===19) return Wr[1]; const X=Math.floor(x+3), Y=19-s;
      if((X>=3&&X<=5&&Y>=2&&Y<=5)||(X===6&&(Y===3||Y===4))) return GOLDc; return Wr[3]; } return null; }},
};
  const Objetos3D = { G, D, S, B, W, SA, WA, SL, TH, SH, CU, Grgb, Drgb, Srgb, PROP3D };
  if (typeof module === 'object' && module.exports) module.exports = Objetos3D;
  else (root.Tablero3D = root.Tablero3D || {}).Objetos3D = Objetos3D;
})(typeof window !== 'undefined' ? window : globalThis);
