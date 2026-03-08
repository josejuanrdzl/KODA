if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ ignoreEnvFile: true, silent: true });
}

const twilio = require('twilio');

// Verificar que existan las credenciales antes de inicializar
let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} else {
    console.warn('⚠️ Credenciales de Twilio incompletas. La mensajería por WhatsApp estará deshabilitada.');
}

/**
 * Enviar mensaje de texto por WhatsApp a través de Twilio
 * @param {string} to Número de destino (ej: +521XXXXXXXXXX o whatsapp:+521...)
 * @param {string} message Contenido del mensaje a enviar
 * @returns {Promise<boolean>} TRUE si se envió correctamente
 */
async function sendWhatsAppMessage(to, message) {
    if (!client) {
        console.error('Error: Cliente Twilio no inicializado.');
        return false;
    }

    // Asegurarnos que el "to" empiece con "whatsapp:"
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    // Asegurarnos que el "from" empiece con "whatsapp:" (TWILIO_WHATSAPP_NUMBER típicamente viene raw como +1415...)
    let fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const fromFormatted = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    try {
        const response = await client.messages.create({
            body: message,
            from: fromFormatted,
            to: toFormatted
        });
        console.log(`Mensaje WhatsApp enviado a ${toFormatted} (SID: ${response.sid})`);
        return true;
    } catch (error) {
        console.error(`Error enviando mensaje WhatsApp a ${toFormatted}:`, error);
        return false;
    }
}

/**
 * Enviar archivo multimedia por WhatsApp a través de Twilio
 * @param {string} to Número de destino
 * @param {string} message Contenido del mensaje adjunto
 * @param {string} mediaUrl URL del archivo multimedia (debe ser pública y accesible por Twilio)
 * @returns {Promise<boolean>} TRUE si se envió correctamente
 */
async function sendWhatsAppFile(to, message, mediaUrl) {
    if (!client) {
        console.error('Error: Cliente Twilio no inicializado.');
        return false;
    }

    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    let fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const fromFormatted = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    try {
        const response = await client.messages.create({
            body: message || '',
            from: fromFormatted,
            to: toFormatted,
            mediaUrl: [mediaUrl]
        });
        console.log(`Archivo WhatsApp enviado a ${toFormatted} (SID: ${response.sid})`);
        return true;
    } catch (error) {
        console.error(`Error enviando archivo WhatsApp a ${toFormatted}:`, error);
        return false;
    }
}

module.exports = {
    sendWhatsAppMessage,
    sendWhatsAppFile
};
