-- SQL schema for Shopping Module

CREATE TABLE IF NOT EXISTS public.shopping_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shopping_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Register 'shopping' module in KODA
INSERT INTO public.modules (name, slug, description, is_public) 
SELECT 'Shopping', 'shopping', 'Gestión de listas de compras y supermercado', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.modules WHERE slug = 'shopping'
);

-- Assign to all current plans
INSERT INTO public.plan_modules (plan_slug, module_slug, is_included)
SELECT p.slug, m.slug, true
FROM public.plans p
CROSS JOIN public.modules m
WHERE m.slug = 'shopping'
  AND NOT EXISTS (
      SELECT 1 FROM public.plan_modules pm 
      WHERE pm.plan_slug = p.slug AND pm.module_slug = m.slug
  );
