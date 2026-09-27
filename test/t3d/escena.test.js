'use strict';
/* Módulo puro escena.js (Tablero3D.Escena), extraído de tablero3d.js en la tarea 5 del refactor: read (núcleo de
   deserialize, sin la semilla), write (núcleo de serialize, sin syncMinis), levelSide, readExtras, sceneExtras, normRoof,
   blankMap y campValid. Exporta `make({Catalogo, Muros, Ambiente, Ajustes})` (los tres últimos no son UMD: el helper los
   carga con vm); lo que es estado del motor llega en cada llamada (helpers/motor.js → deps). La ida y vuelta de las
   escenas de entrada se compara con la foto e2e (test/e2e/fixtures/motor-escenas.json, paso «escenas»). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Escena = require('../../modules/tablero3d/public/escena.js');
const { load, plain } = require('./helpers/motor');
const ENTRADA = require('./fixtures/motor-escenas-entrada.json');
const FOTO = require('../e2e/fixtures/motor-escenas.json');

const E = load('escena');
const PIECES = new Map(ENTRADA.pieces.map((p) => [p.id, p]));
const UID_OK = /^u[a-z0-9]{8}$/;
// orden de claves fuera: la ficha de una mini la vuelve a copiar el motor (syncMinis) con otro orden
const canon = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x)));
const scene = (i) => JSON.parse(JSON.stringify(ENTRADA.escenas[i]));

test('escena: make da la lectura, la escritura y sus normalizaciones', () => {
  assert.deepEqual(Object.keys(Escena), ['make']);
  assert.deepEqual(Object.keys(E.Escena).sort(), ['ROOF_MAT_IDS', 'ROOF_SHAPE_IDS', 'blankMap', 'campValid', 'levelSide', 'normRoof', 'read', 'readExtras', 'sceneExtras', 'write'].sort());
});

test('escena: ida y vuelta write(read(o)) de las tres escenas de entrada = la foto e2e «escenas»', () => {
  ENTRADA.escenas.forEach((sc, i) => {
    const deps = E.deps(PIECES);
    const m = E.Escena.read(scene(i), deps);
    assert.equal('seed' in m, false, 'read no pone semilla (la pone el motor)');
    const keep = new Set(sc.props.map((q) => q.uid).filter(Boolean));
    const o = plain(E.Escena.write(m, { ...deps, env: E.Ambiente.norm(m), fog: m.fog }));
    for (const q of o.props) if (!keep.has(q.uid) && UID_OK.test(q.uid || '')) q.uid = '(nuevo)';
    assert.deepEqual(Object.keys(o), Object.keys(FOTO.escenas[i].serialized), `${sc.name}: claves`);
    assert.deepEqual(canon(o), canon(FOTO.escenas[i].serialized), sc.name);
    // write asigna a la pieza leída el uid que Catalogo.complete le dio (como serialize)
    assert.ok(m.props.every((p) => typeof p.uid === 'string'), `${sc.name}: uid en el modelo`);
  });
});

test('escena: read rechaza tamaños, alturas y terrenos imposibles', () => {
  const deps = E.deps(PIECES), bad = (o) => assert.throws(() => E.Escena.read(o, deps), /bad/);
  bad(null); bad('x');
  bad({ ...scene(0), w: 3, d: 3, h: '2'.repeat(9), t: 'g'.repeat(9) });
  bad({ ...scene(0), h: scene(0).h.slice(1) });
  bad({ ...scene(0), h: 'z' + scene(0).h.slice(1) });
  bad({ ...scene(0), t: 'Q' + scene(0).t.slice(1) });
  assert.equal(E.Escena.read(scene(0), deps).w, 16);
});

test('escena: una p: sin definición en el tablero se conserva opaca; blockCells fuera de rango se descartan', () => {
  const sc = scene(1), p = sc.props.find((q) => typeof q.def === 'string' && q.def.startsWith('p:'));
  assert.ok(p, 'la escena v2 trae piezas p:');
  const m = E.Escena.read({ ...sc, blockCells: [-1, 3, 3.5, 256, 255, 'x'] }, E.deps(new Map()));
  const q = m.props.find((r) => r.def === p.def && r.x === p.x && r.z === p.z);
  assert.ok(q, 'la p: desconocida no se descarta');
  assert.deepEqual(plain(q), { ...plain(p), ...plain(q) }, 'se conserva tal cual');
  assert.deepEqual([...m.blockCells], [3, 255]);
  assert.equal('blockCells' in E.Escena.read(sc, E.deps(PIECES)), false, 'sin casillas bloqueadas, sin blockCells');
  // y se guarda tal cual
  const o = E.Escena.write(m, { ...E.deps(new Map()), env: {}, fog: false });
  assert.deepEqual(plain(o.props.find((r) => r.def === p.def && r.x === p.x && r.z === p.z)), plain(q));
});

test('escena: levelSide, normRoof, readExtras, sceneExtras y blankMap', () => {
  const S = E.Escena;
  assert.deepEqual(S.levelSide({ level: 0, side: 'N' }), { level: 0, side: 'N' });
  assert.deepEqual(S.levelSide({ level: 15, side: 'W' }), { level: 15, side: 'W' });
  assert.deepEqual(S.levelSide({ level: 16, side: 'X' }), {});
  assert.deepEqual(S.levelSide({ level: -1 }), {});
  assert.deepEqual(S.levelSide({ level: 1.5 }), {});
  assert.deepEqual(S.normRoof({ x: 1, z: 1, w: 3, d: 2 }, 8, 8), { x: 1, z: 1, w: 3, d: 2, mat: 'tile', shape: 'gable' });
  assert.deepEqual(S.normRoof({ x: 0, z: 0, w: 2, d: 2, mat: 'copper', shape: 'shed', rot: 3 }, 8, 8), { x: 0, z: 0, w: 2, d: 2, mat: 'copper', shape: 'shed', rot: 3 });
  assert.equal(S.normRoof({ x: 7, z: 0, w: 2, d: 2 }, 8, 8), null);
  assert.equal(S.normRoof({ x: 0, z: 0, w: 1, d: 2 }, 8, 8), null);
  const ex = plain(S.readExtras({ grid: false, plans: [null, 'x'], notes: 'x' }, 8, 8));
  assert.deepEqual(ex.plans, []); assert.deepEqual(ex.notes, []);
  assert.deepEqual(plain(S.sceneExtras({ plans: [], notes: [] })), plain(S.sceneExtras({})));
  const b = S.blankMap(8, 'q', 'night', 42);
  assert.deepEqual(Object.keys(b), ['name', 'w', 'd', 'h', 't', 'props', 'minis', ...Object.keys(E.Ambiente.norm({ env: 'night' })), 'seed', 'start']);
  assert.equal(b.seed, 42); assert.equal(b.t[0], 'g', 'terreno desconocido → pasto'); assert.deepEqual(b.start, [4, 4]); assert.equal(b.h.length, 64);
  assert.equal(S.blankMap(8, 'n').t[5], 'n');
});

test('escena: campValid se queda con los tableros que se leen y limpia las notas', () => {
  const deps = E.deps(PIECES), S = E.Escena;
  assert.equal(S.campValid(null, deps), null);
  assert.equal(S.campValid({ id: 'X!', boards: {} }, deps), null);
  const c = S.campValid({ id: 'c1', name: 'Mi campaña', cur: 'zz', updated: 5.7,
    boards: { b1: { name: 'Uno', data: scene(0) }, b2: { data: { w: 3 } }, 'b 3': { data: scene(1) } },
    notes: { b1: [{ x: 1, z: 2, text: 'hola', extra: 1 }, { x: 'a', z: 1, text: 'no' }] } }, deps);
  assert.deepEqual(Object.keys(c.boards), ['b1']);
  assert.equal(c.cur, 'b1'); assert.equal(c.updated, 5); assert.equal(c.name, 'Mi campaña');
  assert.deepEqual(c.notes, { b1: [{ x: 1, z: 2, text: 'hola' }] });
  assert.equal(S.campValid({ id: 'c1', boards: { b2: { data: { w: 3 } } } }, deps), null, 'sin tableros legibles, nada');
});
