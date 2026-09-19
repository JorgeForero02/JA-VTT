'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/rules');

test('sameObject ignora el orden de las claves, también anidadas', () => {
  assert.equal(R.sameObject({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }), true);
  assert.equal(R.sameObject({ a: 1 }, { a: 2 }), false);
  assert.equal(R.sameObject({ a: [1, { k: 1, j: 2 }] }, { a: [1, { j: 2, k: 1 }] }), true);
  assert.equal(R.sameObject({ a: [1, 2] }, { a: [2, 1] }), false);
});

test('playerUpsert: girar la luz propia devuelve un objeto igual al enviado (sin corrección)', () => {
  const uid = 7;
  const old = R.sanitize({ id: 1, type: 'token', kind: 'player', owner: uid, x: 100, y: 100, name: 'A', size: 1, hidden: false, vision: true, sight: 0, darkvision: 0, light: { on: true, preset: 'bullseye', bright: 60, dim: 60, color: '#FFE6B8', intensity: 1, anim: 'none', angle: 60, rot: 0 } });
  // jsonb devuelve las claves en otro orden al recargar de la base: se emula aquí
  const fromDb = JSON.parse(R.stableJson(old));
  const neu = R.sanitize(Object.assign({}, old, { light: Object.assign({}, old.light, { rot: 37 }) }));
  const result = R.playerUpsert(uid, fromDb, neu, { settings: {} }, 1, 0);
  assert.ok(result);
  assert.equal(result.light.rot, 37);
  assert.notEqual(JSON.stringify(result), JSON.stringify(neu), 'el orden de claves difiere tras pasar por jsonb');
  assert.equal(R.sameObject(result, neu), true, 'pero el contenido es el mismo: no hay que corregir al cliente');
});

test('sanitize acepta el tipo de muro "cover" (maleza)', () => {
  const w = R.sanitize({ id: 5, type: 'wall', kind: 'cover', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });
  assert.equal(w.kind, 'cover');
  assert.equal(R.sanitize({ id: 6, type: 'wall', kind: 'inventado', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }).kind, 'wall');
});

test('weather: ajuste de escena con id de la lista, intensidad 0–1 y viento −1–1', () => {
  assert.deepEqual(R.WEATHER_IDS, ['none', 'rain', 'storm', 'drizzle', 'blizzard', 'sand', 'fog', 'ash', 'embers', 'heat', 'arcane']);
  assert.deepEqual(R.cleanSettings({ weather: { id: 'rain', intensity: .7, wind: -.3 } }).weather, { id: 'rain', intensity: .7, wind: -.3 });
  assert.deepEqual(R.cleanSettings({ weather: { id: 'storm', intensity: 4, wind: -9 } }).weather, { id: 'storm', intensity: 1, wind: -1 });
  assert.deepEqual(R.cleanSettings({ weather: { id: 'none' } }).weather, { id: 'none', intensity: .6, wind: 0 });
  for (const id of ['tsunami', 'snow', '', 7, null]) assert.equal(R.cleanSettings({ weather: { id } }).weather, undefined, String(id));
  assert.equal(R.cleanSettings({ weather: 'rain' }).weather, undefined);
  assert.deepEqual(R.cleanSettings({ weather: { id: 'fog', intensity: 'x', wind: null, extra: 1 } }).weather, { id: 'fog', intensity: .6, wind: 0 });
  assert.equal(R.cleanSettings({}).weather, undefined);
  assert.equal(R.splitSettings({ weather: { id: 'rain' } }).scene.weather.id, 'rain');
});

test('weather.indoor: sólo ids de la lista (sin none) con true; lo demás se descarta', () => {
  assert.deepEqual(R.cleanSettings({ weather: { id: 'rain', indoor: { rain: true, fog: 1, none: true, tsunami: true, ash: false } } }).weather.indoor, { rain: true, fog: true });
  assert.equal(R.cleanSettings({ weather: { id: 'rain' } }).weather.indoor, undefined);
  assert.equal(R.cleanSettings({ weather: { id: 'rain', indoor: ['rain'] } }).weather.indoor, undefined);
  assert.equal(R.cleanSettings({ weather: { id: 'rain', indoor: {} } }).weather.indoor, undefined);
});

