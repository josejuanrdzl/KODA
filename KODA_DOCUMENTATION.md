# 🧠 KODA Backend - Documentación Completa del Proyecto

Este documento integra todo el contexto, arquitectura, módulos implementados y procesos de KODA (tu bot asistente personal de Telegram) hasta la versión actual. También incluye la guía paso a paso para conectar tu futura Landing Page.

---

## 🏗 Arquitectura General

KODA es un asistente virtual para Telegram construido sobre un backend de Node.js + Express, desplegado en **Railway** y conectado a una base de datos PostgreSQL en **Supabase**. La inteligencia artificial está potenciada por **Anthropic Claude 3.7 Sonnet** para razonamiento deductivo y **OpenAI Whisper** para el procesamiento y transcripción de voz.

### Estructura del Código

- `index.js`: Punto de entrada de la aplicación. Levanta el servidor Express en el puerto 3000, configura los parsers de JSON y raw (para Stripe), monta los archivos estáticos (`/public`) e inicializa el webhook de Telegram y los cron jobs residentes.
- `handlers/`: Lógica de control delegada por Telegram.
  - `commands.js`: Maneja comandos estrictos (`/ayuda`, `/perfil`, `/diario`, `/plan`, `/upgrade`).
  - `main.js`: Corazón del bot. Intercepta texto y audios, verifica tokens y límites (Stripe), delega a Whisper/Claude, filtra y clasifica, y regresa las respuestas al usuario construyendo la memoria de conversación.
  - `onboarding.js`: Máquina de estado para la configuración inicial de un usuario primerizo (Nombre, Tono, Género, Zona Horaria).
  - `journal.js`: Manejador visual que resume la semana de vida de un usuario mediante el comando `/diario`.
  - `messageAnalysis.js`: Lógica derivada cuando el usuario reenvía mensajes de 3ros a KODA para solicitar su opinión o respuesta.
- `services/`: Interfaces a plataformas externas de uso intensivo.
  - `supabase.js`: Contiene todas las consultas a base de datos (DB abstract layer).
  - `claude.js`: Integración de SDK Anthropic e inyección dinámica del **System Prompt** contextualizado (Inyecta nombre, tono, hora local, memorias recientes, recordatorios activos y humor actual).
  - `whisper.js`: Integración de FFmpeg y conexión a OpenAI Whisper API. Transforma notas de voz o video (Ogg/MP4) a MP3 mediante `/tmp` de Linux y retorna el texto transcrito.
  - `stripe.js`: Wrapper de Stripe para sincronizar productos, clientes y pagos.
  - `reminders.js`: CronJob disparado *cada minuto* para notificar tareas agendadas.
  - `proactive.js`: CronJob disparado *cada hora* para emitir saludos o reflexiones dependiendo del ciclo diurno del usuario.
- `utils/`:
  - `actionParser.js`: Analizador Regex para capturar tags inyectados por Claude (ej. `[KODA_ACTION:SAVE_NOTE]`) para ejecutar transacciones silenciosas en la base de datos sin mostrar comandos crudos al usuario final.
- `routes/`:
  - `webhook-stripe.js`: Escucha suscripciones y fallos de tarjeta en tiempo real desde Stripe para impactar los límites de uso.
  - `registration.js`: Lógica del portal cautivo web para capturar emails, crear clientes en Stripe y darles suscripciones "trial".
  - `admin.js`: API protegida por contraseña para el Backoffice.

---

## 🛠 Bases de Datos (Supabase)

Estructura modelada en PostgreSQL:
- `users`: Perfil de telegram, timezone, y metadatos financieros (Stripe Customer ID, `plan`, `plan_status`).
- `conversations`: Historial íntegro para contexto (Incluyendo audios transcritos con `content_type = 'audio'`).
- `notes` / `reminders`: Tareas y anotaciones abstraídas por IA.
- `memories`: Fragmentos de personalidad o gustos del usuario que KODA debe recordar permanentemente.
- `journal_entries` / `emotional_timeline`: Registro vitalicio y puntuación del estado de ánimo del usuario (1 a 10).
- `message_analysis`: Tracking de uso del módulo de "análisis de mensajes de 3ros".
- `plan_limits` / `subscriptions`: Control del modelo SaaS para limitar la cantidad de mensajes por día (Starter vs Corporate).

---

## 💸 Facturación y Planes (Stripe & Suscripciones)

KODA opera como un SaaS (Software as a Service) freemium con Free Trials:
- **Starter Mode**: Al iniciar, un usuario tiene un límite diario de mensajes (Ej. 15/día). Si se excede, el bot se interrumpe ofreciendo un upgrade.
- **Trial Activo de 3 Días**: Si el usuario entra al portal web e ingresa su tarjeta, Stripe lo valida y crea una suscripción con 3 días gratuitos antes de hacer el primer cargo. KODA detecta esto vía Webhooks.
- **Portales Web Estáticos (`/public`)**: 
  - `index.html`: Landing interna actual (ofertas de planes y Stripe Elements).
  - `success.html`: Pantalla verde para mandar al cliente de regreso a Telegram (`t.me/TuBot`).
  - `portal.html`: Vista privada ("Mi Cuenta") para visualizar próximos pagos. El management de la tarjeta se hace a través de Stripe Customer Portal oficial.
  - `admin.html`: Portal de administrador (`/admin` contraseñado). Permite ver MRR, Usuarios activos, Trials y forzar subidas/bajadas de planes de manera manual.

---

## 🎙 Notas de Voz y Análisis (Reciente Integración)

