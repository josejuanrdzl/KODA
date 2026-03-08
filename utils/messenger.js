const twilio = require('../services/twilio');

/**
 * Helper unificado para despachar mensajes al canal correcto (Telegram vs WhatsApp)
 * @param {object} bot - Instancia del bot de Telegram
 * @param {string|number} chatId - ID del chat destino (telegram_id o whatsapp_id con/sin prefijo)
 * @param {string} text - Contenido del mensaje a enviar
 * @param {object} options - Opciones extras de parseo para Telegram (ej. parse_mode)
 * @param {string} channel - Canal destino ('telegram' o 'whatsapp')
 * @returns {Promise<object>} Objeto simulado de mensaje (o real de Telegram)
 */
async function sendChannelMessage(bot, chatId, text, options = {}, channel = 'telegram') {
    if (channel === 'whatsapp') {
        const success = await twilio.sendWhatsAppMessage(chatId, text);
        if (!success) console.error(`[messenger] Falló envío WhatsApp a ${chatId}`);
        return { message_id: 'whatsapp_' + Date.now() }; // Mock para manter firmas
    } else {
        return await bot.sendMessage(chatId, text, options);
    }
}

module.exports = {
    sendChannelMessage
};
