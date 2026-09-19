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
  assert.match(js, /register:'\/api\/register',recover:'\/api\/recover'/);
  assert.match(js, /const payload=\{name,password\}/);
  assert.match(js, /function setLoginMode\(mode\)/);
});

test('todos los scripts del cliente compilan', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js') && f !== 'dice3d.js')) {
    assert.doesNotThrow(() => new Function(read('js/' + f)), f);
  }
  // dice3d.js es un módulo ES (import/export): se comprueba como tal
  assert.match(read('js/dice3d.js'), /^import \* as THREE from '\.\/vendor\/three\.module\.min\.js';$/m);
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
  assert.match(render, /c\.filter=`blur\(\$\{EXP\.blur\*d\}px\)`/);
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

test('muros: las articulaciones se arrastran con cualquier número de muros seleccionados y desde la herramienta de muros', () => {
  const editor = read('js/editor.js');
  assert.doesNotMatch(editor, /UI\.selected\.length<=8/);
  assert.match(editor, /function startWallEnd\(pt,snap\)/);
  assert.match(editor, /function hitWallVertex\(p\)/);
  assert.match(editor, /if\(!UI\.chain&&!UI\.curve&&!UI\.arc&&UI\.wallShape==='chain'\)\{const v=hitWallVertex\(p\);if\(v\)\{startWallEnd\(v\);return\}\}/);
  const render = read('js/render.js');
  assert.match(render, /const big=isSel\(w\)\|\|UI\.tool==='wall'/);
});

test('chat, dados, iniciativa y perfil: piezas del cliente en su sitio', () => {
  const html = read('index.html');
  for (const id of ['tab-chat', 'chatLog', 'diceBar', 'chatForm', 'initBar', 'initList', 'chatEnabled', 'initiativeShown', 'profileBtn', 'profilePop', 'recoveryCode', 'recoveryPop', 'forgotBtn', 'loginCode', 'passwordForm']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /<script type="module" src="js\/dice3d\.js"><\/script>/);
  const net = read('js/net.js');
  assert.match(net, /case 'chat':Chat\.receive\(d\.msg\)/);
  assert.match(net, /case 'initiative':UI\.initiative=d\.initiative\|\|null;renderInitiative\(\)/);
  assert.match(net, /'chatEnabled','diceEnabled','initiativeShown'\]/);
  const editor = read('js/editor.js');
  assert.match(editor, /function syncChatTab\(\)/);
  assert.match(editor, /Dice3D\.roll\(\$\('#stageWrap'\),m\.body\.dice,m\.user_color,Math\.abs\(m\.id\)\)/);
  assert.match(editor, /const show=i&&i\.entries\.length&&\(gm\|\|S\.initiativeShown===true\)/);
  const main = read('js/main.js');
  assert.match(main, /recover:'\/api\/recover'/);
  assert.match(main, /apiJson\('\/api\/me\/recovery'\)/);
  const dice = read('js/dice3d.js');
  assert.match(dice, /const geo = src\.index \? src\.toNonIndexed\(\) : src;/);
  assert.match(dice, /Math\.max\(0, now - start\)/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'vendor', 'three.module.min.js')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'vendor', 'cannon-es.js')));
});

test('ajustes de chat/dados para todos, tirada privada, favicon propio', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'favicon.svg')));
  assert.match(html, /id="tab-layers">\s*<details class="fold gmSect" data-fold="mesa"/, 'los interruptores viven en Ajustes');
  assert.match(html, /id="diceEnabled"/);
  assert.match(html, /class="die secretToggle gmOnly" id="secretRoll"/);
  const editor = read('js/editor.js');
  assert.match(editor, /const chat=S\.chatEnabled!==false,dice=S\.diceEnabled!==false;/);
  assert.match(editor, /rs|gr|privada/, 'comandos de tirada privada');
  const net = read('js/net.js');
  assert.match(net, /roll\(formula,label,secret\)\{return send\(\{t:'roll',formula,label,secret:!!secret\}\)\}/);
  const css = read('css/app.css');
  assert.match(css, /\.initBar\{[^}]*color:#E9E3D5\}/, 'la barra de iniciativa no depende del tema');
  const dice = read('js/dice3d.js');
  assert.match(dice, /function faceFrame\(solid, f, sides\)/);
  assert.match(dice, /const size = fr\.inR \* half \*/, 'el número se escala al radio inscrito de la cara');
});

