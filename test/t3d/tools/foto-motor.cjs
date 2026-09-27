'use strict';
/* Foto del motor 3D ANTES del refactor de tablero3d.js (tarea 1): luces (normLight, lightOfType, lightRGB y sus listas),
   azar (mulberry32, hash, pick) y los cuatro generadores de mapas (demo, mazmorra con dos semillas, pueblo, taller de luces),
   recortados del texto actual con test/t3d/helpers/motor.js. Uso (sólo una vez; es la referencia):
     node test/t3d/tools/foto-motor.cjs      → escribe test/t3d/fixtures/motor-antes.json
   Si el fichero ya existe, se niega: la foto NO se regenera nunca después de la tarea 1 (como fabrica-antes.json). */
const fs = require('node:fs');
const path = require('node:path');
const { load, CASOS_LUZ, plain } = require('../helpers/motor');

const OUT = path.join(__dirname, '..', 'fixtures', 'motor-antes.json');
if (fs.existsSync(OUT)) { console.error(`${OUT} ya existe: la foto del motor no se regenera.`); process.exit(1); }

const L = load('luces'), A = load('azar'), G = load('mapas');
const r = A.mulberry32(7);
const TRIOS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [3, 5, 7], [7, 3, 91], [-1, -1, 31], [-5, 12, 32], [47, 39, 77], [100, 200, 3],
  [12345, 678, 9], [-12345, 678, 9], [31, 31, 31], [2, 2, 2], [1e6, 1e6, 1e6], [63, 0, 12345]];
const foto = {
  luces: {
    normLight: CASOS_LUZ.map((c) => L.normLight(c)),
    lightOfType: Object.fromEntries(L.LIGHT_IDS.map((id) => [id, L.lightOfType(id)])),
    lightRGB: Object.fromEntries(['#ff9c50', '#000000', 'mal'].map((h) => [h, L.lightRGB(h)])),
    // extra: lo demás que exporta la hoja de luces
    listas: { WARM: L.WARM, LIGHT_TYPES: L.LIGHT_TYPES, LIGHT_IDS: L.LIGHT_IDS, OBJ_LIGHT_IDS: L.OBJ_LIGHT_IDS, LIGHT_ANIMS: L.LIGHT_ANIMS, TOKEN_LIGHTS: L.TOKEN_LIGHTS, HEX6: String(L.HEX6) },
    lightOfTypeKeep: L.lightOfType('bullseye', { rot: 45, on: false }),
    lightName: [{ name: 'Mía' }, { preset: 'moon' }, { preset: 'nope' }, {}].map((p) => L.lightName(p)),
    hexRGB: L.hexRGB('#12abEF'),
  },
  azar: {
    mulberry32_7: Array.from({ length: 8 }, () => r()),
    hash: TRIOS.map(([x, z, s]) => [x, z, s, A.hash(x, z, s)]),
    pick: TRIOS.map(([x, z, s]) => A.pick(['a', 'b', 'c', 'd', 'e'], x, z, s)),
  },
  mapas: {
    demo: plain(G.demoMap()), dungeon32_7: plain(G.dungeonMap(32, 7)), dungeon48_12345: plain(G.dungeonMap(48, 12345)), dungeon64_4242: plain(G.dungeonMap(64, 4242)),
    town: plain(G.townMap()), taller: plain(G.lightWorkshopMap()),
  },
};
fs.writeFileSync(OUT, JSON.stringify(foto) + '\n');
console.log(`foto escrita: ${OUT}`);
