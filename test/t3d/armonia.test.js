'use strict';
/* T6d: que una ficha, una escena y un ajuste signifiquen lo mismo en 2D y en 3D. Reglas del módulo sin servidor: ajustes del
   tablero y de escena de JA-VTT, privacidad por rol, iniciativa, planos, anotaciones y dados (contra los fijos de JA-VTT). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../modules/tablero3d/rules');
const dice = require('../../modules/tablero3d/dice');
const F = require('./helpers/fixtures');

const fixture = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ja-vtt', f), 'utf8'));
const JA = fixture('board-settings.json');
const JD = fixture('dice.json');
const GM = { role: 'gm', user_id: 1 };
const P2 = { role: 'player', user_id: 2 };
const P3 = { role: 'player', user_id: 3 };

test('ajustes: las claves, los valores por defecto y HP_VISIBILITY son los de JA-VTT', () => {
  assert.deepEqual(R.BOARD_KEYS, JA.BOARD_KEYS);
  assert.deepEqual(R.HP_VISIBILITY, JA.HP_VISIBILITY);
  assert.deepEqual(Object.assign({}, R.cleanSettings(null), { initiative: R.cleanInitiative(null) }), JA.DEFAULT_BOARD, 'DEFAULT_BOARD (la iniciativa, en live/combat)');
  assert.deepEqual(Object.keys(R.DEFAULT_SETTINGS).sort(), JA.BOARD_KEYS.filter((k) => k !== 'initiative').sort());
  for (const [k, v] of Object.entries(R.SCENE_FLAGS)) assert.equal(v, JA.DEFAULT_SCENE[k], k);
  assert.deepEqual(Object.keys(R.SCENE_FLAGS), ['grid', 'snap', 'animate', 'plansReleased']);
  // cleanInitiative da lo mismo que el de JA-VTT
  for (const s of JA.initiativeSamples) assert.deepEqual(R.cleanInitiative(s.input), s.output, JSON.stringify(s.input));
});

test('ajustes integrados (T8): las claves que manda el anfitrión son su BOARD_KEYS salvo initiative; el resto, propias del 3D', () => {
  assert.deepEqual(R.HOST_SETTINGS, JA.BOARD_KEYS.filter((k) => k !== 'initiative'));
  assert.deepEqual(R.HOST_SETTINGS.slice().sort(), Object.keys(R.DEFAULT_SETTINGS).sort(), 'hoy todos los ajustes del 3D son de JA-VTT');
  const init = { entries: [], turn: 0, round: 1 };
  assert.deepEqual(R.settingsParts({ diceEnabled: false, hpVisibility: 'gm', initiative: init, soloDel3d: 1 }), { host: { diceEnabled: false, hpVisibility: 'gm' }, own: { soloDel3d: 1 } });
  for (const v of [null, undefined, 'x', [1]]) assert.deepEqual(R.settingsParts(v), { host: {}, own: {} });
});

test('límites de cuerpo (T8): sacados del documento más grande de cada ruta', () => {
  const K = 64 * 1024;
  assert.deepEqual(R.BODY_LIMITS, {
    small: K,
    scenes: R.SCENE_MAX_BYTES + K,
    travel: R.SCENE_MAX_BYTES + K,
    campaigns: R.CAMPAIGN_MAX_BYTES + K,
    drawings: R.MAX_LAYERS * (Math.ceil(R.LAYER_MAX_BYTES / 3) * 4 + 22) + K,
  });
  // el dibujo más grande que acepta cleanDrawing cabe en su límite
  const layer = { sheet: 'data:image/png;base64,' + Buffer.alloc(R.LAYER_MAX_BYTES, 7).toString('base64') };
  const d = Object.assign(F.drawing('c_max', 1), { layers: Array.from({ length: R.MAX_LAYERS }, () => layer), frameNames: Array.from({ length: 512 }, () => 'x'.repeat(20)), count: 512, cols: 16 });
  assert.ok(R.cleanDrawing(d), 'se acepta');
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= R.BODY_LIMITS.drawings, 'y cabe');
  assert.equal(R.docBytes({ a: 'ñ' }), Buffer.byteLength('{"a":"ñ"}'), 'la medida de la cuota: bytes UTF-8 del JSON');
});

test('escena: grid, snap, animate y plansReleased de JA-VTT; una escena de antes los toma por defecto', () => {
  const old = R.cleanMap(F.map(8));
  assert.deepEqual([old.grid, old.snap, old.animate, old.plansReleased, old.fog], [true, true, true, false, false]);
  assert.equal(old.plans, undefined, 'sin planos ni anotaciones no se añade nada');
  assert.equal(old.notes, undefined);
  const m = R.cleanMap(F.map(8, { grid: false, snap: 'no', animate: false, plansReleased: true }));
  assert.deepEqual([m.grid, m.snap, m.animate, m.plansReleased], [false, true, false, true]);
  assert.deepEqual(R.cleanSceneFlags({}), R.SCENE_FLAGS);
});

test('planos: forma de JA-VTT (line, circle, rect, cone; a, b; owner y color) en casillas, recortados al mapa', () => {
  assert.deepEqual(R.cleanPlan({ id: 4, shape: 'rect', a: { x: 1.234, z: -3 }, b: { x: 99, z: 2 } }, 8, 8), { id: 4, shape: 'rect', a: { x: 1.23, z: 0 }, b: { x: 8, z: 2 } });
  assert.deepEqual(R.cleanPlan({ id: 5, shape: 'hex', a: { x: 1, z: 1 }, b: { x: 2, z: 2 }, area: true, owner: '7', color: '#AABBCC' }, 8, 8),
    { id: 5, shape: 'line', a: { x: 1, z: 1 }, b: { x: 2, z: 2 }, area: true, owner: '7', color: '#aabbcc' });
  assert.equal(R.cleanPlan({ id: 6, shape: 'cone', a: { x: 1, z: 1 }, b: { x: 2, z: 2 }, area: true }, 8, 8).area, undefined, 'area sólo en la línea');
  assert.equal(R.cleanPlan({ id: 0, a: { x: 1, z: 1 }, b: { x: 2, z: 2 } }, 8, 8), null);
  assert.equal(R.cleanPlan({ id: 1, a: { x: 1, z: 1 } }, 8, 8), null);
  const m = R.cleanMap(F.map(8, { plans: [{ id: 1, shape: 'circle', a: { x: 4, z: 4 }, b: { x: 6, z: 4 } }, { id: 1, shape: 'cone', a: { x: 0, z: 0 }, b: { x: 1, z: 1 } }, { id: 2 }] }));
  assert.deepEqual(m.plans.map((p) => [p.id, p.shape]), [[1, 'circle']], 'ids únicos; los que no valen, fuera');
});

test('anotaciones: texto de hasta 200 en una casilla del mapa, gmOnly', () => {
  assert.deepEqual(R.cleanNote({ id: 3, x: 2, z: 5, text: '  Trampa  ', gmOnly: 1 }, 8, 8), { id: 3, x: 2, z: 5, text: 'Trampa', gmOnly: true });
  assert.equal(R.cleanNote({ id: 3, x: 2, z: 5, text: 'x'.repeat(300) }, 8, 8).text.length, 200);
  for (const bad of [{ id: 3, x: 8, z: 0, text: 'a' }, { id: 3, x: 1, z: 1, text: '   ' }, { x: 1, z: 1, text: 'a' }]) assert.equal(R.cleanNote(bad, 8, 8), null);
  assert.equal(R.cleanMap(F.map(8, { notes: [{ id: 1, x: 1, z: 1, text: 'Cofre' }, { id: 2, x: 2, z: 2, text: 'Emboscada', gmOnly: true }] })).notes.length, 2);
});

/* fichas de la mesa: la de P2 (caballero), un orco visible, un goblin oculto y el lobo oculto de P3 */
const tokens = () => R.cleanTokens({
  k1: F.token(2, { sheet: { name: 'Aria', kind: 'player', hp: { cur: 7, max: 12, temp: 3 }, ac: 16, speed: 30 } }),
  o1: F.token(null, { kind: 'goblin', sheet: { name: 'Orco', kind: 'enemy', hp: { cur: 9, max: 20, temp: 0 }, ac: 13 } }),
  g1: F.token(null, { kind: 'goblin', sheet: { name: 'Goblin', kind: 'enemy', hidden: true, hp: { cur: 7, max: 7, temp: 0 }, ac: 15 } }),
  w1: F.token(3, { kind: 'wolf', sheet: { name: 'Lobo', kind: 'player', hidden: true, hp: { cur: 0, max: 11, temp: 0 }, ac: 13 } }),
});

