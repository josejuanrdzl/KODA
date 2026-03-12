-- Extensión recomendada para UUIDs seguros
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Extensión requerida para trabajos programados (cron) en Supabase
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ENUMS
CREATE TYPE plan_type AS ENUM ('personal', 'team', 'business', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user');
CREATE TYPE connector_type AS ENUM ('gmail', 'office365');
CREATE TYPE language_preference AS ENUM ('es', 'en');
CREATE TYPE tone_preference AS ENUM ('formal', 'friendly', 'executive');

-- -----------------------------------------------------
-- 1. TENANTS (EMPRESAS/CLIENTES)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    plan plan_type NOT NULL DEFAULT 'personal',
    status tenant_status NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------
-- 2. USERS (USUARIOS DE CADA TENANT)
-- -----------------------------------------------------

-- Si la tabla ya existe, la alteramos en lugar de crearla
ALTER TABLE IF EXISTS users 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS language language_preference NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS tone_preference tone_preference NOT NULL DEFAULT 'friendly';

-- Si no existe, la creamos (ej. en local o entorno nuevo)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'user',
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    language language_preference NOT NULL DEFAULT 'es',
    tone_preference tone_preference NOT NULL DEFAULT 'friendly',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice clave para consultas muy recurrentes por tenant
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

-- Función Helpers para RLS: Obtener tenant_id del usuario actual (cachado durante la transacción para velocidad)
CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- Función Helpers para RLS: Verificar si es admin/super_admin
CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- -----------------------------------------------------
-- 3. CONNECTORS (TOKENS OAUTH O365 / GMAIL)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type connector_type NOT NULL,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Asegurar que un usuario no tenga duplicados del mismo conector
    UNIQUE(user_id, type)
);

CREATE INDEX idx_connectors_user_id ON connectors(user_id);

-- -----------------------------------------------------
-- 4. MODULES (CATÁLOGO GLOBAL)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    phase INTEGER DEFAULT 1,
    is_core BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------
-- 5. TENANT_MODULES (MÓDULOS ACTIVOS POR TENANT)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_modules (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_slug TEXT NOT NULL REFERENCES modules(slug) ON DELETE CASCADE,
    enabled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    disabled_at TIMESTAMP WITH TIME ZONE,
    config JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, module_slug)
);

CREATE INDEX idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);

-- -----------------------------------------------------
-- 6. USAGE_EVENTS (ANALYTICS - HASH ANON)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id_hash TEXT NOT NULL,
    user_id_hash TEXT NOT NULL,
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    query_type TEXT,
    response_ms INTEGER,
    success BOOLEAN DEFAULT true,
    zone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices prioritarios para agilizar analíticas cronológicas y por cuenta agrupada
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX idx_usage_events_tenant_hash ON usage_events(tenant_id_hash);

-- -----------------------------------------------------
-- 7. MINI_PORTALS (PORTALES EFÍMEROS)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS mini_portals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Funciona como token de URL
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE,
    channel_origin TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_mini_portals_user_id ON mini_portals(user_id);
-- Muy importante para acelerar la función de vaciado del cron
CREATE INDEX idx_mini_portals_expires_at ON mini_portals(expires_at);

-- -----------------------------------------------------
-- 8. AUDIT_LOG (HISTORIAL ACCIONES KODA)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    channel TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);

-- -----------------------------------------------------
-- ROW LEVEL SECURITY (RLS) ACTIVACIÓN Y POLÍTICAS
-- Aislamiento estricto multi-tenant ("Silo Arquitecture")
-- -----------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Tenants
CREATE POLICY "Tenants: Lectura propia" 
ON tenants FOR SELECT USING (id = current_user_tenant_id());

-- Users
CREATE POLICY "Users: Lectura de su mismo tenant" 
ON users FOR SELECT USING (tenant_id = current_user_tenant_id());
CREATE POLICY "Users: Lectura/Escritura propia" 
ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users: Admins pueden insertar en su tenant" 
ON users FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id() AND is_tenant_admin());
CREATE POLICY "Users: Admins pueden actualizar en su tenant" 
ON users FOR UPDATE USING (tenant_id = current_user_tenant_id() AND is_tenant_admin());

-- Connectors
CREATE POLICY "Connectors: Acceso exclusivo propietario" 
ON connectors FOR ALL USING (user_id = auth.uid());

-- Modules (Catálogo Global Público para Lectura)
CREATE POLICY "Modules: Lectura global" 
ON modules FOR SELECT USING (true);

-- Tenant Modules
CREATE POLICY "Tenant Modules: Lectura de su mismo tenant" 
ON tenant_modules FOR SELECT USING (tenant_id = current_user_tenant_id());
CREATE POLICY "Tenant Modules: Administración solo por admins" 
ON tenant_modules FOR ALL USING (tenant_id = current_user_tenant_id() AND is_tenant_admin());

-- Usage Events
-- La inserción debe hacerse desde Edge Functions / Backend (Service Role Key).
-- Lectura opcional para analíticas compartidas en dashboard de admin:
CREATE POLICY "Usage Events: Lectura admins de hash" 
ON usage_events FOR SELECT USING (is_tenant_admin()); 

-- Mini Portals
CREATE POLICY "Mini Portals: Aislamiento por usuario" 
ON mini_portals FOR ALL USING (user_id = auth.uid());

-- Audit Log
CREATE POLICY "Audit Log: Aislamiento por tenant" 
ON audit_log FOR SELECT USING (tenant_id = current_user_tenant_id());


-- -----------------------------------------------------
-- JOB DE LIMPIEZA AUTOMÁTICA (PG_CRON)
-- -----------------------------------------------------

-- Función PL/pgSQL que elimina registros vencidos
CREATE OR REPLACE FUNCTION cleanup_expired_mini_portals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Batch deletion seguro evitando bloqueos largos en producción
  DELETE FROM mini_portals WHERE expires_at < now();
END;
$$;

-- Programación en pg_cron (ej. se ejecuta cada hora, minuto 0)
SELECT cron.schedule(
  'purge-expired-portals-job',
  '0 * * * *',
  'SELECT cleanup_expired_mini_portals();'
);
