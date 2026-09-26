'use strict';
/* Dados de la mesa 3D con la notación y el formato de Just Another VTT (su server/dice.js; fijo
   test/fixtures/ja-vtt/dice.json): "2d6+3", "d20", "1d100-1", "4d6 + 2d8". La tirada la decide el servidor
   con crypto.randomInt, así todos ven la misma, y su cuerpo es el que guarda JA-VTT en chat_messages
   (kind 'roll'): { formula, dice: [{ n, sides, sign, rolls }], mod, total, label? }. Extra del 3D: `adv`
   (ventaja 1 o desventaja -1, sólo con 1d20): se tiran dos d20 y cuenta el mayor o el menor. El cliente tiene
   la misma cuenta en public/dados.js (un test los compara). */
const crypto = require('node:crypto');

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_TERMS = 5;
const MAX_DICE = 20;
const MAX_MOD = 1000;

function parse(formula) {
  // "2d8 1d4" y "2d6 + 3" valen: los espacios entre términos suman
  const text = String(formula || '').toLowerCase().trim().replace(/\s*([+-])\s*/g, '$1').replace(/\s+/g, '+');
  if (!text || text.length > 60) throw new Error('Fórmula vacía o demasiado larga');
  const parts = text.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== text) throw new Error('Fórmula no válida');
  const terms = []; let mod = 0;
  for (const raw of parts) {
    const sign = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    const dice = /^(\d*)d(\d+)$/.exec(body);
    if (dice) {
      const n = dice[1] === '' ? 1 : Number(dice[1]), sides = Number(dice[2]);
      if (!SIDES.includes(sides)) throw new Error(`No hay dados de ${sides} caras (sí: ${SIDES.join(', ')})`);
      if (n < 1 || n > MAX_DICE) throw new Error(`Entre 1 y ${MAX_DICE} dados por término`);
      terms.push({ n, sides, sign });
      continue;
    }
    if (/^\d+$/.test(body)) { mod += sign * Number(body); continue; }
    throw new Error(`No entiendo «${raw}»`);
  }
  if (!terms.length) throw new Error('La fórmula necesita al menos un dado');
  if (terms.length > MAX_TERMS) throw new Error(`Como mucho ${MAX_TERMS} grupos de dados`);
  if (Math.abs(mod) > MAX_MOD) throw new Error('Modificador demasiado grande');
  return { terms, mod };
}

function describe(terms, mod) {
  let s = terms.map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.n}d${t.sides}`).join('');
  if (mod) s += (mod > 0 ? '+' : '') + mod;
  return s;
}

const d = (sides) => crypto.randomInt(1, sides + 1);
/* rng(sides) → 1..sides (por defecto crypto.randomInt; los tests pasan uno fijo) */
function roll(formula, opts = {}) {
  const rng = opts.rng || d;
  const { terms, mod } = parse(formula);
  const adv = opts.adv === 1 || opts.adv === -1 ? opts.adv : 0;
  if (adv && terms.length === 1 && terms[0].n === 1 && terms[0].sides === 20 && terms[0].sign === 1) {
    const rolls = [rng(20), rng(20)], kept = adv > 0 ? Math.max(...rolls) : Math.min(...rolls);
    const t2 = [{ n: 2, sides: 20, sign: 1 }];
    return { formula: describe(t2, mod), dice: [{ n: 2, sides: 20, sign: 1, rolls }], mod, total: kept + mod, adv };
  }
  let total = mod;
  const dice = terms.map((t) => {
    const rolls = Array.from({ length: t.n }, () => rng(t.sides));
    total += t.sign * rolls.reduce((a, b) => a + b, 0);
    return { n: t.n, sides: t.sides, sign: t.sign, rolls };
  });
  return { formula: describe(terms, mod), dice, mod, total };
}

module.exports = { parse, roll, describe, SIDES, MAX_DICE, MAX_TERMS, MAX_MOD };