test('condiciones: catálogo de 20 ids; sanitize filtra las inventadas, quita duplicados y siempre deja un array', () => {
  assert.deepEqual(R.CONDITION_IDS, ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'dead', 'concentration', 'exhaustion', 'burning', 'blessed', 'marked']);
  const base = { id: 1, type: 'token', x: 0, y: 0 };
  assert.deepEqual(R.sanitize(Object.assign({ conditions: ['poisoned', 'invalid'] }, base)).conditions, ['poisoned']);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: ['prone', 'prone', 'dead', 7, null] }, base)).conditions, ['prone', 'dead']);
  assert.deepEqual(R.sanitize(base).conditions, []);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: 'prone' }, base)).conditions, []);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: R.CONDITION_IDS.concat(['x']) }, base)).conditions, R.CONDITION_IDS);
});

test('hp y elevación: enteros acotados; cur nunca supera max; sin max no hay hp; elevation siempre presente', () => {
  const base = { id: 2, type: 'token', x: 0, y: 0 };
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 15, max: 20 } }, base)).hp, { cur: 15, max: 20, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 25, max: 20, temp: 5.7 } }, base)).hp, { cur: 20, max: 20, temp: 6 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: -3, max: 20 } }, base)).hp, { cur: 0, max: 20, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { max: 12 } }, base)).hp, { cur: 12, max: 12, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 1, max: 99999 } }, base)).hp, { cur: 1, max: 9999, temp: 0 });
  assert.equal(R.sanitize(Object.assign({ hp: { cur: 5 } }, base)).hp, undefined);
  assert.equal(R.sanitize(Object.assign({ hp: 7 }, base)).hp, undefined);
  assert.equal(R.sanitize(base).hp, undefined);
  assert.equal(R.sanitize(Object.assign({ elevation: 20 }, base)).elevation, 20);
  assert.equal(R.sanitize(Object.assign({ elevation: -10.4 }, base)).elevation, -10);
  assert.equal(R.sanitize(Object.assign({ elevation: 1e9 }, base)).elevation, 9999);
  assert.equal(R.sanitize(Object.assign({ elevation: 'alto' }, base)).elevation, 0);
  assert.equal(R.sanitize(base).elevation, 0);
});

test('playerUpsert: el dueño cambia condiciones, hp y elevación de su ficha; no toca tamaño ni visibilidad; ajena → null', () => {
  const uid = 7;
  const old = R.sanitize({ id: 3, type: 'token', kind: 'player', owner: uid, x: 0, y: 0, name: 'A', size: 2, hidden: false, hp: { cur: 10, max: 10 } });
  const neu = R.sanitize(Object.assign({}, old, { conditions: ['prone', 'blessed'], hp: { cur: 4, max: 10, temp: 3 }, elevation: 15, size: 4, hidden: true }));
  const r = R.playerUpsert(uid, old, neu, { settings: {} }, 1, 0);
  assert.deepEqual(r.conditions, ['prone', 'blessed']);
  assert.deepEqual(r.hp, { cur: 4, max: 10, temp: 3 });
  assert.equal(r.elevation, 15);
  assert.equal(r.size, 2, 'el tamaño sigue siendo cosa del director');
  assert.equal(r.hidden, false);
  // quitar la vida del todo (sin hp) también es del dueño
  assert.equal(R.playerUpsert(uid, old, R.sanitize(Object.assign({}, old, { hp: undefined })), { settings: {} }, 1, 0).hp, undefined);
  const ajena = R.sanitize({ id: 4, type: 'token', kind: 'enemy', owner: null, x: 0, y: 0, hp: { cur: 30, max: 30 } });
  assert.equal(R.playerUpsert(uid, ajena, R.sanitize(Object.assign({}, ajena, { hp: { cur: 0, max: 30 } })), { settings: {} }, 1, 0), null);

  // Ficha guardada antes de este cambio (sin conditions/elevation/hp en old)
  const legacyOld = { id: 10, type: 'token', kind: 'player', owner: uid, x: 50, y: 50, name: 'Vieja', size: 1, color: '#7FB2E5', hidden: false, vision: true, sight: 0, darkvision: 0, light: { preset: 'none', on: false, bright: 0, dim: 0, color: '#FFFFFF', intensity: 1, anim: 'none', angle: 360, rot: 0 }, img: null };
  const legacyNeu = R.sanitize(legacyOld);
  const legacyRes = R.playerUpsert(uid, legacyOld, legacyNeu, { settings: {} }, 1, 0);
  assert.equal(R.sameObject(legacyRes, legacyNeu), true, 'ficha previa sin campos nuevos no genera divergencia');
});

