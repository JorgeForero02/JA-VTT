-- Tipo de mesa: un tablero es 3D si tiene fila aquí. Se elige al crear el tablero y no cambia
-- (el módulo no tiene ruta para quitarla); se va sólo con el tablero (ON DELETE CASCADE).
-- En una base de JA-VTT la tabla nace vacía: sus tableros siguen siendo 2D. Este repo, en el que
-- todo tablero es 3D, marca los suyos al arrancar (opción allBoards3D del anfitrión).
CREATE TABLE IF NOT EXISTS t3d.boards (
  board_id   TEXT   PRIMARY KEY REFERENCES public.boards(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
