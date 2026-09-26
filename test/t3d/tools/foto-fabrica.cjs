'use strict';
/* Foto del comportamiento de las piezas de fábrica ANTES de la fase 0: lee PROP3D de tablero3d.js (las banderas
   anteriores a `fn:`), Muros (kindOf, WALL_TYPES, PASSABLE, SPANS) y las listas del servidor (rules.js). Uso:
   node test/t3d/tools/foto-fabrica.cjs > test/t3d/fixtures/fabrica-antes.json  (sólo una vez; es la referencia). */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const MOD = path.join(__dirname, '..', '..', '..', 'modules', 'tablero3d');
const src = fs.readFileSync(path.join(MOD, 'public', 'tablero3d.js'), 'utf8');
const a = src.indexOf('const PROP3D={');
let depth = 0, i = a + 13;
const start = i;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
const body = src.slice(start + 1, i);
const P3 = {};
for (const m of body.matchAll(/\n {2}([a-zA-Z0-9_]+):\{/g)) {
  const from = m.index + m[0].length, to = body.indexOf('fn:', from);
  P3[m[1]] = Function('return {' + body.slice(from, to).replace(/,\s*$/, '') + '}')();
}
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(MOD, 'public', 'muros.js'), 'utf8'), ctx);
const Mu = ctx.window.Tablero3D.Muros;
const R = require(path.join(MOD, 'rules.js'));
const out = {};
for (const t of [...Object.keys(P3), 'tree', 'brazier', 'light']) {
  const P = P3[t] || {}, k = Mu.kindOf({ type: t }), W = k ? Mu.WALL_TYPES[k] : null;
  out[t] = {
    span: P.span || [1, 1], orient: !!P.orient, walk: t === 'light' || !!P.walk, deck: P.deck || 0, door: !!P.door, lift: P.lift || 0,
    gmOnly: !!P.gmOnly, rand: t === 'tree' || !!P.rand, wallKind: k,
    sight: W ? !!W.sight : false, lightBlock: W ? !!W.light : false, hide: W ? !!W.hide : false, portal: !!(W && W.portal),
    emit: t === 'brazier' ? { r: 6, h: 0.8 } : P.light ? { r: P.light, h: (P.lightS || 16) / 16 } : null,
    cat: P.cat || null, hidden: !!P.hidden,
    // lo que la maleza puede ocultar: la regla de hideable() de antes (propCat ∈ furniture/decor/mine, sin tipo de muro ni luz)
    low: !k && t !== 'light' && t !== 'tree' && t !== 'brazier' && !P.light && !['fence', 'stairs'].includes(t) && (!P.cat || P.cat === 'decor' || P.cat === 'furniture'),
    server: { passable: R.PASSABLE_PROPS.includes(t), span: R.PROP_SPANS[t] || null, door: R.DOOR_PROPS.includes(t) },
  };
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
