'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { db, t3dDb, dropSchemas, resetSchema } = require('./helpers/db');
const F = require('./helpers/fixtures');

const tables = async (schema) => (await db.pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name', [schema])).rows.map((r) => r.table_name);

before(async () => { await resetSchema(); });
after(async () => { await db.close(); });

test('migrate es idempotente: segunda pasada no aplica nada, ni en el núcleo ni en el módulo', async () => {
  assert.deepEqual(await db.migrate(), []);
  assert.deepEqual(await t3dDb.migrate(), []);
  const mod = await db.pool.query('SELECT version, name FROM t3d.schema_migrations ORDER BY version');
  assert.deepEqual(mod.rows.map((r) => r.name), ['001-esquema.sql', '002-tableros-3d.sql', '003-arte-por-tamano.sql', '004-ajustes-del-tablero.sql', '005-planos-en-vivo.sql', '006-tamano-guardado.sql']);
});

test('módulo: luz de los objetos y opacidad y bloqueo de las capas', async () => {
  const cols = await db.pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 't3d' AND (table_name, column_name) IN (('drawings', 'light_spec'), ('drawings', 'char_size'), ('drawing_layers', 'opacity'), ('drawing_layers', 'locked')) ORDER BY 1, 2");
  assert.deepEqual(cols.rows.map((r) => `${r.table_name}.${r.column_name}`), ['drawing_layers.locked', 'drawing_layers.opacity', 'drawings.char_size', 'drawings.light_spec']);
});

test('módulo: su migración se puede repetir sin error (IF NOT EXISTS)', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tablero3d', 'migrations', '001-esquema.sql'), 'utf8');
  await db.pool.query(sql);
  await db.pool.query(sql);
  assert.deepEqual(await tables('t3d'), ['boards', 'campaigns', 'drawing_layers', 'drawings', 'live_docs', 'scenes', 'schema_migrations']);
});

test('dibujos: se guardan con sus capas en bytes y se reemplazan al volver a guardar', async () => {
  const gm = await db.createUser('Gm4', 'h');
  const board = await db.createBoard('Arte', gm.id);
  const layer = (idx) => ({ idx, name: `Capa ${idx}`, visible: true, mime: 'image/png', data: Buffer.from([idx, 1, 2, 3]) });
  const d = { id: 'c_heroe1', ownerId: gm.id, key: 'c_heroe1', kind: 'char', target: 'c_heroe1', name: 'Héroe', res: 32, width: 32, height: 32, light: false, frames: 3, cols: 3, frameNames: ['a', 'b', 'c'], size: 8 };
  await t3dDb.saveDrawing(board.id, d, [layer(0), layer(1)]);
  await t3dDb.saveDrawing(board.id, Object.assign({}, d, { name: 'Heroína' }), [layer(0)]);
  const [row] = await t3dDb.q.drawings(board.id, 10);
  assert.equal(row.name, 'Heroína');
  assert.deepEqual(row.frame_names, ['a', 'b', 'c']);
  const layers = await t3dDb.q.drawingLayers(board.id, [row.id]);
  assert.equal(layers.length, 1);
  assert.ok(Buffer.isBuffer(layers[0].data));
  assert.equal((await t3dDb.q.boardUsage(board.id)).bytes > 0, true);
  await t3dDb.q.deleteDrawing(board.id, row.id);
  assert.equal((await t3dDb.q.drawingLayers(board.id, [row.id])).length, 0, 'las capas se borran en cascada');
});

test('dibujos: un personaje guarda el tamaño de su arte (migración 003); un Colosal a 64 px mide 256×384', async () => {
  const gm = await db.createUser('Gm4b', 'h');
  const board = await db.createBoard('Gigantes', gm.id);
  const layer = { idx: 0, name: 'Capa', visible: true, mime: 'image/png', data: Buffer.from([1]) };
  const d = { id: 'c_golem1', ownerId: gm.id, key: 'c_golem1', kind: 'char', target: 'new', name: 'Gólem', res: 64, width: 256, height: 384, light: false, frames: 3, cols: 3, frameNames: [], size: 1, charSize: 'gargantuan' };
  await t3dDb.saveDrawing(board.id, d, [layer]);
  const [row] = await t3dDb.q.drawings(board.id, 10);
  assert.deepEqual([row.char_size, row.height], ['gargantuan', 384]);
  await t3dDb.saveDrawing(board.id, Object.assign({}, d, { id: 'g_top', key: 'g:top', kind: 'tile', charSize: null, height: 64, width: 64 }), [layer]);
  assert.equal((await t3dDb.q.drawings(board.id, 10)).find((r) => r.id === 'g_top').char_size, null);
  await assert.rejects(t3dDb.saveDrawing(board.id, Object.assign({}, d, { charSize: 'titánico' }), [layer]), /char_size/);
  await assert.rejects(t3dDb.saveDrawing(board.id, Object.assign({}, d, { height: 385 }), [layer]), /drawings_height_check/);
});

