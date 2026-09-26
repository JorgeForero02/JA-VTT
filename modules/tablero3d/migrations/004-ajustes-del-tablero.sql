-- Ajustes del tablero 3D (T6b), con los nombres de los ajustes de tablero de Just Another VTT (su boards.settings).
-- De momento sólo playersDoors (los jugadores abren y cierran las puertas sin llave; por defecto sí). Vive en la fila
-- del tipo de mesa para no tocar ninguna tabla del anfitrión; T6d armonizará el resto de ajustes aquí mismo.
ALTER TABLE t3d.boards ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
