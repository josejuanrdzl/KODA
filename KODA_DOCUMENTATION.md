# Documentación General del Proyecto KODA

Este documento resume el estado actual del proyecto KODA, su arquitectura, componentes principales y los pasos futuros para integrar una Landing Page personalizada.

## 1. Visión General
KODA es un asistente de IA basado en Telegram que ofrece respuestas a los usuarios dependiendo de su nivel de suscripción. El sistema incluye un bot de Telegram, una pasarela de pago web integrada con Stripe, y un panel de administración para monitorear usuarios, suscripciones e interacciones.

## 2. Tecnologías Utilizadas
*   **Backend:** Node.js, Express.js
*   **Bot de Telegram:** Telegraf (API de Telegram)
*   **Base de Datos:** Supabase (PostgreSQL)
*   **Pagos:** Stripe (Suscripciones y Webhooks)
*   **Despliegue:** Railway
*   **Frontend (Panel y Pagos):** HTML5, CSS (Tailwind/Pico/Vanilla), JavaScript (Fetch API)

## 3. Arquitectura del Proyecto

El sistema se divide en tres ramas principales que conviven en el mismo repositorio:

### A. Bot de Telegram (`index.js`)
Es el núcleo de la interacción con el usuario. Escucha los mensajes en Telegram, verifica en Supabase si el usuario tiene un plan activo, evalúa los límites de mensajes diarios/mensuales y responde utilizando el modelo de IA.
*   **Planes soportados:** `starter` (gratis), `basic`, `executive`, `corporate`.

### B. Servidor Web y APIs (`dev.js` / Rutas)
Sirve la interfaz gráfica y expone los endpoints necesarios para el ecosistema:
*   `routes/registration.js`: Maneja el checkout de Stripe (`/api/register`). Recibe el método de pago, crea/actualiza el cliente en Stripe, genera la suscripción y actualiza la base de datos en Supabase.
*   `routes/webhook.js`: Escucha eventos de Stripe (ej. `invoice.payment_succeeded`, `customer.subscription.deleted`) para mantener sincronizado el estado del usuario automáticamente.
*   `routes/admin.js`: API protegida por sesión para estadísticas del panel de control (MRR, conteo de usuarios, interacciones recientes).
*   `routes/auth.js`: Maneja el login del administrador con cookies seguras (JWT/Session).

### C. Frontend (`public/`)
Las vistas web estáticas servidas por Express:
*   `index.html`: La página actual de venta y selección de planes. Contiene el formulario embebido de Stripe Elements para captura de tarjetas.
*   `success.html`: Pantalla de agradecimiento tras un pago exitoso.
*   `admin.html` / `auth.html`: Interfaz del Panel de Administración para visualizar el MRR e historial de usuarios.

## 4. Estructura de la Base de Datos (Supabase)

Las tablas principales en PostgreSQL son:
1.  **`users`**: Almacena los identificadores de Telegram (`telegram_id`, `telegram_username`), el nombre, correo, tipo de `plan` (ahora en formato TEXTO para evitar errores de Enum), y fechas de uso para los límites.
2.  **`subscriptions`**: Registra detalles financieros (`stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_start/end`).
3.  **`interactions`**: Log de cada mensaje enviado a la IA para tener analíticas de uso por usuario.
4.  **`admin_users`**: Credenciales encriptadas para acceso al `/admin`.

---

## 5. Próximos Pasos: Conectar tu Landing Page a KODA y Railway

Actualmente, KODA sirve su propia página de ventas en la ruta raíz (`/` apunta a `public/index.html`). Cuando tengas tu Landing Page profesional diseñada (por ejemplo, en Webflow, Framer, WordPress, o HTML estático), tienes dos opciones para integrarla:

### Opción A: Alojamiento Separado (Recomendado)
Aojas tu Landing Page en un servicio optimizado para web (Vercel, Netlify, o donde la diseñes) y usas Railway solo como tu "Motor / Backend".

1.  **Dominio:** Tu Landing Page vivirá en `koda.ai` (ejemplo).
2.  **Subdominio Backend:** Asignas un dominio personalizado en Railway a tu proyecto actual, por ejemplo `api.koda.ai` o `app.koda.ai`.
3.  **Botones de Pago:** En tu Landing Page, los botones de "Suscribirse" deberán redirigir al los usuarios al Checkout o a la página de planes de Railway:
    *   Ejemplo: `<a href="https://app.koda.ai/">Comprar Plan Corporate</a>`
4.  **Ajuste de CORS:** Si decides incrustar formularios directamente en tu Landing Page, deberás configurar el `cors` en `dev.js` para permitir peticiones desde tu dominio principal (`koda.ai`).

### Opción B: Alojamiento Unificado en Railway
Reemplazar el `index.html` actual de KODA por tu Landing Page.

1.  **Reemplazo de Archivos:** Cuando tengas los archivos de tu Landing Page (HTML, CSS, JS, Imágenes), los colocas dentro de la carpeta `/public` del proyecto en Github.
2.  **Sobrescribir el Inicio:** Renombras tu archivo principal como `index.html` (borrando o moviendo el actual a algo como `checkout.html`).
3.  **Conexión del Formulario Stripe:** La lógica de pago que actualmente vive al final del `index.html` viejo (los scripts de Stripe Elements y el fetch a `/api/register`) deberás portarla a tu nuevo HTML, específicamente en la sección de "Pricing" de tu nueva Landing Page.
4.  **Despliegue Automático:** Al hacer un `git push` con tus nuevos archivos en la carpeta `/public`, Railway detectará el cambio y publicará tu nueva web sirviendo el backend y frontend juntos.

---
*Documento generado automáticamente para KODA - Marzo 2026*
