'use strict';
/* Fórmulas de dados: "2d6+3", "d20", "1d100-1", "4d6 + 2d8". El resultado lo decide
   el servidor con crypto.randomInt para que todos los clientes vean la misma tirada. */
const crypto = require('node:crypto');

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_TERMS = 5;
const MAX_DICE = 20;
const MAX_MOD = 1000;

function parse(formula) {
  const text = String(formula || '').toLowerCase().replace(/\s+/g, '');
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

function roll(formula) {
  const { terms, mod } = parse(formula);
  let total = mod;
  const dice = terms.map((t) => {
    const rolls = Array.from({ length: t.n }, () => crypto.randomInt(1, t.sides + 1));
    total += t.sign * rolls.reduce((a, b) => a + b, 0);
    return { n: t.n, sides: t.sides, sign: t.sign, rolls };
  });
  return { formula: describe(terms, mod), dice, mod, total };
}

function describe(terms, mod) {
  let s = terms.map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.n}d${t.sides}`).join('');
  if (mod) s += (mod > 0 ? '+' : '') + mod;
  return s;
}

module.exports = { parse, roll, SIDES, MAX_DICE, MAX_TERMS };