test('privacidad: el director lo ve todo; el jugador no ve fichas ocultas ajenas ni la CA de otros, y su ficha entera', () => {
  const doc = { tokens: tokens() }, S = R.cleanSettings(null);
  assert.equal(R.tokensFor(doc, GM, S), doc);
  const p2 = R.tokensFor(doc, P2, S).tokens;
  assert.deepEqual(Object.keys(p2).sort(), ['k1', 'o1'], 'sin el goblin oculto ni el lobo oculto de otro');
  assert.deepEqual(p2.k1, doc.tokens.k1, 'la suya, tal cual');
  assert.equal(p2.o1.sheet.ac, undefined, 'la CA de un enemigo es del director');
  assert.deepEqual(p2.o1.sheet.hp, { cur: 9, max: 20, temp: 0 }, "hpVisibility 'all': la vida sí");
  assert.deepEqual(p2.o1.sheet.withheld, ['ac']);
  const p3 = R.tokensFor(doc, P3, S).tokens;
  assert.deepEqual(Object.keys(p3).sort(), ['k1', 'o1', 'w1'], 'su lobo oculto sí lo ve');
  assert.equal(p3.k1.sheet.ac, undefined, 'la CA de otro jugador tampoco');
  assert.equal(doc.tokens.o1.sheet.ac, 13, 'no toca el documento de la mesa');
});

