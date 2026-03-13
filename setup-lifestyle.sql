-- 1. Registrar módulos en catálogo maestro
INSERT INTO public.modules (slug, name, display_name, short_description, icon, phase, is_core, is_public, sort_order)
VALUES
  ('weather',          'Weather',           'Clima',            'Pronóstico personalizado y alertas de clima extremo',        '🌤️', 1, false, true, 11),
  ('fx-rates',         'FX Rates',          'Tipo de Cambio',   'Divisas en tiempo real con alertas de umbral',               '💱', 1, false, true, 12),
  ('spotify',          'Spotify',           'Música',           'Playlists por mood, actividad o momento del día',            '🎵', 1, false, true, 13),
  ('sports-nfl',       'NFL',               'NFL',              'Resultados, standings y alertas de la NFL',                  '🏈', 1, false, true, 20),
  ('sports-nba',       'NBA',               'NBA',              'Resultados, standings y alertas de la NBA',                  '🏀', 1, false, true, 21),
  ('sports-bbva',      'Liga BBVA MX',      'Liga BBVA MX',     'Resultados, standings y alertas de la Liga MX',              '⚽', 1, false, true, 22),
  ('sports-nhl',       'NHL',               'NHL',              'Resultados, standings y alertas de la NHL',                  '🏒', 1, false, true, 23),
  ('sports-epl',       'Premier League',    'Premier League',   'Resultados, standings y alertas de la EPL',                  '⚽', 1, false, true, 24),
  ('sports-laliga',    'LaLiga',            'LaLiga',           'Resultados, standings y alertas de LaLiga',                  '⚽', 1, false, true, 25),
  ('sports-champions', 'Champions League',  'Champions',        'Resultados y alertas de la UEFA Champions League',           '🏆', 1, false, true, 26),
  ('sports-f1',        'Fórmula 1',         'Fórmula 1',        'Resultados, calendario y alertas de F1',                     '🏎️', 1, false, true, 27),
  ('luna',             'Luna',              'KODA Luna',        'Bienestar femenino — ciclo, fases y autocuidado inteligente', '🌙', 1, false, true, 30),
  ('shopping',         'Shopping List',     'Lista de Compras', 'Listas inteligentes por voz o chat',                         '🛒', 1, false, true, 31),
  ('familia',          'Familia',           'Mi Familia',       'KODA conoce tu familia — horarios, actividades y momentos',  '👨‍👩‍👧‍👦', 1, false, true, 32)
ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name;

-- 2. Asignar a plan_modules (todos incluidos en todos los planes)
INSERT INTO public.plan_modules (plan_slug, module_slug, is_included)
SELECT p.slug, m.slug, true
FROM public.plans p
CROSS JOIN public.modules m
WHERE m.slug IN ('weather','fx-rates','spotify','sports-nfl','sports-nba',
  'sports-bbva','sports-nhl','sports-epl','sports-laliga','sports-champions',
  'sports-f1','luna','shopping','familia')
ON CONFLICT DO NOTHING;

-- 3. Asignar a style_modules (Lifestyle incluye todos los lifestyle modules)
INSERT INTO public.style_modules (style_slug, module_slug)
VALUES
  ('lifestyle','weather'), ('lifestyle','fx-rates'), ('lifestyle','spotify'),
  ('lifestyle','sports-nfl'), ('lifestyle','sports-nba'), ('lifestyle','sports-bbva'),
  ('lifestyle','luna'), ('lifestyle','shopping'), ('lifestyle','familia')
ON CONFLICT DO NOTHING;

-- 4. Tablas nuevas de módulos
CREATE TABLE IF NOT EXISTS public.user_fx_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pair       TEXT NOT NULL,
  threshold  DECIMAL(10,4) NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('above','below')),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.user_fx_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_alerts_owner" ON public.user_fx_alerts
  FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_sports_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  league_slug TEXT NOT NULL,
  team_name   TEXT NOT NULL,
  team_id     TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, league_slug, team_name)
);
ALTER TABLE public.user_sports_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_owner" ON public.user_sports_teams
  FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.luna_cycles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_start  DATE NOT NULL,
  cycle_length INTEGER DEFAULT 28,
  phase        TEXT,
  notes        TEXT,
  symptoms     JSONB,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.luna_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "luna_private" ON public.luna_cycles
  FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT DEFAULT 'Supermercado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shopping_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT,
  quantity   TEXT,
  is_checked BOOLEAN DEFAULT false,
  added_by   UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_owner" ON public.shopping_lists
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "shopping_items_access" ON public.shopping_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shopping_lists
                 WHERE id = list_id AND user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.family_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relation     TEXT NOT NULL,
  birthdate    DATE,
  school       TEXT,
  school_start TIME,
  school_end   TIME,
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.family_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  day_of_week INTEGER[],
  start_time  TIME,
  end_time    TIME,
  location    TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_owner" ON public.family_members
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "family_activities_owner" ON public.family_activities
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_members
                 WHERE id = member_id AND user_id = auth.uid()));
