'use strict';
/* Red de seguridad del refactor de tablero3d.js (tarea 1): `load(nombre)` devuelve la implementación ACTUAL de una parte
   del motor, recortada del texto de modules/tablero3d/public/tablero3d.js (como frontend.test.js con engineConst/between)
   y ejecutada con vm en este mismo reino (así sus objetos y listas se comparan con deepStrictEqual sin plain()).
   Las tareas 3–5 cambian cada `load` por el módulo extraído; las fotos (fixtures/motor-antes.json) no cambian.
     load('luces') → WARM, LIGHT_TYPES, LIGHT_IDS, OBJ_LIGHT_IDS, LIGHT_ANIMS, TOKEN_LIGHTS, HEX6, normLight, lightOfType, lightName, hexRGB, lightRGB
     load('azar')  → mulberry32, hash, pick
     load('mapas') → demoMap, dungeonMap, townMap, lightWorkshopMap */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MOD = path.join(__dirname, '..', '..', '..', 'modules', 'tablero3d', 'public');
const engine = fs.readFileSync(path.join(MOD, 'tablero3d.js'), 'utf8');

// casos de normLight (los mismos en la foto y en el test)
const CASOS_LUZ = [{}, { preset: 'torch' }, { r: 99, h: -3, color: '#ABCDEF', intensity: 5, anim: 'pulse', angle: 0, rot: 9999 },
  { c: '#112233', f: 0 }, { preset: 'nope', name: '  Farol del puerto  ' }, { r: 'x', h: 'y', on: false, darkness: 1 }];

function between(a, b) {
  const i = engine.indexOf(a), j = engine.indexOf(b, i);
  if (i < 0 || j <= i) throw new Error(`no encuentro ${a} … ${b} en tablero3d.js`);
  return engine.slice(i, j);
}
const lineOf = (start) => between(start, '\n');
// constante de una línea, o de varias si la línea acaba en «{» (LIGHT_TYPES, que cierra con «\n};»)
const engineConst = (name) => (lineOf(`const ${name}=`).endsWith('{') ? between(`const ${name}=`, '\n};') + '\n};' : lineOf(`const ${name}=`));

// ejecuta un trozo del motor dentro de una función (ámbito propio, mismo reino) y devuelve lo que exporta `ret`
function run(src, ret, deps = {}) {
  const names = Object.keys(deps);
  return vm.runInThisContext(`(function(${names.join(',')}){'use strict';\n${src}\nreturn {${ret.join(',')}};\n})`)(...names.map((k) => deps[k]));
}

const LUCES = ['WARM', 'LIGHT_TYPES', 'LIGHT_IDS', 'OBJ_LIGHT_IDS', 'LIGHT_ANIMS', 'TOKEN_LIGHTS', 'HEX6', 'normLight', 'lightOfType', 'lightName', 'hexRGB', 'lightRGB'];
const srcLuces = () => [lineOf('const hexRGB='), ...['WARM', 'LIGHT_TYPES', 'LIGHT_IDS', 'OBJ_LIGHT_IDS', 'LIGHT_ANIMS', 'TOKEN_LIGHTS', 'HEX6'].map(engineConst),
  between('function normLight(', '\n// campos de un tipo'), between('function lightOfType(', '\nconst lightName='), lineOf('const lightName='), lineOf('function lightRGB(')].join('\n');
const AZAR = ['mulberry32', 'hash', 'pick'];
const srcAzar = () => [lineOf('function mulberry32('), lineOf('function hash('), lineOf('const pick=')].join('\n');

function loadFichas() {
  return vm.runInThisContext(`(function(window){\n${fs.readFileSync(path.join(MOD, 'fichas.js'), 'utf8')}\nreturn window.Tablero3D.Fichas;\n})`)({});
}

const LOADERS = {
  luces: () => run(srcLuces(), LUCES),
  azar: () => run(srcAzar(), AZAR),
  mapas: () => run([srcAzar(), srcLuces(), between('const CHARS=', '\nconst CHAR_ART='), lineOf('const CUSTOM='),
    between('const NPC=', '\nfunction defaultSheet('), between('function defaultSheet(', '\n// una ficha guardada'), lineOf('function normSheet('),
    between('function demoMap(', '\nfunction dungeonMap('), between('function dungeonMap(', '\nconst undoStack='),
    between('function townMap(', '\n// Taller de luces'), between('function lightWorkshopMap(', '\n/* ============ fase 8')].join('\n'),
  ['demoMap', 'dungeonMap', 'townMap', 'lightWorkshopMap'], { Fichas: loadFichas() }),
};

function load(name) {
  const f = LOADERS[name];
  if (!f) throw new Error(`load: no sé cargar «${name}»`);
  return f();
}

// un mapa como se guarda en la foto: listas tipadas → listas y sin `seed`
function plain(o) {
  const out = JSON.parse(JSON.stringify(o, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
  if (out && typeof out === 'object') delete out.seed;
  return out;
}

module.exports = { load, CASOS_LUZ, plain };
