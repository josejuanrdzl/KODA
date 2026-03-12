# KODA Schema & Architecture Snapshot
**Última actualización:** 2026-03-11T10:03:05-06:00

Este documento contiene un resumen en tiempo real (snapshot) del esquema de base de datos de Supabase, las variables de entorno utilizadas, y la arquitectura de archivos del proyecto KODA.

---

## 1. Esquema de Base de Datos (Supabase)

### `tenants` (Gestión Multitenant)
- `id` (UUID): Identificador único de la cuenta.
- `name` (TEXT): Nombre de la empresa, inquilino o cuenta personal.
- `plan` (ENUM): Plan suscrito (`personal`, `team`, `business`, `enterprise`).
- `status` (ENUM): Estado de la cuenta (`active`, `suspended`, `trial`).
- `trial_ends_at` (TIMESTAMP): Fecha en la que caduca el periodo de prueba.
- `created_at` (TIMESTAMP): Fecha de creación del tenant.

### `users` (Usuarios y Preferencias)
- `id` (UUID): Referencia cruzada a `auth.users(id)`.
- `tenant_id` (UUID): Relación al tenant principal.
- `role` (ENUM): Nivel de permisos (`super_admin`, `admin`, `user`).
- `email` (TEXT): Correo electrónico (único).
- `full_name` (TEXT): Nombre completo asignado.
- `language` (ENUM): Preferencia de idioma (`es`, `en`).
- `tone_preference` (ENUM): Tono de KODA (`formal`, `friendly`, `executive`).
- `telegram_username` (TEXT): Alias extraído desde Telegram (añadido en Phase 3).
- `plan` (TEXT): Suscripción individual/básica del bot.
- `plan_status` (TEXT): Estatus del plan en Stripe/interno.
- `trial_ends_at` (TIMESTAMP): Periodo extendido de trial de mensajes.
- `stripe_customer_id` (TEXT): ID de facturación en Stripe.
- `stripe_subscription_id` (TEXT): ID de la membresía activa en Stripe.
- `billing_currency` (TEXT): Moneda de facturación del usuario.
- `invited_by` (UUID): En caso de referidos o miembros de equipo, el ID de quien invitó.
- `team_admin_id` (UUID): Relación indicando al líder/pagador del equipo.
- `created_at` (TIMESTAMP): Fecha de registro.

### `connectors` (Tokens Integraciones de 3eros)
- `id` (UUID): ID autogenerado.
- `user_id` (UUID): Dueño del conector.
- `type` (ENUM): Tipo de integración (`gmail`, `office365`).
- `access_token_enc` (TEXT): Token de acceso (cifrado).
- `refresh_token_enc` (TEXT): Refresh token (cifrado)
- `expires_at` (TIMESTAMP): Expiración del token.
- `scope` (TEXT): Permisos otorgados en el proveedor OAuth.
- `created_at` (TIMESTAMP): Registro de creación.

### `modules` (Feature Flags globales)
- `id` (UUID), `slug` (TEXT), `name` (TEXT), `description` (TEXT), `phase` (INTEGER), `is_core` (BOOLEAN), `created_at` (TIMESTAMP).

### `tenant_modules` (Funciones activadas por cliente)
- `tenant_id` (UUID), `module_slug` (TEXT), `enabled_at` (TIMESTAMP), `disabled_at` (TIMESTAMP), `config` (JSONB).

### `usage_events` (Analíticas Hasheadas)
- `id` (UUID), `tenant_id_hash` (TEXT), `user_id_hash` (TEXT), `event_type` (TEXT), `channel` (TEXT), `query_type` (TEXT), `response_ms` (INTEGER), `success` (BOOLEAN), `zone` (TEXT), `created_at` (TIMESTAMP).

### `mini_portals` (Portales temporales/web efímeras)
- `id` (UUID - actuando como token seguro), `user_id` (UUID), `view_type` (TEXT), `data` (JSONB), `expires_at` (TIMESTAMP), `opened_at` (TIMESTAMP), `channel_origin` (TEXT), `created_at` (TIMESTAMP).

### `audit_log` (Trazabilidad de acciones de KODA)
- `id` (UUID), `user_id` (UUID), `tenant_id` (UUID), `action_type` (TEXT), `confirmed_at` (TIMESTAMP), `channel` (TEXT), `metadata` (JSONB), `created_at` (TIMESTAMP).

### `plan_limits` (Restricciones del modelo SaaS)
- `id` (UUID), `plan` (TEXT), `messages_per_day` (INTEGER), `memory_days` (INTEGER), `max_notes` (INTEGER), `max_reminders` (INTEGER), `journal_enabled` (BOOLEAN), `proactive_enabled` (BOOLEAN), `message_analysis_enabled` (BOOLEAN), `shared_spaces` (INTEGER), `max_users` (INTEGER), `ryse_integration` (BOOLEAN).

