'use strict';
/* Base de pruebas del tablero 3D dentro de JA-VTT. `resetSchema()` borra `public` Y `t3d`: con sólo
   `public`, el esquema t3d se quedaría sin sus claves ajenas. Nunca apuntar a producción. */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://jav:jav@localhost:55432/jav_test';
const db = require('../../../server/db');
const t3dDb = require('../../../modules/tablero3d/db').createDb(db.pool);

async function dropSchemas() {
  await db.pool.query('DROP SCHEMA IF EXISTS t3d CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
async function resetSchema() {
  await dropSchemas();
  return [...await db.migrate(), ...await t3dDb.migrate()];
}
module.exports = { db, t3dDb, dropSchemas, resetSchema };
