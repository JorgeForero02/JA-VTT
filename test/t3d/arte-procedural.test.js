'use strict';
/* Fábrica del arte procedural (arte-procedural.js, Tablero3D.ArteProcedural), extraída de tablero3d.js en la tarea 6 del
   refactor. Construida en node con el lienzo de mentira de helpers/arte.js pinta, píxel a píxel, lo mismo que el motor en
   el navegador: la suma del atlas y de los sprites coincide con la foto congelada del e2e (test/e2e/fixtures/
   motor-escenas.json, paso «atlas y sprites»). Lo que buildArt() reasigna se lee por getter, así que un cambio de
   resolución (getTEX) se ve en el objeto devuelto y la ida y vuelta vuelve a la foto (paso «resolución»). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadArte, fakeCanvas } = require('./helpers/arte');
const FOTO = require('../e2e/fixtures/motor-escenas.json').arte;

// lo mismo que probe('atlas') y probe('sprite', k) del motor
const sumOf = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let sum = 0; for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0; return { w: c.width, h: c.height, sum }; };
const probe = (A) => ({ atlas: sumOf(A.atlasCanvas), sprites: Object.fromEntries(Object.keys(FOTO.sprites).map((k) => [k, { custom: !!A.CUSTOM.chars[k], ...sumOf(A.SPR[k].front.image) }])) });

test('arte procedural: al construirse pinta el atlas y los sprites igual que el motor antes del refactor (foto del e2e)', () => {
  assert.deepStrictEqual(probe(loadArte()), FOTO);
});

test('arte procedural: el estado que buildArt rehace se lee por getter (cambio de resolución de ida y vuelta)', () => {
  let TEX = 32;
  const art = loadArte({ getTEX: () => TEX });   // como el motor: TEX es suyo y la fábrica lo lee en cada uso
  const spr0 = art.SPR, tex0 = art.atlasTex, stack0 = art.STACK, stk0 = art.STK;
  for (const t of [64, 16]) {
    TEX = t; art.buildArt();
    assert.notEqual(art.SPR, spr0, `${t}: SPR nuevo`); assert.notEqual(art.atlasTex, tex0); assert.notEqual(art.STACK, stack0); assert.notEqual(art.STK, stk0);
    assert.deepEqual([art.atlasCanvas.width, art.atlasCanvas.height], [16 * t, 4 * t], `${t}: atlas a ${t} por casilla`);
    assert.equal(art.atlasTex.image, art.atlasCanvas, 'la textura del atlas es la del lienzo compuesto');
  }
  TEX = 32; art.buildArt();
  assert.deepStrictEqual(probe(art), FOTO, 'de vuelta a 32: la foto');
});

test('arte procedural: atlasTex, atlasCanvas y PLACEHOLDER tienen setter; CUSTOM, TERR y las cachés no cambian de identidad', () => {
  const art = loadArte();
  const custom = art.CUSTOM, terr = art.TERR, caches = [art.baseTexCache, art.artTops, art.spriteDimC];
  const c = art.composeAtlas(); art.atlasCanvas = c; art.atlasTex = art.tex(c);
  assert.equal(art.atlasCanvas, c); assert.equal(art.atlasTex.image, c);
  assert.equal(art.PLACEHOLDER, null); const ph = art.placeholderStack(); art.PLACEHOLDER = ph; assert.equal(art.PLACEHOLDER, ph);
  art.buildArt();
  assert.equal(art.PLACEHOLDER, null, 'buildArt suelta el marcador «sin arte»');
  assert.equal(art.CUSTOM, custom); assert.equal(art.TERR, terr); [art.baseTexCache, art.artTops, art.spriteDimC].forEach((m, i) => assert.equal(m, caches[i], 'la misma caché'));
});

test('arte procedural: un dibujo propio en CUSTOM (el mismo objeto que muta el motor) entra al rehacer el arte', () => {
  const art = loadArte();
  const cv = () => { const c = fakeCanvas(32, 48); const x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.fillRect(4, 4, 24, 40); return c; };
  art.CUSTOM.chars.knight = { name: 'Caballero', res: 32, size: 'medium', canvases: [cv(), cv(), cv()] };
  art.buildArt();
  const s = sumOf(art.SPR.knight.front.image);
  assert.notEqual(s.sum, FOTO.sprites.knight.sum, 'el caballero es el dibujado');
  assert.deepEqual([s.w, s.h], [32, 48]);
  delete art.CUSTOM.chars.knight; art.buildArt();
  assert.deepStrictEqual(probe(art), FOTO, 'sin el dibujo vuelve el de fábrica');
});
