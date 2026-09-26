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

module.exports = { PNG_1x1, map, drawing, campaign, token };
