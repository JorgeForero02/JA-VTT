/* Editor de pixel art del tablero 3D (Tablero3D.EditorArte): documento por capas y cuadros (casilla, personaje u objeto 3D
   por rebanadas), herramientas y selección, paleta y ajustes de color, vista previa, «Probar», «Guardar», la biblioteca
   (hojas PNG por capa), el explorador de todo el arte, el borrador automático y el asistente de nuevo dibujo.
   Extraído literalmente de tablero3d.js (refactor, tarea 8): ART + la parte del editor de «interfaz: paneles» y los
   ajustes de creación. La fase 1 (objetos propios con comportamiento) añade aquí su panel.

   Es una FÁBRICA de navegador (usa el DOM y los lienzos del editor): el motor la invoca una vez, en el punto de su cierre
   donde empezaba este código, así que los manejadores que se registran al cargar ($('artSave').onclick…, el giro de la
   vista previa, el borrador cada 5 s, la tecla espacio) lo hacen en el mismo orden relativo:
     const EDITOR=T3D.EditorArte({...});

   api (lista cerrada; lo que el motor REASIGNA llega como función lectora y se lee en cada uso):
     $, icon            $(id) e icon(nombre) del anfitrión (ctx)
     ui                 Tablero3D.UI del motor (mkBtn, sepEl, lblEl, lsGet, lsSet)
     pixel              Tablero3D.Pixel (voltear/girar, línea, HSL, rampa, paletas y los núcleos de los ajustes)
     art                la instancia de ArteProcedural del motor: atlasTex y atlasCanvas se leen y asignan como art.X en cada
                        uso (applyCustom); lo que no cambia de identidad (CUSTOM, CAN, atlas…) se desestructura
     Base, Luces, Objetos3D, Escena, Fichas   módulos puros (hexRGB, mulberry32; WARM, LIGHT_TYPES, OBJ_LIGHT_IDS; rampas y
                        PROP3D; ROOF_MAT_IDS; tamaños de ficha)
     getM(), getENV(), getTEX(), getDB(), getDL(), getSIN_E(), getCOS_E()
                        escena abierta, momento de luz, resolución, almacén y descargas de la mesa, y el seno/coseno de la
                        elevación de la cámara (la vista alta la cambia) para la vista previa de los objetos
     uniforms           uniformes del terreno (applyCustom cambia uMap al rehacer el atlas)
     rebuild, buildDecor, buildRoofs, refreshEntities, syncMinis, renderPalette, applyArtMaps, layout, showHint
                        lo que el motor rehace cuando el arte propio cambia, y el aviso
     propOpts, setPropSel(i), setMiniKind(k), artSizeId(kind), stackThumb(slices)
                        paleta de objetos y personajes del editor de tablero («Probar» deja elegido lo nuevo)
     on, every, observe escuchas, temporizadores y observadores que el motor suelta al desmontar

   Devuelve:
     open(), close()    abrir y cerrar el editor (antes openArt/closeArt)
     isOpen()           si está abierto (antes ART.open): la entrada y el bucle del motor lo consultan
     key(e)             teclado mientras está abierto (antes artKey)
     preview(t)         dibuja la vista previa; el bucle la llama en cada cuadro con el editor abierto (antes artPreview)
     loadAllAssets()    carga la biblioteca guardada y la aplica (el motor la llama tras conectar el almacén)
     registerDoc(d), applyCustom(kind)   registra un dibujo como arte propio y lo aplica al tablero
     docInfo(), openNewDlg(), artTab(t)  rótulo del documento, asistente de nuevo dibujo y pestañas del editor */
