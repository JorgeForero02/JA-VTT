#!/usr/bin/env node
/* Red de seguridad del refactor de tablero3d.js (tarea 1): congela lo que el motor 3D hace hoy, en el navegador, antes de
   mover una línea. Se lanza contra un JA-VTT en marcha, como t3d.mjs:
     BASE_URL=http://localhost:3999 node test/e2e/t3d-motor.mjs            → compara con la foto
     FOTO=1 BASE_URL=http://localhost:3999 node test/e2e/t3d-motor.mjs     → captura la foto (sólo una vez; se niega si existe)
   Foto: test/e2e/fixtures/motor-escenas.json (no se regenera después de la tarea 1).
   Escenas de entrada: test/t3d/fixtures/motor-escenas-entrada.json (una v1 sin def/uid, una v2 con piezas p: y puerta,
   una con techos, notas y planos; más las definiciones p: que usa la v2).
   Pasos: atlas y sprites; escenas importadas → serialize(); mapas de ejemplo; resolución ida y vuelta; editor de arte
   (nuevo objeto, Probar, colocar, Guardar, recargar); deshacer/rehacer; combate; el jugador en la mesa en vivo no puede
   empezar combate ni cambiar la niebla; cero errores de consola.
   Lo que es azar no entra en la foto: la semilla (probe('serialized') ya la quita), los uid que el cliente inventa para
   piezas que llegan sin uid (se enmascaran), la mazmorra de [data-map] (semilla Math.random: sólo se comprueba que abre)
   y la iniciativa (tirada con crypto: el paso de combate no depende del orden). */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CAPTURE = process.env.FOTO === '1';
// FOTO_SALIDA (sólo con FOTO=1): escribe la captura en otro sitio, p. ej. para comprobar que dos capturas dan lo mismo
const FOTO_PATH = CAPTURE && process.env.FOTO_SALIDA ? path.resolve(process.env.FOTO_SALIDA) : path.join(process.cwd(), 'test', 'e2e', 'fixtures', 'motor-escenas.json');
const ENTRADA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test', 't3d', 'fixtures', 'motor-escenas-entrada.json'), 'utf8'));
if (CAPTURE && fs.existsSync(FOTO_PATH)) { console.error(`${FOTO_PATH} ya existe: la foto del motor no se regenera.`); process.exit(1); }
if (!CAPTURE && !fs.existsSync(FOTO_PATH)) { console.error(`Falta ${FOTO_PATH}: se captura una sola vez con FOTO=1.`); process.exit(1); }
const FOTO = CAPTURE ? {} : JSON.parse(fs.readFileSync(FOTO_PATH, 'utf8'));
const sfx = Date.now().toString(36);
const res = []; const step = (n, ok, d = '') => { res.push(ok); console.log(`${ok ? 'OK ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const short = (v) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };
// primera diferencia entre dos valores JSON (para que el FAIL diga dónde)
function firstDiff(a, b, at = '') {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${at}.${k}`); if (d) return d; }
  }
  return `${at || '(raíz)'}: ${short(a)} ≠ foto ${short(b)}`;
}
// con FOTO=1 guarda el valor; sin FOTO lo compara con la foto. `ok` añade comprobaciones que no dependen de la foto.
function snap(name, key, value, ok = true, detail = '') {
  if (CAPTURE) { FOTO[key] = value; step(`${name} (foto)`, ok, detail || short(value)); return; }
  const d = firstDiff(value, FOTO[key]);
  step(name, !d && ok, d || detail);
}

