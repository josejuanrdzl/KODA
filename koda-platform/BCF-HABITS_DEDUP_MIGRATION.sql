-- CONSTRAINT ANTI-DUPLICADOS PARA HÁBITOS
-- Previene que un usuario tenga dos hábitos activos con el mismo nombre (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS habits_user_name_active_unique
ON habits (user_id, LOWER(name))
WHERE status = 'active';
