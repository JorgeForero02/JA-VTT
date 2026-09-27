'use strict';
/* Utilidades de interfaz del tablero 3D (Tablero3D.UI): crear un elemento (el), escapar HTML (esc), botón de la barra
   (mkBtn), separador y rótulo (sepEl, lblEl), miniatura de un trozo de lienzo (thumbCanvas) y el guardado local tolerante
   (lsGet, lsSet). Las usan la paleta, el editor de arte, la partida, las campañas, la mesa en vivo y la biblioteca.
   Extraído literalmente de tablero3d.js (refactor, tarea 7).

   Es una FÁBRICA de navegador (usa document y localStorage): el motor la invoca una vez, justo tras sus alias:
     const {el,esc,mkBtn,sepEl,lblEl,thumbCanvas,lsGet,lsSet}=T3D.UI({$,icon:ctx.icon});
   deps = { $, icon }: $(id) y icon(nombre) del anfitrión. Hoy ninguna de estas utilidades los usa (se reciben para las
   piezas de interfaz que se extraen en la tarea 8); no hay estado: cada llamada crea lo suyo.
   thumbCanvas crea su lienzo como mkCanvas de arte-procedural.js (mismo willReadFrequently), que aún no existe cuando se
   construye esta fábrica. */
(function (root) {
'use strict';
function UI(deps){
function mkCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d',{willReadFrequently:true}); return c; }
function thumbCanvas(src,sx,sy,sw,sh){ const c=mkCanvas(sw,sh); c.getContext('2d').drawImage(src,sx,sy,sw,sh,0,0,sw,sh); return c; }
function mkBtn(label,fn,opt={}){ const b=document.createElement('button'); b.className='btn'; b.textContent=label; if(opt.pressed!==undefined) b.setAttribute('aria-pressed',String(!!opt.pressed)); if(opt.title) b.title=opt.title; if(opt.disabled) b.disabled=true; b.onclick=fn; return b; }
function sepEl(){ const s=document.createElement('span'); s.className='t3d-sep'; return s; }
function lblEl(t){ const s=document.createElement('span'); s.className='t3d-lbl'; s.textContent=t; return s; }
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}')||{}; }catch(e){ return {}; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
const el=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; };
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
return { el, esc, mkBtn, sepEl, lblEl, thumbCanvas, lsGet, lsSet };
}
if (typeof module === 'object' && module.exports) module.exports = UI;
else (root.Tablero3D = root.Tablero3D || {}).UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
