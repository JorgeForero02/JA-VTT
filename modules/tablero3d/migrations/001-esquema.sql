-- Esquema del módulo del tablero 3D. Sus tablas cuelgan de las del anfitrión (public.boards y
-- public.users, las mismas en este repo y en Just Another VTT).
-- Todo con IF NOT EXISTS: en una base de este repo que ya tenía el 3D, la migración 003 del núcleo
-- mudó aquí las tablas con sus datos; en una base nueva o de JA-VTT se crean ahora.

CREATE SCHEMA IF NOT EXISTS t3d;

-- Escena: un mapa 3D (alturas, terreno, objetos, techos, personajes) serializado por el cliente.
-- El id lo genera el cliente; es único dentro del tablero.
CREATE TABLE IF NOT EXISTS t3d.scenes (
  board_id   TEXT    NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  id         TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  width      INTEGER NOT NULL CHECK (width BETWEEN 4 AND 160),
  depth      INTEGER NOT NULL CHECK (depth BETWEEN 4 AND 160),
  data       JSONB   NOT NULL,
  created_at BIGINT  NOT NULL,
  updated_at BIGINT  NOT NULL,
  PRIMARY KEY (board_id, id)
);

-- Campaña: varias escenas unidas por escaleras, con notas del director por escena.
CREATE TABLE IF NOT EXISTS t3d.campaigns (
  board_id   TEXT   NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  id         TEXT   NOT NULL,
  name       TEXT   NOT NULL,
  data       JSONB  NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (board_id, id)
);

-- Dibujo del editor de pixel art: casilla, personaje u objeto 3D por rebanadas.
CREATE TABLE IF NOT EXISTS t3d.drawings (
  board_id    TEXT    NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  id          TEXT    NOT NULL,
  owner_id    BIGINT  REFERENCES public.users(id) ON DELETE SET NULL,
  -- clave del arte que sustituye o añade (g:top, knight, c_heroe…); el id es la misma clave saneada para la URL
  key         TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('tile', 'char', 'obj')),
  target      TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  res         INTEGER NOT NULL CHECK (res IN (16, 32, 64)),
  width       INTEGER NOT NULL CHECK (width BETWEEN 1 AND 256),
  height      INTEGER NOT NULL CHECK (height BETWEEN 1 AND 256),
  light       BOOLEAN NOT NULL DEFAULT false,
  frames      INTEGER NOT NULL CHECK (frames BETWEEN 1 AND 512),
  cols        INTEGER NOT NULL CHECK (cols >= 1),
  frame_names JSONB   NOT NULL DEFAULT '[]'::jsonb,
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  BIGINT  NOT NULL,
  updated_at  BIGINT  NOT NULL,
  PRIMARY KEY (board_id, id)
);
-- Dónde y cómo alumbra un objeto 3D: píxel (px, py) de la rebanada s, radio r en casillas,
-- color c (#rrggbb) y parpadeo f (0 o 1). NULL: el objeto no da luz o la da centrada (dibujos antiguos).
ALTER TABLE t3d.drawings ADD COLUMN IF NOT EXISTS light_spec JSONB;

-- Cada capa de un dibujo es una hoja PNG con todos sus cuadros (bytes, como las imágenes de JA-VTT).
CREATE TABLE IF NOT EXISTS t3d.drawing_layers (
  board_id   TEXT    NOT NULL,
  drawing_id TEXT    NOT NULL,
  idx        INTEGER NOT NULL CHECK (idx BETWEEN 0 AND 7),
  name       TEXT    NOT NULL,
  visible    BOOLEAN NOT NULL DEFAULT true,
  mime       TEXT    NOT NULL DEFAULT 'image/png',
  data       BYTEA   NOT NULL,
  PRIMARY KEY (board_id, drawing_id, idx),
  FOREIGN KEY (board_id, drawing_id) REFERENCES t3d.drawings(board_id, id) ON DELETE CASCADE
);
-- Opacidad (0 a 100) y bloqueo de cada capa del editor.
ALTER TABLE t3d.drawing_layers ADD COLUMN IF NOT EXISTS opacity INTEGER NOT NULL DEFAULT 100 CHECK (opacity BETWEEN 0 AND 100);
ALTER TABLE t3d.drawing_layers ADD COLUMN IF NOT EXISTS locked  BOOLEAN NOT NULL DEFAULT false;

-- Mesa en vivo: escena compartida, fichas, combate y puertas. Vive en memoria y se vuelca aquí.
CREATE TABLE IF NOT EXISTS t3d.live_docs (
  board_id   TEXT   NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  key        TEXT   NOT NULL CHECK (key IN ('board', 'tokens', 'combat', 'doors')),
  data       JSONB  NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (board_id, key)
);