(function (root) {
'use strict';
function EditorArte(api){
const {$,icon,ui,pixel:Pixel,art:ART3,Base,Luces,Objetos3D,Escena,Fichas,getM,getENV,getTEX,getDB,getDL,getSIN_E,getCOS_E,uniforms,
  rebuild,buildDecor,buildRoofs,refreshEntities,syncMinis,renderPalette,applyArtMaps,layout,showHint,
  propOpts,setPropSel,setMiniKind,artSizeId,stackThumb,on,every,observe}=api;
const {mkBtn,sepEl,lblEl,lsGet,lsSet}=ui;
const {flipH,flipV,rot90,lineCb,rgb2hsl,hsl2rgb,hueRamp,parsePalette,toHex}=Pixel;
const {hexRGB,mulberry32}=Base; const {WARM,LIGHT_TYPES,OBJ_LIGHT_IDS}=Luces;
const {G,D,S,B,W,SA,WA,SL,TH,SH,CU,Srgb,PROP3D}=Objetos3D; const {ROOF_MAT_IDS}=Escena;
const {CUSTOM,CAN,CHARS,HANDART,FL,EXTRA_RAMPS,BAYER,ROOF_MATS,ROOF_KEY,ORIG_TERR,atlas,AC,mkCanvas,tex,upscale,fitTo,paintStack,
  stackTree,propFn,composeAtlas,buildArt}=ART3;

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
const ART_IC={pencil:'pencil',eraser:'eraser',fill:'paint-bucket',pick:'pipette',line:'slash',rect:'rectangle-horizontal',ellipse:'ellipse',select:'square-dashed',move:'move',shade:'contrast',dither:'grid-2x2',hand:'hand-grab',spray:'spray-can',gradient:'blend',wand:'wand-sparkles',lasso:'lasso',lightpos:'lightbulb'};
function renderTools(){ const el=$('artTools'); el.textContent='';
  for(const [k,n,key] of ATOOLS){ const b=document.createElement('button'); b.className='t3d-tb';
    b.innerHTML=icon(ART_IC[k]||'pencil'); const sp=document.createElement('span'); sp.textContent=n; b.appendChild(sp);
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
function noteRecent(c){ if(!c||!c[3]) return; const h=toHex(c); ART.recent=[h,...(ART.recent||[]).filter(x=>x!==h)].slice(0,12); }
// paleta importada o sacada del dibujo: se añade como paleta base «Importada»
function usePalette(cols,label){ cols=[...new Set(cols.map(h=>h.toLowerCase()).filter(h=>/^#[0-9a-f]{6}$/.test(h)))].slice(0,64);
  if(!cols.length) return showHint('No se encontraron colores en ese archivo.',1800);
  PRESETS.imported=[byLum(cols)]; const sel=$('artPreset'); let o=[...sel.options].find(x=>x.value==='imported');
  if(!o){ o=document.createElement('option'); o.value='imported'; sel.appendChild(o); } o.textContent=label+' ('+cols.length+' colores)'; sel.value='imported';
  PAL_RAMPS=PRESETS.imported; buildShade(); renderPal(); showHint('Paleta de '+cols.length+' colores lista.',1800); }
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
  apx.fillStyle=getENV().ambient<0.4?'#1b1630':'#8fb3c2'; apx.fillRect(0,0,Wp,Hp);
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
    const s=Math.max(0.2,Math.min(Wp/(d.w*1.5),(Hp-8)/(d.w*1.5*getSIN_E()+n*getCOS_E())));
    const base=Hp-d.w*0.75*getSIN_E()*s-4;
    for(let f=0;f<n;f++){ apx.save(); apx.translate(Wp/2,base-f*getCOS_E()*s); apx.scale(s,s*getSIN_E()); apx.rotate(ang); apx.drawImage(compCanvas(f),-d.w/2,-d.h/2);
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
  if(!ART.doc){ $('artKind').value='tile'; syncArtForm(); $('artRes').value=String(getTEX()); setDoc(docFromCurrent('tile','g:top',getTEX())); restoreDraft(); }
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
  if(kind==='tile'){ const old=ART3.atlasTex; ART3.atlasCanvas=composeAtlas(); ART3.atlasTex=tex(ART3.atlasCanvas); uniforms.uMap.value=ART3.atlasTex; old.dispose(); if(getM()){ rebuild(); buildDecor(); buildRoofs(); } }
  else { if(getM()) syncMinis(); buildArt(); applyArtMaps(); if(getM()){ refreshEntities(); rebuild(); buildDecor(); } }
  renderPalette();
}
$('artTry').onclick=()=>{ commitFloat(); const d=ART.doc; d.key=assetKey(d); registerDoc(d); applyCustom(d.kind);
  if(d.kind==='char'&&d.key.startsWith('c_')){ setMiniKind(d.key); } if(d.kind==='obj'&&d.key.startsWith('o_')){ setPropSel(propOpts().findIndex(o=>o.custom===d.key)); }
  closeArt(); $('backToArt').hidden=false;
  showHint(d.kind==='tile'?'Aplicado al tablero (sin guardar).':'Aplicado. Colócalo desde Editar, en '+(d.kind==='char'?'Personajes':'Objetos')+'.',2600); };

/* ---- biblioteca: guardado como hojas PNG por capa ---- */
const LSA='tablero:assets';
async function assetList(){
  if(getDB()){ try{ const q=await getDB().collection('assets').orderBy('updated','desc').limit(120).get(); return q.docs.map(x=>({id:x.id,...x.data()})); }catch(e){} }
  return Object.entries(lsGet(LSA)).map(([id,o])=>({id,...o})).sort((a,b)=>(b.updated||0)-(a.updated||0));
}
async function assetPut(id,rec){
  if(getDB()){ try{ await getDB().collection('assets').doc(id).set(rec); return 'db'; }catch(e){ if(e&&(e.code==='quota_exceeded'||e.code==='invalid_argument')) throw e; } }
  const all=lsGet(LSA); all[id]=rec; if(!lsSet(LSA,all)) throw {code:'local'}; return 'local';
}
async function assetDel(id){ if(getDB()){ try{ await getDB().collection('assets').doc(id).delete(); }catch(e){} } const all=lsGet(LSA); if(all[id]){ delete all[id]; lsSet(LSA,all); } }
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
$('artExp').onclick=async()=>{ if(!getDL()) return; commitFloat(); const d=ART.doc, cols=Math.min(d.frames.length,16), rows=Math.ceil(d.frames.length/cols);
  const c=mkCanvas(cols*d.w,rows*d.h), x=c.getContext('2d'); d.frames.forEach((fr,f)=>x.drawImage(compCanvas(f),(f%cols)*d.w,Math.floor(f/cols)*d.h));
  const blob=await new Promise(r=>c.toBlob(r,'image/png')); const fname=(d.name||'dibujo').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g,'').trim().replace(/\s+/g,'-')||'dibujo';
  try{ await getDL().save({filename:fname+'.png',data:blob}); showHint('Imagen exportada.'); }catch(e){ if(!(e&&e.code==='declined')) showHint('No se pudo exportar la imagen.'); } };

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
// aplica fn(r,g,b)->[r,g,b] a los píxeles de la capa (o selección) actual; all=true: a todos los cuadros
function mapPixels(fn,all){ forCels(all,(buf,d)=>Pixel.mapPixels(buf,d.w,d.h,fn,inSel)); changed(all); }
// la capa actual de cada cuadro que toca un ajuste (all=true: todos), tras soltar lo flotante y guardar el deshacer
function forCels(all,body){ commitFloat(); const d=ART.doc; all?pushDoc():pushCel();
  for(const f of (all?d.frames.map((x,i)=>i):[ART.frame])) body(d.frames[f].cels[ART.layer],d); }
const adjHSL=(dh,ds,dl)=>mapPixels((r,g,b)=>{ let [h,s2,l]=rgb2hsl(r,g,b); h=(h+dh+1)%1; s2=Math.max(0,Math.min(1,s2+ds)); l=Math.max(0,Math.min(1,l+dl)); return hsl2rgb(h,s2,l); },ART.adjAll);
function paletteList(){ return [...new Set([...PAL_RAMPS.flat(),...ART.custom])].map(h=>hexRGB(h)); }
function reduceToPalette(){ const pal=paletteList();
  forCels(ART.adjAll,(buf,d)=>Pixel.reduceToPalette(buf,d.w,d.h,pal,inSel)); changed(ART.adjAll);
  showHint('Colores ajustados a la paleta activa.',1500); }
function replaceColor(){ const a=ART.prim, b=ART.sec; if(!a[3]){ showHint('Elige como color principal el color que quieres reemplazar.',2200); return; }
  let n=0; forCels(ART.adjAll,(buf,d)=>{ n+=Pixel.replaceColor(buf,d.w,d.h,a,b,inSel); });
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
return { open:openArt, close:closeArt, isOpen:()=>ART.open, key:artKey, preview:artPreview, loadAllAssets, registerDoc, applyCustom,
  docInfo, openNewDlg, artTab };
}
if (typeof module === 'object' && module.exports) module.exports = EditorArte;
else (root.Tablero3D = root.Tablero3D || {}).EditorArte = EditorArte;
})(typeof window !== 'undefined' ? window : globalThis);
