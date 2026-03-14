const db = require('../../backend/services/supabase');
const { supabase } = db;
import * as crypto from 'crypto';
import { indexDirectMessage } from '../memory/memory.indexer';

const ENCRYPTION_KEY = process.env.KODA_ENCRYPTION_KEY || 'koda-default-encryption-key-32ch';
const ALGORITHM = 'aes-256-cbc';

function encryptMessage(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function decryptMessage(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift() as string, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const encrypted = parts.join(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export async function handleDirectMessages(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';

    // Leaving chat mode
    if (/^(salir|volver|exit|modo koda)$/i.test(text) && user.exclusive_mode === 'chat') {
        await supabase.from('users').update({ 
            exclusive_mode: null, 
            exclusive_data: null, 
            active_context: { mode: 'koda' } 
        }).eq('id', user.id);
        await bot.sendMessage(user.id, "Has salido del chat. Estás de vuelta en modo KODA.", options);
        return true;
    }

    // Processing incoming messages during active Chat Mode
    if (user.exclusive_mode === 'chat' && user.exclusive_data?.context_id) {
        const recipientId = user.exclusive_data.context_id;
        
        const encryptedContent = encryptMessage(text);
        
        const { data: message, error } = await supabase.from('koda_messages').insert({
            from_user_id: user.id,
            to_user_id: recipientId,
            content: encryptedContent,
            message_type: 'direct'
        }).select().single();
        
        if (!error && message) {
            // Send to recipient via their id
            await bot.sendMessage(recipientId, `[De @${user.koda_id || 'Usuario'}]: ${text}\n(Responde directamente para continuar el chat)`, options);
            
            // Background index the direct message
            const { data: recipientData } = await supabase.from('users').select('koda_id').eq('id', recipientId).maybeSingle();
            const fromUsername = user.koda_id || 'Usuario';
            const toUsername = recipientData ? (recipientData.koda_id || 'Usuario') : 'Usuario';

            indexDirectMessage(user.id, recipientId, text, message.id, fromUsername, toUsername).catch(e => {
                console.error('[Memory] Error background indexing DM:', e);
            });

            // Add delivery record
            await supabase.from('koda_message_delivery').insert({
                message_id: message.id,
                channel: 'unknown',
                status: 'sent'
            });
        }
        
        return true; 
    }

    // Opening a chat
    const chatMatch = text.match(/^(abrir chat con|mensaje a|escríbele a)\s+@?([a-z0-9_]+)$/i);
    if (chatMatch) {
         const targetUsername = chatMatch[2].toLowerCase();
         // Find target
         const { data: targetUser } = await supabase.from('users').select('id, name, koda_id').eq('koda_id', targetUsername).maybeSingle();
         if (!targetUser) {
             await bot.sendMessage(user.id, `Usuario @${targetUsername} no encontrado.`, options);
             return true;
         }

         // Check connection
         const { data: connection } = await supabase.rpc('get_koda_connection', {
             user_a: user.id,
             user_b: targetUser.id
         });

         if (!connection) {
             await bot.sendMessage(user.id, `No estás conectado con @${targetUsername}. Envíale un código de invitación primero.`, options);
             return true;
         }

         // Activate chat context
         await supabase.from('users').update({ 
             exclusive_mode: 'chat',
             exclusive_data: { context_id: targetUser.id },
             active_context: { mode: 'chat', context_id: targetUser.id } 
         }).eq('id', user.id);
         
         await bot.sendMessage(user.id, `Has abierto el chat con ${targetUser.name} (@${targetUser.koda_id}). Todo lo que escribas ahora se enviará como mensaje directo. Escribe "salir" para terminar.`, options);
         return true;
    }

    // Secret messages composing logic
    const secretMatch = text.match(/^(mensaje secreto a|enviar secreto a)\s+@?([a-z0-9_]+)$/i);
    if (secretMatch) {
         const targetUsername = secretMatch[2].toLowerCase();
         // find target
         const { data: targetUser } = await supabase.from('users').select('id').eq('koda_id', targetUsername).maybeSingle();
         if (!targetUser) {
             await bot.sendMessage(user.id, `Usuario @${targetUsername} no encontrado.`, options);
             return true;
         }
         
         await supabase.from('users').update({ 
             active_context: { mode: 'chat_secret_compose', context_id: targetUser.id, step: 'awaiting_content' } 
         }).eq('id', user.id);
         
         await bot.sendMessage(user.id, `Escribe el contenido del mensaje secreto para @${targetUsername}:`, options);
         return true;
    }
    
    if (user.active_context?.mode === 'chat_secret_compose') {
         if (/^(cancelar|salir)$/i.test(text)) {
             await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
             await bot.sendMessage(user.id, "Mensaje secreto cancelado.", options);
             return true;
         }
         if (user.active_context.step === 'awaiting_content') {
             await supabase.from('users').update({ 
                 active_context: { 
                     mode: 'chat_secret_compose', 
                     context_id: user.active_context.context_id, 
                     step: 'awaiting_pin',
                     secret_draft: text 
                 } 
             }).eq('id', user.id);
             await bot.sendMessage(user.id, "Contenido guardado. Ahora ingresa un PIN de 4-8 dígitos numéricos para protegerlo (o escribe cancelar):", options);
             return true;
         }
         if (user.active_context.step === 'awaiting_pin') {
             const pin = text;
             if (!/^\d{4,8}$/.test(pin)) {
                 await bot.sendMessage(user.id, "El PIN debe tener entre 4 y 8 dígitos numéricos. Intenta de nuevo:", options);
                 return true;
             }
             const pinHash = crypto.scryptSync(pin, 'salt', 64).toString('hex');
             const secretContent = user.active_context.secret_draft;
             const recipientId = user.active_context.context_id;
             
             const encryptedContent = encryptMessage(secretContent);
             const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
             
             await supabase.from('koda_messages').insert({
                 from_user_id: user.id,
                 to_user_id: recipientId,
                 content: encryptedContent,
                 message_type: 'secret',
                 pin_hash: pinHash,
                 expires_at: expiresAt
             });
             
             await bot.sendMessage(recipientId, `🔒 Tienes un nuevo mensaje secreto de @${user.koda_id || 'Usuario'}. Envíame "leer secreto" para intentar abrirlo.`, options);
             await bot.sendMessage(user.id, "Mensaje secreto enviado con éxito.", options);
             
             // Close flow
             await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
             return true;
         }
    }

    // Reading secret message logic
    if (/^(leer secreto|abrir secreto)$/i.test(text)) {
         // Find unread secret message
         const { data: unreadSecrets } = await supabase.from('koda_messages')
            .select('*')
            .eq('to_user_id', user.id)
            .eq('message_type', 'secret')
            .is('read_at', null)
            .is('deleted_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

         if (!unreadSecrets || unreadSecrets.length === 0) {
             await bot.sendMessage(user.id, "No tienes mensajes secretos sin leer o ya expiraron.", options);
             return true;
         }
         
         const msgRecord = unreadSecrets[0];
         await supabase.from('users').update({ 
             active_context: { mode: 'chat_secret_read', message_id: msgRecord.id, attempts: 0 } 
         }).eq('id', user.id);
         
         await bot.sendMessage(user.id, "Ingresa el PIN numérico para destapar el mensaje secreto (tienes 3 intentos):", options);
         return true;
    }

    if (user.active_context?.mode === 'chat_secret_read') {
         if (/^(cancelar|salir)$/i.test(text)) {
             await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
             await bot.sendMessage(user.id, "Operación cancelada.", options);
             return true;
         }

         const messageId = user.active_context.message_id;
         const attempts = user.active_context.attempts || 0;
         const pin = text;

         const { data: msgRecord } = await supabase.from('koda_messages').select('*').eq('id', messageId).single();
         if (!msgRecord || msgRecord.deleted_at) {
             await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
             await bot.sendMessage(user.id, "Este mensaje ya no está disponible.", options);
             return true;
         }

         const pinHash = crypto.scryptSync(pin, 'salt', 64).toString('hex');
         if (pinHash === msgRecord.pin_hash) {
             // Success
             const decryptedContent = decryptMessage(msgRecord.content);
             await supabase.from('koda_messages').update({ read_at: new Date().toISOString() }).eq('id', messageId);
             await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
             
             await bot.sendMessage(user.id, `🔓 Mensaje Secreto Descifrado:\n\n${decryptedContent}\n\n(Este mensaje se autodestruirá en KODA en 30 segundos, pero recuerda borrarlo de tu app si quieres privacidad total).`, options);
             
             // Schedule auto-deletion in DB after 30 seconds
             setTimeout(async () => {
                 await supabase.from('koda_messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
             }, 30000);
             return true;
         } else {
             // Failed attempt
             const newAttempts = attempts + 1;
             if (newAttempts >= 3) {
                 await supabase.from('koda_messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
                 await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
                 await bot.sendMessage(user.id, "❌ Demasiados intentos fallidos. El mensaje secreto ha sido destruido por seguridad.", options);
                 return true;
             } else {
                 await supabase.from('users').update({ active_context: { ...user.active_context, attempts: newAttempts } }).eq('id', user.id);
                 await bot.sendMessage(user.id, `❌ PIN incorrecto. Te quedan ${3 - newAttempts} intentos:`, options);
                 return true;
             }
         }
    }

    // View inbox
    if (/^(ver mis chats|mensajes nuevos|tengo mensajes|bandeja de entrada|inbox)$/i.test(text)) {
        // Query koda_unread_messages view
        const { data: unreadStats, error } = await supabase.from('koda_unread_messages')
            .select('*')
            .eq('to_user_id', user.id);
        
        if (error || !unreadStats || unreadStats.length === 0) {
            await bot.sendMessage(user.id, "No tienes mensajes nuevos.", options);
            return true;
        }

        let inboxList = "✉️ Tienes mensajes nuevos de:\n\n";
        for (const stat of unreadStats) {
            const { data: sender } = await supabase.from('users').select('name, koda_id').eq('id', stat.from_user_id).single();
            if (sender) {
               inboxList += `- ${sender.name} (@${sender.koda_id}): ${stat.unread_count} mensaje(s)\n`;
            }
        }
        inboxList += `\nUsa "abrir chat con @usuario" para leerlos.`;
        
        await bot.sendMessage(user.id, inboxList, options);
        return true;
    }

    return false;
}
