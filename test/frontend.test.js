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
  // setEnv rehace niebla, bruma y visión; stop() es seguro mientras start() aún carga
  assert.match(idx, /function setEnv\(env,amb\)\{[\s\S]*?S\.fogAlpha=P\.fogA;S\.mist=P\.mist;S\.dark=null;G\.visionDirty=true;[\s\S]*?applyEnv\(false\);/);
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
  assert.match(idx, /window\.D3=\{mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version\}/);
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
  assert.match(render, /#blindNote'\)\.style\.display='none'/, 'el aviso de ceguera 2D no debe quedar visible sobre el diorama');
  assert.match(read('js/net.js'), /D3\.setEnv\(S\.env,S\.ambient\)/, 'un cambio de entorno remoto también debe llegar al motor montado');
  assert.match(read('js/net.js'), /case 'terrain':/);
  const world = read('js/d3/world.js');
  assert.match(world, /export function loadTerrain\(blob\)/m);
  assert.match(world, /export function applyTerrainOp\(op,version\)/m);
  assert.match(read('js/d3/ctx.js'), /terrainVersion:0/);
  const idx = read('js/d3/index.js');
  assert.match(idx, /window\.D3=\{mount,unmount,resize:resizeEngine,rotate:rotateEngine,setEnv,isMounted,loadTerrain:loadTerrainBlob,applyRemoteOp,version\}/);
  assert.match(idx, /opts\.terrain\?loadTerrain\(opts\.terrain\):loadScene\('valle'\)/);
  const css = read('css/app.css');
  assert.match(css, /#stage\.d3 canvas:not\(\.d3\)\{display:none\}/);
  assert.match(css, /#app\.d3 #rail \.tool:not\(\[data-tool="select"\]\):not\(\[data-tool="pan"\]\),#app\.d3 #rail \.railsep\{display:none\}/);
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
