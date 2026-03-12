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

INSERT INTO public.modules (slug, name, display_name, short_description, icon, phase, is_core, is_public, sort_order)
VALUES
  ('familia', 'Familia', 'Mi Familia', 'KODA conoce tu familia — horarios y actividades', '👨👩👧👦', 1, false, true, 32)
ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.plan_modules (plan_slug, module_slug, is_included)
SELECT p.slug, m.slug, true
FROM public.plans p
CROSS JOIN public.modules m
WHERE m.slug = 'familia'
ON CONFLICT DO NOTHING;