test('campañas y mesa en vivo: upsert, lista y borrado', async () => {
  const gm = await db.createUser('Gm5', 'h');
  const board = await db.createBoard('Campañas', gm.id);
  await t3dDb.q.upsertCampaign(board.id, 'cbrezo', 'Brezo', F.campaign());
  assert.equal((await t3dDb.q.campaigns(board.id, 10))[0].data.cur, 'tpueblo');
  await t3dDb.q.deleteCampaign(board.id, 'cbrezo');
  assert.equal((await t3dDb.q.campaigns(board.id, 10)).length, 0);
  await t3dDb.q.upsertLiveDoc(board.id, 'tokens', { tokens: { k1: F.token(gm.id) } });
  await t3dDb.q.upsertLiveDoc(board.id, 'tokens', { tokens: {} });
  assert.deepEqual((await t3dDb.q.liveDocs(board.id)).map((r) => [r.key, r.data]), [['tokens', { tokens: {} }]]);
  await assert.rejects(t3dDb.q.upsertLiveDoc(board.id, 'otra', {}), /live_docs_key_check/);
  await t3dDb.q.deleteLiveDoc(board.id, 'tokens');
  assert.equal((await t3dDb.q.liveDocs(board.id)).length, 0);
});

test('borrar un tablero borra en cascada escenas, dibujos, campañas y mesa (tablas t3d.*)', async () => {
  const gm = await db.createUser('Gm6', 'h');
  const board = await db.createBoard('Borrable', gm.id);
  await t3dDb.q.upsertScene(board.id, 'b1', 'Claro', 8, 8, F.map(8));
  await t3dDb.q.upsertLiveDoc(board.id, 'board', { open: true, rev: 1 });
  await db.q.deleteBoard(board.id);
  // JA-VTT: sólo las tablas del módulo (t3d.*); public.chat_messages y public.board_members los cubren los tests del núcleo
  for (const t of ['t3d.scenes', 't3d.live_docs']) {
    const { rows } = await db.pool.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE board_id = $1`, [board.id]);
    assert.equal(rows[0].n, 0, t);
  }
});

test('base con el núcleo de JA-VTT (su propia public.scenes): la 003 no la toca y el módulo crea las suyas en t3d', async () => {
  await dropSchemas();
  await db.pool.query(`
    CREATE TABLE users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, password_hash TEXT NOT NULL, created_at BIGINT NOT NULL);
    CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, invite_code TEXT NOT NULL UNIQUE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb, active_scene TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
    CREATE TABLE board_members (board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, joined_at BIGINT NOT NULL, scene_id TEXT, PRIMARY KEY (board_id, user_id));
    CREATE TABLE scenes (id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, name TEXT NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb, sort INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL);
    INSERT INTO users (name, color, password_hash, created_at) VALUES ('Jav', '#fff', 'h', 0);
    INSERT INTO boards (id, name, owner_id, invite_code, created_at, updated_at) VALUES ('bjav', 'Mesa JA-VTT', 1, 'AAAAAA', 0, 0);
    INSERT INTO scenes (id, board_id, name, created_at) VALUES ('s1', 'bjav', 'Escena 1', 0);`);
  // JA-VTT: no se aplica aquí ninguna migración del núcleo (su propia 003, «003-sin-muestras.sql», no tiene relación con esto);
  // el punto de la prueba es que la migración del módulo por sí sola no toca public.scenes
  assert.deepEqual(await t3dDb.migrate(), ['t3d/001-esquema.sql', 't3d/002-tableros-3d.sql', 't3d/003-arte-por-tamano.sql', 't3d/004-ajustes-del-tablero.sql', 't3d/005-planos-en-vivo.sql', 't3d/006-tamano-guardado.sql']);
  assert.deepEqual(await tables('public'), ['board_members', 'boards', 'scenes', 'users']);
  assert.equal(await t3dDb.q.is3d('bjav'), false, 'en JA-VTT sus tableros siguen siendo 2D');
  assert.deepEqual(await tables('t3d'), ['boards', 'campaigns', 'drawing_layers', 'drawings', 'live_docs', 'scenes', 'schema_migrations']);
  assert.equal((await db.pool.query('SELECT name FROM public.scenes')).rows[0].name, 'Escena 1');
  const cols = await db.pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 't3d' AND column_name IN ('light_spec', 'char_size', 'opacity', 'locked') ORDER BY 1, 2");
  assert.deepEqual(cols.rows.map((r) => `${r.table_name}.${r.column_name}`), ['drawing_layers.locked', 'drawing_layers.opacity', 'drawings.char_size', 'drawings.light_spec']);
  await t3dDb.q.upsertScene('bjav', 'b1', 'Cueva', 8, 8, F.map(8));
  assert.equal((await t3dDb.q.scene('bjav', 'b1')).name, 'Cueva');
  assert.deepEqual(await t3dDb.migrate(), []);
});