### `subscriptions` (Registro de pagos Stripe)
- `id` (UUID), `user_id` (UUID), `plan` (TEXT), `status` (TEXT), `currency` (TEXT), `amount` (DECIMAL), `stripe_subscription_id` (TEXT), `current_period_start` (TIMESTAMP), `current_period_end` (TIMESTAMP), `trial_end` (TIMESTAMP), `created_at`, `updated_at`.

### `team_members` (Invitaciones SaaS B2B)
- `id` (UUID), `admin_user_id` (UUID), `member_user_id` (UUID), `plan` (TEXT), `status` (TEXT), `invited_at` (TIMESTAMP), `joined_at` (TIMESTAMP).

---

## 2. Variables de Entorno del Bot (.env / Fly.toml)

*   `NEXT_PUBLIC_SUPABASE_URL`: Endpoint oficial de tu BD Supabase.
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Token de acceso anónimo e inseguro para clientes web.
*   `SUPABASE_SERVICE_ROLE_KEY`: Token privilegiado de back-end (admin/bypass RLS).
*   `UPSTASH_REDIS_REST_URL`: API Endpoint HTTPS a la cola de BullMQ en Upstash.
*   `UPSTASH_REDIS_REST_TOKEN`: Auth token HTTPS para Upstash.
*   `UPSTASH_REDIS_URL`: Socket standard de redis (`rediss://...`) utilizado por los workers background.
*   `ANTHROPIC_API_KEY`: API Key para Claude-3 (Inteligencia Artificial de KODA).
*   `TELEGRAM_BOT_TOKEN`: Token asignado por @BotFather para controlar el bot de Telegram.
*   `TELEGRAM_WEBHOOK_SECRET`: Pre-shared string para verificar la validez de los webhooks que entran a Next.js (si configurado).
*   `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`: Tokens para conexión con Sandbox/Producción de WhatsApp.
*   `TWILIO_WHATSAPP_NUMBER`: +14155238886 (twilio sandbox) u oficial dependiendo del entorno WhatsApp.
*   `META_WHATSAPP_TOKEN`: Token directo Cloud API por si se ignora el Gateway Twilio.
*   `STRIPE_SECRET_KEY`: Llave privada B2B SaaS pagos.
*   `STRIPE_WEBHOOK_SECRET`: Firma para garantizar que los pagos entrantes a /api/webhooks... sean reales.
*   `ADMIN_PASSWORD`: Contraseña root para el portal `/admin.html`.
*   `INTERNAL_API_KEY`: Contraseña estática usada internamente por lo workers para acceder a `POST /api/koda`.
*   `PORT=3000`: Expuesto por Fly.io

---

## 3. Archivos Principales y Directorios

*   `koda-platform/`: Entorno principal actual del Bot bajo infraestructura Next.js.
*   `koda-platform/lib/backend/`: Contenedor principal del cerebro del robot migrado de la fase 1 de Express (incluye `services`, `utils`, `handlers`).
*   `koda-platform/lib/queue.ts`: Contiene la lógica central de BullMQ (colas `koda-inbox`, `koda-outbox`, `koda-dead-letter`) y conectividad a Upstash.
*   `koda-platform/workers/inbox-worker.ts`: Demonio background en Typescript que lee del `koda-inbox`, pasa a la inteligencia artificial (`/api/koda`), y avienta la respuesta como un texto serializado a `koda-outbox`.
*   `koda-platform/workers/outbox-worker.ts`: Demonio background final que hace la llamada HTTPS `fetch` oficial final hacia la API de *Telegram*, *Whatsapp*, o *Portal Web*.
*   `koda-platform/app/api/telegram/route.ts`: Endpoint público expuesto a Telegram Bot API. Su único trabajo ahora es recibir e inyectar el mensaje al `koda-inbox` para no sufrir de "Twilio Timeouts".
*   `koda-platform/app/api/koda/route.ts`: API Endpoint interno seguro. Procesa flujos principales de comandos y contexto, contacta a Claude y devuelve texto crudo, sin saber de WhatsApp ni Telegram.
*   `koda-platform/app/api/admin/.../route.ts`: Módulo de rutas Serverless reconstruidas en Next.js devolviendo datos del dashboard administrativo en `/admin.html`.
*   `schema-saas.sql` y `schema-phase3.sql`: DDL Scripts SQL raiz que construyeron las tablas y extensiones de base de datos utilizadas actualmente.
*   `koda-platform/package.json`: Gestor principal conteniendo dependencias (`bullmq`, `@upstash/redis`, `node-telegram-bot-api`, `next`) además de scripts valiosos como `npm run worker`.
