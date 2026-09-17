'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'd3', 'light-map.js')).href);

test('SPRITE_OF cubre todos los presets de luz del servidor', async () => {
  const { SPRITE_OF } = await load();
  const R = require('../server/rules');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'rules.js'), 'utf8');
  const presets = JSON.parse(src.match(/const LIGHT_PRESETS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  for (const p of presets) assert.ok(SPRITE_OF[p], 'falta el preset ' + p);
  assert.equal(Object.keys(SPRITE_OF).length, presets.length);
  void R;
});

test('SPRITE_OF apunta siempre a un preset que el diorama sí tiene', async () => {
  const { SPRITE_OF } = await load();
  const chars = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'd3', 'chars.js'), 'utf8');
  const block = chars.slice(chars.indexOf('export const LIGHT_PRESETS'), chars.indexOf('export const TOKEN_LIGHTS'));
  for (const v of new Set(Object.values(SPRITE_OF))) assert.ok(new RegExp('\\n  ' + v + ':').test(block), 'el diorama no tiene ' + v);
});

test('defFor manda los radios y el color del tablero; el preset sólo pone el sprite', async () => {
  const { defFor } = await load();
  const base = { lantern: { bright: 30, dim: 30, color: '#FFD28F', intensity: 1, anim: 'soft', sprite: 'torch', lh: 1.3, scale: 1 },
    magic: { bright: 20, dim: 20, color: '#DDE8FF', intensity: 1, anim: 'none', sprite: 'orb', lh: 1.5, scale: .9 },
    darkness: { bright: 15, dim: 0, color: '#000000', intensity: 1, anim: 'none', darkness: true, sprite: 'orb', lh: 1.2, scale: 1.1, tint: '#3a2a55' } };
  const d = defFor({ preset: 'bullseye', bright: 60, dim: 60, color: '#FFE6B8', intensity: 1, anim: 'none' }, base);
  assert.equal(d.bright, 60); assert.equal(d.dim, 60); assert.equal(d.sprite, 'torch'); assert.equal(d.darkness, false);
  const inv = defFor({ preset: 'inventado' }, base);
  assert.equal(inv.sprite, 'orb', 'un preset desconocido cae en custom → magic');
  const dk = defFor({ preset: 'darkness', bright: 15, dim: 0, darkness: true }, base);
  assert.equal(dk.darkness, true);
});