test("privacidad: hpVisibility 'gm' quita la vida ajena; 'bar_only' deja sólo la barra (fracciones de 0,05)", () => {
  const doc = { tokens: tokens() };
  const gmOnly = R.tokensFor(doc, P2, R.cleanSettings({ hpVisibility: 'gm' })).tokens;
  assert.equal(gmOnly.o1.sheet.hp, undefined);
  assert.equal(gmOnly.o1.sheet.hpBar, undefined);
  assert.deepEqual(gmOnly.o1.sheet.withheld, ['ac', 'hp']);
  assert.deepEqual(gmOnly.k1.sheet.hp, { cur: 7, max: 12, temp: 3 }, 'la suya, siempre');
  const bar = R.tokensFor(doc, P3, R.cleanSettings({ hpVisibility: 'bar_only' })).tokens;
  assert.equal(bar.o1.sheet.hp, undefined, 'sin números');
  assert.deepEqual(bar.o1.sheet.hpBar, { cur: 0.45, temp: 0 });
  assert.deepEqual(bar.k1.sheet.hpBar, { cur: 0.6, temp: 0.25 });
  const edge = (cur, max) => R.sheetFor({ hp: { cur, max, temp: 0 } }, { hpVisibility: 'bar_only' }).hpBar.cur;
  assert.deepEqual([edge(0, 10), edge(1, 100), edge(99, 100), edge(100, 100)], [0, 0.05, 0.95, 1], 'nunca 0 si vive ni 1 si le falta algo');
});

test('privacidad: una escena para el jugador — sin anotaciones gmOnly, planos del director sólo publicados, personajes filtrados', () => {
  const m = R.cleanMap(F.map(8, {
    minis: [{ kind: 'goblin', x: 1, z: 1, id: 'g1', sheet: { hidden: true } }, { kind: 'knight', x: 2, z: 2, id: 'k1', owner: '2', sheet: { ac: 17 } }, { kind: 'goblin', x: 3, z: 3, id: 'o1', sheet: { ac: 12 } }],
    notes: [{ id: 1, x: 1, z: 1, text: 'Cofre' }, { id: 2, x: 2, z: 2, text: 'Emboscada', gmOnly: true }],
    plans: [{ id: 1, shape: 'circle', a: { x: 4, z: 4 }, b: { x: 6, z: 4 } }],
  }));
  assert.equal(R.sceneFor(m, GM, R.DEFAULT_SETTINGS), m);
  const p = R.sceneFor(m, P2, R.DEFAULT_SETTINGS);
  assert.deepEqual(p.minis.map((x) => [x.id, x.sheet.ac]), [['k1', 17], ['o1', undefined]]);
  assert.deepEqual(p.notes.map((n) => n.text), ['Cofre']);
  assert.deepEqual(p.plans, [], 'sin publicar, el jugador no ve los planos del director');
  assert.equal(R.sceneFor(Object.assign({}, m, { plansReleased: true }), P2, R.DEFAULT_SETTINGS).plans.length, 1);
  const camp = R.campaignFor({ id: 'c', boards: { a: { name: 'A', data: m } }, notes: { a: [{ x: 1, z: 1, text: 'secreto' }] } }, P2, null);
  assert.deepEqual([camp.notes, camp.boards.a.data.notes.length], [{}, 1], 'las notas de campaña son del director');
  assert.deepEqual(R.liveDocFor('board', { open: true, board: m }, P2, null).board.notes.length, 1);
});

