-- Fase 0 del arte propio: definiciones de piezas del tablero (docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md).
-- Una fila = una definición `p:…` (forma, componentes, estados, variantes); las piezas de fábrica viven en el catálogo, no aquí.
CREATE TABLE IF NOT EXISTS t3d.pieces (
  board_id   TEXT    NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  id         TEXT    NOT NULL CHECK (id ~ '^p:[a-z0-9]{2,40}$'),
  name       TEXT    NOT NULL,
  data       JSONB   NOT NULL,
  size       BIGINT  NOT NULL,
  created_at BIGINT  NOT NULL,
  updated_at BIGINT  NOT NULL,
  PRIMARY KEY (board_id, id)
);
