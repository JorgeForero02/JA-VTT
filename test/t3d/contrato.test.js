'use strict';
/* Los datos de referencia de test/t3d/fixtures/ja-vtt (copiados de 3d-tablero, commit d68f41f) tienen que
   seguir siendo los del código real de JA-VTT: si el 2D cambia, este test lo avisa. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { db, resetSchema, t3dDb } = require('./helpers/db');
const ROOT = path.join(__dirname, '..', '..');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ja-vtt', n), 'utf8'));
const leer = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// public/js/core.js es un script clásico: se evalúa con lo mínimo del navegador y se devuelven sus catálogos
function core() {
  const ctx = { matchMedia: () => ({ matches: false }), document: { querySelector: () => null, querySelectorAll: () => [] } };
  vm.createContext(ctx);
  return vm.runInContext(leer('public', 'js', 'core.js') + '\n;({ WALL_TYPES, LIGHT_PRESETS, TOKEN_LIGHTS, ENVS, CONDITIONS })', ctx);
}

before(async () => { await resetSchema(); });
after(async () => { await db.close(); });

test('contrato: iconos, variables CSS, ajustes, condiciones y dados son los del código real de JA-VTT', () => {
  const icons = Object.keys(JSON.parse(/const ICONS=(\{.*?\});/s.exec(leer('public', 'js', 'icons.js'))[1]));
  for (const k of fx('icons.json').iconos) assert.ok(icons.includes(k), `icono ${k}`);
  const css = leer('public', 'css', 'app.css');
  for (const v of fx('variables-css.json').variables) assert.ok(css.includes(v + ':'), `variable ${v}`);
  const R = require(path.join(ROOT, 'server', 'rules.js'));
  const bs = fx('board-settings.json');
  assert.deepEqual(R.DEFAULT_BOARD, bs.DEFAULT_BOARD);
  assert.deepEqual(R.DEFAULT_SCENE, bs.DEFAULT_SCENE);
  assert.deepEqual([...R.CONDITION_IDS], fx('conditions.json').ids);
  const dice = require(path.join(ROOT, 'server', 'dice.js'));
  for (const [f, esperado] of Object.entries(fx('dice.json').parse)) {
    let got; try { got = dice.parse(f); } catch (e) { got = { error: e.message }; }
    assert.deepEqual(JSON.parse(JSON.stringify(got)), esperado, `fórmula ${f}`);
  }
});

test('contrato: tipos de muro, luces y momentos del cliente de JA-VTT', () => {
  const C = core();
  const wt = fx('wall-types.json').types;
  for (const [k, t] of Object.entries(wt)) for (const f of ['sight', 'light', 'move', 'hide', 'door', 'portal']) assert.equal(!!C.WALL_TYPES[k][f], !!t[f], `${k}.${f}`);
  assert.deepEqual(Object.keys(C.LIGHT_PRESETS), Object.keys(fx('light-presets.json').presets));
  assert.deepEqual([...C.TOKEN_LIGHTS], fx('light-presets.json').tokenLights);
  assert.deepEqual(Object.keys(C.ENVS), fx('envs.json').ids);
});

// M8 (ola final): «dos veces igual» mira también el esquema t3d: la lista de sus tablas y cuántas filas tiene cada una
async function t3dEstado() {
  const tablas = (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 't3d' ORDER BY 1")).rows.map((r) => r.table_name);
  const filas = {};
  for (const t of tablas) filas[t] = (await db.pool.query(`SELECT COUNT(*)::int AS n FROM t3d."${t}"`)).rows[0].n;
  return { tablas, filas };
}
test('contrato: el módulo migra sobre la base de JA-VTT sin tocar sus tablas, y dos veces igual', async () => {
  const antes = (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows;
  const t3dAntes = await t3dEstado();
  assert.ok(t3dAntes.tablas.includes('pieces') && t3dAntes.tablas.includes('scenes'), JSON.stringify(t3dAntes.tablas));
  assert.deepEqual(await t3dDb.migrate(), []);
  const despues = (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows;
  assert.deepEqual(despues, antes);
  assert.deepEqual(await t3dEstado(), t3dAntes, 'la segunda migración no crea tablas ni filas en t3d');
});
