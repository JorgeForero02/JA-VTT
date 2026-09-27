'use strict';
/* T6d en el cliente, sin navegador: ajustes.js y dados.js leen igual que el servidor (rules.js, dice.js) y que JA-VTT (fijos
   board-settings.json y dice.json), la pestaña Mesa tiene los ajustes con los textos de JA-VTT y el motor los usa. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../../modules/tablero3d/rules');
const dice = require('../../modules/tablero3d/dice');
const F = require('./helpers/fixtures');
const { readEngine } = require('./helpers/engine');

const MOD = path.join(__dirname, '..', '..', 'modules', 'tablero3d', 'public');
const readMod = (f) => fs.readFileSync(path.join(MOD, f), 'utf8');
const load = (f, name) => { const ctx = { crypto: globalThis.crypto }; ctx.window = ctx; vm.runInNewContext(readMod(f), ctx); return ctx.Tablero3D[name]; };
const Ajustes = load('ajustes.js', 'Ajustes');
const Dados = load('dados.js', 'Dados');
const Fichas = load('fichas.js', 'Fichas');
const plain = (o) => JSON.parse(JSON.stringify(o));
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ja-vtt', f), 'utf8'));
const JA = fixture('board-settings.json');
const JD = fixture('dice.json');
const frag = readMod('t3d.html');
const engine = readEngine();

test('ajustes: el cliente tiene las claves y valores por defecto de JA-VTT y lee igual que el servidor', () => {
  assert.deepEqual(plain(Ajustes.DEFAULTS), R.DEFAULT_SETTINGS);
  assert.deepEqual(plain(Ajustes.HP_VISIBILITY), JA.HP_VISIBILITY);
  const cases = [[null], [{ playersDoors: false, otro: 1 }], [{ hpVisibility: 'bar_only', acEnabled: 'no' }, { acEnabled: false }], [{ hpVisibility: 'x' }, { hpVisibility: 'gm', sharedVision: false }], [{ initiativeShown: true, diceEnabled: false }, null]];
  for (const [s, base] of cases) assert.deepEqual(plain(Ajustes.norm(s, base)), R.cleanSettings(s, base), JSON.stringify([s, base]));
  for (const o of [{}, { grid: false, snap: 1, animate: false, plansReleased: true }, { animate: 'no' }]) assert.deepEqual(plain(Ajustes.sceneFlags(o)), R.cleanSceneFlags(o));
  assert.deepEqual(plain(Ajustes.SCENE_FLAGS), R.SCENE_FLAGS);
});

test('ajustes: la pestaña Mesa tiene los de JA-VTT con sus textos (Reglas para jugadores; Chat, dados y fichas) y la escena los suyos', () => {
  for (const [k, label] of Object.entries(JA.labels)) {
    const id = { animToggle: 't3d-animToggle', gridToggle: 't3d-gridToggle' }[k] || 't3d-' + k;
    if (k === 'snapToggle' || k === 'fogToggle') continue; // en 3D todo va por casillas; la niebla es el botón de Partida
    assert.match(frag, new RegExp(`<label class="check"><input type="checkbox" id="${id}"(?: checked)?> ${label.replace(/[()]/g, '\\$&')}</label>`), k);
  }
  const sel = frag.match(/<select id="t3d-hpVisibility">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...sel.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => ({ value: m[1], text: m[2] })), JA.hpVisibilityOptions);
  for (const t of Object.values(JA.folds)) assert.match(frag, new RegExp(`<span class="foldTitle">${t}</span>`), t);
  assert.match(frag, /data-fold="t3d-reglas"/);
  assert.match(frag, /Lo que apagues desaparece para todo el mundo, tú incluido\. Vida y condiciones se ocultan pero no se borran\./);
  // el motor engancha cada casilla y el selector
  assert.match(engine, /const BOARD_TOGGLES=\['sharedVision','playersDoors','initiativeShown','chatEnabled','diceEnabled','hpEnabled','conditionsEnabled','acEnabled'\];/);
  for (const k of ['sharedVision', 'playersDoors', 'initiativeShown', 'chatEnabled', 'diceEnabled', 'hpEnabled', 'conditionsEnabled', 'acEnabled', 'hpVisibility', 'animToggle', 'gridToggle']) assert.match(frag, new RegExp(`id="t3d-${k}"`), k);
});

test('ajustes: el motor los aplica — visión compartida, vida, CA, estados y dados apagados, animar y cuadrícula', () => {
  assert.match(engine, /if\(LIVE\.on&&!LIVE\.dm&&SETTINGS\.sharedVision===false\)\{ const mine=/, 'sin visión compartida, cada jugador ve desde las suyas');
  assert.match(engine, /const hpShown=b=>hpOn\(\)&&\(!withheld\(b,'hp'\)\|\|!!b\.sheet\.hpBar\);/);
  assert.match(engine, /conds=condsOn\(\)\?sh\.conditions\|\|\[\]:\[\], elev=condsOn\(\)\?sh\.elevation\|0:0/, 'estados y altura sobre la ficha');
  assert.match(engine, /if\(acOn\(\)\) g1\.append\(numIn\('CA'/);
  assert.match(engine, /if\(!diceOn\(\)\)\{ showHint\('Los dados están desactivados en este tablero\.'/);
  assert.match(engine, /const animOn=\(\)=>!reduceMotion&&!\(M&&M\.animate===false\);/);
  assert.match(engine, /uniforms\.uFrame\.value=anim\?/);
  assert.match(engine, /function buildGrid\(\)\{/);
});

test('planos: el cliente los lee como el servidor y un plano fijado pinta las mismas casillas que la plantilla', () => {
  const cases = [{ id: 4, shape: 'rect', a: { x: 1.234, z: -3 }, b: { x: 99, z: 2 } }, { id: 5, shape: 'hex', a: { x: 1, z: 1 }, b: { x: 2, z: 2 }, area: true, owner: '7', color: '#AABBCC' },
    { id: 6, shape: 'cone', a: { x: 1, z: 1 }, b: { x: 2, z: 2 }, area: true }, { id: 0, a: { x: 1, z: 1 }, b: { x: 2, z: 2 } }, { id: 1, a: { x: 1, z: 1 } }, { id: 2, shape: 'circle', a: { x: 1, z: 1 }, b: { x: 3, z: 1 }, owner: 'x' }];
  for (const p of cases) assert.deepEqual(plain(Ajustes.normPlan(p, 8, 8)), R.cleanPlan(p, 8, 8), JSON.stringify(p));
  for (const n of [{ id: 3, x: 2, z: 5, text: '  Trampa  ', gmOnly: 1 }, { id: 3, x: 8, z: 0, text: 'a' }, { id: 1, x: 1, z: 1, text: 'x'.repeat(300) }, { id: 1, x: 1, z: 1, text: ' ' }]) assert.deepEqual(plain(Ajustes.normNote(n, 8, 8)), R.cleanNote(n, 8, 8));
  const W = 20, D = 16;
  for (const [mode, a, b, L] of [['ruler', [2, 3], [11, 7], 0], ['circle', [9, 8], null, 4], ['cube', [5, 5], null, 3], ['cube', [5, 5], null, 4], ['cone', [3, 3], [9, 5], 6], ['cone', [10, 8], [4, 8], 3], ['line', [2, 2], [14, 11], 12], ['line', [15, 3], [15, 13], 6]]) {
    const want = Ajustes.measure(mode, a, b || a, L, W, D), plan = Ajustes.normPlan(Object.assign({ id: 1 }, Ajustes.planOf(mode, a, b || a, L)), W, D);
    assert.ok(want.length > 0, mode);
    assert.deepEqual([...Ajustes.planCells(plan, W, D)].sort((x, y) => x - y), [...want].sort((x, y) => x - y), `${mode} ${JSON.stringify(plan)}`);
    assert.equal(Ajustes.planMode(plan), mode);
  }
  assert.deepEqual(plain(Ajustes.planOf('cube', [5, 5], null, 4)), { shape: 'rect', a: { x: 3.5, z: 3.5 }, b: { x: 7.5, z: 7.5 } }, 'el cubo de 20 pies es un rect de JA-VTT');
  // el motor usa estas cuentas, los guarda con la escena y reparte los de los jugadores en live/plans
  assert.match(engine, /function measureCells\(mode,a,b\)\{ return Ajustes\.measure\(/);
  assert.match(engine, /Ajustes\.planCells\(p,M\.w,M\.d\)/);
  assert.match(engine, /DB\.doc\('live\/plans'\)\.update\(\{plans:\{\[id\]:plan\}\}\)/);
  assert.match(engine, /plans:list\(o\.plans,100,Ajustes\.normPlan\),notes:list\(o\.notes,300,Ajustes\.normNote\)/, 'deserialize');
});

test('escena: el cliente y el servidor leen igual los ajustes, planos y anotaciones de una escena de antes y de una de ahora', () => {
  const now = F.map(8, { grid: false, animate: false, plansReleased: true, plans: [{ id: 1, shape: 'cone', a: { x: 1.5, z: 1.5 }, b: { x: 4.5, z: 1.5 } }], notes: [{ id: 2, x: 3, z: 3, text: 'Pozo', gmOnly: true }] });
  for (const o of [F.map(8), now]) {
    const srv = R.cleanMap(o), list = (v, f) => (Array.isArray(v) ? v.map((x) => f(x, 8, 8)).filter(Boolean) : []);
    const cli = Object.assign({}, Ajustes.sceneFlags(o), { plans: list(o.plans, Ajustes.normPlan), notes: list(o.notes, Ajustes.normNote) });
    assert.deepEqual(plain(cli), { grid: srv.grid, snap: srv.snap, animate: srv.animate, plansReleased: srv.plansReleased, plans: srv.plans || [], notes: srv.notes || [] });
  }
});

test('iniciativa: forma de JA-VTT en el cliente; el combate de antes y el de ahora se leen igual que en el servidor', () => {
  for (const s of JA.initiativeSamples) assert.deepEqual(plain(Ajustes.normInitiative(s.input)), s.output);
  const old = { active: true, order: [{ id: 'k1', roll: 12, total: 14, init: 2 }, { id: 'g1', roll: 3, total: 5, init: 2 }], turn: 1, round: 3, left: 4, dashed: true };
  const srv = R.combatFor(R.cleanLiveDoc('combat', old), { role: 'gm', user_id: 1 }, {}, R.DEFAULT_SETTINGS), cli = Ajustes.readCombat(old);
  assert.deepEqual([cli.entries.map((e) => [e.tokenId, e.value, e.roll, e.init]), cli.turn, cli.round, cli.active, cli.current, cli.left, cli.dashed],
    [srv.initiative.entries.map((e) => [e.tokenId, e.value, e.roll, e.init]), srv.initiative.turn, srv.initiative.round, srv.active, srv.current, srv.left, srv.dashed]);
  assert.deepEqual(plain(Ajustes.readCombat(srv)).current, 'g1', 'el de ahora');
  const hidden = Ajustes.readCombat({ initiative: null, active: true, round: 2, current: null, left: 0, dashed: false });
  assert.deepEqual([hidden.hiddenOrder, hidden.active, hidden.round, hidden.entries.length, hidden.current], [true, true, 2, 0, null], 'la vista del jugador sin iniciativa');
  assert.equal(Ajustes.readCombat({ active: false, order: [] }).active, false);
  assert.equal(Ajustes.readCombat(null).active, false);
  // el motor manda la iniciativa de JA-VTT y, el jugador, sólo su movimiento o «pasar turno»
  assert.match(engine, /return \{initiative:\{entries,turn:on\?Math\.max\(0,GM\.turn\):0,round:on\?GM\.round:1\},left:GM\.left,dashed:GM\.dashed\}; \}/);
  assert.match(engine, /DB\.doc\('live\/combat'\)\.update\(\{next:true\}\)/);
  assert.match(engine, /c=Ajustes\.readCombat\(d\);/);
});

test('fichas: el cliente guarda lo que el servidor no manda (withheld) y la barra (hpBar); el servidor no los acepta de un cliente', () => {
  const d = { name: 'Orco', kind: 'enemy', size: 1, hidden: false, vision: true, sight: 60, darkvision: 0, light: Fichas.noLight(), conditions: [], elevation: 0, ac: 13, hp: { cur: 9, max: 9, temp: 0 }, speed: 30, init: 0 };
  const seen = R.tokensFor({ tokens: R.cleanTokens({ o1: F.token(null, { sheet: { name: 'Orco', kind: 'enemy', hp: { cur: 9, max: 20, temp: 0 }, ac: 13 } }) }) }, { role: 'player', user_id: 2 }, R.cleanSettings({ hpVisibility: 'bar_only' })).tokens.o1.sheet;
  const s = plain(Fichas.norm(seen, d));
  assert.deepEqual([s.withheld, s.hpBar], [['ac', 'hp'], { cur: 0.45, temp: 0 }]);
  assert.equal(R.cleanSheet(seen).withheld, undefined);
  assert.equal(R.cleanSheet(seen).hpBar, undefined);
  assert.equal(plain(Fichas.norm({ withheld: ['x', 'ac', 'ac'] }, d)).withheld.join(), 'ac');
});

test('dados: el cliente usa la notación y el cuerpo de tirada de JA-VTT, igual que el servidor', () => {
  assert.deepEqual(plain(Dados.SIDES), JD.SIDES);
  for (const [f, want] of Object.entries(JD.parse)) {
    let got; try { got = plain(Dados.parse(f)); } catch (e) { got = { error: e.message }; }
    assert.deepEqual(got, want, JSON.stringify(f));
  }
  for (const [f, opts] of [['2d6-1d4+2', {}], ['d20+1', { adv: 1 }], ['1d20-2', { adv: -1 }], ['4d8 + 2d10', {}], ['2d6', { adv: 1 }]]) {
    const seq = () => { let k = 0; return (sides) => (k++ * 7) % sides + 1; };
    assert.deepEqual(plain(Dados.roll(f, Object.assign({ rng: seq() }, opts))), dice.roll(f, Object.assign({ rng: seq() }, opts)), f);
  }
  for (const b of JD.bodies) assert.match(Dados.text(b), new RegExp('^' + (b.label ? b.label + ': ' : '') + b.formula.replace(/[+]/g, '\\+') + ': \\['), 'una tirada de JA-VTT se lee en el registro');
  assert.equal(Dados.text({ formula: '1d20+3', dice: [{ n: 1, sides: 20, sign: 1, rolls: [20] }], mod: 3, total: 23 }), '1d20+3: [20] + 3 = 23 (¡crítico!)');
  assert.equal(Dados.text({ formula: '2d20', dice: [{ n: 2, sides: 20, sign: 1, rolls: [1, 9] }], mod: 0, total: 1, adv: -1, label: 'Salvación' }), 'Salvación: 2d20 con desventaja: [1, 9] → 1 = 1 (pifia)');
  assert.equal(Dados.text(null), '');
  // en la mesa en vivo tira el servidor (mensaje roll) y todos lo apuntan al recibirlo
  assert.match(readMod('mesa.js'), /roll:\(formula,label,adv\)=>request\(\{t:'roll',formula,label,adv\}\)/);
  assert.match(engine, /LIVE\.room\.roll\(formula,label\|\|'',adv\|\|0\)/);
  assert.doesNotMatch(engine, /LIVE\.room\.emit\('roll'/, 'la tirada ya no la manda el cliente como texto');
});
