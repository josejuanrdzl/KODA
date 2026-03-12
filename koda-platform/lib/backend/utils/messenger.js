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
/**
 * Envía un mensaje de upsell cuando un usuario intenta acceder a un módulo restringido
 * @param {object} bot - Instancia del bot de Telegram
 * @param {string|number} chatId - ID del chat destino
 * @param {string} channel - Canal destino ('telegram' o 'whatsapp')
 * @param {string} moduleName - Nombre legible del módulo (ej. 'Hábitos', 'Diario')
 */
async function sendModuleUpsell(bot, chatId, channel, moduleName) {
    const text = `🔒 Tu plan actual no incluye acceso a **${moduleName}**.\n\nPara desbloquear esta funcionalidad y llevar tu gestión personal al siguiente nivel, por favor mejora tu suscripción desde el portal web en [my.kodaplatform.com](https://my.kodaplatform.com) 🚀`;
    const options = { parse_mode: 'Markdown' };
    return await sendChannelMessage(bot, chatId, text, options, channel);
}

module.exports = {
    sendChannelMessage,
    sendModuleUpsell
};
