/* Traduce una luz de JA-VTT (preset + radios propios) a la definición que consume el motor 2.5D.
   Los radios, el color y la animación mandan tal cual vienen del tablero: el preset del diorama
   sólo elige el sprite y su altura. */

// preset de JA-VTT -> sprite del diorama (los 4 que el diorama no tiene se asimilan al más cercano)
export const SPRITE_OF = {
  candle: 'candle', torch: 'torch', lantern: 'lantern', campfire: 'campfire', brazier: 'brazier',
  magic: 'magic', crystal: 'crystal', moon: 'moon', daylight: 'daylight', darkness: 'darkness',
  bullseye: 'lantern',   // linterna sorda: la lleva alguien en la mano, como el farol
  window: 'daylight',    // luz que entra por una ventana: orbe alto y frío
  custom: 'magic',       // luz a medida del director: orbe neutro
  none: 'magic',         // no debería llegar (on=false), pero necesita entrada
};

export function defFor(L, base) {
  const key = SPRITE_OF[L && L.preset] ? L.preset : 'custom';
  const P = base[SPRITE_OF[key]];
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    bright: num(L && L.bright, P.bright), dim: num(L && L.dim, P.dim),
    color: (L && typeof L.color === 'string' && L.color) || P.color,
    intensity: num(L && L.intensity, P.intensity),
    anim: (L && L.anim) || 'none',
    darkness: !!(L && L.darkness) || !!P.darkness,
    sprite: P.sprite, lh: P.lh, scale: P.scale, tint: P.tint,
  };
}