test('hpVisibility: ajuste de tablero con tres valores; objectFor quita el hp a los jugadores en fichas ajenas sólo en modo gm', () => {
  assert.equal(R.DEFAULT_BOARD.hpVisibility, 'all');
  for (const v of ['all', 'gm', 'bar_only']) assert.equal(R.splitSettings({ hpVisibility: v }).board.hpVisibility, v);
  assert.equal(R.cleanSettings({ hpVisibility: 'nadie' }).hpVisibility, undefined);
  assert.equal(R.splitSettings({ hpVisibility: 'gm' }).scene.hpVisibility, undefined, 'no es ajuste de escena');
  const gmTok = R.sanitize({ id: 5, type: 'token', kind: 'enemy', owner: null, x: 0, y: 0, hp: { cur: 8, max: 20 }, conditions: ['prone'] });
  const mine = R.sanitize({ id: 6, type: 'token', kind: 'player', owner: 7, x: 0, y: 0, hp: { cur: 3, max: 9 } });
  const player = { role: 'player', user_id: 7 }, gm = { role: 'gm', user_id: 1 };
  const seen = R.objectFor(gmTok, player, { hpVisibility: 'gm' });
  assert.equal(seen.hp, undefined);
  assert.deepEqual(seen.conditions, ['prone'], 'las condiciones sí se ven');
  assert.deepEqual(gmTok.hp, { cur: 8, max: 20, temp: 0 }, 'el original no se toca');
  assert.equal(R.objectFor(mine, player, { hpVisibility: 'gm' }), mine, 'la propia, intacta');
  assert.equal(R.objectFor(gmTok, gm, { hpVisibility: 'gm' }), gmTok);
  for (const v of ['all', 'bar_only', undefined]) assert.equal(R.objectFor(gmTok, player, { hpVisibility: v }), gmTok, String(v));
  const wall = R.sanitize({ id: 8, type: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } });
  assert.equal(R.objectFor(wall, player, { hpVisibility: 'gm' }), wall);
});

test('hpEnabled y conditionsEnabled: booleanos de tablero, true por defecto', () => {
  assert.equal(R.DEFAULT_BOARD.hpEnabled, true);
  assert.equal(R.DEFAULT_BOARD.conditionsEnabled, true);
  assert.deepEqual(R.splitSettings({ hpEnabled: false, conditionsEnabled: false }).board, { hpEnabled: false, conditionsEnabled: false });
  assert.deepEqual(R.splitSettings({ hpEnabled: 'no', conditionsEnabled: 0 }).board, {});
  assert.equal(R.splitSettings({ hpEnabled: false }).scene.hpEnabled, undefined);
});

test('note: texto recortado a 200, gmOnly booleano, sin posición → null; los jugadores no ven las gmOnly', () => {
  const n = R.sanitize({ id: 9, type: 'note', x: 10, y: 20, text: 'Trampa DC 15', gmOnly: 1 });
  assert.deepEqual(n, { id: 9, type: 'note', x: 10, y: 20, text: 'Trampa DC 15', gmOnly: true });
  assert.equal(R.sanitize({ id: 9, type: 'note', x: 10, y: 20, text: 'x'.repeat(300) }).text.length, 200);
  assert.deepEqual(R.sanitize({ id: 9, type: 'note', x: 10, y: 20 }), { id: 9, type: 'note', x: 10, y: 20, text: '', gmOnly: false });
  assert.equal(R.sanitize({ id: 9, type: 'note', text: 'sin sitio' }), null);
  const player = { role: 'player', user_id: 7 }, gm = { role: 'gm', user_id: 1 };
  assert.equal(R.visibleTo(n, player, {}), false);
  assert.equal(R.visibleTo(n, gm, {}), true);
  assert.equal(R.visibleTo(Object.assign({}, n, { gmOnly: false }), player, {}), true);
  assert.equal(R.playerUpsert(7, null, n, { settings: {} }, 0, 0), null, 'un jugador no crea notas');
  assert.deepEqual(R.cleanSettings({ layers: { notes: { visible: false } } }).layers.notes, { visible: false, locked: false });
});

