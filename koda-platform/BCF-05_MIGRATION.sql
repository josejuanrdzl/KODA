-- BCF-05 CommandRegistry Migration

-- 1. Asegurar que las columnas existen y son correctas
ALTER TABLE IF EXISTS koda_commands
ADD COLUMN IF NOT EXISTS plan_required text DEFAULT 'free';

-- Si trigger_pattern ya no se usa, opcionalmente tirarla después de confirmar
-- ALTER TABLE koda_commands DROP COLUMN IF EXISTS trigger_pattern;

-- 2. Insertar los comandos básicos obligatorios dictados por el BCF-05
INSERT INTO koda_commands
    (trigger_type, trigger_value, module_slug, intent, priority, plan_required, is_active)
VALUES
    ('exact', 'clima', 'weather', 'get_weather', 10, 'free', true),
    ('exact', 'dólar', 'fx-rates', 'get_rate', 10, 'free', true),
    ('exact', 'habitos', 'habits', 'list_habits', 10, 'free', true),
    ('exact', 'hábitos', 'habits', 'list_habits', 10, 'free', true),
    ('exact', 'recordatorios', 'reminders', 'list_reminders', 10, 'free', true),
    ('exact', 'ayuda', 'core', 'show_commands', 10, 'free', true),
    ('exact', 'configuracion', 'settings', 'show_menu', 10, 'free', true),
    ('exact', 'configuración', 'settings', 'show_menu', 10, 'free', true)
ON CONFLICT (trigger_value) DO UPDATE SET 
    trigger_type = EXCLUDED.trigger_type,
    module_slug = EXCLUDED.module_slug,
    intent = EXCLUDED.intent,
    priority = EXCLUDED.priority,
    plan_required = EXCLUDED.plan_required,
    is_active = EXCLUDED.is_active;

-- 3. Limpiar cualquier basura de trigger_pattern que pueda causar confusión si se usa select *
-- UPDATE koda_commands SET trigger_pattern = NULL;
