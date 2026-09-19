#!/usr/bin/env node
/* Prueba visual con Playwright y el Edge/Chrome instalado en el PC (no descarga navegadores).
   Uso: BASE_URL=http://localhost:3999 node test/e2e/ui.mjs [carpeta-capturas]
   Registra director y jugador, crea un tablero, y comprueba en dos pestañas: chat, dados 3D,
   iniciativa (oculta/mostrada), perfil con código de recuperación y recuperación de contraseña. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* Píxeles RGBA de una captura PNG de Playwright (8 bits, RGB o RGBA, sin entrelazado): para medir colores
   con tolerancia en vez de comparar bytes (la bruma y la luz animada cambian la captura entre fotogramas). */
function pngPixels(buf) {
  let pos = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 2 ? 3 : 4; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0, b = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = (src[i] + p) & 255;
    }
  }
  return { w, h, ch, px: out };
}

const BASE = process.env.BASE_URL || 'http://localhost:3999';
const OUT = process.argv[2] || path.join(process.cwd(), 'test', 'e2e', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const suffix = Date.now().toString(36);
const results = [];
const step = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

async function launch() {
  for (const channel of ['msedge', 'chrome']) { try { return await chromium.launch({ channel, headless: true }); } catch {} }
  throw new Error('No hay Edge ni Chrome instalados');
}
const browser = await launch();
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  // los errores de WebGL de Chrome llegan como warning: cuentan igual
  page.on('console', (m) => { if (m.type() === 'error' || /GL_INVALID|WebGL/.test(m.text())) errors.push(`[${page.__name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${page.__name}] ${e.message}`));
  return page;
}
async function register(page, name, password) {
  await page.goto(BASE + '/');
  await page.click('.gateTab[data-mode="register"]');
  await page.fill('#loginName', name); await page.fill('#loginPassword', password);
  await page.click('#loginSubmit');
  await page.waitForSelector('#recoveryPop:not([hidden])', { timeout: 8000 });
  const code = await page.textContent('#recoveryCodeNew');
  await page.click('#recoveryOk');
  await page.waitForSelector('#dashView:not([hidden])');
  return code.trim();
}

try {
  const gm = await newPage(); gm.__name = 'gm';
  const gmCode = await register(gm, `dir-${suffix}`, 'secreto1');
  step('registro muestra código de recuperación', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(gmCode), gmCode);
  await shot(gm, '01-panel');

  // perfil: código oculto → mostrar → coincide
  await gm.click('#profileBtn');
  await gm.waitForSelector('#profilePop:not([hidden])');
  await gm.waitForTimeout(400);
  const hidden = await gm.textContent('#recoveryCode');
  await gm.click('#recoveryShow');
  const shown = await gm.textContent('#recoveryCode');
  step('perfil: código oculto y luego visible', hidden.includes('•') && shown.trim() === gmCode);
  await shot(gm, '02-perfil');
  await gm.click('#profileClose');

  // tablero
  await gm.fill('#newBoardName', 'Mesa UI');
  await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForSelector('#app:not([hidden])');
  await gm.waitForTimeout(800);
  const boardId = (await gm.evaluate(() => location.hash)).split('/').pop();
  await gm.click('[data-tab="live"]');
  const invite = (await gm.textContent('#inviteCode')).trim();
  step('tablero creado con código de invitación', /^[A-Z2-9]{6}$/.test(invite), invite);

  const pl = await newPage(); pl.__name = 'player';
  await register(pl, `jug-${suffix}`, 'secreto1');
  await pl.fill('#joinCode', invite);
  await pl.click('#joinForm button[type=submit]');
  await pl.waitForSelector('#app:not([hidden])');
  await pl.waitForTimeout(800);
  step('jugador dentro del tablero', (await pl.evaluate(() => location.hash)).endsWith(boardId));

  // chat: jugador escribe, director recibe
  await pl.click('[data-tab="chat"]');
  await pl.fill('#chatInput', 'hola desde el jugador');
  await pl.press('#chatInput', 'Enter');
  await gm.click('[data-tab="chat"]');
  await gm.waitForSelector('.chatMsg.text', { timeout: 5000 });
  step('chat: el mensaje del jugador llega al director', (await gm.textContent('#chatLog')).includes('hola desde el jugador'));

  // dados: jugador pulsa d20; ambos ven la tirada y la capa 3D existe
  await pl.click('#diceBar .die[data-d="20"]');
  await gm.waitForSelector('.chatMsg.roll', { timeout: 5000 });
  await pl.waitForTimeout(900);
  const dieLayer = await pl.evaluate(() => { const c = document.getElementById('diceLayer'); return c ? { w: c.width, h: c.height } : null; });
  step('dados: la tirada llega al chat de ambos', (await pl.locator('.chatMsg.roll').count()) === 1 && (await gm.locator('.chatMsg.roll').count()) === 1);
  step('dados: capa 3D creada sobre el mapa', !!dieLayer && dieLayer.w > 0, JSON.stringify(dieLayer));
  await shot(pl, '03-dados-jugador');
  await pl.fill('#chatInput', '/r 2d6+3 # Daño');
  await pl.press('#chatInput', 'Enter');
  await gm.waitForFunction(() => document.querySelectorAll('.chatMsg.roll').length === 2, null, { timeout: 5000 });
  step('dados: /r 2d6+3 con etiqueta', (await gm.textContent('.chatMsg.roll:last-child')).includes('Daño'));
  // bandeja: 4×d6 + 2×d8 y Tirar
  for (let i = 0; i < 4; i++) await pl.click('#diceBar .die[data-d="6"]');
  await pl.click('#diceBar .die[data-d="8"]'); await pl.click('#diceBar .die[data-d="8"]');
  const trayText = await pl.textContent('#trayFormula');
  await pl.click('#trayRoll');
  await gm.waitForFunction(() => document.querySelectorAll('.chatMsg.roll').length === 3, null, { timeout: 5000 });
  step('bandeja: varios dados a la vez (4d6 + 2d8)', trayText.trim() === '2d8 + 4d6' && (await gm.textContent('.chatMsg.roll:last-child')).includes('2d8+4d6'), trayText.trim());
  await pl.waitForTimeout(1500);
  await shot(pl, '04b-bandeja');
  await pl.waitForTimeout(1200);
  await shot(pl, '04-dados-2d6');

  // iniciativa: oculta por defecto para el jugador; el director la crea y la muestra
  await gm.click('[data-tab="live"]');
  await gm.click('#initAddCustom'); await gm.click('#initAddCustom');
  await gm.waitForTimeout(300);
  await gm.click('#initRollAll');
  await gm.waitForTimeout(400);
  const gmBar = await gm.evaluate(() => !document.getElementById('initBar').hidden);
  const plBarHidden = await pl.evaluate(() => document.getElementById('initBar').hidden);
  step('iniciativa: el director ve la barra; el jugador no (oculta por defecto)', gmBar && plBarHidden);
  await gm.check('#initiativeShown');
  await pl.waitForFunction(() => !document.getElementById('initBar').hidden, null, { timeout: 5000 });
  step('iniciativa: al mostrarla, el jugador la ve', true);
  await gm.click('#initNext');
  await pl.waitForFunction(() => document.querySelectorAll('#initBarEntries .initEntry')[1]?.classList.contains('current'), null, { timeout: 5000 });
  step('iniciativa: «Siguiente» mueve el turno en el jugador', true);
  await shot(gm, '05-iniciativa-director');
  await shot(pl, '06-iniciativa-jugador');

  // tirada privada del director: sólo él la ve
  await gm.click('[data-tab="chat"]');
  await gm.click('#secretRoll');
  await gm.click('#diceBar .die[data-d="20"]');
  await gm.waitForSelector('.chatMsg.roll.secret', { timeout: 5000 });
  await pl.waitForTimeout(600);
  step('tirada privada: el director la ve marcada, el jugador no la recibe', (await pl.locator('.chatMsg.roll').count()) === 3 && (await gm.locator('.chatMsg.roll').count()) === 4);
  await gm.click('#secretRoll');
  await shot(gm, '05b-tirada-privada');

  // director apaga el chat (Ajustes): nadie escribe, la pestaña sigue por los dados; apaga dados: la pestaña desaparece para todos
  await gm.click('[data-tab="layers"]');
  await gm.uncheck('#chatEnabled');
  await pl.waitForFunction(() => document.getElementById('chatForm').style.display === 'none' && document.querySelector('[data-tab="chat"]').style.display !== 'none', null, { timeout: 5000 });
  step('chat apagado: el jugador pierde la caja de texto pero conserva los dados', true);
  await gm.uncheck('#diceEnabled');
  await pl.waitForFunction(() => document.querySelector('[data-tab="chat"]').style.display === 'none', null, { timeout: 5000 });
  const gmTabHidden = await gm.evaluate(() => document.querySelector('[data-tab="chat"]').style.display === 'none');
  step('chat y dados apagados: la pestaña desaparece para jugador y director', gmTabHidden);
  await gm.check('#chatEnabled'); await gm.check('#diceEnabled');
  await pl.waitForFunction(() => document.querySelector('[data-tab="chat"]').style.display !== 'none', null, { timeout: 5000 });

  // clima 2D: el director pone tormenta (Escena → Clima); la capa Pixi se monta entre la escena y el brillo en
  // director y jugador (las librerías se cargan sólo ahora); «Sin clima» la destruye en ambos
  await gm.click('[data-tab="scene"]');
  await gm.click('#envGrid button:nth-child(2)');   // exterior de día: se ve el tablero refractado
  // columnas de la cuadrícula (perfil de brillo por columna): la copia refractada debe caer sobre las mismas
  const gridCols = async (page) => { const png = pngPixels(await page.screenshot({ clip: { x: 560, y: 60, width: 400, height: 600 } })); const cols = []; for (let x = 0; x < png.w; x++) { let t = 0; for (let y = 0; y < png.h; y++) t += png.px[(y * png.w + x) * png.ch + 1]; cols.push(t / png.h); } const peaks = cols.map((v, i) => [v - (cols[i - 2] + cols[i + 2]) / 2 || 0, i]).filter(([d]) => d > 2).map(([, i]) => i); return peaks.filter((v, i) => i === 0 || v - peaks[i - 1] > 1).slice(0, 14); };
  await gm.evaluate(() => { UI.cam.zoom = 1; requestRender(); }); await gm.waitForTimeout(400);
  const colsBefore = await gridCols(gm);
  // zona interior (cueva) a la izquierda: bajo techo no se nota el clima salvo que el director marque el tipo
  await gm.evaluate(() => { addObj({ id: nid(), type: 'zone', name: 'Cueva', x: UI.cam.x - 400, y: UI.cam.y - 150, w: 300, h: 300 }); changed(); });
  await gm.waitForTimeout(500);
  const stageBox = await gm.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const meanAt = async (page, x, y) => { const png = pngPixels(await page.screenshot({ clip: { x, y, width: 60, height: 60 } })); let g = 0; for (let i = 0; i < png.w * png.h; i++) g += png.px[i * png.ch + 1]; return g / (png.w * png.h); };
  const inZone = [stageBox.l + stageBox.w / 2 - 280, stageBox.t + stageBox.h / 2 - 30], outZone = [stageBox.l + stageBox.w / 2 + 200, stageBox.t + stageBox.h / 2 - 30];
  const zoneBefore = { in: await meanAt(gm, ...inZone), out: await meanAt(gm, ...outZone) };
  await gm.selectOption('#weatherId', 'fog');
  await gm.waitForFunction(() => !!document.getElementById('cWeather') && Weather.mounted(), null, { timeout: 20000 });
  await gm.waitForTimeout(1500);
  const colsFog = await gridCols(gm);
  // columnas de la cuadrícula = cadena a 50 px (zoom 1); otras columnas (barra de iniciativa, etiquetas) se ignoran
  const gridChain = (c) => c.filter((v) => c.some((u) => Math.abs(u - v - 50) <= 1) || c.some((u) => Math.abs(v - u - 50) <= 1));
  // la niebla baja el contraste y alguna columna cae bajo el umbral: basta con que 4 de la cadena coincidan ±1 px
  const aligned = gridChain(colsBefore).length >= 5 && gridChain(colsBefore).filter((c) => colsFog.some((f) => Math.abs(f - c) <= 1)).length >= 4;
  step('clima: la copia refractada del tablero no se escala ni desplaza (cuadrícula en las mismas columnas ±1 px)', aligned, `${colsBefore.slice(0, 6)} → ${colsFog.slice(0, 6)}`);
  const zoneFog = { in: await meanAt(gm, ...inZone), out: await meanAt(gm, ...outZone) };
  step('clima: dentro de la zona interior no hay niebla (píxeles como sin clima); fuera sí', Math.abs(zoneFog.in - zoneBefore.in) <= 4 && zoneFog.out - zoneBefore.out > 10, JSON.stringify({ zoneBefore, zoneFog }));
  await gm.check('#weatherIndoor');
  await gm.waitForTimeout(1500);
  const indoorSync = { gm: await gm.evaluate(() => JSON.stringify(S.weather)), pl: await pl.evaluate(() => JSON.stringify(S.weather)) };
  const zoneIndoor = await meanAt(gm, ...inZone);
  step('clima: «Se nota en zonas interiores» (por tipo) mete la niebla en la cueva y llega al jugador', zoneIndoor - zoneBefore.in > 10 && /"indoor":\{"fog":true\}/.test(indoorSync.pl), `${zoneBefore.in.toFixed(1)} → ${zoneIndoor.toFixed(1)} · ${JSON.stringify(indoorSync)}`);
  await gm.uncheck('#weatherIndoor'); await gm.waitForTimeout(300);
  await gm.selectOption('#weatherId', 'storm');
  const weatherLayer = (page) => page.evaluate(() => { const c = document.getElementById('cWeather'); return c ? { w: c.width, prev: c.previousElementSibling.id, next: c.nextElementSibling.id, pixi: typeof PIXI } : null; });
  await gm.waitForFunction(() => !!document.getElementById('cWeather') && Weather.mounted(), null, { timeout: 20000 });
  await pl.waitForFunction(() => !!document.getElementById('cWeather') && Weather.mounted(), null, { timeout: 20000 });
  const wGm = await weatherLayer(gm), wPl = await weatherLayer(pl);
  step('clima: tormenta montada en director y jugador entre cScene y cGlow', wGm && wPl && wGm.w > 0 && wPl.w > 0 && wGm.prev === 'cScene' && wGm.next === 'cGlow' && wPl.prev === 'cScene', JSON.stringify(wPl));
  await pl.waitForFunction(() => S.weather && S.weather.id === 'storm', null, { timeout: 5000 });
  step('clima: el jugador recibe el ajuste saneado', (await pl.evaluate(() => JSON.stringify(S.weather))) === '{"id":"storm","intensity":0.6,"wind":0}', await pl.evaluate(() => JSON.stringify(S.weather)));
  step('clima: el panel del director muestra intensidad y viento sólo con clima', await gm.evaluate(() => document.querySelector('.weatherOnly').style.display === ''));
  await gm.waitForTimeout(2500);
  await shot(gm, '05c-clima-tormenta');
  // el canvas de la escena cambia de tamaño (ventana, paneles): la textura fuente debe seguirle sin errores de WebGL
  const glBefore = errors.filter((e) => /WebGL|GL_INVALID/.test(e)).length;
  await gm.setViewportSize({ width: 1600, height: 1000 });
  await gm.waitForTimeout(1200);
  await gm.setViewportSize({ width: 1100, height: 700 });
  await gm.waitForTimeout(1200);
  await gm.setViewportSize({ width: 1400, height: 860 });
  await gm.waitForTimeout(1200);
  // y la copia refractada no queda estirada: el paso de la cuadrícula sigue siendo 50 px (zoom 1)
  await gm.selectOption('#weatherId', 'fog'); await gm.waitForTimeout(800);   // sin ondas de agua que muevan la cuadrícula
  await gm.click('#panelToggle'); await gm.waitForTimeout(1200);
  const colsClosed = await gridCols(gm);
  await gm.click('#panelToggle'); await gm.waitForTimeout(1200);
  const colsOpen = await gridCols(gm);
  const step50 = (c) => gridChain(c).length >= 5;
  step('clima: al abrir/cerrar el panel el mapa refractado no se estira (paso de cuadrícula 50 px)', step50(colsClosed) && step50(colsOpen), `cerrado ${colsClosed} · abierto ${colsOpen}`);
  const glErrors = errors.filter((e) => /WebGL|GL_INVALID/.test(e)).slice(glBefore);
  step('clima: redimensionar la ventana con clima no produce errores de WebGL (textura fuente sigue al canvas)', glErrors.length === 0, glErrors[0] || '');
  await gm.selectOption('#weatherId', 'none');
  await gm.waitForFunction(() => !document.getElementById('cWeather') && !Weather.mounted(), null, { timeout: 10000 });
  await pl.waitForFunction(() => !document.getElementById('cWeather') && !Weather.mounted(), null, { timeout: 10000 });
  step('clima: «Sin clima» destruye la capa en director y jugador', await gm.evaluate(() => document.querySelector('.weatherOnly').style.display === 'none'));
  await gm.click('#envGrid button:nth-child(1)');

  // recuperación de contraseña desde la pantalla de entrada
  const rec = await newPage(); rec.__name = 'recover';
  await rec.goto(BASE + '/');
  await rec.click('#forgotBtn');
  await rec.fill('#loginName', `dir-${suffix}`);
  await rec.fill('#loginCode', gmCode.toLowerCase());
  await rec.fill('#loginPassword', 'nueva1234');
  await rec.click('#loginSubmit');
  await rec.waitForSelector('#dashView:not([hidden])', { timeout: 8000 });
  step('recuperación: nombre + código ponen contraseña nueva y entran', true);
  await shot(rec, '07-recuperacion');

  const realErrors = errors.filter((e) => !/favicon|ERR_INTERNET|net::ERR|status of 401/.test(e)); // el 401 de /api/me sin sesión es esperado
  step('sin errores de consola', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
} catch (e) {
  step('excepción en la prueba', false, e.message);
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} pasos correctos · capturas en ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