const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: GL_ARGS });
  for (const channel of ['msedge', 'chrome']) { try { return await chromium.launch({ channel, headless: true, args: GL_ARGS }); } catch {} }
  throw new Error('No hay Edge ni Chrome instalados (o define CHROMIUM_PATH)');
}
const browser = await launch();
const errors = [];
async function page(name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function register(p, name) {
  await p.goto(BASE + '/'); await p.click('.gateTab[data-mode="register"]');
  await p.fill('#loginName', name); await p.fill('#loginPassword', 'secreto1'); await p.click('#loginSubmit');
  await p.waitForSelector('#recoveryPop:not([hidden])'); await p.click('#recoveryOk');
}
const mapName = (p) => p.evaluate(() => document.getElementById('t3d-mapName')?.textContent || '');
const UID_OK = /^u[a-z0-9]{8}$/;
// la escena tal como se guarda, con los uid que el cliente inventó (piezas que llegaron sin uid) enmascarados
const serialized = (p, keepUids) => p.evaluate(() => t3dView.probe('serialized')).then((o) => {
  for (const q of o.props || []) if (!keepUids.has(q.uid) && UID_OK.test(q.uid || '')) q.uid = '(nuevo)';
  return o;
});

try {
  const pl = await page('pl'); await register(pl, `jug-${sfx}`);
  const gm = await page('gm'); await register(gm, `dir-${sfx}`);
  await gm.fill('#newBoardName', 'Mesa 3D'); await gm.selectOption('#newBoardType', '3d'); await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const boardId = await gm.evaluate(() => location.hash.split('/').pop());
  await gm.evaluate(async (n) => { await fetch(`/api/boards/${location.hash.split('/').pop()}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) }); }, `jug-${sfx}`);
  // el motor ha pintado: atlas y sprites de fábrica listos
  await gm.waitForFunction(() => { const a = t3dView.probe('atlas'), k = t3dView.probe('sprite', 'knight'); return !!(a && a.sum && k && k.sum); }, null, { timeout: 20000 });

  // 1. atlas de casillas y sprites de fábrica (lo que pintan paint() y buildArt() al cargar)
  const art0 = await gm.evaluate(() => ({ atlas: t3dView.probe('atlas'), sprites: Object.fromEntries(['knight', 'goblin', 'golem', 'rat'].map((k) => [k, t3dView.probe('sprite', k)])) }));
  snap('atlas y sprites: el motor pinta lo mismo que antes', 'arte', art0, !!(art0.atlas && art0.atlas.sum && art0.sprites.knight));

  // 2. escenas importadas (v1 sin def/uid, v2 con piezas p: y puerta, techos + notas + planos) → serialize()
  const put = await gm.evaluate(async ([id, defs]) => { const out = [];
    for (const d of defs) out.push((await fetch(`/api/t3d/boards/${id}/pieces/${d.id.slice(2)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })).status);
    return out; }, [boardId, ENTRADA.pieces]);
  await gm.reload();
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const importJson = async (obj) => {
    await gm.setInputFiles('#t3d-file', { name: 'escena.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
    await gm.waitForFunction((n) => (document.getElementById('t3d-mapName')?.textContent || '').startsWith(n), obj.name, { timeout: 15000 });
  };
  const escenas = [];
  for (const sc of ENTRADA.escenas) {
    await importJson(sc);
    const keep = new Set(sc.props.map((q) => q.uid).filter(Boolean));
    const s = await serialized(gm, keep);
    const extra = await gm.evaluate(() => ({ props: t3dView.probe('props'), roofs: t3dView.probe('roofs').length, plans: t3dView.probe('plans').length, notes: t3dView.probe('notes').length,
      cells: [[4, 6], [5, 8], [6, 8], [9, 8], [3, 3]].map(([x, z]) => t3dView.probe('cell', x, z)) }));
    escenas.push({ serialized: s, props: extra.props.map((q) => ({ type: q.type, kind: q.kind, open: q.open, locked: q.locked })), roofs: extra.roofs, plans: extra.plans, notes: extra.notes, cells: extra.cells });
  }
  const pOk = put.every((c) => c === 200 || c === 201);
  const v2door = [1, 2].every((i) => escenas[1].cells[i] && escenas[1].cells[i].blocked && escenas[1].cells[i].shut);   // la puerta p: 2×1 cerrada tapa sus dos casillas
  snap('escenas: v1, v2 con piezas p: y techos/notas/planos se guardan igual que antes', 'escenas', escenas,
    pOk && v2door && escenas[2].roofs === 3 && escenas[2].plans === 2 && escenas[2].notes === 2, `piezas ${put.join()} · puerta p: ${v2door}`);

  // 3. mapas de ejemplo (botones [data-map]): número de objetos y luces. La mazmorra lleva semilla al azar: sólo se abre.
  const mapas = {};
  for (const [k, name] of [['town', 'Pueblo de Brezo'], ['d64', 'Mazmorra 64'], ['demo', 'Claro del bosque'], ['lights', 'Taller de luces']]) {
    await gm.evaluate((key) => document.querySelector(`#t3d-sheet [data-map="${key}"]`).click(), k);
    await gm.waitForFunction((n) => (document.getElementById('t3d-mapName')?.textContent || '').startsWith(n), name, { timeout: 20000 });
    const m = await gm.evaluate(() => { const s = t3dView.probe('serialized'); return { props: t3dView.probe('props').length, saved: s.props.length, lights: s.props.filter((q) => q.type === 'light').length, minis: s.minis.length, roofs: s.roofs.length, w: s.w, d: s.d }; });
    if (k === 'd64') { mapas.d64ok = m.props > 0 && m.props === m.saved && m.w === 64; continue; }
    mapas[k] = m;
  }
  snap('mapas de ejemplo: pueblo, demo y taller con sus objetos, luces, fichas y techos; la mazmorra abre', 'mapas', mapas, mapas.d64ok === true);

  // 4. resolución de píxel ida y vuelta (32 → 64 → 16 → 32): el atlas y los sprites vuelven a ser los de antes
  const resTxt = [];
  for (let i = 0; i < 3; i++) {
    const w0 = (await gm.evaluate(() => t3dView.probe('atlas'))).w;
    await gm.evaluate(() => document.getElementById('t3d-res').click());
    await gm.waitForFunction((w) => t3dView.probe('atlas').w !== w, w0, { timeout: 20000 });
    await gm.waitForTimeout(300);
    resTxt.push(await gm.evaluate(() => document.getElementById('t3d-res').textContent));
  }
  const art1 = await gm.evaluate(() => ({ atlas: t3dView.probe('atlas'), sprites: Object.fromEntries(['knight', 'goblin', 'golem', 'rat'].map((k) => [k, t3dView.probe('sprite', k)])) }));
  const artRef = CAPTURE ? art0 : FOTO.arte;
  step('resolución: ida y vuelta, el atlas y los sprites vuelven a la foto', isDeepStrictEqual(art1, artRef) && resTxt.join() === 'Resolución 64,Resolución 16,Resolución 32', `${resTxt.join()} · ${firstDiff(art1, artRef) || ''}`);

  // 5. editor de arte: objeto nuevo, un píxel, «Probar» → en la paleta y se coloca en (5,5); «Guardar»; recargar → sigue
  const v2 = ENTRADA.escenas[1];
  await importJson(Object.assign({}, v2, { name: 'Motor arte' }));
  const artName = `Motor ${sfx}`;
  await gm.click('#t3d-artOpen');
  await gm.click('#t3d-artNewB');
  await gm.click('#t3d-kindSeg [data-kind="obj"]'); await gm.selectOption('#t3d-artTarget', 'new');
  await gm.click('#t3d-artNew');
  await gm.fill('#t3d-artName', artName);
  const cv = await gm.locator('#t3d-artCv').boundingBox();
  await gm.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await gm.click('#t3d-artTry');
  const palette = () => gm.evaluate(() => [...document.querySelectorAll('#t3d-palette .t3d-sw span')].map((s) => s.textContent));
  await gm.click('#t3d-rail [data-tool="prop"]');
  const pal1 = await palette();
  const at55 = await gm.evaluate(() => t3dView.probe('screen', 5, 5));
  await gm.mouse.click(at55.x, at55.y);
  const placed = await gm.waitForFunction(() => (t3dView.probe('props') || []).find((q) => q.x === 5 && q.z === 5 && /^obj:o_/.test(q.type)), null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  await gm.click('#t3d-backToArt');
  await gm.click('#t3d-artSave');
  const drawings = () => gm.evaluate(async (id) => { const r = await (await fetch(`/api/t3d/boards/${id}/drawings`)).json(); return r.drawings.map((d) => d.name); /* GET /drawings → { drawings } (modules/tablero3d/index.js) */ }, boardId);
  let saved = [];
  for (let k = 0; k < 30 && !saved.includes(artName); k++) { saved = await drawings(); if (!saved.includes(artName)) await gm.waitForTimeout(300); }
  await gm.evaluate(() => document.getElementById('t3d-artClose').click());
  await gm.reload();
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const after = await drawings();
  await gm.click('#t3d-rail [data-tool="prop"]');
  // la biblioteca llega por la red tras abrir: se espera a que el dibujo esté en la paleta (o 15 s)
  await gm.waitForFunction((n) => [...document.querySelectorAll('#t3d-palette .t3d-sw span')].some((s) => s.textContent === n), artName, { timeout: 15000 }).catch(() => {});
  const pal2 = await palette();
  step('editor de arte: nuevo objeto, «Probar» (paleta y se coloca), «Guardar» y al recargar sigue en la biblioteca y en la paleta',
    pal1.includes(artName) && !!placed && saved.includes(artName) && after.includes(artName) && pal2.includes(artName),
    JSON.stringify({ enPaleta: pal1.includes(artName), placed: placed && placed.type, saved: saved.includes(artName), after: after.includes(artName), pal2: pal2.includes(artName) }));

  // 6. deshacer / rehacer en el editor de tablero: pintar nieve en (2,2); Ctrl+Z, Ctrl+Y y el botón
  await importJson(Object.assign({}, v2, { name: 'Motor deshacer' }));
  await gm.click('#t3d-rail [data-tool="paint"]');
  await gm.evaluate(() => [...document.querySelectorAll('#t3d-palette .t3d-sw')].find((b) => b.textContent === 'Nieve').click());
  const T = () => gm.evaluate(() => t3dView.probe('serialized').t);
  const t0 = await T();
  const at22 = await gm.evaluate(() => t3dView.probe('screen', 2, 2));
  await gm.mouse.click(at22.x, at22.y);
  const t1 = await T();
  await gm.keyboard.press('Control+z'); const tz = await T();
  await gm.keyboard.press('Control+y'); const ty = await T();
  await gm.click('#t3d-undo'); const tb = await T();
  step('deshacer: pintar cambia el terreno; Ctrl+Z lo devuelve, Ctrl+Y lo rehace y el botón lo deshace otra vez',
    t1 !== t0 && t1[2 * 16 + 2] === 'n' && tz === t0 && ty === t1 && tb === t0, JSON.stringify({ pintado: t1 !== t0, celda: t1[34], tz: tz === t0, ty: ty === t1, tb: tb === t0 }));

  // 7. combate (sin mesa en vivo): empezar; mover la ficha sin turno → rechazado; la del turno → gasta; siguiente; terminar.
  // Las dos fichas juntas en campo abierto: la cámara va a la del turno y la otra tiene que seguir en pantalla para tocarla.
  await gm.click('#t3d-explore');
  await importJson(Object.assign({}, v2, { name: 'Motor combate', start: [8, 12], minis: [{ kind: 'knight', x: 7, z: 12, fx: 1, fz: 0, id: 'k1' }, { kind: 'wolf', x: 10, z: 12, fx: -1, fz: 0, id: 'w1' }] }));
  await gm.click('#panel .tabs [data-tab="t3d-game"]');
  await gm.click('#t3d-gTurns button:has-text("Tirar iniciativa y empezar combate")');
  const c0 = await gm.evaluate(() => t3dView.probe('combat'));
  const toks = () => gm.evaluate(() => t3dView.probe('tokens').map((b) => ({ id: b.id, x: b.x, z: b.z })));
  const tk0 = await toks();
  const other = tk0.find((b) => b.id !== c0.cur), cur = tk0.find((b) => b.id === c0.cur);
  // tocar una ficha (un poco por encima del suelo de su casilla, sobre el sprite) y luego una casilla libre al lado
  // (la cámara se desliza hacia la ficha del turno: se espera a que la casilla deje de moverse en pantalla antes de tocar)
  const still = async (x, z) => { let a = null;
    for (let k = 0; k < 40; k++) { const b = await gm.evaluate(([cx, cz]) => t3dView.probe('screen', cx, cz), [x, z]);
      if (a && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) return b; a = b; await gm.waitForTimeout(150); }
    return a; };
  const tapToken = async (b) => { const s = await still(b.x, b.z); await gm.mouse.click(s.x, s.y - 12); };
  const tapCell = async (x, z) => { const s = await still(x, z); await gm.mouse.click(s.x, s.y); };
  const selectedId = () => gm.evaluate(() => (t3dView.probe('tokens').find((b) => b.selected) || {}).id);
  await tapToken(other); const selOther = await selectedId(); await tapCell(other.x + 1, other.z);
  await gm.waitForTimeout(600);
  const tk1 = await toks(), c1 = await gm.evaluate(() => t3dView.probe('combat'));
  await tapToken(cur); const selCur = await selectedId(); await tapCell(cur.x + 1, cur.z);
  await gm.waitForFunction((l) => t3dView.probe('combat').left < l, c1.left, { timeout: 5000 }).catch(() => {});
  const c2 = await gm.evaluate(() => t3dView.probe('combat'));
  // la ficha del turno termina su paso antes de pasar turno
  await gm.waitForFunction(([id, x]) => (t3dView.probe('tokens').find((b) => b.id === id) || {}).x === x, [cur.id, cur.x + 1], { timeout: 5000 }).catch(() => {});
  await gm.click('#t3d-gTurns button:has-text("Siguiente turno")');
  const c3 = await gm.evaluate(() => t3dView.probe('combat'));
  await gm.click('#t3d-gTurns button:has-text("Terminar combate")');
  const c4 = await gm.evaluate(() => t3dView.probe('combat'));
  step('combate: empezar, fuera de turno rechazado, en turno gasta movimiento, siguiente turno y terminar',
    c0.active && c0.order.length === 2 && selOther === other.id && selCur === cur.id && isDeepStrictEqual(tk1, tk0) && c1.left === c0.left && c2.left < c1.left && c3.cur === other.id && c3.cur !== c0.cur && c4.active === false,
    JSON.stringify({ c0: [c0.active, c0.cur, c0.left], sel: [selOther, selCur], fuera: isDeepStrictEqual(tk1, tk0), c2: c2.left, c3: c3.cur, fin: c4.active }));

  // 8. jugador en la mesa en vivo: no puede empezar combate ni cambiar la niebla (el estado del director no cambia)
  await gm.click('#panel .tabs [data-tab="live"]');
  await gm.click('#t3d-gTable button:has-text("Abrir mesa con este tablero")');
  await pl.goto(`${BASE}/#/tablero/${boardId}`);
  await pl.waitForFunction(() => !!document.getElementById('t3d-mapName'), null, { timeout: 20000 });
  await pl.click('#panel .tabs [data-tab="live"]');
  await pl.waitForSelector('#t3d-gTable button:has-text("Unirse a la mesa")', { timeout: 10000 });
  await pl.click('#t3d-gTable button:has-text("Unirse a la mesa")');
  await pl.waitForFunction(() => /en vivo/.test(document.getElementById('t3d-mapName')?.textContent || ''), null, { timeout: 15000 });
  await pl.click('#panel .tabs [data-tab="t3d-game"]');
  await pl.waitForSelector('#t3d-gTurns button', { timeout: 10000 });
  const gmState = () => gm.evaluate(() => ({ combat: t3dView.probe('combat').active, fog: t3dView.probe('serialized').fog }));
  const g0 = await gmState();
  const ctl = await pl.evaluate(() => {
    const btn = (label) => [...document.querySelectorAll('#t3d-gTurns button')].find((b) => b.textContent.includes(label));
    const out = {};
    for (const [k, label] of [['combat', 'Tirar iniciativa y empezar combate'], ['fog', 'Niebla de guerra']]) {
      const b = btn(label); out[k] = b ? { exists: true, hidden: !b.checkVisibility(), disabled: b.disabled } : { exists: false };
      if (b) b.click();   // un botón desactivado no hace nada; si estuviera activo, el estado del director tampoco debe cambiar
    }
    return out;
  });
  await gm.waitForTimeout(1500);
  const g1 = await gmState();
  const plCombat = await pl.evaluate(() => t3dView.probe('combat').active);
  // hoy (tablero3d.js renderGame, disabled:noDM): los dos controles existen y el jugador los ve desactivados
  const blockedCtl = (c) => c.exists && c.disabled;
  step('jugador en vivo: no puede empezar combate ni cambiar la niebla (el director sigue igual)',
    blockedCtl(ctl.combat) && blockedCtl(ctl.fog) && isDeepStrictEqual(g1, g0) && plCombat === false, JSON.stringify({ ctl, g0, g1, plCombat }));

  step('sin errores de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) { step('sin excepciones', false, e.message.split('\n')[0]); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
if (CAPTURE && res.every(Boolean)) {
  fs.mkdirSync(path.dirname(FOTO_PATH), { recursive: true });
  fs.writeFileSync(FOTO_PATH, JSON.stringify(FOTO, null, 1) + '\n');
  console.log(`foto escrita: ${FOTO_PATH}`);
} else if (CAPTURE) console.log('la foto NO se escribe: hay pasos en rojo');
console.log(`\n${res.filter(Boolean).length}/${res.length} pasos correctos`);
process.exit(res.every(Boolean) ? 0 : 1);