const combat = () => R.cleanLiveDoc('combat', { initiative: { entries: [
  { id: 1, name: 'Goblin', value: 18, tokenId: 'g1' }, { id: 2, name: 'Aria', value: 15, tokenId: 'k1' }, { id: 3, name: 'Lobo', value: 12, tokenId: 'w1' }, { id: 4, name: 'Orco', value: 9, tokenId: 'o1' },
], turn: 1, round: 2 }, left: 6 });

test('iniciativa: forma de JA-VTT; el jugador la ve sólo con initiativeShown, sin las fichas ocultas, y su turno siempre', () => {
  const tk = tokens(), doc = combat();
  const gm = R.combatFor(doc, GM, tk, R.DEFAULT_SETTINGS);
  assert.deepEqual([gm.initiative, gm.active, gm.current], [doc.initiative, true, 'k1']);
  const hidden = R.combatFor(doc, P2, tk, R.DEFAULT_SETTINGS);
  assert.deepEqual(hidden, { initiative: null, active: true, round: 2, current: 'k1', left: 6, dashed: false }, 'initiativeShown apagado (por defecto): sin orden, pero sabe que es su turno');
  assert.equal(R.combatFor(doc, P3, tk, R.DEFAULT_SETTINGS).current, null, 'el turno de otro, no');
  const shown = R.combatFor(doc, P3, tk, R.cleanSettings({ initiativeShown: true }));
  assert.deepEqual(shown.initiative.entries.map((e) => e.name), ['Aria', 'Lobo', 'Orco'], 'sin el goblin oculto; su lobo oculto sí');
  assert.deepEqual([shown.initiative.turn, shown.current], [0, 'k1']);
  const gobTurn = Object.assign({}, doc, { initiative: Object.assign({}, doc.initiative, { turn: 0 }) });
  assert.deepEqual(R.combatFor(gobTurn, P2, tk, R.cleanSettings({ initiativeShown: true })).current, null, 'el turno de una ficha oculta no se revela');
  assert.deepEqual(R.combatFor({ initiative: R.cleanInitiative(null), left: 0, dashed: false }, P2, tk, R.DEFAULT_SETTINGS).active, false);
});

test('iniciativa: el jugador sólo pasa su turno (el servidor salta a los caídos) o gasta su movimiento', () => {
  const tk = tokens(), doc = combat();
  const next = R.liveChange(P2, 'combat', 'update', { next: true }, doc, { tokens: tk });
  assert.deepEqual([next.doc.initiative.turn, next.doc.initiative.round, next.doc.left], [3, 2, 6], 'el lobo (0 PV) no juega: pasa al orco');
  const wrap = R.playerCombat('2', Object.assign({}, doc, { initiative: Object.assign({}, doc.initiative, { turn: 1, entries: doc.initiative.entries.slice(0, 3) }) }), { next: true }, tk);
  assert.deepEqual([wrap.doc.initiative.turn, wrap.doc.initiative.round], [0, 3], 'tras el último vuelve al primero y sube la ronda');
  assert.deepEqual(R.liveChange(P2, 'combat', 'update', { left: 2, dashed: true, initiative: null }, doc, { tokens: tk }).doc, Object.assign({}, doc, { left: 2, dashed: true }), 'sólo left y dashed');
  assert.match(R.liveChange(P3, 'combat', 'update', { next: true }, doc, { tokens: tk }).error, /tus personajes/);
  assert.match(R.liveChange(P2, 'combat', 'set', doc, doc, { tokens: tk }).error, /director/, 'el orden sólo lo pone el director');
  assert.equal(R.liveChange(GM, 'combat', 'set', doc, doc, { tokens: tk }).doc.initiative.turn, 1);
});

