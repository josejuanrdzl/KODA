const db = require('../services/supabase');
const { sendChannelMessage } = require('../utils/messenger');

// Memoria volátil para sesiones de onboarding
// Idealmente en producción esto iría a Redis o DB.
const onboardingSessions = new Map();

async function handleOnboarding(bot, msg, user) {
    const telegramId = user.telegram_id;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const channel = msg._channel || 'telegram';

    // Initial step 0
    if (!onboardingSessions.has(telegramId)) {
        await sendChannelMessage(bot, chatId, `¡Hola! Soy KODA, tu asistente personal con inteligencia artificial. 
Voy a ser tu memoria, tu organizador, y tu mano derecha. Todo lo que me digas lo recuerdo, y estoy disponible cuando me necesites.

Para darte el mejor servicio, necesito conocerte un poco. Son solo 3 preguntas rápidas. ¿Empezamos?`, {}, channel);
        onboardingSessions.set(telegramId, 'waiting_start');
        return;
    }

    const step = onboardingSessions.get(telegramId);

    if (step === 'waiting_start') {
        // Asume que aceptó empezar
        await sendChannelMessage(bot, chatId, `¡Perfecto! ¿Cómo te llamas? (como quieras que te diga)`, {}, channel);
        onboardingSessions.set(telegramId, 'waiting_name');
    }

    else if (step === 'waiting_name') {
        await db.updateUser(user.id, { name: text.trim() });
        await sendChannelMessage(bot, chatId, `¡Mucho gusto, ${text.trim()}! ¿Cómo prefieres que te hable?
1. Profesional (formal y ejecutivo)
2. Amigable (casual y cercano)
3. Directo (sin rodeos, al grano)
4. Divertido (con humor ligero)

(Responde con el número)`, {}, channel);
        onboardingSessions.set(telegramId, 'waiting_tone');
    }

    else if (step === 'waiting_tone') {
        let tone = 'amigable';
        if (text.includes('1')) tone = 'profesional';
        else if (text.includes('2')) tone = 'amigable';
        else if (text.includes('3')) tone = 'directo';
        else if (text.includes('4')) tone = 'divertido';

        await db.updateUser(user.id, { tone });

        // Obtener info mas actualizada del usuario
        const updatedUser = await db.getUserByTelegramId(telegramId);

        await sendChannelMessage(bot, chatId, `¡Perfecto! Última pregunta: ¿prefieres que me presente como asistente masculino, femenino, o neutro?
1. Masculino
2. Femenino  
3. Neutro (sin género)

(Responde con el número)`, {}, channel);
        onboardingSessions.set(telegramId, 'waiting_gender');
    }

    else if (step === 'waiting_gender') {
        let gender = 'neutro';
        if (text.includes('1')) gender = 'masculino';
        else if (text.includes('2')) gender = 'femenino';
        else if (text.includes('3')) gender = 'neutro';

        await db.updateUser(user.id, { gender, onboarding_complete: true });

        // Get updated user again to make sure we show the correct name
        const finalUser = await db.getUserByTelegramId(telegramId);

        await sendChannelMessage(bot, chatId, `¡Listo, ${finalUser.name}! Ya estamos configurados. Aquí va lo que puedo hacer:

🧠 Recordar cosas — Dime cualquier dato y lo guardo.
📝 Tomar notas — 'Anota que...' y queda guardado.
📓 Diario personal — Cuéntame tu día y lo registro.
⏰ Recordatorios — 'Recuérdame que...' y te aviso.
🎙️ Voz — Mándame audios y te entiendo igual que texto (Fase 2).

Escribe /ayuda en cualquier momento para ver todo. ¡Estoy listo!`, {}, channel);
        onboardingSessions.delete(telegramId);
    }
}

module.exports = {
    handleOnboarding
};
