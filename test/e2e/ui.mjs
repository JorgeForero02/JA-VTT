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
  for (const channel of ['msedge', 'chrome']) { try { return await chromium.launch({ channel, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); } catch {} }
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

let gm, pl;
try {
  gm = await newPage(); gm.__name = 'gm';
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

  pl = await newPage(); pl.__name = 'player';
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

  // tablero 2.5D: el motor monta su canvas y pinta algo que no es negro
  // (va antes de la recuperación: ésta cierra todas las sesiones del director y le dejaría fuera)
  await gm.goto(BASE + '/#/');
  await gm.waitForSelector('#dashView:not([hidden])');
  await gm.fill('#newBoardName', `Valle ${suffix}`);
  await gm.selectOption('#newBoardMode', '2.5d');
  await gm.click('#newBoardForm button[type=submit]');
  await gm.waitForSelector('#stage canvas.d3', { timeout: 40000 });
  await gm.waitForTimeout(2500);
  // readPixels sobre el canvas ya presentado devuelve 0 (preserveDrawingBuffer es falso): se mide la captura
  const buf = await gm.screenshot({ clip: { x: 600, y: 380, width: 64, height: 64 } });
  const distinct = new Set(buf.slice(100, 4000)).size;
  step('tablero 2.5D: canvas WebGL con imagen (captura no plana)', distinct > 16, String(distinct));
  await shot(gm, '08-tablero-25d');
  const v0 = await gm.evaluate(() => window.D3.version());
  step('2.5D: terreno cargado del servidor (version 0)', v0 === 0, String(v0));
  const railTools = await gm.$$eval('#rail .tool', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.tool));
  step('rail 2.5D del director: select, pan, luz, fichas y herramientas de terreno (regla y planos llegan después)', railTools.join(',') === 'select,pan,light,player,enemy,up,down,paint,object,water', railTools.join(','));

  // panel Mapa 2.5D: los cuatro estilos de arte, uno a uno, con captura
  await gm.click('[data-tab="scene"]');
  await gm.waitForFunction(() => document.querySelectorAll('#style25 .chip').length === 4, null, { timeout: 40000 });
  const zonasHidden = await gm.evaluate(() => getComputedStyle(document.querySelector('[data-fold="zonas"]')).display === 'none');
  step('2.5D: el panel Escena muestra «Mapa 2.5D» y esconde las zonas del 2D', zonasHidden);
  const styleShots = {}, groundShots = {};
  for (const [key, label] of [['pixel', 'Píxel 16'], ['pixel32', 'Píxel 32'], ['drawn', 'Dibujado'], ['packs', 'Packs']]) {
    await gm.click(`#style25 .chip:has-text("${label}")`);
    await gm.waitForFunction((k) => window.D3.debug().style === k, key, { timeout: 40000 });
    await gm.waitForTimeout(2500);
    const buf = await gm.screenshot({ clip: { x: 500, y: 300, width: 200, height: 200 } });
    styleShots[key] = buf.toString('base64').slice(0, 4000);
    // recorte pequeño de una esquina del suelo (sin agua ni fichas todavía): comprueba el ítem extra de
    // esta tarea, chars.restyle reasignando terrainMat.map — si no lo hace, el suelo se queda con el atlas
    // del estilo anterior y este recorte sale igual entre packs y pixel32.
    const gbuf = await gm.screenshot({ clip: { x: 505, y: 305, width: 24, height: 24 } });
    groundShots[key] = gbuf.toString('base64');
    await shot(gm, `09-estilo-${key}`);
  }
  const distinctStyles = new Set(Object.values(styleShots)).size;
  step('2.5D: los cuatro estilos de arte se aplican y se ven distintos', distinctStyles === 4, String(distinctStyles));
  step('2.5D: el suelo cambia de atlas entre estilos (chars.restyle reasigna terrainMat.map)', groundShots.packs !== groundShots.pixel32);
  const vStyle = await gm.evaluate(() => window.D3.version());
  step('2.5D: cada cambio de estilo es una op de terreno (version sube)', vStyle >= 4, String(vStyle));

  const n0 = await gm.evaluate(() => window.D3.settings25().n);
  await gm.click('#grow25');
  await gm.waitForFunction((n) => window.D3.settings25().n === n + 16, n0, { timeout: 40000 });
  step('2.5D: «Ampliar 8 casillas» crece el tablero en local y en el servidor', (await gm.evaluate(() => window.D3.version())) >= 5, `${n0} → ${n0 + 16}`);

  // arte propio: PNG de 32×16 generado aquí (dos piezas de 16), subido a la Biblioteca como Arte 2.5D,
  // la primera pieza pasa a ser la cara superior del material Pasto
  const png = await gm.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 16; const x = c.getContext('2d');
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#00ffff'; x.fillRect(16, 0, 16, 16);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { size: b.size };
  });
  step('2.5D arte: PNG de prueba generado', png.size > 0, String(png.size));
  await gm.click('[data-tab="library"]');
  await gm.click('#upCat button:has-text("Arte 2.5D")');
  await gm.setInputFiles('#libFile', { name: 'piezas.png', mimeType: 'image/png', buffer: await gm.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 16; const x = c.getContext('2d');
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#00ffff'; x.fillRect(16, 0, 16, 16);
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer()));
  }).then((a) => Buffer.from(a)) });
  await gm.waitForFunction(() => document.querySelectorAll('#arte25Imgs button.thumb').length >= 1, null, { timeout: 40000 });
  await gm.click('#arte25Imgs button.thumb');
  await gm.waitForSelector('#arte25Cutter:not([hidden])', { timeout: 40000 });
  // el lienzo se pinta cuando la imagen llega del servidor: el contador de piezas se escribe al final del pintado
  await gm.waitForFunction(() => /pieza/.test(document.getElementById('arte25Sel').textContent), null, { timeout: 40000 });
  const cv = await gm.locator('#arte25Canvas').boundingBox();
  await gm.mouse.click(cv.x + 8, cv.y + 8);   // primera pieza (zoom 2 → 32 px por pieza)
  await gm.click('#arte25Target .chip:has-text("Terreno")');
  const vArt0 = await gm.evaluate(() => window.D3.version());
  await gm.click('#arte25Apply');
  await gm.waitForFunction((v) => window.D3.version() > v && Object.keys(window.D3.customArt().art).length === 1, vArt0, { timeout: 40000 });
  const artKeys = await gm.evaluate(() => Object.keys(window.D3.customArt().art));
  step('2.5D arte: la pieza recortada se aplica al terreno como op y aparece en «Arte en uso»', artKeys[0] === 'tile:0:top' && (await gm.locator('#arte25List .item').count()) >= 1, artKeys.join(','));
  await gm.waitForTimeout(2500);
  await shot(gm, '19-arte-propio-25d');
  await gm.click('#arte25List button:has-text("Quitar")');
  await gm.waitForFunction(() => Object.keys(window.D3.customArt().art).length === 0, null, { timeout: 40000 });
  step('2.5D arte: quitar devuelve el atlas original', true);
  await gm.click('[data-tab="scene"]');

  // el jugador abre el mismo tablero 2.5D y recibe las ops de terreno del director
  const invite25 = (await gm.textContent('#inviteCode')).trim();
  await pl.goto(BASE + '/#/');
  await pl.waitForSelector('#dashView:not([hidden])');
  await pl.fill('#joinCode', invite25);
  await pl.click('#joinForm button[type=submit]');
  // con dos páginas WebGL en swiftshader el montaje puede pasar de 15 s (P-12): se espera al motor, no al canvas
  await pl.waitForFunction(() => window.D3 && window.D3.isMounted() && window.D3.debug() && window.D3.version() >= 0, null, { timeout: 40000 });
  await pl.waitForTimeout(3000);

  const stageBox = await gm.locator('#stage').boundingBox();
  const cx = stageBox.x + stageBox.width / 2;
  const cy = stageBox.y + stageBox.height / 2;

  // el panel Mapa 2.5D ya adelantó la versión (4 cambios de estilo + 1 «Ampliar»): las comprobaciones
  // de aquí en adelante son relativas a esa base, no absolutas
  const vBase = await gm.evaluate(() => window.D3.version());
  await gm.click('#rail [data-tool="up"]');
  await gm.waitForSelector('#subbar .hint', { timeout: 5000 });
  await gm.mouse.click(cx, cy);
  await pl.waitForFunction((v) => window.D3.version() === v, vBase + 1, { timeout: 40000 });
  step('2.5D: la edición del director llega al jugador (version +1)', true);

  await gm.click('#rail [data-tool="paint"]');
  await gm.waitForSelector('#subbar .chip:nth-of-type(2)', { timeout: 5000 });
  await gm.click('#subbar .chip:nth-of-type(2)');
  await gm.mouse.click(cx, cy);
  await pl.waitForFunction((v) => window.D3.version() === v, vBase + 2, { timeout: 40000 });
  step('2.5D: el material pintado llega al jugador (version +2)', true);

  await gm.evaluate(() => {
    const t = { id: S.nextId++, type: 'token', kind: 'player', name: 'Prueba', x: 11 * 50 + 25, y: 11 * 50 + 25,
      color: '#7FB2E5', hidden: false, vision: true, sight: 0, darkvision: 0, size: 1, art: 'guerrera',
      light: { preset: 'torch', on: true, bright: 20, dim: 20, color: '#FFA652', intensity: 1, anim: 'flicker', angle: 360, rot: 0 },
      img: null, owner: null };
    S.tokens.push(t); changed(); Net.tick();
  });
  await pl.waitForFunction(() => window.D3.debug() && window.D3.debug().chars >= 1, null, { timeout: 40000 });
  const seen = await pl.evaluate(() => window.D3.debug());
  step('2.5D: la ficha del director aparece como sprite en la pantalla del jugador', seen.chars >= 1 && seen.lights >= 1, JSON.stringify(seen));
  await shot(pl, '11-ficha-25d-jugador');

  // el director mueve la ficha con dos clics y el jugador la ve cambiar de sitio
  await gm.click('#rail [data-tool="select"]');
  await gm.waitForFunction(() => window.D3.debug() && window.D3.debug().chars >= 1, null, { timeout: 40000 });
  const before = await pl.evaluate(() => S.tokens[0].x + ',' + S.tokens[0].y);
  const pos = (await gm.evaluate(() => window.D3.debug().screen))[0];
  await gm.mouse.click(pos.x, pos.y);
  await gm.waitForFunction(() => getComputedStyle(document.getElementById('selbar')).display !== 'none', null, { timeout: 8000 });
  const selText = await gm.textContent('#selbar .count');
  step('2.5D: elegir una ficha muestra la barra de selección (editar, duplicar, eliminar)', /Prueba/.test(selText), selText.trim());

  // aspecto: el director cambia la criatura de la ficha desde el editor y el jugador ve el sprite nuevo
  await gm.click('#selbar [data-act="edit"]');
  await gm.waitForSelector('#edBody .pick.sprite', { timeout: 40000 });
  const thumbs = await gm.$$eval('#edBody .pick.sprite', (els) => els.map((e) => e.dataset.art));
  step('2.5D: el editor de la ficha ofrece el catálogo de criaturas', thumbs.includes('guerrera') && thumbs.includes('goblin') && thumbs.length >= 12, thumbs.length + ' criaturas');
  await gm.click('#edBody .pick.sprite[data-art="esqueleto"]');
  await pl.waitForFunction(() => (window.D3.debug().screen[0] || {}).kind === 'esqueleto', null, { timeout: 40000 });
  step('2.5D: cambiar el aspecto cambia el sprite en el jugador', true);
  await shot(pl, '20-aspecto-esqueleto-25d');
  await gm.keyboard.press('Escape');
  await gm.waitForTimeout(400);
  // Escape cierra el editor pero también suelta la ficha (window.D3.select(null) en editor.js): hay que
  // volver a pincharla antes del clic que la mueve.
  await gm.mouse.click(pos.x, pos.y);
  await gm.waitForFunction(() => getComputedStyle(document.getElementById('selbar')).display !== 'none', null, { timeout: 8000 });

  await gm.mouse.click(pos.x + 70, pos.y + 40);
  await pl.waitForFunction((b) => S.tokens[0] && S.tokens[0].x + ',' + S.tokens[0].y !== b, before, { timeout: 60000 });
  const after = await pl.evaluate(() => S.tokens[0].x + ',' + S.tokens[0].y);
  step('2.5D: el director mueve la ficha y el jugador la ve en la casilla nueva', after !== before, `${before} → ${after}`);
  await shot(pl, '12-ficha-movida-25d');
  // tocar la ficha elegida la suelta: la barra desaparece
  await gm.waitForTimeout(600);
  const pos2 = (await gm.evaluate(() => window.D3.debug().screen))[0];
  await gm.mouse.click(pos2.x, pos2.y);
  await gm.waitForFunction(() => getComputedStyle(document.getElementById('selbar')).display === 'none', null, { timeout: 8000 });
  step('2.5D: tocar la ficha elegida la suelta y la barra se va', true);

  // crear una ficha con la herramienta del rail
  await gm.click('#rail [data-tool="player"]');
  const box = await gm.locator('#stage').boundingBox();
  await gm.mouse.click(box.x + box.width / 2 - 90, box.y + box.height / 2 + 60);
  await pl.waitForFunction(() => window.D3.debug().chars >= 2, null, { timeout: 40000 });
  step('2.5D: el director crea una ficha tocando una casilla', true);

  // luz suelta con la herramienta Luz: el jugador la recibe como sprite
  const lights0 = await pl.evaluate(() => window.D3.debug().lights);
  await gm.click('#rail [data-tool="light"]');
  await gm.waitForSelector('#subbar .chip', { timeout: 40000 });
  const lampChips = await gm.$$eval('#subbar .chip', (els) => els.map((e) => e.textContent.trim()));
  step('2.5D: la subbarra de Luz lista los presets de JA-VTT', lampChips.includes('Farol') && lampChips.includes('Linterna sorda'), lampChips.slice(0, 5).join(','));
  await gm.click('#subbar .chip:has-text("Farol")');
  const posL = (await gm.evaluate(() => window.D3.debug().screen))[0];
  await gm.mouse.click(posL.x - 70, posL.y - 40);
  await pl.waitForFunction((n) => window.D3.debug().lights > n, lights0, { timeout: 40000 });
  step('2.5D: el director coloca un farol y el jugador lo ve', true);
  await gm.click('#rail [data-tool="select"]');
  await shot(pl, '17-farol-25d');

  // clic derecho sobre la ficha: menú contextual de JA-VTT
  const posR = (await gm.evaluate(() => window.D3.debug().screen))[0];
  await gm.mouse.click(posR.x, posR.y, { button: 'right' });
  await gm.waitForFunction(() => getComputedStyle(document.getElementById('ctx')).display !== 'none', null, { timeout: 8000 });
  const ctxTitle = await gm.textContent('#ctx .ctxTitle');
  step('2.5D: el clic derecho sobre una ficha abre su menú', /Prueba/.test(ctxTitle), ctxTitle.trim());
  await shot(gm, '18-menu-ficha-25d');
  await gm.keyboard.press('Escape');

  // el tablero nuevo nace con visión compartida; la desactivamos para probar el caso ciego
  await gm.evaluate(() => { $('#sharedVision').checked = false; $('#sharedVision').dispatchEvent(new Event('change')); Net.tick(); });
  await pl.waitForFunction(() => S.sharedVision === false, null, { timeout: 10000 });

  // el jugador no controla ninguna ficha: ve el aviso de ciego y nada del mapa
  await pl.waitForFunction(() => window.D3.debug() && window.D3.debug().blind === true, null, { timeout: 40000 });
  const blindShown = await pl.evaluate(() => getComputedStyle(document.getElementById('blindNote')).display !== 'none');
  step('2.5D: el jugador sin fichas ve el aviso de ciego', blindShown);
  await shot(pl, '13-ciego-25d');

  // el director le asigna la ficha: deja de estar ciego y ve con ella
  const plId = await gm.evaluate(() => Net.members.find((m) => m.role === 'player').id);
  await gm.evaluate((uid) => { S.tokens[0].owner = uid; changed(); Net.tick(); }, plId);
  await pl.waitForFunction(() => window.D3.debug() && window.D3.debug().blind === false, null, { timeout: 40000 });
  const dbg = await pl.evaluate(() => window.D3.debug());
  step('2.5D: con una ficha propia el jugador ve con ella', dbg.view === 'party' && dbg.viewers.length >= 1, JSON.stringify(dbg));
  await shot(pl, '14-vista-jugador-25d');

  // el jugador explora moviendo su ficha, recarga la página y la niebla sigue ahí
  const posPl = (await pl.evaluate(() => window.D3.debug().screen.find((s) => s.vid === S.tokens[0].id)));
  await pl.mouse.click(posPl.x, posPl.y);
  await pl.mouse.click(posPl.x + 60, posPl.y - 35);
  await pl.waitForTimeout(2500);
  const exp0 = await pl.evaluate(() => window.D3.debug().explored);
  await pl.evaluate(() => Net.flushFog());
  await pl.waitForTimeout(800);
  await pl.reload();
  // el tablero pasó a 38×38 (panel Mapa 2.5D → «Ampliar 8 casillas»): remontar tarda más que con
  // 22×22 bajo swiftshader y con el resto de la sesión ya cargada; 60 s se quedaba corto (medido: ~45 s
  // en un repro aislado, más con dos pestañas y todo lo demás abierto), así que se amplía a 120 s.
  await pl.waitForFunction(() => window.D3 && window.D3.isMounted() && window.D3.debug(), null, { timeout: 120000 });
  await pl.waitForFunction((n) => window.D3.debug().explored >= n, Math.max(1, exp0 - 2), { timeout: 60000 });
  const exp1 = await pl.evaluate(() => window.D3.debug().explored);
  step('2.5D: la niebla explorada sigue ahí tras recargar', exp0 > 0 && exp1 >= exp0 - 2, `${exp0} → ${exp1}`);
  await shot(pl, '16-niebla-25d');

  // el director alterna Director / Vista de jugador
  const gmView0 = await gm.evaluate(() => window.D3.debug().view);
  await gm.click('#rolePlayer');
  await gm.waitForFunction(() => window.D3.debug().view !== 'gm', null, { timeout: 10000 });
  await shot(gm, '15-director-vista-jugador-25d');
  await gm.click('#roleGm');
  await gm.waitForFunction(() => window.D3.debug().view === 'gm', null, { timeout: 10000 });
  step('2.5D: el director alterna entre su vista y la del grupo', gmView0 === 'gm');
  step('2.5D: el panel Mapa 2.5D vuelve a estar activo tras alternar la vista', !(await gm.evaluate(() => document.getElementById('fogAlpha25').disabled)));

  await pl.evaluate(() => Net.terrain({ type: 'cells', cells: [{ i: 1, h: 9 }] }));
  await pl.waitForTimeout(1000);
  const plVersion = await pl.evaluate(() => window.D3.version());
  const gmVersion = await gm.evaluate(() => window.D3.version());
  step('2.5D: el jugador no puede editar el terreno', plVersion === vBase + 2 && gmVersion === vBase + 2, `pl=${plVersion}, gm=${gmVersion}`);

  await shot(pl, '09-tablero-25d-jugador');
  await gm.click('#rail [data-tool="paint"]');
  await gm.waitForSelector('#subbar .chip:nth-of-type(2)', { timeout: 5000 });
  await shot(gm, '10-subbar-2.5d');

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
  if (errors.length) console.log('errores de consola hasta el fallo:\n  ' + errors.slice(0, 10).join('\n  '));
  try { console.log('diag gm', await gm.evaluate(() => JSON.stringify({ v: window.D3.version(), tool: UI.tool, dbg: window.D3.debug() }))); console.log('diag pl', await pl.evaluate(() => JSON.stringify({ v: window.D3.version(), dbg: window.D3.debug(), mode: S.mode }))); } catch (e2) { console.log('diag', e2.message); }
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} pasos correctos · capturas en ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
