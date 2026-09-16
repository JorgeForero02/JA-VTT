'use strict';
/* El cliente no tiene framework de tests: se comprueba el contrato entre HTML, JS y API. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'public', p), 'utf8');

test('index.html: el formulario tiene nombre, contraseña y las dos pestañas (entrar / crear cuenta)', () => {
  const html = read('index.html');
  assert.match(html, /<form id="loginForm"[^>]*data-mode="login"/);
  assert.match(html, /<input id="loginName"[^>]*autocomplete="username"/);
  assert.match(html, /<input id="loginPassword"[^>]*type="password"[^>]*minlength="6"/);
  assert.match(html, /class="gateTab" data-mode="login"/);
  assert.match(html, /class="gateTab" data-mode="register"/);
  assert.doesNotMatch(html, /No hay contraseña/);
  assert.doesNotMatch(html, /Mini VTT/);
});

test('main.js: envía nombre y contraseña a /api/login o /api/register según la pestaña', () => {
  const js = read('js/main.js');
  assert.match(js, /mode==='register'\?'\/api\/register':'\/api\/login'/);
  assert.match(js, /JSON\.stringify\(\{name,password\}\)/);
  assert.match(js, /function setLoginMode\(mode\)/);
});

test('todos los scripts del cliente compilan', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js'))) {
    assert.doesNotThrow(() => new Function(read('js/' + f)), f);
  }
});

test('cabecera: botón para ocultar el panel lateral, con estado y preferencia guardada', () => {
  const html = read('index.html');
  assert.match(html, /<header>[\s\S]*<button id="panelToggle"[^>]*aria-pressed="false"[^>]*>[\s\S]*<\/header>/);
  const css = read('css/app.css');
  assert.doesNotMatch(css, /#panelToggle\{display:none\}/, 'el botón ya no se oculta en escritorio');
  assert.match(css, /#app\.noPanel main\{grid-template-columns:58px 1fr\}/);
  assert.match(css, /#app\.noPanel #panel\{display:none\}/);
  const js = read('js/editor.js');
  assert.match(js, /localStorage\.setItem\('jav\.panel'/);
  assert.match(js, /classList\.toggle\('noPanel',hidden\)/);
  const icons = read('js/icons.js');
  assert.match(icons, /"panel-right-open"/);
  assert.match(icons, /"panel-right-close"/);
});

test('visión: sin tope de alcance; visión en la oscuridad absoluta; lo iluminado visto queda explorado', () => {
  const render = read('js/render.js');
  assert.doesNotMatch(render, /ftPx\(v\.sight\)/, 'la máscara de visión ya no se recorta por alcance');
  assert.match(render, /createRadialGradient\(v\.x,v\.y,0,v\.x,v\.y,r\);g\.addColorStop\(0,'rgba\(255,255,255,1\)'\)/);
  assert.match(render, /scale:\.2,size:2000,chunks:new Map\(\),max:160,boost:3,blur:2\.5/);
  assert.match(render, /c\.filter=`blur\(\$\{EXP\.blur\*dpr\}px\)`/);
  assert.match(render, /drawImage\(im,0,0,ch\.c\.width,ch\.c\.height\)/, 'la niebla guardada a otra resolución se escala');
  assert.match(render, /for\(let n=0;n<EXP\.boost;n\+\+\)ch\.x\.drawImage\(maskC,0,0\)/);
  const core = read('js/core.js');
  assert.doesNotMatch(core, /v\.sight>0/);
  const editor = read('js/editor.js');
  assert.doesNotMatch(editor, /Alcance máximo/);
  assert.match(editor, /Visión en la oscuridad \(pies\)/);
});

test('linterna sorda de ficha: el dueño puede orientarla (tirador y campo Dirección)', () => {
  const editor = read('js/editor.js');
  assert.match(editor, /function tokenAimHandles\(t\)/);
  assert.match(editor, /ang=e\.altKey\?Math\.round\(ang\/15\)\*15:Math\.round\(ang\)/, 'giro fino por defecto, 15° con Alt');
  assert.match(editor, /\[near,Math\.max\(near\+px\(14\),rr\/2\),rr\]/, 'tres tiradores: ficha, medio, extremo');
  assert.match(editor, /return\{kind:'lightAim',o\}/);
  assert.match(editor, /case 'lightAim':\{const o=A\.o;let ang=Math\.atan2/);
  assert.match(editor, /if\(!gm&&isToken\)\{check\('Encendida'[^\n]*num\('Dirección \(°\)'/);
  const render = read('js/render.js');
  assert.match(render, /if\(!isSel\(t\)\|\|!canControl\(t\)\)continue;\s*const L=tokenLight\(t\);if\(!L\|\|L\.angle>=360\)continue;/);
});

test('maleza: deja ver el fondo, esconde fichas y objetos detrás', () => {
  const core = read('js/core.js');
  assert.match(core, /cover:\{name:'Maleza',icon:'trees',sight:0,light:0,move:0,hide:1/);
  assert.match(core, /if\(kind==='hide'\)return !!\(t\.hide\|\|t\.sight\)/);
  assert.match(core, /canSee\(v,p,'hide'\)/);
  assert.match(core, /function propVisibleToPlayers\(a\)/);
  const render = read('js/render.js');
  assert.match(render, /a\.kind==='prop'&&\(!player\|\|propVisibleToPlayers\(a\)\)/);
});
