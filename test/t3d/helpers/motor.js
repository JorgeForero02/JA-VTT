'use strict';
/* Red de seguridad del refactor de tablero3d.js (tarea 1): `load(nombre)` devuelve la implementación ACTUAL de una parte
   del motor. Lo ya extraído se carga con require del módulo; lo que aún vive en tablero3d.js se recorta de su texto
   (como frontend.test.js con between) y se ejecuta con vm en este mismo reino (así sus objetos y listas se
   comparan con deepStrictEqual sin plain()). Las tareas 3–5 cambian cada `load` por el módulo; las fotos
   (fixtures/motor-antes.json) no cambian.
     load('luces') → luces.js (WARM, LIGHT_TYPES, LIGHT_IDS, OBJ_LIGHT_IDS, LIGHT_ANIMS, TOKEN_LIGHTS, HEX6, normLight, lightOfType,
                     lightName, lightRGB) + hexRGB de base.js
     load('azar')  → base.js (mulberry32, hash, pick y hexRGB)
     load('mapas') → mapas.js: Mapas.make({defaultSheet, normSheet, Fichas}) → demoMap, dungeonMap, townMap, lightWorkshopMap;
                     defaultSheet/normSheet (con CHARS, CUSTOM, NPC y SHEET_OF, que leen) siguen en tablero3d.js y se recortan
     load('escena') → { Escena, deps(pieces) }: escena.js hecho con Escena.make({Catalogo, Muros, Ambiente, Ajustes}) (muros.js,
                     ambiente.js y ajustes.js no son UMD: se cargan con vm como frontend.test.js); deps(pieces) da lo que el motor
                     pasa en cada llamada (escenaDeps): pieces (Map de las p: del tablero), opaque, ft, terr (claves de TERR),
                     miniKinds (CHARS) y normSheet, recortados de tablero3d.js */
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

// ejecuta un trozo del motor dentro de una función (ámbito propio, mismo reino) y devuelve lo que exporta `ret`
function run(src, ret, deps = {}) {
  const names = Object.keys(deps);
  return vm.runInThisContext(`(function(${names.join(',')}){'use strict';\n${src}\nreturn {${ret.join(',')}};\n})`)(...names.map((k) => deps[k]));
}

const Base = require(path.join(MOD, 'base.js'));
const Luces = require(path.join(MOD, 'luces.js'));
const Mapas = require(path.join(MOD, 'mapas.js'));
const Escena = require(path.join(MOD, 'escena.js'));
const Catalogo = require(path.join(MOD, 'catalogo.js'));

// módulos de navegador (no UMD) en su propio contexto, como frontend.test.js y cliente-armonia.test.js
function loadBrowser(files, name) {
  const ctx = { crypto: globalThis.crypto }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(MOD, f), 'utf8'), ctx, { filename: f });
  return ctx.Tablero3D[name];
}

function loadSheets(Fichas) {
  return run([between('const CHARS=', '\nconst CHAR_ART='), lineOf('const CUSTOM='),
    between('const NPC=', '\nfunction defaultSheet('), between('function defaultSheet(', '\n// una ficha guardada'), lineOf('function normSheet(')].join('\n'),
  ['defaultSheet', 'normSheet', 'CHARS'], { Fichas });
}

function loadFichas() {
  return vm.runInThisContext(`(function(window){\n${fs.readFileSync(path.join(MOD, 'fichas.js'), 'utf8')}\nreturn window.Tablero3D.Fichas;\n})`)({});
}

const LOADERS = {
  luces: () => ({ ...Luces, hexRGB: Base.hexRGB }),
  azar: () => Base,
  mapas: () => {
    const Fichas = loadFichas();
    const { defaultSheet, normSheet } = loadSheets(Fichas);
    return Mapas.make({ defaultSheet, normSheet, Fichas });
  },
  escena: () => {
    const mods = { Catalogo, Muros: loadBrowser(['catalogo.js', 'muros.js'], 'Muros'), Ambiente: loadBrowser(['ambiente.js'], 'Ambiente'), Ajustes: loadBrowser(['ajustes.js'], 'Ajustes') };
    const E = Escena.make(mods);
    const { normSheet, CHARS } = loadSheets(loadFichas());
    const { TERR } = run(`${between('const TERR={', '\n};')}\n};`, ['TERR']);
    const miniKinds = CHARS.map((c) => c[0]);
    const deps = (pieces = new Map()) => ({ pieces, opaque: run(lineOf('const opaque='), ['opaque'], { Catalogo, PIECES: pieces }).opaque,
      ft: (p) => Catalogo.factoryType(p), terr: TERR, miniKinds, normSheet });
    return { Escena: E, deps, Ambiente: mods.Ambiente };
  },
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
