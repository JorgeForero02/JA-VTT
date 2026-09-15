'use strict';
/* Contraseñas con scrypt nativo. Formato guardado: scrypt$N$sal_hex$hash_hex. */
const crypto = require('node:crypto');

const SCRYPT_N = 16384;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;

const scrypt = (password, salt, n) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, KEY_BYTES, { N: n }, (err, key) => (err ? reject(err) : resolve(key)));
});

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_N);
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algo, nText, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !/^\d+$/.test(nText) || !/^[0-9a-f]+$/.test(saltHex || '') || !/^[0-9a-f]+$/.test(hashHex || '')) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEY_BYTES) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), Number(nText));
  return crypto.timingSafeEqual(key, expected);
}

const validPassword = (v) => typeof v === 'string' && v.length >= MIN_PASSWORD && v.length <= MAX_PASSWORD;

module.exports = { hashPassword, verifyPassword, validPassword, MIN_PASSWORD };
