-- Terreno de una escena 2.5D: un blob por escena. h/m/chan: n*n bytes (altura 0..9, material 0..6, cauce 0/1).
-- extras: objetos, piezas de pared, fuentes de agua y ajustes (jsonb). El agua en sí (W) no se guarda.
CREATE TABLE terrain (
  scene_id   TEXT    PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL,
  h          BYTEA   NOT NULL,
  m          BYTEA   NOT NULL,
  chan       BYTEA   NOT NULL,
  extras     JSONB   NOT NULL DEFAULT '{}'::jsonb,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT  NOT NULL
);
