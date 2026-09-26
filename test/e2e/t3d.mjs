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
  step('sin errores de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) { step('sin excepciones', false, e.message.split('\n')[0]); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
console.log(`\n${res.filter(Boolean).length}/${res.length} pasos correctos · capturas en ${OUT}`);
process.exit(res.every(Boolean) ? 0 : 1);
