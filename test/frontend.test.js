'use strict';
/* El cliente no tiene framework de tests: se comprueba el contrato entre HTML, JS y API. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
  // el motor 2.5D son módulos ES: se compilan tras quitar import/export
  const d3 = path.join(__dirname, '..', 'public', 'js', 'd3');
  for (const f of fs.readdirSync(d3).filter((f) => f.endsWith('.js'))) {
    const src = read('js/d3/' + f).replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
    assert.doesNotThrow(() => new Function(src), 'd3/' + f);
  }
});

test('motor 2.5D: módulos ES sobre three r170, sin DOM del diorama', () => {
  // T11: engine.js se disolvió en 12 módulos; index.js crea el motor y expone window.D3
  const d3 = path.join(__dirname, '..', 'public', 'js', 'd3');
  for (const f of ['ctx', 'art', 'water', 'fx', 'vision', 'chars', 'camera', 'input', 'terrain', 'world', 'index', 'packmap']) assert.ok(fs.existsSync(path.join(d3, f + '.js')), f + '.js');
  assert.ok(!fs.existsSync(path.join(d3, 'engine.js')), 'engine.js ya no existe');
  const idx = read('js/d3/index.js'), cam = read('js/d3/camera.js');
  assert.match(idx, /^import \* as THREE from '\.\.\/vendor\/three\.module\.min\.js';$/m);
  assert.match(idx, /export function createEngine\(stage,opts\)/);
  const all = ['ctx', 'art', 'water', 'fx', 'vision', 'chars', 'camera', 'input', 'terrain', 'world', 'index'].map((f) => read('js/d3/' + f + '.js')).join('\n');
  for (const bad of ['WebGLMultisampleRenderTarget', "getElementById('view')", "getElementById('hint')", 'localStorage', 'PACK_SRC', 'renderPanel(', 'window.innerWidth', "from './engine.js'"]) assert.ok(!all.includes(bad), 'no debe quedar: ' + bad);
  assert.match(cam, /WebGLRenderTarget\(1,1,\{format:T3\.RGBAFormat,samples:4\}\)/);
  assert.match(idx, /outputColorSpace=THREE\.LinearSRGBColorSpace/);
  assert.match(idx, /ColorManagement\.enabled=false/);
  assert.match(cam, /sun\.intensity=envCur\.si\*Math\.PI/);
  // sombras suaves: onBeforeCompile recibe la plantilla sin expandir, así que se parchea el chunk
  const vis = read('js/d3/vision.js');
  assert.match(vis, /ShaderChunk\.lights_fragment_begin/);
  const shadowRe = /getShadow\( directionalShadowMap\[ i \][^;]*\) : 1\.0;/;
  assert.match(vis, /lights_fragment_begin\.replace\(\/getShadow\\\( directionalShadowMap/);
  const three = read('js/vendor/three.module.min.js');
  const chunk = JSON.parse('"' + three.match(/lights_fragment_begin:"((?:[^"\\]|\\.)*)"/)[1] + '"');
  assert.match(chunk, shadowRe, 'el regex de sombras debe casar con el chunk real de r170');
  assert.match(chunk.replace(shadowRe, (m) => 'mix(1.0,' + m.slice(0, -7) + ',uShadow) : 1.0;'), /\? mix\(1\.0,getShadow\( directionalShadowMap\[ i \][^;]*\),uShadow\) : 1\.0;/);
  // setEnv rehace niebla, bruma y visión; el entorno del tablero se aplica de golpe al montar
  assert.match(idx, /function setEnv\(env,amb,snap\)\{[\s\S]*?S\.fogAlpha=P\.fogA;S\.mist=P\.mist;S\.dark=null;G\.visionDirty=true;[\s\S]*?applyEnv\(!!snap\);/);
  assert.match(idx, /if\(opts\.env\)setEnv\(opts\.env,opts\.ambient\|\|0,true\)/);
  assert.match(read('js/render.js'), /env:S\.env,ambient:S\.ambient/);
  assert.match(idx, /function stop\(\)\{stopped=true;/);
  assert.match(idx, /await loadPacks\(\);[\s\S]*?if\(stopped\)return;/);
  assert.match(read('js/d3/art.js'), /^export function loadStyle\(key\)/m);
  assert.match(read('js/d3/water.js'), /^export function simWater\(\)/m);
  assert.match(read('js/d3/fx.js'), /^export function explode\(cell,levelKey,chained\)/m);
  assert.match(vis, /^export function computeVision\(\)/m);
  assert.match(read('js/d3/chars.js'), /^export function addChar\(s\)/m);
  assert.match(read('js/d3/terrain.js'), /^export function buildTerrain\(\)/m);
  assert.match(read('js/d3/world.js'), /^export function loadScene\(key\)/m);
  assert.match(read('js/d3/input.js'), /^export function pickAt\(px,py\)/m);
  assert.match(cam, /^export function stepEnv\(dt\)/m);
  // todo lo que se crea en un módulo y vive en la escena se registra en ella (se perdió una vez en la tarea 10)
  assert.match(idx, /scene\.add\(decor\);scene\.add\(charsGroup\);scene\.add\(propGroup\)/);
  assert.match(idx, /initTerrain\(scene\);[\s\S]*initWater\(scene\);initFx\(scene\);[\s\S]*initWorld\(scene\);initInput\(scene\);/);
  // los ganchos que evitan importes circulares no pueden quedar vacíos (la tarea 11 con GPT dejó removeLight como stub)
  for (const h of ['terrainChanged', 'removeObj', 'removeMount', 'removeLight', 'charAt', 'refreshTufts', 'envEm', 'blocksMove', 'closedDoor', 'blocksSight', 'flashLight', 'relayout', 'maybeGrow']) assert.match(idx, new RegExp('hooks\\.' + h + '=(?!\\(\\)=>\\{\\})'), 'hooks.' + h);
  assert.match(idx, /window\.D3=\{mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,setView,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version,setTool,setToolOption,catalog[,}]/);
  const dice = read('js/dice3d.js');
  assert.match(dice, /function withColorManagement\(fn\)/);
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

test('nuevo tablero: selector de tipo 2D/2.5D; la tarjeta lo etiqueta; el estado conoce el modo', () => {
  const html = read('index.html');
  assert.match(html, /<select id="newBoardMode"[^>]*>[\s\S]*<option value="2d"[^>]*>2D[\s\S]*<option value="2\.5d"[^>]*>2\.5D/);
  const main = read('js/main.js');
  assert.match(main, /body:JSON\.stringify\(\{name,mode\}\)/);
  assert.match(main, /b\.mode==='2\.5d'/);
  const core = read('js/core.js');
  assert.match(core, /mode:'2d'/);
  assert.match(core, /const is25=\(\)=>S\.mode==='2\.5d'/);
});

test('modo 2.5D: atlas CC0 y mapa de piezas presentes', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'packs25.png')));
  const map = read('js/d3/packmap.js');
  assert.match(map, /^export const PACK_MAP=\{"t:floor":\[\[0,0,16,16\]\]/m);
  assert.match(read('../README.md'), /Kenney/);
  assert.match(read('../README.md'), /0x72/);
});

test('shell 2.5D: el stage delega en D3 y el 2D no dibuja ni recibe punteros', () => {
  const render = read('js/render.js');
  assert.match(render, /function syncStageMode\(terrain\)/);
  assert.match(render, /if\(is25\(\)\)\{if\(ts-lastNet>40\)\{lastNet=ts;Net\.tick\(\)\}return\}/);
  assert.match(render, /if\(is25\(\)&&window\.D3\)window\.D3\.resize\(\)/);
  const editor = read('js/editor.js');
  assert.ok((editor.match(/if\(is25\(\)\)return/g) || []).length >= 6, 'punteros, rueda, dblclick, contextmenu, drop y teclado');
  assert.match(editor, /D3\.rotate\(-1\)/); assert.match(editor, /D3\.rotate\(1\)/);
  assert.match(read('js/net.js'), /loadState\(st\);syncStageMode\(d\.terrain\)/);
  assert.match(read('js/main.js'), /loadState\(blankState\(\)\);syncStageMode\(\)/);
  assert.match(render, /onBlind:b=>.*blindNote.*style\.display=b\?'grid':'none'/, 'el motor avisa al shell cuando el jugador está ciego');
  assert.match(read('js/net.js'), /D3\.setEnv\(S\.env,S\.ambient\)/, 'un cambio de entorno remoto también debe llegar al motor montado');
  assert.match(read('js/net.js'), /case 'terrain':/);
  const world = read('js/d3/world.js');
  assert.match(world, /export function loadTerrain\(blob\)/m);
  assert.match(world, /export function applyTerrainOp\(op,version\)/m);
  assert.match(read('js/d3/ctx.js'), /terrainVersion:0/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /window\.D3=\{mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,setView,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version,setTool,setToolOption,catalog[,}]/);
  assert.match(idx, /opts\.terrain\?loadTerrain\(opts\.terrain\):loadScene\('valle'\)/);
  const css = read('css/app.css');
  assert.match(css, /#stage\.d3 canvas:not\(\.d3\)\{display:none\}/);
  assert.match(css, /#app\.d3 #rail \.tool:not\(\[data-tool="select"\]\):not\(\[data-tool="pan"\]\):not\(\[data-tool="player"\]\):not\(\[data-tool="enemy"\]\):not\(\[data-tool="light"\]\):not\(\.d3Only\),#app\.d3 #rail \.railsep:not\(\.d3Only\)\{display:none\}/);
});

test('ctx.js: el estado del mundo 2.5D vive en G/S/R/U; ningún módulo declara N ni H por su cuenta', () => {
  const ctx = read('js/d3/ctx.js');
  assert.match(ctx, /export const G=\{/); assert.match(ctx, /export const I=\(x,z\)=>z\*G\.N\+x/);
  const world = read('js/d3/world.js');
  assert.match(world, /import \{ G, S, R, U, MAXH, MAXN, BASE_N, DIRS, I, cxOf, czOf, wx, wz, inb \} from '\.\/ctx\.js'/);
  for (const f of ['art', 'water', 'fx', 'vision', 'chars', 'camera', 'input', 'terrain', 'world', 'index']) assert.doesNotMatch(read('js/d3/' + f + '.js'), /^\s*let N=|^\s*let H,M,W|^\s*const S=\{env:/m, f);
});

test('world.js: escena blank, carga escena/off desde blob y delega grow a growWorld', () => {
  const world = read('js/d3/world.js');
  assert.match(world, /blank:\{name:'Vacío'/);
  assert.match(world, /case 'grow':growWorld\(op\.pad,true\)/);
  assert.match(world, /G\.sceneKey=SCENES\[X\.scene\]\?X\.scene:'valle';G\.OFF=X\.off\|\|0;/);
});

test('catálogo 2.5D: catalog.js y server/terrain.js no divergen; art.js mantiene las mismas banderas', async () => {
  const T = require('../server/terrain');
  const cat = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'd3', 'catalog.js')).href);
  assert.deepEqual(cat.MATS, T.MATS);
  assert.deepEqual(cat.OBJ_KINDS, T.OBJ_KINDS);

  const art = read('js/d3/art.js');
  const extract = (start, end) => {
    const i = art.indexOf(start);
    if (i < 0) throw new Error('No se encontró ' + start);
    const j = art.indexOf(end, i + start.length);
    if (j < 0) throw new Error('No se encontró el cierre de ' + start);
    return art.slice(i + start.length, j + 1);
  };
  const artMats = new Function('TL', 'return ' + extract('const MATS=', '];'))(new Proxy({}, { get: () => 0 }));
  assert.deepEqual(artMats.map((m) => ({ name: m.name })), T.MATS.map((m) => ({ name: m.name })));

  const artKinds = new Function('return ' + extract('const OBJ_KINDS=', '};'))();
  const flags = ['move', 'sight', 'door', 'fixed', 'mount', 'mountOnly', 'explosive', 'flat'];
  for (const k of Object.keys(T.OBJ_KINDS)) {
    assert.ok(artKinds[k], 'falta ' + k + ' en art.js');
    for (const f of flags) {
      assert.equal(artKinds[k][f] || 0, T.OBJ_KINDS[k][f] || 0, `diferencia en ${k}.${f}`);
    }
  }
  assert.equal(Object.keys(artKinds).length, Object.keys(T.OBJ_KINDS).length);
});

test('herramientas 2.5D del director: rail, subbar, ops y puentes', () => {
  const html = read('index.html');
  for (const t of ['up', 'down', 'paint', 'object', 'water']) {
    assert.match(html, new RegExp(`<button(?=[^>]*data-tool="${t}")(?=[^>]*class="[^"]*d3Only[^"]*")[^>]*>`), `botón ${t} con clase d3Only`);
  }
  const css = read('css/app.css');
  assert.match(css, /#app:not\(\.d3\) \.d3Only\{display:none\}/);

  const editor = read('js/editor.js');
  assert.match(editor, /const D3_TOOLS=\{[^}]*up:'subir'[^}]*water:'agua'/);
  assert.match(editor, /D3\.setToolOption\('paintMat'/);
  assert.match(editor, /\['select','up','down','paint','object','water'\]\[e\.key-1\]/);

  const input = read('js/d3/input.js');
  assert.match(input, /^export function onTerrainOp\(cb\)/m);
  assert.match(input, /function sendOp\(op\)\{const v=G\.terrainVersion;/);
  assert.match(input, /sendOp\(\{type:'grow',pad:8\}\)/);
  assert.doesNotMatch(input, /G\.H\[i\]\+\+/);
  assert.doesNotMatch(input, /G\.H\[i\]--/);
  assert.doesNotMatch(input, /explode\(/);

  const idx = read('js/d3/index.js');
  assert.match(idx, /onTerrainOp\(op=>opts\.onTerrainOp&&opts\.onTerrainOp\(op\)\)/);
  assert.match(idx, /window\.D3=\{mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,setView,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version,setTool,setToolOption,catalog[,}]/);

  assert.match(read('js/render.js'), /onTerrainOp:op=>Net\.terrain\(op\)/);
  assert.match(read('js/net.js'), /version:op\.version!=null\?op\.version:window\.D3\.version\(\)/);
  assert.match(read('js/core.js'), /paintMat:1,objKind:'arbol',waterMode:'verter'/);
});

test('fichas y luces 2.5D: sync desde el estado clásico y presets sin duplicar', () => {
  const chars = read('js/d3/chars.js');
  assert.match(chars, /export function syncTokens\(/);
  assert.match(chars, /export function syncLights\(/);
  assert.match(chars, /export const defOf =/);
  assert.match(chars, /export function cellFromPx\(/);
  const vision = read('js/d3/vision.js');
  assert.ok(!/LIGHT_PRESETS\[l\.preset\]/.test(vision), 'vision.js debe usar defOf(l)');
  assert.match(vision, /defOf\(l\)/);
  const index = read('js/d3/index.js');
  assert.match(index, /syncObjects/);
  assert.match(index, /location\.hostname==='localhost'/);
  const net = read('js/net.js');
  assert.match(net, /D3\.syncObjects\(\)/);
  const ctx = read('js/d3/ctx.js');
  assert.match(ctx, /cellPx:\s*50/);
});

test('fichas 2.5D: selección, movimiento por ops y creación desde el rail', () => {
  const input = read('js/d3/input.js');
  assert.ok(!/G\.tool!=='mover'/.test(input), 'la herramienta mover ya no está desactivada');
  assert.match(input, /R\.canMove\(p\.char\.vid\)/);
  assert.match(input, /if\(G\.tool==='ficha'\|\|G\.tool==='luz'\)return/);
  const chars = read('js/d3/chars.js');
  assert.match(chars, /hooks\.moved\(c\)/);
  assert.match(read('js/d3/fx.js'), /moved:/);
  assert.match(read('js/d3/ctx.js'), /canMove:/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /hooks\.moved=/);
  assert.match(idx, /function pickCell\(/);
  assert.match(idx, /pickCell/);
  const ed = read('js/editor.js');
  assert.match(ed, /player:'ficha',enemy:'ficha'/);
  assert.match(ed, /function canMove25\(/);
  assert.match(ed, /function onToken25Move\(/);
  assert.match(ed, /window\.D3\.pickCell\(/);
  assert.match(read('js/render.js'), /onMove:onToken25Move/);
  assert.match(read('css/app.css'), /#app\.d3 #rail \.tool[^\n]*data-tool="player"/);
});

test('ver como en 2.5D: observadores por dueño, aviso de ciego y vista del director', () => {
  const vision = read('js/d3/vision.js');
  assert.match(vision, /S\.view === 'gm'\) return \[\]/);
  assert.match(vision, /c\.owner === S\.uid/);
  assert.match(vision, /c\.vid === S\.view/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /function setView\(/);
  assert.ok(idx.includes('applyView();') && !idx.includes('// applyView();'), 'setView llama a applyView sin estar comentado');
  assert.match(idx, /onBlind/);
  assert.match(read('js/d3/ctx.js'), /uid:\s*null/);
  const ed = read('js/editor.js');
  assert.match(ed, /function view25\(/);
  assert.match(ed, /shared:S\.sharedVision!==false/);
  const rnd = read('js/render.js');
  assert.match(rnd, /onBlind:/);
  assert.ok(!/if\(want\)\{\$\('#blindNote'\)\.style\.display='none'/.test(rnd), 'el aviso de ciego lo decide el motor');
  assert.match(read('js/net.js'), /view25\(\)/);
  const chars = read('js/d3/chars.js');
  assert.match(chars, /vision: s\.vision !== false/);
});

test('niebla 2.5D: lo explorado se guarda por celda y se recupera', () => {
  const vision = read('js/d3/vision.js');
  assert.match(vision, /export function exploredBytes\(\)/);
  assert.match(vision, /export function loadExplored\(bytes\)/);
  assert.match(vision, /export function resetExplored\(\)/);
  assert.match(vision, /G\.exploredUser\[j\] = 255/);
  assert.match(read('js/d3/ctx.js'), /exploredUser:new Uint8Array\(C0\)/);
  assert.match(read('js/d3/world.js'), /G\.exploredUser\[re\(i\)\]/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /exploredBytes/);
  assert.match(idx, /resetExplored:resetExplored25/);
  const rnd = read('js/render.js');
  assert.match(rnd, /'base64:'\+bytesToB64/);
  assert.match(rnd, /b64ToBytes\(f\.data\.slice\(7\)\)/);
  assert.match(rnd, /window\.D3\.resetExplored\(\)/);
  // el 2D no cambia: sigue subiendo PNG por bloques
  assert.match(rnd, /toDataURL\('image\/png'\)/);
});

test('selección 2.5D: el motor avisa al shell, la barra de selección aparece y Supr/Escape funcionan', () => {
  assert.match(read('js/d3/chars.js'), /export function select\(c\) \{ G\.selected = c; hooks\.selected\(c\); \}/);
  assert.match(read('js/d3/fx.js'), /selected: \(\) => \{\}/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /hooks\.selected=c=>\{if\(opts\.onSelect\)opts\.onSelect\(c\?c\.vid:null\);\}/);
  assert.match(idx, /function selectVid\(vid\)/);
  assert.match(idx, /select:selectToken/);
  const ed = read('js/editor.js');
  assert.match(ed, /function onToken25Select\(vid\)\{UI\.selected=vid==null\?\[\]:\[vid\];/);
  assert.match(read('js/d3/input.js'), /if\(G\.selected===p\.char\)\{select\(null\);return;\}/);
  assert.match(ed, /e\.key==='Escape'\|\|e\.key==='Delete'\|\|e\.key==='Backspace'\|\|e\.ctrlKey\|\|e\.metaKey/);
  assert.match(ed, /if\(e\.key==='Escape'&&window\.D3\)window\.D3\.select\(null\)/);
  assert.match(read('js/render.js'), /onSelect:onToken25Select/);
  assert.match(read('index.html'), /data-tool="up" data-ic="chevron-up"/);
  assert.match(read('js/icons.js'), /"chevron-up":/);
});

test('panel Mapa 2.5D: ajustes del motor con ops settings/grow y estilo persistente', () => {
  const html = read('index.html');
  assert.match(html, /<details class="fold d3Only" data-fold="mapa25"/);
  for (const id of ['style25', 'fogAlpha25', 'mist25', 'cutOn25', 'cutH25', 'focus25', 'size25', 'grow25', 'autoGrow25', 'evap25', 'edgeDrain25']) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /class="fold d2Only" data-fold="zonas"/);
  assert.match(html, /class="fold d2Only" data-fold="contenido"/);
  const css = read('css/app.css');
  assert.match(css, /#app:not\(\.d3\) \.d3Only\{display:none\}/);
  assert.match(css, /#app\.d3 \.d2Only\{display:none\}/);
  const ed = read('js/editor.js');
  assert.match(ed, /function render25Panel\(\)/);
  assert.match(ed, /window\.D3\.terrainOp\(op\)/);
  assert.match(ed, /\{type:'grow',pad:8\}/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /terrainOp:sendOp/);
  assert.match(idx, /function settings25\(\)/);
  assert.match(idx, /export const STYLES=\[\['packs'/);
  const world = read('js/d3/world.js');
  assert.match(world, /case 'settings':if\(op\.style\)restyle\(op\.style\);/);
  assert.match(world, /if\(X\.style&&X\.style!==ART\.art\.style\)restyle\(X\.style\)/);
  assert.match(read('js/d3/input.js'), /export function sendOp\(op\)/);
  assert.match(read('js/net.js'), /render25Panel\(\)/);
});

test('fix D1: niebla explorada no se descarta al recargar con el tablero crecido; el panel se reactiva al volver a Director', () => {
  const idx = read('js/d3/index.js');
  // loadExplored espera a `ready` (como ya hace setView con pendingView), si no G.CELLS todavía es el
  // tamaño por defecto cuando llegan bytes de un tablero ya crecido y vision.loadExplored los descarta
  assert.match(idx, /function loadExplored\(bytes\)\{if\(!ready\)\{pendingExplored=bytes;return;\}visionLoadExplored\(bytes\);\}/);
  assert.match(idx, /if\(pendingExplored\)\{const b=pendingExplored;pendingExplored=null;visionLoadExplored\(b\);\}/);
  assert.match(idx, /loadExplored,\s*resetExplored:visionResetExplored/, 'el objeto de createEngine expone el loadExplored propio, no el de vision.js directo');
  const world = read('js/d3/world.js');
  // la niebla reproyectada por growWorld tiene que marcarse sucia o el servidor se queda con la copia vieja
  assert.match(world, /G\.exploredUser\[re\(i\)\]=oEU\[i\];\s*\n\s*G\.exploredDirty=true;/);
  const ed = read('js/editor.js');
  // el estado disabled se recalcula en cada pintado del panel, no sólo la primera vez que se detecta jugador
  const panel = ed.slice(ed.indexOf('function render25Panel()'), ed.indexOf('function render25PanelWait('));
  assert.match(panel, /const ro=!isGM\(\);/);
  assert.match(panel, /disabled=ro/, 'los controles del fold se deshabilitan con ro dentro de render25Panel');
});

test('2.5D: luces sueltas y colgadas desde el rail, menú contextual con clic derecho', () => {
  const input = read('js/d3/input.js');
  assert.match(input, /export function describePick\(p\)/);
  assert.match(input, /export function pickPlace\(px,py\)/);
  assert.match(input, /if\(e\.button===2\)\{hooks\.context\(describePick\(pickAt\(e\.clientX,e\.clientY\)\),e\.clientX,e\.clientY\);\}/);
  assert.match(input, /if\(G\.tool==='ficha'\|\|G\.tool==='luz'\)return;/);
  assert.ok(!/llegan en la fase|todavía no se colocan desde el mapa/.test(input), 'la herramienta luz ya funciona');
  assert.match(read('js/d3/fx.js'), /context: \(\) => \{\}/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /hooks\.context=\(info,x,y\)=>\{if\(opts\.onContext&&info\)opts\.onContext\(info,x,y\);\}/);
  assert.match(idx, /pickPlace/);
  const ed = read('js/editor.js');
  assert.match(ed, /light:'luz'/);
  assert.match(ed, /if\(q\.mount\)l\.mount=q\.mount;/);
  assert.match(ed, /function onTerrain25Context\(info,cx,cy\)/);
  assert.match(ed, /function openTerrainContext\(info,sp\)/);
  assert.match(ed, /\{type:'door',i:info\.cell,open:!info\.open\}/);
  assert.match(read('js/render.js'), /onContext:onTerrain25Context/);
  assert.match(read('css/app.css'), /:not\(\[data-tool="light"\]\)/);
  const T = require('../server/terrain');
  assert.equal(typeof T.mountValid, 'function');
});

test('D3: arte propio desde la Biblioteca — categoría arte25, op art, recortador y motor sin localStorage', () => {
  assert.match(read('js/store.js'), /arte25:\{name:'Arte 2\.5D'/);
  const html = read('index.html');
  assert.match(html, /data-fold="arte25"/);
  assert.match(html, /id="arte25Canvas"/);
  assert.match(html, /id="arte25Apply"/);
  const art = read('js/d3/art.js');
  assert.match(art, /export function setCustomArt\(list, getImage\)/);
  assert.match(art, /export function resetStyleCache\(\)/);
  assert.match(art, /export function customKinds\(\)/);
  assert.ok(/resetStyleCache\(\);/.test(art.slice(art.indexOf('export function setCustomArt'))), 'setCustomArt debe vaciar STYLE_CACHE: si no, el atlas no cambia');
  const world = read('js/d3/world.js');
  assert.match(world, /case 'art':/);
  assert.match(world, /export function refreshCustomArt\(\)/);
  assert.match(world, /G\.customArt=X\.art\|\|\{\}/);
  assert.match(read('js/d3/ctx.js'), /customArt:\{\}/);
  assert.match(read('js/d3/fx.js'), /getImage: null/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /hooks\.getImage=opts\.getImage\|\|\(\(\)=>null\)/);
  assert.match(idx, /customArt/);
  assert.match(idx, /CHARS:/);
  const ed = read('js/editor.js');
  assert.match(ed, /function renderArte25\(\)/);
  assert.match(ed, /'tile:'\+/);
  assert.match(ed, /'newobj:'\+/);
  assert.match(ed, /'newchar:'\+/);
  assert.ok(!/arte25.*localStorage|localStorage.*arte25|AU25.*localStorage|localStorage.*AU25/.test(ed), 'el arte propio no se guarda en localStorage');
  const rnd = read('js/render.js');
  assert.match(rnd, /getImage:getImg/);
  assert.match(rnd, /syncStageMode\.tries=\(syncStageMode\.tries\|\|0\)\+1\)<=400/, 'el reintento hasta que exista window.D3 tiene tope');
  assert.match(rnd, /el motor no cargó/);
  assert.match(idx, /deferred\.forEach\(d=>\{uses\.push/, 'customArt().uses incluye los objetos diferidos (imagen cargando)');
  assert.match(world, /export const deferred=\[\];/);
  assert.match(read('js/net.js'), /renderArte25\(\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server', 'app.js'), 'utf8'), /'arte25'/);
  assert.match(read('css/app.css'), /\.cutwrap\{/);
});

test('aspecto de ficha en 2.5D: catálogo del motor con miniaturas y token.art', () => {
  const idx = read('js/d3/index.js');
  assert.match(idx, /function artThumb\(kind\)/);
  assert.match(idx, /a\.idle\[0\]\*a\.fw/);
  assert.match(idx, /kind:c\.kind/);
  const ed = read('js/editor.js');
  assert.match(ed, /function artPicker\(o,done\)/);
  assert.match(ed, /b\.dataset\.art=ch\.key/);
  assert.match(ed, /o\.art=ch\.key;done\(\)/);
  assert.match(ed, /section\('Aspecto'\)/);
  assert.match(read('css/app.css'), /\.pick\.sprite/);
  // ítem extra: chars.restyle reasigna el atlas del terreno (si no, el suelo se queda con el estilo anterior)
  const chars = read('js/d3/chars.js');
  assert.match(chars, /hooks\.atlasChanged\(\)/);
  assert.match(read('js/d3/fx.js'), /atlasChanged: \(\) => \{\}/);
  assert.match(idx, /hooks\.atlasChanged=\(\)=>\{terrainMat\.map=ART\.TEX\.atlas;terrainMat\.needsUpdate=true;\}/);
});

test('ola final D: kinds propios sin imagen no tumban el motor; open en op obj; deferred limpio; menores', () => {
  const world = read('js/d3/world.js');
  // C1: removeObj (y los predicados del motor) toleran un kind que setCustomArt acaba de borrar
  assert.match(world, /export function removeObj\(i\)\{\s*const o=objs\.get\(i\);if\(!o\)return;const K=OBJ_KINDS\[o\.kind\]\|\|\{\};/);
  for (const fn of ['isDoor', 'blocksMove', 'blocksSight']) {
    const line = world.slice(world.indexOf('export const ' + fn + '='));
    assert.match(line.slice(0, line.indexOf('\n')), /\|\|\{\}\)/, fn + ' tolera kinds inexistentes');
  }
  assert.match(world, /export function autoRot\(i,kind\)\{\n\s*const K=OBJ_KINDS\[kind\]\|\|\{\}/);
  // C1: las instancias de kinds propios salen ANTES de que setCustomArt rehaga OBJ_KINDS
  const refresh = world.slice(world.indexOf('export function refreshCustomArt()'));
  assert.ok(refresh.indexOf('customKinds()') < refresh.indexOf('setCustomArt('), 'refreshCustomArt quita los kinds propios antes de rehacerlos');
  // C1: una op remota que lanza devuelve false para que net.js pida el terreno completo
  const idx = read('js/d3/index.js');
  assert.match(idx, /export function applyRemoteOp\(op,version\)\{[^\n]*try\{return eng\.applyTerrainOp\(op,version\);\}catch\(e\)\{[^\n]*return false;\}/);
  // I1: la op obj respeta `open` (Girar / llave sobre una puerta abierta)
  assert.match(world, /case 'obj':\{[^\n]*if\(w&&op\.open&&OBJ_KINDS\[op\.kind\]&&OBJ_KINDS\[op\.kind\]\.door\)\{w\.open=true;w\.mesh\.userData\.tex\.offset\.x=\.5;/);
  // I2: una op sobre la casilla / el muro saca su entrada de deferred; la reproducción no duplica
  assert.match(world, /case 'obj':\{dropDeferred\(d=>d\.i===op\.i\);/);
  assert.match(world, /case 'mount':\{dropDeferred\(d=>d\.wall\+':'\+d\.dir===op\.key\);/);
  assert.match(world, /if\(d\.wall!=null\)\{const key=mountKey\(d\.wall,d\.dir\);if\(mounts\.has\(key\)\)removeMount\(key\);addMount\(d\.wall,d\.dir,d\.kind\);\}else\{if\(objs\.has\(d\.i\)\)removeObj\(d\.i\);addObj\(d\.i,d\.kind,d\.rot\);\}/);
  // menores: el reintento de arte se cancela al parar el motor
  assert.match(world, /export function cancelArtRetry\(\)/);
  assert.match(idx, /function stop\(\)\{stopped=true;cancelArtRetry\(\);/);
  // menores: renderArte25 sólo con full u op art; el toast de fix muestra el error del servidor
  const net = read('js/net.js');
  assert.match(net, /if\(d\.fix\)toast\(d\.error\|\|'No puedes editar el terreno de esta escena'\)/);
  assert.match(net, /if\(\(d\.full\|\|\(d\.op&&d\.op\.type==='art'\)\)&&typeof renderArte25==='function'\)renderArte25\(\);/);
  // menores: Girar sólo para kinds fixed; tecla L = Luz; Arte 2.5D fuera del editor de imagen en 2D
  assert.match(idx, /fixed:!!o\.fixed,custom:!!o\.custom/);
  const ed = read('js/editor.js');
  assert.match(ed, /if\(info\.fixed\)add\('rotate-cw','Girar'/);
  assert.match(read('js/d3/input.js'), /fixed:!!\(OBJ_KINDS\[o\.kind\]\|\|\{\}\)\.fixed/);
  assert.match(ed, /\/\^\[pel\]\$\/\.test\(e\.key\.toLowerCase\(\)\)/);
  assert.match(ed, /if\(k==='arte25'&&!is25\(\)&&m\.category!=='arte25'\)continue;/);
  // I3: el jugador también elige Aspecto en 2.5D
  const pStart = ed.indexOf("if(!gm){\n      text('Nombre'");
  const player = ed.slice(pStart, ed.indexOf('if(gm){', pStart));
  assert.match(player, /section\('Aspecto'\);body\.appendChild\(artPicker\(o,/);
  // servidor: la clave tile sólo admite los 7 materiales
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server', 'terrain.js'), 'utf8'), /tile:\[0-6\]:\(top\|side\|fill\)/);
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

test('clima: weather.js es el único puente con la librería y render.js lo engancha en los frames completos', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/render.js') < html.indexOf('js/weather.js') && html.indexOf('js/weather.js') < html.indexOf('js/store.js'), 'weather.js va tras render.js y antes de store.js');
  assert.doesNotMatch(html, /vendor\/pixi|vendor\/weather-fx/, 'las librerías no se cargan en index.html: sólo con clima');
  const w = read('js/weather.js');
  assert.match(w, /^const Weather=\(\(\)=>\{/m);
  assert.match(w, /'js\/vendor\/pixi\.min\.js','js\/vendor\/weather-fx\.js'/);
  assert.match(w, /new WeatherFX\(\{container:stage,source:cv\.scene/);
  assert.match(w, /view\.id='cWeather'/);
  assert.match(w, /stage\.insertBefore\(view,cv\.glow\)/, 'la capa Pixi va entre la escena y el brillo');
  assert.match(w, /fx\.pause\(!S\.animate\)/);
  assert.match(w, /refraction:PERF\.scale<1\?0:/);
  // la librería pinta el mapa con 16 px de sobremedida (_fitMap): desalinearía muros, luz y controles
  assert.match(w, /function fit\(\)\{[^}]*mapSprite\.position\.set\(0,0\);[^}]*mapSprite\.width=fx\.w;[^}]*mapSprite\.height=fx\.h\}/);
  assert.match(w, /stage\.insertBefore\(view,cv\.glow\);[^\n]*fit\(\)/);
  // el reajuste va en invalidate() tras drawScene, sin renderizar (app.resize renderiza a medias): renderer → fx.resize → textura → sprite
  assert.match(w, /fx\.app\.resizeTo=null/);
  assert.match(w, /const resized=fx\.app\.screen\.width!==W\|\|fx\.app\.screen\.height!==H;\n\s*if\(resized\)\{fx\.app\.renderer\.resize\(W,H\);fx\.resize\(\)\}\n\s*fx\.sourceTexture\.baseTexture\.resource\.update\(\);\n\s*if\(resized\|\|fx\.mapSprite\.x!==0\)fit\(\)/);
  assert.doesNotMatch(w, /fx\.app\.resize\(\)/);
  assert.match(w, /return\{sync,invalidate,resize,mounted/);
  const r = read('js/render.js');
  assert.match(r, /function drawAll\(t,lightsOnly\)\{(?:\n[^\n]*){1,3}\n\s*if\(!lightsOnly\)\{Weather\.sync\(\);drawScene\(player\);Weather\.invalidate\(\)/);
  assert.match(r, /function resize\(\)\{(?:\n[^\n]*){1,8}\n\s*Weather\.resize\(\);\n\s*requestRender\(\);\n\}/);
  assert.match(r, /if\(!want\)\$\('#subbar'\)\.innerHTML='';\n\s*Weather\.sync\(\);/);
  // fuera de weather.js nadie habla con la librería
  for (const f of ['js/core.js', 'js/render.js', 'js/editor.js', 'js/net.js', 'js/main.js', 'js/store.js']) assert.doesNotMatch(read(f), /WeatherFX|PIXI\./, f);
});

test('clima: panel Escena con selector e intensidad/viento; el director lo cambia con deshacer y sincronía', () => {
  const html = read('index.html');
  assert.match(html, /<details class="fold" data-fold="clima"[^>]*>\s*<summary><span class="foldTitle">Clima<\/span><\/summary>/);
  assert.match(html, /<select id="weatherId" class="gmOnly"><\/select>/);
  assert.match(html, /<input id="weatherIntensity" type="range" min="0" max="100" step="1">/);
  assert.match(html, /<input id="weatherWind" type="range" min="-100" max="100" step="5">/);
  const ed = read('js/editor.js');
  assert.match(ed, /function renderWeather\(\)\{/);
  assert.match(ed, /for\(const\[k,w\]of Object\.entries\(WEATHERS\)\)/);
  assert.match(ed, /\$\('#weatherId'\)\.onchange=e=>\{pushUndo\(\);S\.weather=Object\.assign\(\{\},S\.weather,\{id:e\.target\.value\}\);changed\(\);renderWeather\(\)\}/);
  assert.match(ed, /\[\['weatherIntensity','intensity',100\],\['weatherWind','wind',100\]\]/);
  assert.match(ed, /el\.oninput=e=>\{S\.weather=Object\.assign\(\{\},S\.weather,\{\[key\]:\+e\.target\.value\/div\}\)/);
  assert.match(ed, /el\.onchange=\(\)=>\{pushUndo\(weatherSnap\|\|undefined\);weatherSnap=null;changed\(\)\}/);
  assert.match(ed, /function syncSceneInputs\(\)\{(?:\n[^\n]*){1,6}\n\s*renderWeather\(\);/);
});

test('clima en interiores: casilla por tipo (weather.indoor) y máscara con las zonas interiores', () => {
  const html = read('index.html');
  assert.match(html, /<label class="check weatherOnly"><input type="checkbox" id="weatherIndoor"> Se nota en zonas interiores/);
  const ed = read('js/editor.js');
  assert.match(ed, /\$\('#weatherIndoor'\)\.checked=!!\(w\.indoor&&w\.indoor\[sel\.value\]\)/);
  assert.match(ed, /\$\('#weatherIndoor'\)\.onchange=e=>\{pushUndo\(\);const indoor=Object\.assign\(\{\},S\.weather\.indoor\);if\(e\.target\.checked\)indoor\[S\.weather\.id\]=true;else delete indoor\[S\.weather\.id\];S\.weather=Object\.assign\(\{\},S\.weather,\{indoor\}\);changed\(\)\}/);
  const w = read('js/weather.js');
  assert.match(w, /function indoors\(w\)\{return !!\(w\.indoor&&w\.indoor\[w\.id\]\)\}/);
  assert.match(w, /function maskZones\(w\)\{/);
  // pantalla entera menos cada zona (rect o polígono) en coordenadas de pantalla, con la cámara del 2D
  assert.match(w, /g\.beginFill\(0xffffff\);g\.drawRect\(0,0,fx\.w,fx\.h\)/);
  assert.match(w, /for\(const z of S\.zones\)\{g\.beginHole\(\);/);
  assert.match(w, /const sx=x=>W\/2\+\(x-UI\.cam\.x\)\*UI\.cam\.zoom,sy=y=>H\/2\+\(y-UI\.cam\.y\)\*UI\.cam\.zoom/);
  assert.match(w, /fx\.scene\.mask=/);
  // se recalcula en cada frame completo: la cámara y las zonas cambian
  assert.match(w, /if\(fx\)\{apply\(\);maskZones\(w\);return\}/);
});
