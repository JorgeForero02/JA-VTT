-- Arte por tamaño (T5b): cada personaje dibujado guarda el tamaño de su lienzo (tiny … gargantuan, los
-- de Fichas.SIZES); NULL en los de antes, que se leen como Medianos. Un Colosal a 64 píxeles por
-- casilla mide 256×384: el alto máximo de un dibujo pasa de 256 a 384.
ALTER TABLE t3d.drawings ADD COLUMN IF NOT EXISTS char_size TEXT
  CHECK (char_size IS NULL OR char_size IN ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'));
ALTER TABLE t3d.drawings DROP CONSTRAINT IF EXISTS drawings_height_check;
ALTER TABLE t3d.drawings ADD CONSTRAINT drawings_height_check CHECK (height BETWEEN 1 AND 384);
