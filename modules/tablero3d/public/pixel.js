/* Operaciones de píxel del editor de arte del tablero 3D (Tablero3D.Pixel en el navegador; require() en node): voltear y
   girar (flipH, flipV, rot90), la línea de Bresenham (lineCb), HSL (rgb2hsl, hsl2rgb), la rampa de tonos (hueRamp), el
   color en #rrggbb (toHex), leer una paleta de texto (parsePalette) y los núcleos de los ajustes de color (mapPixels,
   reduceToPalette, replaceColor). Extraído de tablero3d.js (refactor, tarea 7).
   Puro: trabaja sobre un Uint8ClampedArray RGBA de w×h, sin DOM, sin THREE y sin el estado del editor (ART). Los ajustes
   que en el motor leen ART (capa y cuadro actuales, selección, deshacer) se quedan allí en envoltorios con el mismo nombre
   que llaman a estos núcleos: la selección llega como `sel(x,y)` (sin ella, todos los píxeles).
     mapPixels(data,w,h,fn,sel)           aplica fn(r,g,b)->[r,g,b] (o nada: no cambia) a cada píxel opaco seleccionado
     reduceToPalette(data,w,h,pal,sel)    cada píxel opaco seleccionado al color más cercano de pal ([[r,g,b]…], luma ponderada)
     replaceColor(data,w,h,a,b,sel)       los píxeles opacos seleccionados de color a pasan a b (con su alfa); devuelve cuántos */
(function (root) {
'use strict';
const toHex=c=>'#'+[c[0],c[1],c[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
function lineCb(x0,y0,x1,y1,cb){ const dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1; let e=dx+dy;
  for(;;){ cb(x0,y0); if(x0===x1&&y0===y1) break; const e2=2*e; if(e2>=dy){ e+=dy; x0+=sx; } if(e2<=dx){ e+=dx; y0+=sy; } } }
const flipH=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(y*w+x)*4+k]=s[(y*w+w-1-x)*4+k]; return {data:o,w,h}; };
const flipV=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(y*w+x)*4+k]=s[((h-1-y)*w+x)*4+k]; return {data:o,w,h}; };
const rot90=(s,w,h)=>{ const o=new Uint8ClampedArray(s.length); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<4;k++) o[(x*h+(h-1-y))*4+k]=s[(y*w+x)*4+k]; return {data:o,w:h,h:w}; };
// rampa de 7 tonos: las sombras giran hacia el azul y las luces hacia el amarillo, como en el pixel art clásico
function hueRamp(c){ const [h,s2,l]=rgb2hsl(c[0],c[1],c[2]), out=[];
  for(let i=-3;i<=3;i++){ const t=i/3, tgt=i<0?0.66:0.16; let dh=((tgt-h+1.5)%1)-0.5; const nh=(h+dh*Math.abs(t)*0.12+1)%1;
    const nl=Math.max(0.04,Math.min(0.96,l+t*(i<0?l*0.8:(1-l)*0.8))), ns=Math.max(0,Math.min(1,s2*(i>0?1-t*0.25:1+Math.abs(t)*0.1)));
    out.push(toHex(hsl2rgb(nh,ns,nl))); }
  return [...new Set(out)]; }
function parsePalette(text){ const out=[];
  for(const line of String(text).split(/\r?\n/)){ const t=line.trim(); if(!t||t.startsWith('#')&&!/^#[0-9a-f]{6}\b/i.test(t)||/^(GIMP|Name|Columns)/i.test(t)) continue;
    const m=t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/); if(m){ out.push(toHex([+m[1],+m[2],+m[3]].map(v=>Math.min(255,v)))); continue; }
    for(const h of t.matchAll(/#?\b([0-9a-f]{6})\b/gi)) out.push('#'+h[1]); }
  return out; }
function rgb2hsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0, s=0; const l=(mx+mn)/2;
  if(mx!==mn){ const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h/=6; } return [h,s,l]; }
function hsl2rgb(h,s,l){ if(!s){ const v=Math.round(l*255); return [v,v,v]; } const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{ t=(t+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p; }; return [f(h+1/3),f(h),f(h-1/3)].map(v=>Math.round(v*255)); }
// núcleo de mapPixels del motor: el recorrido de una capa (el motor elige cuadros y capa, y guarda el deshacer)
function mapPixels(buf,w,h,fn,sel){
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(sel&&!sel(x,y)) continue; const o=(y*w+x)*4; if(!buf[o+3]) continue;
      const c=fn(buf[o],buf[o+1],buf[o+2]); if(c){ buf[o]=c[0]; buf[o+1]=c[1]; buf[o+2]=c[2]; } } }
// núcleo de reduceToPalette del motor: el color más cercano de la paleta
function reduceToPalette(buf,w,h,pal,sel){
  mapPixels(buf,w,h,(r,g,b)=>{ let best=pal[0], bd=1e9; for(const p of pal){ const dr=r-p[0], dg=g-p[1], db=b-p[2], dd=dr*dr*0.3+dg*dg*0.59+db*db*0.11; if(dd<bd){ bd=dd; best=p; } } return best; },sel); }
// núcleo de replaceColor del motor: una capa; devuelve cuántos píxeles cambió
function replaceColor(buf,w,h,a,b,sel){ let n=0;
    for(let o=0;o<buf.length;o+=4){ const x=(o/4)%w, y=((o/4)/w)|0; if(sel&&!sel(x,y)) continue;
      if(buf[o+3]&&buf[o]===a[0]&&buf[o+1]===a[1]&&buf[o+2]===a[2]){ buf[o]=b[0]; buf[o+1]=b[1]; buf[o+2]=b[2]; buf[o+3]=b[3]; n++; } }
  return n; }
  const Pixel = { flipH, flipV, rot90, lineCb, rgb2hsl, hsl2rgb, hueRamp, parsePalette, reduceToPalette, replaceColor, mapPixels, toHex };
  if (typeof module === 'object' && module.exports) module.exports = Pixel;
  else (root.Tablero3D = root.Tablero3D || {}).Pixel = Pixel;
})(typeof window !== 'undefined' ? window : globalThis);
