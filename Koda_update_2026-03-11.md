# KODA - Reporte de Estado y Actualización de Implementación
**Fecha:** 11 de Marzo de 2026

Este documento detalla el estado actual del proyecto KODA, resumiendo la evolución de su arquitectura, las integraciones activas, los diferentes módulos disponibles y las validaciones de negocio implementadas hasta la fecha.

---

## 1. Arquitectura e Infraestructura Central

El proyecto migró de una arquitectura cruda en Express.js a un entorno serverless/Edge basado en **Next.js** desplegado en **Fly.io**. Esto resolvió problemas de escalabilidad y unificó el portal de pagos y métricas con el cerebro del bot.

*   **Hosting principal:** Fly.io (Dockerizado, Node.js + Next.js).
*   **Base de Datos y Auth:** Supabase (PostgreSQL avanzado con Row Level Security y funciones nativas).
*   **Motores de Cola (Queue System):** BullMQ con Upstash (Redis Serverless). Implementado (`koda-inbox`, `koda-outbox`) para desacoplar la recepción del procesamiento de IA y evitar *Timeouts* de proveedores (como Twilio o Telegram).
*   **Motor de Inteligencia Artificial:** Anthropic Claude (modelo `claude-sonnet-4-6`).
*   **Transcripción de Audio:** OpenAI Whisper combinado con FFmpeg (conversión OGG a MP3 *on-the-fly*).

---

## 2. Canales de Comunicación e Integraciones

KODA actualmente procesa mensajes de forma omnicanal, abstrayendo la lógica interna para responder donde el usuario lo invoque.

*   **Telegram:** Integración nativa mediante Webhooks y la librería `node-telegram-bot-api`. Permite comandos estandarizados (con menús y un parse mode *Markdown* ligero).
*   **WhatsApp:** Integrado a través de **Twilio** (API / Sandbox). La limitación de tiempo de respuesta de 15 segundos de Twilio fue completamente solventada gracias a la arquitectura de colas (BullMQ).
*   **Stripe:** Implementado para capturas de pagos B2B/B2C, planes transaccionales, control de suscripciones y *trials* gestionados mediante `webhook-stripe.js`.

---

## 3. Módulos y Funcionalidades Desarrolladas (Core & Extra)

El bot opera guiado por un **System Prompt dinámico**. Las acciones a la base de datos se ejecutan inyectando *tags* (Ej. `[KODA_ACTION:SAVE_NOTE...]`) que KODA procesa en el backend.

### Capa Fundamental (Base)
1.  **Conversación Natural y Memoria:** KODA identifica de qué se está hablando, guarda contexto de corto y largo plazo (`memories`) y toma apuntes específicos a petición del usuario (`notes`).
2.  **Transcriptor de Voz a Texto:** Si el usuario manda notas de voz, audio o video_note, KODA descarga el archivo temporalmente, lo convierte a MP3 y extrae el texto usando OpenAI Whisper antes de contestar.
3.  **Recordatorios y Agendamiento (Cron):** KODA es capaz de agendar eventos con horarios precisos (ISO 8601). Un proceso Cron interno evalúa minuto a minuto las notificaciones activas por usuario y las dispara.

### Capa Avanzada (Módulos Opcionales SaaS)
4.  **Diario Personal y Tracking Emocional (`journal`):**
    *   Permite hacer entradas al final del día describiendo vivencias.
    *   KODA asigna automáticamente una nota del 1 al 10 (`mood_score`), detecta etiquetas emocionales y genera un resumen narrativo de la vivencia.
5.  **Seguimiento de Hábitos (`habits`):**
    *   **Creación:** El usuario le pide a KODA iniciar un nuevo hábito a x hora.
    *   **Gamificación (Check-ins):** KODA le pregunta pasivamente al usuario si cumplió. Si la respuesta es sí, suma a su racha total de alcance continuo (*streaks*).
    *   Comando manual `/habitos` para ver el estatus o cancelarlos.
6.  **Análisis de Mensajes (Terceros) (`message_analysis`):**
    *   Si KODA detecta que un mensaje fue *reenviado* (Forwards de Telegram), escanea lingüísticamente el texto buscando tonos subyacentes e intención oculta. Luego, da consejos de respuesta o resume el tema para el usuario.
7.  **Proactividad y Cron Asistente (`proactive_messaging`)**:
    *   KODA "tiene iniciativa". Toma control de iniciar conversaciones según el bloque del día (Buenos días a las 9:00, Check-in a las 14:00, Buenas noches a las 21:00). Configurable vía `/config proactivo on/off`.

---

## 4. Gobernanza B2B SaaS (Control de Roles y Planes)

Toda la base de datos está estructurada de forma escalable **Multitenant (Inquilinos)**. KODA puede operar como suscripción individual o membresía de empresas (equipos).

*   **Modelo de Datos:** Existen relaciones jerárquicas: `Tenants` -> `Users`. Los líderes del Tenant asignan planes al resto de sus usuarios a través del Portal (Desarrollado en Lovable).
*   **Esquema restrictivo de Planes:**
    *   Un usuario puede tener un plan (`starter`, `pro`, `team`, `business`).
    *   Se aplican limitaciones estrictas de "Mensajes por día" y funcionalidades extra.
*   **Interceptores de Acceso y Paywalls (Fase 8 - Reciente):**
    *   Se creó `checkModuleAccess()` que primero evalúa preferencias corporativas en `tenant_modules` y preferencias tarifarias en `plan_modules`.
    *   Se aplican 2 capas de seguridad para *Upsells*:
        1.  **Capa Comandos:** Los atajos explícitos (ej. `/habitos`) envían un mensaje directo diciendo "Tu plan no incluye esto" invitando a subir de nivel en *my.kodaplatform.com*.
        2.  **Capa Inteligencia Artificial (Anti-Prompt Injection):** Dependiendo de los módulos adquiridos del usuario, se inyectan variables (`disabledModules`) al backend de Claude. El bot literalmente oculta o remueve temporalmente su "conocimiento" de cómo hacer diarios personales o agendar hábitos, previniendo alucinaciones inadvertidas. Si lograra pasar algo malicioso, el backend descarta la acción en la capa de la base de datos.
