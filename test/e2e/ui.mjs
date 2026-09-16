#!/usr/bin/env node
/* Prueba visual con Playwright y el Edge/Chrome instalado en el PC (no descarga navegadores).
   Uso: BASE_URL=http://localhost:3999 node test/e2e/ui.mjs [carpeta-capturas]
   Registra director y jugador, crea un tablero, y comprueba en dos pestañas: chat, dados 3D,
   iniciativa (oculta/mostrada), perfil con código de recuperación y recuperación de contraseña. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${page.__name}] ${m.text()}`); });
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

  // director apaga chat: la pestaña desaparece al jugador
  await gm.uncheck('#chatEnabled');
  await pl.waitForFunction(() => document.querySelector('[data-tab="chat"]').style.display === 'none', null, { timeout: 5000 });
  step('chat: al desactivarlo, el jugador pierde la pestaña', true);

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
