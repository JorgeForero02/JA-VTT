/* Utilidades puras del tablero 3D (Tablero3D.Base en el navegador; require() en node): azar con semilla (mulberry32,
   hash, pick) y color (hexRGB). Extraídas literalmente de tablero3d.js (refactor, tarea 3); el motor las toma con un alias. */
(function (root) {
  'use strict';
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash(x,z,s){ let h=(x*73856093)^(z*19349663)^(s*83492791); h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }
const pick=(arr,x,z,s)=>arr[Math.floor(hash(x,z,s)*arr.length)];
const hexRGB=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const Base = { mulberry32, hash, pick, hexRGB };
  if (typeof module === 'object' && module.exports) module.exports = Base;
  else (root.Tablero3D = root.Tablero3D || {}).Base = Base;
})(typeof window !== 'undefined' ? window : globalThis);
