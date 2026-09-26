'use strict';
/* Datos de ejemplo con la forma que produce el cliente (serialize, docToRecord, tokData). */
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function map(n = 8, extra = {}) {
  const c = n >> 1;
  return Object.assign({
    v: 1, name: `Claro ${n}×${n}`, w: n, d: n, h: '2'.repeat(n * n), t: 'g'.repeat(n * n), wsrc: '0'.repeat(n * n),
    props: [{ type: 'tree', x: 1, z: 1, v: 0, open: false }], roofs: [], start: [c, c],
    minis: [{ kind: 'knight', x: c, z: c, fx: 0, fz: 1, id: 'k1', sheet: { name: 'Caballero', hp: 12, hpMax: 12 } }],
    env: 'day', ambient: 1, darkColor: '#0E1316', fog: false, seen: '',
  }, extra);
}

// escena con el formato de antes de la fase 0 (v:1): puertas con llave, portal con destino, escalera de campaña de antes,
// dibujo propio, luz suelta, barrera (sólo director), puente de dos casillas y un tipo inexistente (se descarta)
function escenaVieja() {
  return map(8, { v: 1, props: [
    { type: 'door', x: 1, z: 2, v: 1, open: false, locked: true },
    { type: 'gate', x: 2, z: 2, v: 0, open: true },
    { type: 'portal', x: 3, z: 3, v: 0, id: 7, look: 'cave', target: { scene: 'bOtra', portal: 2 }, name: 'Cueva' },
    { type: 'stairs', x: 4, z: 4, to: 'cabajo', tx: 1, tz: 1 },
    { type: 'obj:o_abcd1234', x: 5, z: 5, v: 2 },
    { type: 'light', x: 6, z: 6, preset: 'torch', r: 8, h: 1.25, color: '#ffa652', intensity: 1, anim: 'flicker', on: true },
    { type: 'barrier', x: 0, z: 7, v: 0 },
    { type: 'bridge2', x: 2, z: 6, v: 1 },
    { type: 'nave_espacial', x: 1, z: 1 },
  ] });
}

function drawing(key = 'c_heroe1', layers = 1) {
  return {
    key, kind: 'char', target: key, name: 'Héroe', res: 32, w: 32, h: 32, light: false, count: 3, cols: 3,
    frameNames: ['Frente', 'Espalda', 'Perfil'], updated: Date.now(),
    layers: Array.from({ length: layers }, (_, i) => ({ name: `Capa ${i + 1}`, vis: i === 0, sheet: PNG_1x1 })),
  };
}

function campaign(id = 'cbrezo') {
  return { id, name: 'Campaña de Brezo', boards: { tpueblo: { name: 'Pueblo', data: map(8) }, tcueva: { name: 'Cueva', data: map(16) } }, notes: { tpueblo: [{ x: 1, z: 2, text: 'Trampa' }] }, cur: 'tpueblo' };
}

function token(owner, extra = {}) {
  return Object.assign({ kind: 'knight', x: 3, z: 4, fx: 0, fz: 1, sheet: { name: 'Caballero', hp: 10, hpMax: 12, ac: 16, speed: 30, init: 2, team: 'pc', vision: 12 }, owner: owner == null ? null : String(owner) }, extra);
}

module.exports = { PNG_1x1, map, drawing, campaign, token, escenaVieja };