test('luces suaves: siguen la posición interpolada y el parpadeo va a 30 fps', () => {
  const core = read('js/core.js');
  assert.match(core, /const P=displayPos\(t\);return\{x:P\.x,y:P\.y,bright:L\.bright/);
  assert.match(core, /const P=displayPos\(l\);out\.push\(\{x:P\.x,y:P\.y/);
  assert.match(read('js/render.js'), /else if\(anim&&animateThisFrame\(\)\)\{lastAnim=ts;frame\.sources=null;const t0=performance\.now\(\);drawAll\(ts\/1000,true\)/, 'los frames de animación sólo redibujan las luces');
  assert.match(read('js/render.js'), /ts-lastNet>40/);
  assert.match(read('js/net.js'), /const SMOOTH_TAU=70;/);
  assert.match(read('js/net.js'), /function chase\(state,tx,ty\)/);
  assert.match(read('js/net.js'), /\(c\.type==='token'\|\|c\.type==='light'\)&&\(old\.x!==c\.x\|\|old\.y!==c\.y\)/);
});

test('luces: transición brillante→tenue ancha y pulso contenido', () => {
  const render = read('js/render.js');
  assert.match(render, /g\.addColorStop\(Math\.max\(0,b-\.1\),`rgba\(255,255,255,\$\{top\}\)`\);g\.addColorStop\(Math\.min\(\.97,b\+\.14\)/);
  assert.match(read('js/core.js'), /if\(src\.anim==='pulse'\)\{const n=Math\.sin\(t\*1\.3\+s\);return\{r:1\+n\*\.035,rb:1\+n\*\.1,i:1,g:1\}\}/, 'el pulso es sólo espacial');
  assert.match(read('js/editor.js'), /const Tray=\(\(\)=>\{/);
  assert.match(read('index.html'), /id="diceTray"/);
  assert.match(render, /mode==='mask'\?f\.i:\(f\.g\?\?f\.i\)/);
});

test('render: capas de luz a escala 1 y exploración desenfocada cacheada entre fotogramas', () => {
  const render = read('js/render.js');
  assert.match(render, /ldpr=Math\.min\(dpr,PERF\.scale\);/);
  assert.match(render, /const LIGHT_LAYERS=\(\)=>\[maskC,losC,expC,cv\.glow,cv\.dark\];/);
  assert.match(render, /function setWorld\(ctx\)\{const z=UI\.cam\.zoom,d=scaleOf\(ctx\);/);
  assert.match(render, /if\(!lightsOnly\)composeExplored\(\);/);
});

test('exportar: usedImageIds existe y recoge las imágenes de objetos y fichas', () => {
  const editor = read('js/editor.js');
  assert.match(editor, /function usedImageIds\(\)\{const ids=new Set\(\);for\(const a of S\.assets\)if\(a\.img\)ids\.add\(a\.img\);for\(const t of S\.tokens\)if\(t\.img\)ids\.add\(t\.img\);return \[\.\.\.ids\]\}/);
});

test('render adaptativo: mide el fotograma de luz y baja escala/cadencia si no cabe en el frame', () => {
  const render = read('js/render.js');
  assert.match(render, /const PERF=\{scale:1,ms:0,frameMs:16\.7/);
  assert.match(render, /if\(ms>budget\)\{PERF\.fast=0;if\(\+\+PERF\.slow>12&&PERF\.scale>\.5\)\{PERF\.scale=\.5;PERF\.slow=0;resize\(\)\}\}/);
  assert.match(render, /function animateThisFrame\(\)\{if\(PERF\.scale>=1\)return true;PERF\.skip\^=1;return PERF\.skip===0\}/, 'cadencia por conteo de frames, no por tiempo (evita la realimentación)');
  assert.equal((render.match(/^requestAnimationFrame\(loop\);$/gm) || []).length, 0, 'el bucle lo arranca main.js una sola vez');
  assert.match(render, /function noteFrame\(ts\)/);
  assert.match(render, /ldpr=Math\.min\(dpr,PERF\.scale\);/);
  assert.match(read('js/editor.js'), /Render de luz: \$\{PERF\.ms\.toFixed\(1\)\} ms/);
});

test('render: toda función usada en render.js está definida en algún script del cliente', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js') && f !== 'dice3d.js');
  const all = files.map((f) => read('js/' + f)).join('\n');
  const defined = new Set([...all.matchAll(/(?:^|[\s;{}])(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const render = read('js/render.js');
  for (const name of ['hexA', 'lightShape', 'buildLightMask', 'drawGlow', 'drawDarkness', 'composeExplored', 'drawOverlay', 'drawScene', 'buildLosMask', 'displayPos', 'cursorPos', 'tokenLight', 'lightSources', 'animFactor', 'clamp', 'ftPx', 'tracePoly', 'roundRect', 'iconImage', 'viewRect', 'expChunk', 'setWorld', 'setRaw', 'setScreen', 'scaleOf', 'notePerf', 'noteFrame', 'animateThisFrame']) {
    assert.ok(defined.has(name), `${name} usada en render.js pero no definida`);
  }
  assert.match(render, /function hexA\(hex,a\)/);
});

test('render: dithering de la máscara de luz contra el banding', () => {
  const render = read('js/render.js');
  assert.match(render, /function dither\(c,op\)/);
  assert.match(render, /img\.data\[i\+3\]=Math\.random\(\)<\.5\?0:1/);
  assert.doesNotMatch(render, /dither\(c\);\s*c\.globalCompositeOperation='destination-out';\s*for\(const s of src\)/, 'el ruido nunca va a la máscara: la exploración lo acumularía');
  assert.match(render, /c\.drawImage\(maskC,0,0\);\s*dither\(c,'destination-out'\);/);
});

/* ---------- Clima 2D (WeatherFX sobre PixiJS, vendorizados y cargados sólo con clima) ---------- */
test('vendor: pixi.min.js 7.4.2 (MIT) y weather-fx.js están vendorizados', () => {
  const pixi = read('js/vendor/pixi.min.js');
  assert.match(pixi.slice(0, 400), /pixi\.js - v7\.4\.2/);
  assert.match(pixi.slice(0, 400), /MIT License/);
  assert.match(read('js/vendor/pixi.LICENSE'), /The MIT License/);
  assert.match(read('js/vendor/weather-fx.js'), /class WeatherFX/);
});

test('clima: la lista de efectos es la misma en core.js, rules.js y vendor/weather-fx.js; viaja como ajuste de escena', () => {
  const vendorIds = [...read('js/vendor/weather-fx.js').matchAll(/^WeatherFX\.register\(\{\s*\n?\s*id: '([a-z]+)'/gm)].map((m) => m[1]);
  assert.ok(vendorIds.length >= 10, 'la librería registra sus efectos');
  const R = require('../server/rules');
  assert.deepEqual(R.WEATHER_IDS, ['none', ...vendorIds]);
  const core = read('js/core.js');
  const m = core.match(/^const WEATHERS=\{([^\n]*)\};?$/m);
  assert.ok(m, 'core.js define WEATHERS');
  assert.deepEqual([...m[1].matchAll(/(\w+):\{/g)].map((x) => x[1]), R.WEATHER_IDS);
  assert.match(core, /weather:\{id:'none',intensity:\.6,wind:0\}/);
  assert.match(read('js/net.js'), /const SCENE_KEYS=\[[^\]]*'weather'/);
});
