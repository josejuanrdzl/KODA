-- SQL Script to grant all modules to all plans temporarily
-- Run this in the Supabase SQL Editor

DO $$
DECLARE
    p_slug TEXT;
    m_slug TEXT;
    plans TEXT[] := ARRAY['free', 'starter', 'personal', 'executive', 'business'];
    modules TEXT[] := ARRAY['weather', 'fx-rates', 'spotify', 'sports', 'luna', 'shopping', 'familia', 'gmail', 'calendar', 'messaging', 'memory'];
BEGIN
    FOREACH p_slug IN ARRAY plans
    LOOP
        FOREACH m_slug IN ARRAY modules
        LOOP
            INSERT INTO plan_modules (plan_slug, module_slug, is_included, updated_at)
            VALUES (p_slug, m_slug, true, NOW())
            ON CONFLICT (plan_slug, module_slug) 
            DO UPDATE SET is_included = true, updated_at = NOW();
        END LOOP;
    END LOOP;
END $$;
