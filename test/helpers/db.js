'use strict';
/* Base de pruebas: TEST_DATABASE_URL apunta a un Postgres desechable.
   `resetSchema()` borra TODO el esquema public: nunca apuntar a producción. */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://jav:jav@localhost:55432/jav_test';

const db = require('../../server/db');

async function resetSchema() {
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return db.migrate();
}

module.exports = { db, resetSchema };
