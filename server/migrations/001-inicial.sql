-- Esquema inicial de Just Another VTT sobre PostgreSQL.
-- Los tiempos son milisegundos desde época (BIGINT), como en el cliente.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT   NOT NULL,
  color         TEXT   NOT NULL,
  password_hash TEXT   NOT NULL,
  created_at    BIGINT NOT NULL
);
CREATE UNIQUE INDEX users_name_ci ON users (lower(name));

CREATE TABLE sessions (
  token      TEXT   PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE boards (
  id           TEXT   PRIMARY KEY,
  name         TEXT   NOT NULL,
  owner_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code  TEXT   NOT NULL UNIQUE,
  settings     JSONB  NOT NULL DEFAULT '{}'::jsonb,
  active_scene TEXT,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE scenes (
  id         TEXT    PRIMARY KEY,
  board_id   TEXT    NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  settings   JSONB   NOT NULL DEFAULT '{}'::jsonb,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT  NOT NULL
);
CREATE INDEX scenes_board ON scenes(board_id);

CREATE TABLE board_members (
  board_id  TEXT   NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT   NOT NULL CHECK (role IN ('gm', 'player')),
  joined_at BIGINT NOT NULL,
  scene_id  TEXT,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE objects (
  board_id TEXT   NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  id       BIGINT NOT NULL,
  scene_id TEXT   REFERENCES scenes(id) ON DELETE CASCADE,
  type     TEXT   NOT NULL,
  data     JSONB  NOT NULL,
  PRIMARY KEY (board_id, id)
);
CREATE INDEX objects_scene ON objects(scene_id);

CREATE TABLE images (
  id         TEXT   PRIMARY KEY,
  board_id   TEXT   REFERENCES boards(id) ON DELETE CASCADE,
  owner_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT   NOT NULL,
  category   TEXT   NOT NULL,
  mime       TEXT   NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  ppc        REAL   NOT NULL DEFAULT 0,
  size       INTEGER NOT NULL,
  origin     TEXT   NOT NULL DEFAULT 'local',
  data       BYTEA  NOT NULL,
  thumb      BYTEA,
  thumb_mime TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX images_board ON images(board_id);

CREATE TABLE fog (
  scene_id   TEXT    NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id    BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cx         INTEGER NOT NULL,
  cy         INTEGER NOT NULL,
  data       BYTEA   NOT NULL,
  updated_at BIGINT  NOT NULL,
  PRIMARY KEY (scene_id, user_id, cx, cy)
);
