/* Hoja de luces del tablero 3D (Tablero3D.Luces en el navegador; require() en node): tipos de fuente de luz, animaciones,
   luces de ficha y la normalización de una luz guardada. Extraída literalmente de tablero3d.js (refactor, tarea 3).
   Sólo datos y funciones puras; lo que lee el estado del motor (L, WALLAT, PIECES…) sigue en tablero3d.js. */
(function (root) {
  'use strict';
  const Base = typeof module === 'object' && module.exports ? require('./base') : root.Tablero3D.Base;
  const { hexRGB } = Base;
const WARM='#ff9c50';
/* Tipos de fuente de luz: mismos ids, nombres e iconos que LIGHT_PRESETS de Just Another VTT (public/js/core.js).
   El radio sale de sus pies (brillante + tenue, 5 pies por casilla); altura, intensidad y halo son del motor 3D.
   angle < 360: cono hacia rot (grados, 0 = este, 90 = sur). darkness: resta la luz y no deja ver dentro. */
const LIGHT_TYPES={
  candle:{name:'Vela',icon:'candle',r:2,h:0.75,color:'#ffc878',intensity:0.9,anim:'flicker'},
  torch:{name:'Antorcha',icon:'torch',r:8,h:1.25,color:'#ffa652',intensity:1,anim:'flicker'},
  lantern:{name:'Farol',icon:'lantern',r:12,h:1.5,color:'#ffd28f',intensity:0.9,anim:'soft'},
  bullseye:{name:'Linterna sorda',icon:'flashlight',r:24,h:1.25,color:'#ffe6b8',intensity:1,anim:'none',angle:60},
  campfire:{name:'Hoguera',icon:'flame-kindling',r:8,h:0.5,color:'#ff8f3f',intensity:1,anim:'flicker'},
  brazier:{name:'Brasero',icon:'brazier',r:5,h:0.75,color:'#ff7a35',intensity:0.95,anim:'flicker'},
  magic:{name:'Luz mágica',icon:'wand-sparkles',r:8,h:1.5,color:'#dde8ff',intensity:0.9,anim:'none'},
  crystal:{name:'Cristal arcano',icon:'gem',r:6,h:1,color:'#a98bff',intensity:0.9,anim:'pulse'},
  moon:{name:'Rayo de luna',icon:'moon-star',r:4,h:2,color:'#9dbbff',intensity:0.65,anim:'none',glow:false},
  daylight:{name:'Luz diurna',icon:'sun',r:24,h:2,color:'#fff1d0',intensity:0.8,anim:'none',glow:false},
  window:{name:'Luz de ventana',icon:'sunrise',r:6,h:1.5,color:'#ffe9c2',intensity:0.85,anim:'none',angle:120,glow:false},
  darkness:{name:'Oscuridad mágica',icon:'circle-off',r:3,h:1,color:'#000000',intensity:1,anim:'none',darkness:true,glow:false}
};
const LIGHT_IDS=Object.keys(LIGHT_TYPES);
const OBJ_LIGHT_IDS=LIGHT_IDS.filter(id=>!LIGHT_TYPES[id].darkness&&!LIGHT_TYPES[id].angle);   // los que puede tener un objeto dibujado
const LIGHT_ANIMS=[['none','Fija'],['flicker','Parpadeo'],['soft','Vaivén suave'],['pulse','Pulso']];
const TOKEN_LIGHTS=['none','candle','torch','lantern','bullseye','magic','crystal'];
const HEX6=/^#[0-9a-f]{6}$/i;
// luz suelta del mapa tal como se guarda; las escenas de antes (r, h, c, f) se leen igual: c → color, f → anim
function normLight(p){ const n=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
  const o={preset:LIGHT_TYPES[p.preset]?p.preset:'custom',r:Math.round(n(p.r,1,24,5)),h:Math.round(n(p.h,0,4,1.2)*4)/4,
    color:HEX6.test(p.color||'')?p.color.toLowerCase():HEX6.test(p.c||'')?p.c.toLowerCase():WARM,intensity:Math.round(n(p.intensity,0,1.2,1)*100)/100,
    anim:LIGHT_ANIMS.some(a=>a[0]===p.anim)?p.anim:(p.f===0?'none':'flicker'),angle:Math.round(n(p.angle,1,360,360)),rot:Math.round(n(p.rot,-3600,3600,0)),
    darkness:!!p.darkness,on:p.on!==false};
  if(typeof p.name==='string'&&p.name.trim()) o.name=p.name.trim().slice(0,40);
  return o; }
// campos de un tipo para una luz nueva o al cambiarle el tipo (conserva dirección, encendido y nombre)
function lightOfType(id,keep){ const T=LIGHT_TYPES[id]; if(!T) return null;
  return {preset:id,r:T.r,h:T.h,color:T.color,intensity:T.intensity,anim:T.anim,angle:T.angle||360,rot:keep&&Number.isFinite(keep.rot)?keep.rot:0,darkness:!!T.darkness,on:keep?keep.on!==false:true}; }
const lightName=p=>p.name||(LIGHT_TYPES[p.preset]?LIGHT_TYPES[p.preset].name:'Luz');
function lightRGB(hex){ const c=hexRGB(/^#[0-9a-f]{6}$/i.test(hex||'')?hex:WARM); return [c[0]/255,c[1]/255,c[2]/255]; }
  const Luces = { WARM, HEX6, LIGHT_TYPES, LIGHT_IDS, OBJ_LIGHT_IDS, LIGHT_ANIMS, TOKEN_LIGHTS, normLight, lightOfType, lightName, lightRGB };
  if (typeof module === 'object' && module.exports) module.exports = Luces;
  else (root.Tablero3D = root.Tablero3D || {}).Luces = Luces;
})(typeof window !== 'undefined' ? window : globalThis);
