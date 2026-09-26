#!/usr/bin/env node
/* Prueba de humo del tablero 3D dentro de JA-VTT (traída de 3d-tablero, test/e2e/ja-vtt.mjs): se lanza
   contra un JA-VTT en marcha.
   Uso: BASE_URL=http://localhost:3999 npm run test:t3d [carpeta-capturas]
   Crea dos cuentas y un tablero «Mesa 3D» (se abre directamente en 3D), alterna pestañas, abre la
   mesa en vivo, tira un d20 (llega al jugador y al chat de JA-VTT), comprueba que los ajustes del tablero son los de
   JA-VTT en los dos sentidos y que el 2D no dibuja con el 3D abierto, crea un tablero «Mesa 2D» (JA-VTT
   tal cual, sin el módulo; su API 3D responde 404), mira las etiquetas 2D/3D del panel y exige cero
   errores de consola. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || path.join(process.cwd(), 'test', 'e2e', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const sfx = Date.now().toString(36);
const res = []; const step = (n, ok, d = '') => { res.push(ok); console.log(`${ok ? 'OK ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
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
async function drawn(p) {
  const box = await p.locator('#t3d-stage').boundingBox();
  const png = await p.screenshot({ clip: { x: box.x, y: box.y, width: Math.min(700, box.width), height: Math.min(600, box.height) } });
  return p.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 997) s.add(d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3); return s.size; }, png.toString('base64'));
}
try {
  const pl = await page('pl'); await register(pl, `jug-${sfx}`);
  const gm = await page('gm'); await register(gm, `dir-${sfx}`);
  const opts = await gm.evaluate(() => [...document.querySelectorAll('#newBoardType option')].map((o) => o.textContent).join());
  step('«Nuevo tablero»: selector Mesa 2D / Mesa 3D con el módulo cargado', (await gm.isVisible('#newBoardType')) && opts === 'Mesa 2D,Mesa 3D', opts);
  await gm.fill('#newBoardName', 'Mesa 3D'); await gm.selectOption('#newBoardType', '3d'); await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const boardId = await gm.evaluate(() => location.hash.split('/').pop());
  await gm.evaluate(async (n) => { await fetch(`/api/boards/${location.hash.split('/').pop()}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) }); }, `jug-${sfx}`);
  step('mesa 3D: abre directamente en 3D, sin botón para alternar', await gm.evaluate(() => document.getElementById('app').classList.contains('is3d') && !document.getElementById('t3dBtn') && !document.getElementById('t3dScene')));
  await gm.waitForTimeout(1500);
  const colors = await drawn(gm);
  step('3D: el motor pinta dentro de JA-VTT', colors > 8, `${colors} colores`);
  // guardado automático, como el 2D: abrir no guarda nada; un cambio del director se guarda solo y sobrevive a recargar
  const scenesOf = () => gm.evaluate(async (id) => (await (await fetch(`/api/t3d/boards/${id}/scenes`)).json()).scenes.map((x) => x.name), boardId);
  await gm.waitForTimeout(3000);
  const untouched = await scenesOf();
  step('guardado automático: abrir una mesa 3D nueva no guarda nada', untouched.length === 0, JSON.stringify(untouched));
  await gm.fill('#t3d-bname', 'Claro autoguardado');
  const autoTxt = await gm.waitForFunction(() => { const t = document.getElementById('t3d-autosave')?.textContent || ''; return /^Guardado/.test(t) ? t : false; }, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => gm.evaluate(() => document.getElementById('t3d-autosave')?.textContent || ''));
  const saved = (await scenesOf()).includes('Claro autoguardado');
  step('guardado automático: un cambio del director se guarda solo en el tablero', saved && /^Guardado/.test(autoTxt), `${JSON.stringify(await scenesOf())} · «${autoTxt}»`);
  await gm.reload();
  const reopened = await gm.waitForFunction(() => /Claro autoguardado/.test(document.getElementById('t3d-mapName')?.textContent || ''), null, { timeout: 20000 }).then(() => true, () => false);
  step('guardado automático: al recargar vuelve la escena guardada sola', reopened, await gm.evaluate(() => document.getElementById('t3d-mapName')?.textContent || ''));
  const lay = await gm.evaluate(() => ({ rail2d: getComputedStyle(document.getElementById('rail')).display, rail3d: getComputedStyle(document.getElementById('t3d-rail')).display, stage: document.getElementById('t3d-stage').getBoundingClientRect().width | 0, tabs: [...document.querySelectorAll('#panel .tabs [data-tab]')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.tab).join() }));
  step('3D: se esconde lo 2D y el raíl/lienzo del módulo ocupan su sitio', lay.rail2d === 'none' && lay.rail3d !== 'none' && lay.stage > 600, JSON.stringify(lay));
  await gm.click('#panel .tabs [data-tab="t3d-tokens"]');
  const t1 = await gm.evaluate(() => ({ mod: document.querySelector('[data-pane="t3d-tokens"]').classList.contains('active'), scene: document.getElementById('tab-scene').classList.contains('active') }));
  await gm.click('#panel .tabs [data-tab="live"]');
  const t2 = await gm.evaluate(() => ({ live: document.getElementById('tab-live').classList.contains('active'), mod: document.querySelector('[data-pane="t3d-tokens"]').classList.contains('active'), table: !!document.querySelector('#tab-live #t3d-gTable') }));
  step('pestañas: las del módulo y las de JA-VTT se alternan', t1.mod && !t1.scene && t2.live && !t2.mod && t2.table, JSON.stringify({ t1, t2 }));
  const icons = await gm.evaluate(() => ['palette', 'eraser', 'lasso'].map((n) => !!document.querySelector(`[data-ic="${n}"] svg :is(path,circle,rect,line,polyline,ellipse)`) || !document.querySelector(`[data-ic="${n}"]`)));
  step('iconos que JA-VTT no trae se pintan (icons-t3d.js)', icons.every(Boolean), JSON.stringify(icons));
  const tool0 = await gm.evaluate(() => window.JustAnotherVTT.UI.tool);
  await gm.locator('#t3d-stage').click({ position: { x: 300, y: 300 } }).catch(() => {});
  await gm.keyboard.press('w');
  step('teclado: en 3D no cambia la herramienta 2D de JA-VTT', (await gm.evaluate(() => window.JustAnotherVTT.UI.tool)) === tool0, tool0);
  await gm.keyboard.press('Escape');

  // jugador entra, abre 3D y se une a la mesa en vivo
  await pl.goto(`${BASE}/#/tablero/${boardId}`);
  await pl.waitForFunction(() => !!document.getElementById('t3d-mapName'), null, { timeout: 20000 });
  const plRole = await pl.evaluate(() => document.getElementById('app').classList.contains('t3d-player'));
  step('jugador: el enlace del tablero abre el 3D con su rol', plRole);
  await gm.click('#t3d-gTable button:has-text("Abrir mesa con este tablero")');
  await pl.click('#panel .tabs [data-tab="live"]');
  await pl.waitForSelector('#t3d-gTable button:has-text("Unirse a la mesa")', { timeout: 10000 });
  await pl.click('#t3d-gTable button:has-text("Unirse a la mesa")');
  await pl.waitForFunction(() => /en vivo/.test(document.getElementById('t3d-mapName')?.textContent || ''), null, { timeout: 10000 });
  step('mesa en vivo por /t3d/ws: el jugador recibe la mesa', true);
  await gm.click('#panel .tabs [data-tab="t3d-game"]');
  await gm.click('#t3d-gDice button:has-text("d20")');
  await pl.click('#panel .tabs [data-tab="t3d-game"]');
  const got = await pl.waitForFunction(() => document.querySelectorAll('#t3d-gDice .t3d-log div').length > 0 && !/Todavía no hay/.test(document.getElementById('t3d-gDice').textContent), null, { timeout: 10000 }).then(() => true, () => false);
  // T6d: la tirada llega al chat de JA-VTT como tirada (kind roll, cuerpo de su dice.js: fórmula, dados y total), no como texto
  const chat = await pl.waitForFunction(() => { const m = document.querySelector('#chatLog .chatMsg.roll'); return !!m && /1d20/.test(m.textContent) && !!m.querySelector('.total') && !!m.querySelector('.pips .pip'); }, null, { timeout: 10000 }).then(() => true, () => false);
  step('tirada: llega al jugador y al chat de JA-VTT como tirada (fórmula, dados y total)', got && chat, await pl.evaluate(() => document.getElementById('chatLog').textContent.slice(-80)));
  // Conexión en una mesa 3D: el estado y «Probar conexión» cuentan las dos conexiones (chat de JA-VTT y tablero 3D) y el render 3D
  await pl.click('#panel .tabs [data-tab="live"]');
  await pl.evaluate(() => { document.querySelector('#tab-live > [data-fold="conexion"]').open = true; });
  await pl.waitForTimeout(1300);
  const conn = await pl.evaluate(() => document.getElementById('liveStatus').textContent);
  step('conexión: el estado muestra el chat, el tablero 3D y su render', /Chat/.test(conn) && /Tablero 3D: conectado/.test(conn) && /\d+ fps/.test(conn), conn);
  await pl.click('#pingBtn');
  const pong = await pl.waitForFunction(() => { const t = document.getElementById('toast'); return t && t.style.display !== 'none' && /Tablero 3D: \d+ ms/.test(t.textContent) && /Chat: \d+ ms/.test(t.textContent) ? t.textContent : false; }, null, { timeout: 6000 }).then((h) => h.jsonValue(), () => pl.evaluate(() => document.getElementById('toast').textContent));
  step('conexión: «Probar conexión» mide las dos conexiones', /Tablero 3D: \d+ ms/.test(pong) && /Chat: \d+ ms/.test(pong), pong);
  const twoD = await pl.evaluate(() => ['vista', 'atajos'].map((f) => getComputedStyle(document.querySelector(`#tab-live > [data-fold="${f}"]`)).display));
  step('pestaña Mesa: sin «Vista» ni «Atajos de teclado» del 2D en una mesa 3D', twoD.every((d) => d === 'none'), JSON.stringify(twoD));
  // T6d: en la pestaña Mesa de una mesa 3D, los ajustes del tablero 3D (con los textos de JA-VTT) sustituyen a los de la escena 2D
  await gm.click('#panel .tabs [data-tab="live"]');
  const rules = await gm.evaluate(() => ({ ja: ['reglas', 'mesa'].map((f) => getComputedStyle(document.querySelector(`#tab-live > [data-fold="${f}"]`)).display), t3d: ['t3d-reglas', 't3d-mesa-fichas'].map((f) => getComputedStyle(document.querySelector(`[data-fold="${f}"]`)).display), hp: !!document.getElementById('t3d-hpVisibility') }));
  step('pestaña Mesa: en una mesa 3D se ven los ajustes del 3D y no los de la escena 2D de JA-VTT', rules.ja.every((d) => d === 'none') && rules.t3d.every((d) => d !== 'none') && rules.hp, JSON.stringify(rules));
  // T8: los ajustes del tablero son los de JA-VTT (una sola fuente) y cada uno se ve una vez
  const once = await gm.evaluate(() => ['chatEnabled', 'diceEnabled', 't3d-chatEnabled', 't3d-diceEnabled'].filter((id) => document.getElementById(id)?.checkVisibility()).join());
  const init2d = await gm.evaluate(() => getComputedStyle(document.querySelector('#tab-chat > [data-fold="iniciativa"]')).display);
  step('pestaña Mesa: «Chat de texto» y «Dados» una sola vez (las del 3D) y sin la iniciativa 2D', once === 't3d-chatEnabled,t3d-diceEnabled' && init2d === 'none', JSON.stringify({ once, init2d }));
  // apagar los dados en los ajustes de JA-VTT (su casilla, oculta en una mesa 3D, por su propio Net) bloquea las tiradas del 3D
  await gm.evaluate(() => { const c = document.getElementById('diceEnabled'); c.checked = false; c.dispatchEvent(new Event('change')); });
  const offPl = await pl.waitForFunction(() => /desactivados/.test(document.getElementById('t3d-gDice').textContent) && !document.getElementById('t3d-diceEnabled').checked, null, { timeout: 10000 }).then(() => true, () => false);
  const rawRoll = () => pl.evaluate((id) => new Promise((resolve) => {
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/t3d/ws?board=${id}`);
    ws.onmessage = (e) => { const d = JSON.parse(e.data); if (d.t === 'state') ws.send(JSON.stringify({ t: 'roll', req: 1, formula: 'd20' })); if (d.t === 'ack') { ws.close(); resolve(d.ok ? 'ok' : d.error); } };
    setTimeout(() => resolve('sin respuesta'), 8000);
  }), boardId);
  const blocked = await rawRoll();
  step('ajustes de JA-VTT: apagar sus «Dados» bloquea las tiradas 3D (en el servidor) y el 3D del jugador lo refleja', offPl && /desactivados/.test(blocked), JSON.stringify({ offPl, blocked }));
  // y al revés: el «Chat de texto» del 3D apaga el chat de JA-VTT (P-06); volver a encenderlo desde el 3D
  await gm.click('#t3d-chatEnabled');
  const chatOff = await pl.waitForFunction(() => getComputedStyle(document.getElementById('chatForm')).display === 'none', null, { timeout: 10000 }).then(() => true, () => false);
  // la casilla de JA-VTT del director se actualiza por su propio Net: se espera a que llegue (sin esperar, a veces se leía antes)
  const jaBox = await gm.waitForFunction(() => !document.getElementById('chatEnabled').checked, null, { timeout: 5000 }).then(() => false, () => true);
  await gm.click('#t3d-chatEnabled'); await gm.click('#t3d-diceEnabled');
  const back = await pl.waitForFunction(() => getComputedStyle(document.getElementById('chatForm')).display !== 'none' && !/desactivados/.test(document.getElementById('t3d-gDice').textContent), null, { timeout: 10000 }).then(() => true, () => false);
  step('ajustes del 3D: su «Chat de texto» apaga el chat de JA-VTT y sus casillas siguen a las de JA-VTT', chatOff && !jaBox && back && (await rawRoll()) === 'ok', JSON.stringify({ chatOff, jaBox, back }));
  // T8: con la mesa 3D abierta el bucle 2D de JA-VTT no dibuja
  const draws = await gm.evaluate(() => new Promise((resolve) => { let n = 0; const orig = window.drawAll; window.drawAll = function (...a) { n++; return orig.apply(this, a); }; requestRender(); setTimeout(() => { window.drawAll = orig; resolve(n); }, 1500); }));
  step('rendimiento: con la mesa 3D abierta el 2D de JA-VTT no dibuja', draws === 0, `${draws} fotogramas 2D en 1,5 s`);
  const stored = await gm.evaluate(async (id) => (await (await fetch(`/api/t3d/boards/${id}/scenes`)).json()), boardId);
  step('API /api/t3d responde en JA-VTT', Array.isArray(stored.scenes));
  // las pruebas que esperan un error van por gm.request (mismas cookies) para no ensuciar la consola
  const fixed = (await gm.request.delete(`${BASE}/api/t3d/boards/${boardId}`)).status();
  step('el tipo es fijo: la mesa 3D no vuelve a 2D', fixed === 409, String(fixed));
  await pl.screenshot({ path: path.join(OUT, 'ja-vtt-3d-jugador.png') });

  // al panel: se desmonta; luego un tablero «Mesa 2D» es JA-VTT sin rastro del módulo
  await gm.evaluate(() => { location.hash = '#/'; });
  await gm.waitForSelector('#dashView:not([hidden]) .boardCard', { timeout: 10000 });
  const left = await gm.evaluate(() => ({ ids: document.querySelectorAll('[id^="t3d-"]').length, is3d: document.getElementById('app').classList.contains('is3d') }));
  await gm.fill('#newBoardName', 'Mesa 2D'); await gm.selectOption('#newBoardType', '2d'); await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForSelector('#sceneBtn', { state: 'visible', timeout: 15000 });
  await gm.waitForTimeout(1200);
  const id2 = await gm.evaluate(() => location.hash.split('/').pop());
  const flat = await gm.evaluate(async (id) => ({ ids: document.querySelectorAll('[id^="t3d-"]').length, is3d: document.getElementById('app').classList.contains('is3d'), rail: getComputedStyle(document.getElementById('rail')).display,
    type: (await (await fetch(`/api/t3d/boards/${id}`)).json()).board.t3d }), id2);
  flat.scenes = (await gm.request.get(`${BASE}/api/t3d/boards/${id2}/scenes`)).status();
  step('mesa 2D: JA-VTT tal cual, sin módulo; /api/t3d de ese tablero 404', left.ids === 0 && !left.is3d && flat.ids === 0 && !flat.is3d && flat.rail !== 'none' && flat.type === false && flat.scenes === 404, JSON.stringify({ left, flat }));
  await gm.screenshot({ path: path.join(OUT, 'ja-vtt-2d.png') });
  await gm.evaluate(() => { location.hash = '#/'; });
  await gm.waitForFunction(() => document.querySelectorAll('#gmBoards .boardCard').length === 2, null, { timeout: 10000 });
  const labels = await gm.evaluate(() => [...document.querySelectorAll('#gmBoards .boardCard')].map((c) => c.querySelector('h3').textContent).sort().join());
  step('panel: cada tarjeta dice si es 2D o 3D', labels === 'Mesa 2D2D,Mesa 3D3D', labels);
  await gm.screenshot({ path: path.join(OUT, 'ja-vtt-panel.png') });
  // Tarea 7 (fase 0): el motor decide paso, puertas, tarimas, maleza y luz fija por el catálogo. Misma escena, mismas
  // respuestas que el motor de antes (medidas con el código de 1dd52c7): caminos, puertas, lo que tapa la maleza y la luz.
  await gm.fill('#newBoardName', 'Mesa catálogo'); await gm.selectOption('#newBoardType', '3d'); await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const eqBoard = await gm.evaluate(() => location.hash.split('/').pop());
  const EW = 16, eh = [], et = [], ews = [];
  for (let z = 0; z < EW; z++) for (let x = 0; x < EW; x++) { const river = x === 9; eh.push(river ? '0' : '2'); et.push(x === 4 && ![3, 6, 10].includes(z) ? 'w' : x === 4 ? 's' : 'g'); ews.push(river ? '2' : '0'); }
  const eqProps = [['door', 4, 3, 1, { open: false }], ['door', 4, 10, 1, { open: false, locked: true }], ['gate', 4, 6, 1, { open: true }], ['chest', 2, 6], ['stall', 6, 1], ['bridge', 9, 5, 1], ['bridge2', 9, 8, 1],
    ['lamp', 6, 8], ['torch', 12, 12], ['brazier', 2, 12], ['cover', 13, 7], ['crates', 14, 7], ['cover', 12, 3], ['barrel', 13, 3], ['veil', 11, 10], ['barrier', 7, 12],
    ['light', 1, 14, 0, { preset: 'torch', r: 5, h: 1.2, color: '#ffb347', intensity: 1, anim: 'flicker', angle: 360, rot: 0 }], ['tree', 10, 1, 2], ['portal', 14, 14, 0, { id: 1, look: 'magic', target: null }],
    ['obj:o_test1', 3, 14], ['window', 11, 14], ['light', 12, 5, 0, { preset: 'torch', r: 8, h: 1.2, color: '#ffffff', intensity: 1, anim: 'none', angle: 360, rot: 0 }]]
    .map(([type, x, z, v, o]) => Object.assign({ type, x, z, v: v || 0 }, o || {}));
  const eqScene = { v: 1, name: 'Catálogo', w: EW, d: EW, h: eh.join(''), t: et.join(''), wsrc: ews.join(''), props: eqProps, roofs: [], start: [11, 6], env: 'night', fog: true, animate: false, seen: '',
    minis: [{ kind: 'knight', x: 11, z: 6, fx: 1, fz: 0, id: 'k1' }, { kind: 'knight', x: 1, z: 1, fx: 0, fz: 1, id: 'k2' }] };
  await gm.evaluate(async ([id, sc]) => { await fetch(`/api/t3d/boards/${id}/scenes/eq1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sc) }); }, [eqBoard, eqScene]);
  await gm.reload();
  await gm.waitForFunction(() => /Catálogo/.test(document.getElementById('t3d-mapName')?.textContent || ''), null, { timeout: 20000 });
  // por condición: las 22 piezas en el tablero y la niebla ya calculada alrededor del caballero
  await gm.waitForFunction(() => (t3dView.probe('props') || []).length === 22 && t3dView.probe('fog', 11, 6) === 2 && t3dView.probe('fog', 12, 5) === 2, null, { timeout: 20000 });
  const ROUTES = { '6,3': 5, '6,10': 6, '8,6': 4, '11,5': 1, '11,8': 2, '2,6': null, '7,1': null, '6,1': null, '13,7': 2, '14,7': null, '12,3': 3, '11,10': 4, '7,12': null, '14,14': null, '10,1': null, '6,8': null, '3,14': null, '1,14': 16, '11,14': null, '9,5': 2, '9,2': null };
  const LIGHT = { '6,9': 1.056, '7,8': 1.222, '12,11': 1.333, '13,12': 1.333, '2,11': 1.111, '3,11': 1.056, '14,13': 1.278, '15,0': 0.667 };
  const eq = await gm.evaluate(([routes, light]) => {
    const P = (...a) => t3dView.probe(...a), bad = [];
    for (const k in routes) { const [x, z] = k.split(',').map(Number), r = P('route', 'k1', x, z); if (r !== routes[k]) bad.push(`camino ${k}: ${r} (antes ${routes[k]})`); }
    for (const k in light) { const [x, z] = k.split(',').map(Number), l = P('light', x, z); if (Math.abs(l - light[k]) > 0.01) bad.push(`luz ${k}: ${l} (antes ${light[k]})`); }
    const props = P('props').map((q) => q.type[0] + (q.shown ? 1 : 0) + (q.open ? 'o' : '') + (q.locked ? 'l' : '')).join(' ');
    if (props !== 'd1 d1l g1o c1 s1 b0 b0 l1 t1 b1 c1 c0 c1 b1 v1 b1 l0 t1 p1 o0 w0 l0') bad.push('objetos ' + props);
    return bad;
  }, [ROUTES, LIGHT]);
  step('motor por catálogo: caminos, puertas, tarimas, maleza y luz fija como antes', eq.length === 0, eq.slice(0, 4).join(' | '));

  // Arreglo §6 (Tarea 7, ronda 1): un dibujo que sustituye a un objeto manda sobre su luz. Un farol dibujado sin luz y el
  // portal mágico dibujado sin luz se apagan; el árbol (variante 0) dibujado con luz alumbra.
  const flat16 = (n, c) => c.repeat(n);
  const lightScene = { v: 1, name: 'Luz', w: 16, d: 16, h: flat16(256, '2'), t: flat16(256, 'g'), wsrc: flat16(256, '0'), roofs: [], start: [0, 0], env: 'night', fog: false, animate: false, seen: '',
    props: [{ type: 'lamp', x: 3, z: 3, v: 0 }, { type: 'tree', x: 12, z: 12, v: 0 }, { type: 'portal', x: 12, z: 3, v: 0, id: 1, look: 'magic', target: null }],
    minis: [{ kind: 'knight', x: 0, z: 15, fx: 0, fz: 1, id: 'k1' }] };
  const openLight = async () => {
    await gm.reload();
    await gm.waitForFunction(() => /^Luz/.test(document.getElementById('t3d-mapName')?.textContent || '') && (t3dView.probe('props') || []).length === 3, null, { timeout: 20000 });
  };
  const cells = () => gm.evaluate(() => { const L = (x, z) => t3dView.probe('light', x, z); return { lamp: L(4, 3), tree: L(11, 12), portal: L(11, 3), dark: L(3, 12) }; });
  await gm.evaluate(async ([id, sc]) => { await fetch(`/api/t3d/boards/${id}/scenes/luz1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sc) }); }, [eqBoard, lightScene]);
  await openLight();
  const lit0 = await cells();
  const drawn3 = await gm.evaluate(async (id) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d');
    for (let f = 0; f < 4; f++) { x.fillStyle = ['#5a3a1a', '#6b4a22', '#2f6b2f', '#3f8f3f'][f]; x.fillRect(f * 16 + 5, 5, 6, 6); }
    const sheet = c.toDataURL('image/png');
    const rec = (key, light) => ({ key, kind: 'obj', target: key, name: key, res: 16, w: 16, h: 16, count: 4, cols: 4, frameNames: [], light,
      lightSpec: light ? { px: 8, py: 8, s: 3, r: 8, c: '#ffffff', f: 0 } : null, layers: [{ name: 'Capa 1', vis: true, op: 100, sheet }], updated: Date.now() });
    const put = (r) => fetch(`/api/t3d/boards/${id}/drawings/${r.key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).then((q) => q.status);
    return [await put(rec('lamp', false)), await put(rec('tree0', true)), await put(rec('portal_magic', false))];
  }, eqBoard);
  await openLight();
  // los dibujos llegan después de la escena: se espera a que el árbol alumbre (o a que venza el plazo)
  await gm.waitForFunction((t0) => t3dView.probe('light', 11, 12) > t0 + 0.1, lit0.tree, { timeout: 15000 }).catch(() => {});
  const lit1 = await cells();
  const near = (a, b) => Math.abs(a - b) <= 0.02;
  step('arreglo §6: un dibujo sin luz apaga el farol y el portal mágico; el árbol dibujado con luz alumbra',
    drawn3.every((s) => s === 200) && lit0.lamp > lit0.dark + 0.1 && lit0.portal > lit0.dark + 0.1 && near(lit1.lamp, lit1.dark) && near(lit1.portal, lit1.dark) && lit1.tree > lit0.tree + 0.1,
    JSON.stringify({ drawn3, antes: lit0, despues: lit1 }));

  // §6 (Tarea 8): al abrir una puerta, la luz de una antorcha que hay detrás llega a la casilla de delante sin esperar a otro
  // cambio. Muro en la columna x=6 con una puerta cerrada en (6,8); antorcha en (3,8); se mide (8,8). Nadie lleva luz propia
  // (así relight() no tiene fichas con luz que lo despierten). La puerta se abre como un usuario: clic derecho en su casilla
  // y «Abrir la puerta» del menú.
  const dw = [], dt = [];
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { dw.push('2'); dt.push(x === 6 ? (z === 8 ? 's' : 'w') : 'g'); }
  const doorScene = { v: 1, name: 'Puerta y antorcha', w: 16, d: 16, h: dw.join(''), t: dt.join(''), wsrc: flat16(256, '0'), roofs: [], start: [7, 8], env: 'night', fog: false, animate: false, seen: '',
    props: [{ type: 'door', x: 6, z: 8, v: 1, open: false }, { type: 'light', x: 3, z: 8, v: 0, preset: 'torch', r: 8, h: 1.2, color: '#ffffff', intensity: 1, anim: 'none', angle: 360, rot: 0 }],
    minis: [{ kind: 'knight', x: 12, z: 13, fx: 0, fz: 1, id: 'k1' }] };
  await gm.evaluate(async ([id, sc]) => { await fetch(`/api/t3d/boards/${id}/scenes/puerta1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sc) }); }, [eqBoard, doorScene]);
  await gm.reload();
  await gm.waitForFunction(() => /^Puerta y antorcha/.test(document.getElementById('t3d-mapName')?.textContent || '') && (t3dView.probe('props') || []).length === 2, null, { timeout: 20000 });
  const doorCells = () => gm.evaluate(() => ({ open: !!(t3dView.probe('props').find((p) => p.type === 'door') || {}).open, front: t3dView.probe('light', 8, 8), behind: t3dView.probe('light', 4, 8), dark: t3dView.probe('light', 12, 2) }));
  const luzAntes = await doorCells();
  const at = await gm.evaluate(() => t3dView.probe('screen', 6, 8));
  await gm.mouse.click(at.x, at.y, { button: 'right' });
  await gm.click('#t3d-ctxMenu button:has-text("Abrir la puerta")', { timeout: 5000 });
  await gm.waitForFunction(() => !!(t3dView.probe('props').find((p) => p.type === 'door') || {}).open, null, { timeout: 5000 });
  // por condición: la casilla de delante se ilumina (con el fallo, no llega nunca: se corta a los 3 s)
  await gm.waitForFunction((t0) => t3dView.probe('light', 8, 8) > t0 + 0.05, luzAntes.front, { timeout: 3000 }).catch(() => {});
  const luzDespues = await doorCells();
  // y al volver a cerrarla, la casilla de delante vuelve a oscurecerse
  await gm.mouse.click(at.x, at.y, { button: 'right' });
  await gm.click('#t3d-ctxMenu button:has-text("Cerrar la puerta")', { timeout: 5000 });
  await gm.waitForFunction((t0) => t3dView.probe('light', 8, 8) <= t0 + 0.02, luzAntes.front, { timeout: 3000 }).catch(() => {});
  const luzCerrada = await doorCells();
  step('luz: al abrir una puerta, la antorcha de detrás alumbra al momento (y al cerrarla deja de alumbrar)',
    !luzAntes.open && luzDespues.open && !luzCerrada.open && luzAntes.behind > luzAntes.dark + 0.1 && Math.abs(luzAntes.front - luzAntes.dark) <= 0.02 &&
    luzDespues.front > luzAntes.front + 0.05 && Math.abs(luzCerrada.front - luzAntes.front) <= 0.02,
    JSON.stringify({ antes: luzAntes, despues: luzDespues, cerrada: luzCerrada }));

  // Escena vieja (v1, como F.escenaVieja() del servidor) importada en el cliente, guardada y releída: v:2, las mismas
  // piezas, puertas con su espejo, portales con destino y nombre, la luz con sus campos; y un segundo guardado no cambia uid.
  const oldScene = { v: 1, name: 'Escena vieja', w: 8, d: 8, h: flat16(64, '2'), t: flat16(64, 'g'), wsrc: flat16(64, '0'), roofs: [], start: [0, 0], env: 'day', fog: false,
    minis: [{ kind: 'knight', x: 0, z: 0, fx: 0, fz: 1, id: 'k1' }],
    props: [
      { type: 'door', x: 1, z: 2, v: 1, open: false, locked: true },
      { type: 'gate', x: 2, z: 2, v: 0, open: true },
      { type: 'portal', x: 3, z: 3, v: 0, id: 7, look: 'cave', target: { scene: 'bOtra', portal: 2 }, name: 'Cueva' },
      { type: 'stairs', x: 4, z: 4, to: 'cabajo', tx: 1, tz: 1 },
      { type: 'obj:o_abcd1234', x: 5, z: 5, v: 2 },
      { type: 'light', x: 6, z: 6, preset: 'torch', r: 8, h: 1.25, color: '#ffa652', intensity: 1, anim: 'flicker', on: true },
      { type: 'barrier', x: 0, z: 7, v: 0 },
      { type: 'bridge2', x: 2, z: 6, v: 1 },
      { type: 'nave_espacial', x: 1, z: 1 },
    ] };
  const importJson = async (obj, name) => {
    await gm.setInputFiles('#t3d-file', { name: 'escena.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
    await gm.waitForFunction((n) => (document.getElementById('t3d-mapName')?.textContent || '').startsWith(n), name, { timeout: 15000 });
  };
  // espera por condición: la escena con ese nombre aparece en el servidor (se pregunta cada 300 ms, hasta 15 s)
  const sceneByName = (n) => gm.evaluate(async ([id, name]) => { const l = (await (await fetch(`/api/t3d/boards/${id}/scenes`)).json()).scenes; const s = l.find((x) => x.name === name); if (!s) return null;
    return (await (await fetch(`/api/t3d/boards/${id}/scenes/${s.id}`)).json()).scene; }, [eqBoard, n]);
  const waitScene = async (n) => { for (let k = 0; k < 50; k++) { const s = await sceneByName(n).catch(() => null); if (s) return s; await gm.waitForTimeout(300); } return null; };
  await importJson(oldScene, 'Escena vieja');
  await gm.evaluate(() => document.getElementById('t3d-save').click());
  const s1 = await waitScene('Escena vieja');
  const chk = [];
  if (!s1) chk.push('no se guardó: ' + await gm.evaluate(() => [document.getElementById('t3d-autosave')?.textContent, document.getElementById('t3d-mapName')?.textContent].join(' · ')));
  else {
    const by = (f) => s1.props.find(f);
    if (s1.v !== 2) chk.push('v ' + s1.v);
    if (s1.props.length !== 8) chk.push('piezas ' + s1.props.length);
    const door = by((p) => p.type === 'door'), gate = by((p) => p.type === 'gate'), cave = by((p) => p.look === 'cave'), st = by((p) => p.look === 'stairs'), lt = by((p) => p.type === 'light');
    if (!(door && door.locked === true && door.open === false && door.state && door.state.locked === true && door.state.open === false)) chk.push('puerta ' + JSON.stringify(door));
    if (!(gate && gate.open === true && gate.state && gate.state.open === true)) chk.push('gate ' + JSON.stringify(gate));
    if (!(cave && cave.id === 7 && cave.name === 'Cueva' && cave.target && cave.target.scene === 'bOtra' && cave.target.portal === 2)) chk.push('portal ' + JSON.stringify(cave));
    if (!(st && st.target && st.target.scene === 'cabajo')) chk.push('escalera ' + JSON.stringify(st));
    if (!(lt && lt.preset === 'torch' && lt.r === 8 && lt.h === 1.25 && lt.color === '#ffa652' && lt.anim === 'flicker')) chk.push('luz ' + JSON.stringify(lt));
    if (!by((p) => p.type === 'barrier') || !by((p) => p.type === 'obj:o_abcd1234') || !by((p) => p.type === 'bridge2')) chk.push('faltan barrera, dibujo o puente');
    if (!s1.props.every((p) => /^u[a-z0-9]{8}$/.test(p.uid) && p.def)) chk.push('uid/def');
    await gm.fill('#t3d-bname', 'Escena vieja 2');
    const s2 = await waitScene('Escena vieja 2');
    const uids = (s) => s.props.map((p) => p.type + '@' + p.x + ',' + p.z + '=' + p.uid).sort().join();
    if (!s2 || uids(s2) !== uids(s1)) chk.push('los uid cambian al volver a guardar: ' + uids(s1) + ' → ' + (s2 ? uids(s2) : 'sin segundo guardado'));
  }
  step('escena vieja (v1) importada, guardada y releída: v2 sin perder nada; los uid no cambian al volver a guardar', chk.length === 0, chk.join(' | '));

  // Pieza de una definición del tablero que aquí no se conoce (p: borrada): se conserva opaca — se dibuja, ocupa su
  // casilla — y al exportar sale tal cual.
  const ghost = { type: 'o_fantasma', def: 'p:fantasma', uid: 'ufantasm1', x: 2, z: 0, v: 1, extra: { algo: 1 } };
  await importJson({ v: 2, name: 'Fantasma', w: 8, d: 8, h: flat16(64, '2'), t: flat16(64, 'g'), wsrc: flat16(64, '0'), roofs: [], start: [0, 0], env: 'day', fog: false,
    minis: [{ kind: 'knight', x: 0, z: 0, fx: 0, fz: 1, id: 'k1' }], props: [ghost] }, 'Fantasma');
  const gp = await gm.evaluate(() => ({ props: t3dView.probe('props'), route: t3dView.probe('route', 'k1', 2, 0), beside: t3dView.probe('route', 'k1', 3, 0) }));
  // «Exportar» (downloads de mesa.js): se recoge el archivo del enlace de descarga sin descargarlo (una descarga real deja
  // al navegador sin cerrar limpio en esta prueba)
  const exported = JSON.parse(await gm.evaluate(() => new Promise((resolve) => { const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (!this.download) return orig.call(this); HTMLAnchorElement.prototype.click = orig; fetch(this.href).then((r) => r.text()).then(resolve); };
    document.getElementById('t3d-export').click(); })));
  const gOut = (exported.props || []).find((p) => p.def === 'p:fantasma');
  step('pieza p: sin definición: se conserva opaca (se dibuja, ocupa su casilla) y se exporta tal cual',
    gp.props.length === 1 && gp.props[0].shown && gp.route === null && gp.beside !== null && JSON.stringify(gOut) === JSON.stringify(ghost),
    JSON.stringify({ gp, gOut }));
  // Tarea 8 / Ruling R18: una columna de barreras (gmOnly) en x=6 y la ficha del jugador en (3,8). En la mesa en vivo el
  // jugador no tiene las barreras en sus datos (sólo `blockCells`), y su camino al otro lado sale bloqueado (como en main).
  await gm.evaluate(() => { location.hash = '#/'; });
  await gm.waitForSelector('#dashView:not([hidden]) .boardCard', { timeout: 10000 });
  await gm.fill('#newBoardName', 'Mesa barrera'); await gm.selectOption('#newBoardType', '3d'); await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForFunction(() => (document.getElementById('t3d-mapName')?.textContent || '').length > 3, null, { timeout: 20000 });
  const barBoard = await gm.evaluate(() => location.hash.split('/').pop());
  const barMembers = await gm.evaluate(async ([id, n]) => (await (await fetch(`/api/boards/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })).json()).members, [barBoard, `jug-${sfx}`]);
  const plUid = String(barMembers.find((m) => m.role !== 'gm').id);
  const barProps = []; for (let z = 0; z < 16; z++) barProps.push({ type: 'barrier', x: 6, z, v: 1 });
  const barScene = { v: 1, name: 'Barrera', w: 16, d: 16, h: flat16(256, '2'), t: flat16(256, 'g'), wsrc: flat16(256, '0'), roofs: [], start: [6, 8], env: 'day', fog: false, animate: false, seen: '', props: barProps,
    minis: [{ kind: 'knight', x: 3, z: 8, fx: 1, fz: 0, id: 'k1', owner: plUid }] };
  await gm.evaluate(async ([id, sc]) => { await fetch(`/api/t3d/boards/${id}/scenes/bar1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sc) }); }, [barBoard, barScene]);
  await gm.reload();
  await gm.waitForFunction(() => /^Barrera/.test(document.getElementById('t3d-mapName')?.textContent || '') && (t3dView.probe('props') || []).length === 16, null, { timeout: 20000 });
  await gm.click('#panel .tabs [data-tab="live"]');
  await gm.click('#t3d-gTable button:has-text("Abrir mesa con este tablero")');
  await pl.goto(`${BASE}/#/tablero/${barBoard}`);
  await pl.waitForFunction(() => !!document.getElementById('t3d-mapName'), null, { timeout: 20000 });
  await pl.click('#panel .tabs [data-tab="live"]');
  await pl.waitForSelector('#t3d-gTable button:has-text("Unirse a la mesa")', { timeout: 10000 });
  await pl.click('#t3d-gTable button:has-text("Unirse a la mesa")');
  await pl.waitForFunction(() => /en vivo/.test(document.getElementById('t3d-mapName')?.textContent || '') && (t3dView.probe('tokens') || []).length === 1, null, { timeout: 15000 });
  const bar = await pl.evaluate(() => { const id = t3dView.probe('tokens')[0].id; return { barriers: t3dView.probe('props').filter((p) => p.type === 'barrier').length, props: t3dView.probe('props').length,
    across: t3dView.probe('route', id, 9, 8), same: t3dView.probe('route', id, 5, 8) }; });
  bar.gmAcross = await gm.evaluate(() => t3dView.probe('route', t3dView.probe('tokens')[0].id, 9, 8));
  step('barrera (R18): el jugador en la mesa en vivo no la tiene en sus datos y su camino a través de ella sale bloqueado',
    bar.barriers === 0 && bar.props === 0 && bar.across === null && bar.same !== null && bar.gmAcross === null, JSON.stringify(bar));
  step('sin errores de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) { step('sin excepciones', false, e.message.split('\n')[0]); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
console.log(`\n${res.filter(Boolean).length}/${res.length} pasos correctos · capturas en ${OUT}`);
process.exit(res.every(Boolean) ? 0 : 1);
