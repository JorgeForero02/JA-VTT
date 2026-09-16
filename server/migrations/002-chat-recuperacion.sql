-- Código de recuperación de contraseña (en claro: el usuario quiere consultarlo desde su perfil)
ALTER TABLE users ADD COLUMN recovery_code TEXT;

-- Chat del tablero: texto, tiradas y avisos del sistema
CREATE TABLE chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  board_id   TEXT   NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT   NOT NULL CHECK (kind IN ('text', 'roll', 'system')),
  body       JSONB  NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX chat_messages_board ON chat_messages(board_id, id);
