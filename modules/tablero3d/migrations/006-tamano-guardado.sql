-- Cuota del tablero con una sola medida: los bytes UTF-8 del JSON que el módulo guarda de cada escena y campaña (el mismo texto
-- que manda a Postgres), apuntados en `size` al escribir, como ya hacían los dibujos (bytes de sus capas PNG). Antes se sumaba
-- pg_column_size (comprimido) y se comparaba con la longitud del JSON nuevo. NULL = sin medir: el módulo lo mide al arrancar.
ALTER TABLE t3d.scenes ADD COLUMN IF NOT EXISTS size BIGINT;
ALTER TABLE t3d.campaigns ADD COLUMN IF NOT EXISTS size BIGINT;
