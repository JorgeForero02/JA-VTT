'use strict';
/* Módulos puros objetos3d.js (datos de los objetos por capas, PROP3D, y su paleta) y mapas.js (generadores de las
   plantillas: demoMap, dungeonMap, townMap, lightWorkshopMap), extraídos de tablero3d.js en la tarea 4 del refactor.
   Mapas exporta `make(deps)`: defaultSheet/normSheet leen el estado del motor (CUSTOM) y Fichas no es UMD, así que
   llegan como dependencias. La salida exacta la fija la foto (motor-fotos.test.js); aquí, sus propiedades. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Mapas = require('../../modules/tablero3d/public/mapas.js');
const Objetos3D = require('../../modules/tablero3d/public/objetos3d.js');
const { load } = require('./helpers/motor');

// letras de terreno que entiende el motor (claves de TERR en tablero3d.js)
const TERR = ['g', 'a', 'p', 's', 'o', 'w', '~', 'c', 'n', 'l'];

test('mapas: el módulo exporta make, que da los cuatro generadores', () => {
  assert.deepEqual(Object.keys(Mapas), ['make']);
  assert.deepEqual(Object.keys(load('mapas')).sort(), ['demoMap', 'dungeonMap', 'lightWorkshopMap', 'townMap']);
});

test('mapas: cada generador da w, d, una altura por casilla y sólo terrenos del motor', () => {
  const G = load('mapas');
  for (const [name, m] of [['demo', G.demoMap()], ['dungeon32', G.dungeonMap(32, 7)], ['dungeon64', G.dungeonMap(64, 4242)], ['town', G.townMap()], ['taller', G.lightWorkshopMap()]]) {
    assert.ok(Number.isInteger(m.w) && Number.isInteger(m.d) && m.w > 0 && m.d > 0, `${name}: ${m.w}×${m.d}`);
    assert.equal(m.h.length, m.w * m.d, `${name}: h`);
    assert.equal(m.t.length, m.w * m.d, `${name}: t`);
    const bad = [...new Set(m.t)].filter((c) => !TERR.includes(c));
    assert.deepEqual(bad, [], `${name}: terrenos desconocidos`);
  }
});

test('mapas: dungeonMap es determinista con la misma semilla', () => {
  const G = load('mapas');
  const a = G.dungeonMap(32, 7), b = G.dungeonMap(32, 7);
  const strip = (m) => { const o = JSON.parse(JSON.stringify({ ...m, h: Array.from(m.h) })); delete o.seed; return o; };
  assert.deepEqual(strip(a), strip(b));
  assert.notDeepEqual(strip(a), strip(G.dungeonMap(32, 8)), 'otra semilla, otra mazmorra');
});

test('objetos3d: exporta PROP3D y la paleta que usan sus capas', () => {
  assert.deepEqual(Object.keys(Objetos3D).sort(), ['B', 'CU', 'D', 'Drgb', 'G', 'Grgb', 'PROP3D', 'S', 'SA', 'SH', 'SL', 'Srgb', 'TH', 'W', 'WA'].sort());
  for (const [k, P] of Object.entries(Objetos3D.PROP3D)) {
    assert.equal(typeof P.name, 'string', k); assert.equal(typeof P.fn, 'function', k);
    assert.ok(Number.isInteger(P.N) && Number.isInteger(P.H), `${k}: ${P.N}×${P.H}`);
  }
  assert.deepEqual(Objetos3D.Grgb, Objetos3D.G.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]));
});

test('objetos3d: las banderas de PROP3D son las de la foto de fábrica (fixtures/fabrica-antes.json, como leía foto-fabrica.cjs)', () => {
  const ANTES = require('./fixtures/fabrica-antes.json');
  const P3 = Objetos3D.PROP3D;
  assert.deepEqual(Object.keys(P3), Object.keys(ANTES).filter((t) => !['tree', 'brazier', 'light'].includes(t)));
  for (const [t, P] of Object.entries(P3)) {
    const a = ANTES[t];
    assert.deepEqual({ span: P.span || [1, 1], orient: !!P.orient, walk: !!P.walk, deck: P.deck || 0, door: !!P.door, lift: P.lift || 0, gmOnly: !!P.gmOnly,
      rand: !!P.rand, emit: P.light ? { r: P.light, h: (P.lightS || 16) / 16 } : null, cat: P.cat || null, hidden: !!P.hidden },
    { span: a.span, orient: a.orient, walk: a.walk, deck: a.deck, door: a.door, lift: a.lift, gmOnly: a.gmOnly, rand: a.rand, emit: a.emit, cat: a.cat, hidden: a.hidden }, t);
  }
});
