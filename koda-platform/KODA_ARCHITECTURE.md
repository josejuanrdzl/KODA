# KODA — NUEVA ARQUITECTURA v1.0

### SECCIÓN 1 — LOS 4 PROBLEMAS QUE ESTA ARQUITECTURA RESUELVE
* **P1: Estado sin dueño** → RESUELTO por Session Object en Redis
* **P2: Historial mezclado en Claude** → RESUELTO eliminando el historial
* **P3: Flujos sin control exclusivo** → RESUELTO por FlowEngine
* **P4: Claude como router** → RESUELTO por CommandRegistry determinístico

### SECCIÓN 2 — LAS 5 CAPAS (inmutables)
* **CAPA 0 — CANALES** (Telegram, WhatsApp, Web, iOS, Android, Desktop, API). Validan webhook + MessageEnvelope + encolar. <30 líneas.
* **CAPA 1 — BOT CORE FUNCTIONS (BCF)** Target <50ms. Sin lógica de negocio. (Canal Adapter, Session Manager, Location+Timezone, Command Router, DirectMsg Bypass, AI Selector+BYOK, Context Builder sin historial, Module Executor, Response Formatter+TTS, Health Monitor). FlowEngine y CommandRegistry son transversales.
* **CAPA 2A — MÓDULOS CORE** Configurables desde BD, sin deploy (onboarding, settings, commands-config, etc.)
* **CAPA 2B — MÓDULOS EXTENDIDOS** Plug & Play (weather, spotify, gmail, etc.)
* **CAPA 3 — KODA MEMORY** Transversal, siempre asíncrona.
* **CAPA 4 — KODA IDENTITY** Transversal, un UUID por usuario.

### SECCIÓN 3 — EL SESSION OBJECT (fuente única de verdad)
Vive en Redis. Key: `session:{userId}`. TTL: 30 mins de inactividad. 
userId SIEMPRE viene del lookup de BD, NUNCA del payload.
Debe guardar fields como mode, flowData, location, temporal, etc.

### SECCIÓN 4 — EL FLOWENGINE (control de flujos multi-paso)
Modo `flow`. Solo un módulo atiende. Bloquea a Claude, a otros módulos y al Command Registry.
Cancelación universal (`cancelar`, `salir`, `0`, etc) forzada, inbloqueable.

### SECCIÓN 5 — EL COMMANDREGISTRY (Claude es el último recurso)
1. DirectMsg (si mode='chat')
2. FlowEngine (si mode='flow')
3. Cancelación universal
4. koda_commands (de BD -> Redis cache)
5. Claude conversacional (sólo charla, NO base de datos, NO historial, solo max 3 memoryFragments semánticos).

### SECCIÓN 6 — CONTEXT BUILDER SIN HISTORIAL
Solo envía al módulo: request actual, temporal, location, aiEngine, memoryFragments semánticos limitados, user preferences. 
NUNCA historial, ni contexto de otros módulos, ni tokens.

### SECCIÓN 7 — AI ENGINE SELECTOR + BYOK + FAILOVER
Prioridad: 1. BYOK usuario -> 2. Primario (`claude-sonnet-4-5`) -> 3. Secundario (`haiku`) -> 4. Backup (`gpt-4o-mini`) -> 5. Static Fallback.
Cero modelos hardcodeados. Enfoque robusto a caídas.

### SECCIÓN 8 — TIMEZONE Y UBICACIÓN
Supabase = UTC. BCF-03 = Calcula `localTime` y `localHour` en el `session` según `users.timezone` (con soporte `travel_city`).

### SECCIÓN 9 — PRIVACIDAD E INTEGRIDAD
NUNCA indexan: luna, journal, emotional_timeline, secret, e2e.
RLS estricto. Integridad antes del INSERT. 

### SECCIÓN 10 — REGLAS QUE NUNCA SE VIOLAN
R1: Core sin lógica de negocio. R2: Módulos aislados. R3: Mensajería entre usuarios sin IA. R4: Bot nunca muere. R5: Todo módulo loggea. R6: Modelos sin hardcode. R7: Canales solo encolan. R8: Onboarding = Módulo + FlowEngine. R9: Memory = Asíncrona. R10: Secretos/E2E nunca indexados. R11: userId del lookup, no del payload. R12: Claude no recibe historial. R13: Claude paso 5 no acciona DB. R14: Crons UTC con hora local. R15: Validar en módulo antes del constraint DB.

### SECCIÓN 11 — ARCHIVOS INTOCABLES
Solo modificados con permiso de JJR: `workers/inbox-worker.ts`, `workers/outbox-worker.ts`, `lib/queue.ts`.

### SECCIÓN 12 — ORDEN DE IMPLEMENTACIÓN DE LA NUEVA ARQUITECTURA
BCF-06 -> BCF-02 -> BCF-03 -> FlowEngine -> CommandRegistry -> BCF-07 -> Channel Adapter -> Onboarding -> Data integrity -> Priority Queue.
