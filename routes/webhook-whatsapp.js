const express = require('express');
const router = express.Router();
const db = require('../services/supabase');
const twilio = require('../services/twilio');
const { bot } = require('../index'); // Mantenemos ref a bot para el flujo principal por si el channel termina siendo mixto (aunque no deberíamos usar `bot` en twilio real)
const { handleOnboarding } = require('../handlers/onboarding');
const { handleCommand } = require('../handlers/commands');
const { handleMainFlow } = require('../handlers/main');

// Función asíncrona para procesar el mensaje en bloque (sin detener la respuesta HTTP de Twilio)
async function processWhatsAppMessage(reqBody) {
    try {
        const twilioPayload = reqBody;

        // Extraer los datos relevantes de Twilio
        const fromNumberFull = twilioPayload.From || ''; // ej. "whatsapp:+52155..."
        const textContent = twilioPayload.Body || '';

        // Si hay un archivo adjunto (audio u otro), Twilio lo manda como NumMedia y MediaUrl0
        const isMedia = parseInt(twilioPayload.NumMedia || '0', 10) > 0;
        let mediaUrl = null;
        let mediaContentType = null;

        if (isMedia) {
            mediaUrl = twilioPayload.MediaUrl0;
            mediaContentType = twilioPayload.MediaContentType0;
        }

        if (!fromNumberFull) {
            return;
        }

        console.log(`[WHATSAPP WEBHOOK] Mensaje recibido de ${fromNumberFull}: ${textContent}`);

        // Limpiar el número de teléfono para guardarlo en la DB
        // Quitar el "whatsapp:" si existe
        const cleanWhatsappId = fromNumberFull.replace('whatsapp:', '');

        // 2. Buscar o crear usuario en Supabase
        let user = await db.getUserByChannelId(cleanWhatsappId, 'whatsapp');

        if (!user) {
            // Usuario nuevo
            user = await db.createUser({
                whatsapp_id: cleanWhatsappId,
                name: 'Usuario Nuevo',     // En WA usualmente no llega el ProfileName nativo a primera instancia a menos que consultes API
                telegram_id: null,         // Explícito
                telegram_username: null
            });
            // NOTA: Si quisieras capturar el ProfileName que a veces manda Twilio, podrías extraerlo de twilioPayload.ProfileName
            if (twilioPayload.ProfileName) {
                await db.updateUser(user.id, { name: twilioPayload.ProfileName });
                user.name = twilioPayload.ProfileName;
            }
        }

        // Construir un objeto `msg` "falsificado" (mock) similar al de Telegram para reciclar los handlers
        // (Los handlers esperan la estructura de telegram-bot-api)
        const mockMsg = {
            chat: { id: cleanWhatsappId },
            from: { id: cleanWhatsappId, first_name: user.name, username: null },
            text: textContent,
            _channel: 'whatsapp', // INYECTAMOS LA BANDERA DE CANAL AQUÍ
            // Mapeo básico de Media
            voice: undefined,
            audio: undefined,
            video_note: undefined
        };

        // Si Twilio nos manda un audio (nota de voz de WA), típicamente es audio/ogg
        if (isMedia && mediaContentType && (mediaContentType.includes('audio') || mediaContentType.includes('video'))) {
            // Engañamos a mainFlow diciendo que es un archivo general o nota de voz
            mockMsg.voice = {
                file_id: mediaUrl, // Para whatsapp, el "file_id" será simplemente la URL de Twilio que luego descargaremos
                duration: 0 // No tenemos la duración exacta a la mano, o la extrapolamos después
            };
        }

        // 3. Revisar estado de onboarding (USANDO mockMsg)
        if (!user.onboarding_complete) {
            await handleOnboarding(bot, mockMsg, user);
            return;
        }

        // 4. Revisar Comandos Explícitos (USANDO mockMsg)
        const isCommand = await handleCommand(bot, mockMsg, user);
        if (isCommand) {
            return;
        }

        // 5. Flujo Principal (Claude)
        await handleMainFlow(bot, mockMsg, user);

    } catch (error) {
        console.error('Error procesando webhook interno de WhatsApp:', error);
    }
}

// Endpoint para recibir POST de Twilio (viene desde el webhook configurado en Twilio Console)
// IMPORTANTE: Twilio envía application/x-www-form-urlencoded
router.post('/', (req, res) => {
    // 1. Enviar 200 OK y TwiML vacío casi de inmediato para evitar retrys de Twilio por timeout
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

    // 2. Procesar TODO el flujo pesado en segundo plano sin detener la solicitud HTTP original
    processWhatsAppMessage(req.body).catch(console.error);
});

module.exports = router;