test('planos en la mesa: cada jugador pone, cambia y quita sólo los suyos (hasta 40)', () => {
  const plan = (owner, x = 1) => ({ shape: 'circle', a: { x, z: 1 }, b: { x: x + 2, z: 1 }, owner });
  const cur = R.cleanLiveDoc('plans', { plans: { 1: plan('2'), 2: plan('3') } });
  assert.ok(R.liveChange(P2, 'plans', 'update', { plans: { 5: plan('2', 3) } }, cur, {}).doc.plans[5]);
  assert.equal(R.liveChange(P2, 'plans', 'update', { plans: { 1: null } }, cur, {}).doc.plans[1], undefined, 'null lo quita');
  assert.match(R.liveChange(P2, 'plans', 'update', { plans: { 2: null } }, cur, {}).error, /tus propios planos/);
  assert.match(R.liveChange(P2, 'plans', 'update', { plans: { 6: plan('3') } }, cur, {}).error, /tus propios planos/);
  assert.match(R.liveChange(P2, 'plans', 'set', { plans: {} }, cur, {}).error, /director/);
  const many = {}; for (let i = 10; i < 51; i++) many[i] = plan('2');
  assert.match(R.liveChange(P2, 'plans', 'update', { plans: many }, cur, {}).error, /40 planos/);
  assert.deepEqual(R.liveChange(GM, 'plans', 'set', { plans: {} }, cur, {}).doc, { plans: {} }, 'el director los borra todos');
  assert.ok(R.liveChange(P2, 'plans', 'update', { plans: { 5: plan('2') } }, null, {}).doc.plans[5], 'en una mesa abierta antes de que hubiera planos');
  assert.match(R.liveChange(P2, 'combat', 'update', { next: true }, null, {}).error, /no existe/);
});

test('dados: la notación, los errores y el cuerpo de la tirada son los de JA-VTT (server/dice.js)', () => {
  assert.deepEqual(dice.SIDES, JD.SIDES);
  assert.deepEqual([dice.MAX_DICE, dice.MAX_TERMS], [JD.MAX_DICE, JD.MAX_TERMS]);
  for (const [f, want] of Object.entries(JD.parse)) {
    let got; try { got = dice.parse(f); } catch (e) { got = { error: e.message }; }
    assert.deepEqual(got, want, JSON.stringify(f));
  }
  for (const b of JD.bodies) {
    const mine = dice.roll(b.formula);
    assert.deepEqual(Object.keys(mine), ['formula', 'dice', 'mod', 'total']);
    assert.deepEqual([mine.formula, mine.mod, mine.dice.map((x) => [x.n, x.sides, x.sign, x.rolls.length])], [b.formula, b.mod, b.dice.map((x) => [x.n, x.sides, x.sign, x.rolls.length])]);
    assert.equal(b.total, b.dice.reduce((s, x) => s + x.sign * x.rolls.reduce((a, v) => a + v, 0), b.mod), 'así suma JA-VTT');
  }
  const seq = [3, 5, 6, 1, 17, 4];
  const r = dice.roll('2d6-1d4+2', { rng: () => seq.shift() });
  assert.deepEqual(r, { formula: '2d6-1d4+2', dice: [{ n: 2, sides: 6, sign: 1, rolls: [3, 5] }, { n: 1, sides: 4, sign: -1, rolls: [6] }], mod: 2, total: 4 });
  const adv = dice.roll('d20+1', { adv: 1, rng: () => seq.shift() }), dis = dice.roll('1d20', { adv: -1, rng: (() => { const q = [12, 4]; return () => q.shift(); })() });
  assert.deepEqual([adv.formula, adv.total, adv.adv, dis.total], ['2d20+1', 18, 1, 4], 'ventaja: el mayor; desventaja: el menor');
  assert.equal(dice.roll('2d6', { adv: 1, rng: () => 2 }).adv, undefined, 'sólo con 1d20');
});