Ahora KODA ya no solo lee texto, sino que intercepta medias nativas:
1. El usuario envía una **nota de voz** normal de Telegram (formato `audio/ogg`), un archivo local de audio, o un video-mensaje de círculo (`video_note`).
2. KODA emite de inmediato un aviso ("🎙️ *Transcribiendo tu audio...*") indicando que está trabajando.
3. Se descarga de Telegram temporalmente, usa FFmpeg (directo en la VM de Railway) para convertir el OGG oscuro a MP3 universal, se purga la caché al disco.
4. Pasa el archivo MP3 a Whisper de OpenAI, quien con altísima precisión redacta el contenido y puntuaciones.
5. Pasa transparente a la mente deductiva de Claude como cualquier otro mensaje para finalmente emitir la confirmación empática del robot al usuario de Telegram.
6. Archiva explícitamente `content_type='audio'` y el transcript orgánico en la base de datos Supabase para futuras memorias.

---

## 💬 Integración de WhatsApp (Twilio)

Se habilitó el soporte multi-canal para que KODA atienda a los usuarios indistintamente desde Telegram o **WhatsApp**:
- **Twilio SDK**: El envío de mensajes y archivos mediante WhatsApp se gestiona por una cuenta de Twilio (`services/twilio.js`).
- **Webhook Independiente**: Hay un endpoint dedicado en `/webhook-whatsapp` que procesa exclusivamente las cargas de Twilio, extrayendo incluso las limitadas notas de audio `.ogg` nativas y derivándolas al Whisper.
- **Unificación de Base de Datos**: Mismos perfil, mismos recordatorios y misma memoria interactiva gracias a `getUserByChannelId` que unifica a los usuarios por su número local de WhatsApp y/o su ID de Telegram genérico.
- **Mensajería Dinámica**: Utiliza un módulo `utils/messenger.js` para despachar contenido inteligentemente (Mensajes de Rutina, Saludos Proactivos y Confirmaciones) de vuelta a la red social que la persona utilizó últimamente.

---

## 🚀 Despliegue Actual (Railway)

Tu servidor actual de Producción está alojado en **Railway**.
- No requiere archivos ocultos `.env` localmente en el servidor. Todas las variables (como `SUPABASE_URL`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, etc.) están dadas de alta nativamente en la Interfaz de Configuración de Railway.
- El repositorio de GitHub está conectado y monitorea la rama `main`. Cada comando `git push` desencadena de manera automática la reinstalación del motor de Node.js, `ffmpeg` local y levanta el servidor usando el comando `node index.js`.
- Railway expone un dominio estático y seguro HTTPS que nosotros registramos dentro de Telegram mediante un Webhook. Al no usar *polling* o bucles constantes en el código, el costo de CPU es estrictamente 0 cuando el bot está inactivo. Solo despierta cuando le escriben.

---

## 🌐 Pasos Futuros: Conectar tu Nueva Landing Page a KODA y Railway

Actualmente, KODA sirve un `index.html` provisional muy crudo para que el usuario pueda pagar. Cuando tu diseñador o tú terminen la Landing Page oficial y final, así deberás conectarlo para que se integre al Bot sin problemas:

### Escenario A: Tu Landing es HTML/JS estándar (Alojada en el mismo Railway de KODA)
Si tu landing es estática (HTML, CSS, JS puro):
1. Copia todos los archivos de tu nueva Landing Page dentro de la carpeta `/public` de tu repositorio local de KODA.
2. Nombra a tu página principal de ventas como `index.html` (reemplazando el de prueba que existe actualmente).
3. Adentro de tu nuevo archivo HTML, donde quieras que estén los botones de "Suscribirse al Plan Corporate", simplemente pon vínculos que redireccionen a la pantalla real de checkout de tarjeta de crédito que ya tenemos armada.
   Para no perder la lógica de cobro actual, renombra mi actual `/public/index.html` a `/public/checkout.html`, y los botones de tu landing nueva deberán apuntar ahí:
   ```html
   <a href="/checkout.html">Comprar Ahora</a> 
   ```
4. Haz `git add .`, `git commit -m "add new landing page"` y `git push`. Railway servirá tu sitio como la cara frontal de KODA.

### Escenario B: Tu Landing estará Alojada Externamente (Ej. WordPress, Webflow, Vercel) usando un Dominio Custom (www.midominio.com)
Si prefieres hostear tu página por separado para tener mejor SEO, usar builders visuales y darles más flexibilidad a la estructura sin tocar el backend de código:
1. A nivel Bot/Código de Node.js o Repositorio **no tienes que hacer nada nuevo**. 
2. Deja el frontend transaccional de KODA (lo que hay ahorita en `/public/index.html`) hosteado solitariamente en Railway para ser únicamente la "Bóveda de Registro y Cobro Protegida".
3. En tu Landing Page externa de Webflow/Wordpress, tu botón de "Contratar o Registrarse" simplemente será un embudo como "Link hacia afuera" que apunte al dominio formal de transacciones: 
   `https://web-production-d25f.up.railway.app/`
4. De esa forma tu Landing externa capta prospectos de manera limpia y lanza a tus clientes al backend para procesar con seguridad su tarjeta de crédito o administrar su portal en una pestaña aislada (Railway) que hace todo el trabajo logístico con Stripe y Supabase.

---

### Links Utilitarios (Producción Activa):
- **Bot de Telegram**: `@josejuanrdz` o tu link profundo directo de tu Bot de Telegram.
- **Portal de Pago/Registro Web**: `https://web-production-d25f.up.railway.app/`
- **Dashboard de Administrador**: `https://web-production-d25f.up.railway.app/admin/` (Clave de acceso: administrada por la variable de entorno)
