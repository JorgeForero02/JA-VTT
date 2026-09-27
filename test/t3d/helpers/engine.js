'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MOD = path.join(__dirname, '..', '..', '..', 'modules', 'tablero3d', 'public');
// ficheros del motor en orden de carga (t3d.js loadAssets); cada extracción añade el suyo
const ENGINE_FILES = ['base.js', 'luces.js', 'objetos3d.js', 'escena.js', 'mapas.js', 'tablero3d.js'];
const readEngine = () => ENGINE_FILES.map((f) => fs.readFileSync(path.join(MOD, f), 'utf8')).join('\n');
module.exports = { MOD, ENGINE_FILES, readEngine };
