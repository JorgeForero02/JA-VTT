-- Planos de los jugadores en la mesa en vivo (T6d): nuevo documento `plans` (los planos del director van en la escena).
-- El documento `combat` sigue con su nombre y pasa a llevar la iniciativa con la forma de Just Another VTT (lo traduce el
-- módulo al abrir la mesa; no hace falta tocar los datos aquí).
ALTER TABLE t3d.live_docs DROP CONSTRAINT IF EXISTS live_docs_key_check;
ALTER TABLE t3d.live_docs ADD CONSTRAINT live_docs_key_check CHECK (key IN ('board', 'tokens', 'combat', 'doors', 'plans'));
