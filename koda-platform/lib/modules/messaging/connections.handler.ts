import { sendChannelMessage } from '../../backend/utils/messenger';
const db = require('../../backend/services/supabase');
const { supabase } = db;

// Handler for managing connections
export async function handleConnections(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';
    
    // --- Direct Connection Request via @username ---
    const connectMatch = text.match(/(?:conectar|contactar|hablar con|mensaje a|escribir a|chat con)\s+.*?@([a-z0-9_]{3,20})/i);
    if (connectMatch) {
        const targetKodaId = connectMatch[1].toLowerCase();
        
        if (targetKodaId === user.koda_id) {
            await bot.sendMessage(user.id, "No puedes conectar contigo mismo.", options);
            return true;
        }

        // Find target user
        const { data: targetUser } = await supabase.from('users')
            .select('id, name')
            .eq('koda_id', targetKodaId)
            .maybeSingle();

        if (!targetUser) {
            await bot.sendMessage(user.id, `El usuario @${targetKodaId} no fue encontrado.`, options);
            return true;
        }

        // Check if connection already exists
        const { data: existingConnection } = await supabase.rpc('get_koda_connection', {
            user_a: user.id,
            user_b: targetUser.id
        });

        if (existingConnection) {
            if (existingConnection.status === 'active') {
                await bot.sendMessage(user.id, `Ya estás conectado con @${targetKodaId}.`, options);
            } else if (existingConnection.status === 'pending') {
                await bot.sendMessage(user.id, `Ya hay una solicitud pendiente con @${targetKodaId}.`, options);
            }
            return true;
        }

        // Create pending connection
        const { error } = await supabase.from('koda_connections').insert({
            user_id_1: user.id,
            user_id_2: targetUser.id,
            status: 'pending',
            // It will not use an invite code, it's a direct connection
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

        if (error) {
            console.error("Error creating direct connection:", error);
            await bot.sendMessage(user.id, "Hubo un error al intentar crear la solicitud de conexión.", options);
            return true;
        }

        // Notify target user
        const channel = msg._channel || 'telegram'; // fallback to telegram
        const notifyMsg = `📨 *${user.name}* (@${user.koda_id || 'sin_KODA_ID'}) quiere conectarse contigo.\n\nPara aceptar, responde a este mensaje diciendo:\n*aceptar conexión con @${user.koda_id || 'Usuario'}*\n\nPara rechazar, simplemente ignora este mensaje.`;
        
        // Since we don't know the target user's preferred channel here from the handler perfectly, 
        // we'll use their ID and standard bot behaviour assuming Telegram for now, or using sendChannelMessage properly
        // Actually, we must fetch their channel ID. `sendChannelMessage` uses `chatId`. 
        // We'll pass the targetUser.id (UUID) which might not be enough if sendChannelMessage expects a Telegram ID.
        // Let's get their telegram_id or whatsapp_id.
        const { data: fullTargetUser } = await supabase.from('users').select('telegram_id, whatsapp_id').eq('id', targetUser.id).single();
        
        if (fullTargetUser) {
             const targetChatId = fullTargetUser.whatsapp_id || fullTargetUser.telegram_id;
             const targetChannel = fullTargetUser.whatsapp_id ? 'whatsapp' : 'telegram';
             if (targetChatId) {
                 await sendChannelMessage(bot, targetChatId, notifyMsg, { parse_mode: 'Markdown' }, targetChannel);
             }
        }

        // Confirm to sender
        await bot.sendMessage(user.id, `✅ Solicitud enviada a @${targetKodaId}.\nTe avisaré cuando la acepte.`, options);
        return true;
    }

    // --- Direct Connection Acceptance ---
    const acceptMatch = text.match(/aceptar\s+(?:conexión|conexion)\s+(?:con\s+)?@([a-z0-9_]{3,20})/i);
    if (acceptMatch) {
        const requesterKodaId = acceptMatch[1].toLowerCase();
        
        // Find existing pending connection where user is target (user_id_2) and requester is user_id_1
        const { data: requester } = await supabase.from('users').select('id, name').eq('koda_id', requesterKodaId).maybeSingle();
        
        if (!requester) {
            await bot.sendMessage(user.id, `El usuario @${requesterKodaId} no existe.`, options);
            return true;
        }

        const { data: pendingConn } = await supabase.from('koda_connections')
            .select('*')
            .eq('user_id_1', requester.id)
            .eq('user_id_2', user.id)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        if (!pendingConn) {
            await bot.sendMessage(user.id, `No tienes una solicitud pendiente activa de @${requesterKodaId}.`, options);
            return true;
        }

        // Accept it
        await supabase.from('koda_connections')
            .update({ 
                status: 'active',
                connected_at: new Date().toISOString()
            })
            .eq('id', pendingConn.id);

        await bot.sendMessage(user.id, `¡Conexión aceptada! Ahora estás conectado con ${requester.name} (@${requesterKodaId}).`, options);
        
        // Notify the requester
        const { data: fullRequester } = await supabase.from('users').select('telegram_id, whatsapp_id').eq('id', requester.id).single();
        if (fullRequester) {
            const reqChatId = fullRequester.whatsapp_id || fullRequester.telegram_id;
            const reqChannel = fullRequester.whatsapp_id ? 'whatsapp' : 'telegram';
            if (reqChatId) {
                await sendChannelMessage(bot, reqChatId, `✅ *${user.name}* (@${user.koda_id}) ha aceptado tu solicitud de conexión.`, { parse_mode: 'Markdown' }, reqChannel);
            }
        }

        return true;
    }

    // Command to generate invite code
    if (/^(conectar con alguien|invitar a koda|mi código de invitación)$/i.test(text)) {
        // We ensure we have the generate_invite_code RPC in supabase or locally fallback
        const { data: code, error } = await supabase.rpc('generate_invite_code');
        let inviteCode = code;

        if (error || !code) {
             inviteCode = `KODA-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        }

        // Insert the generated code
        await supabase.from('koda_connections').insert({
             user_id_1: user.id,
             invite_code: inviteCode,
             status: 'pending',
             expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        
        await bot.sendMessage(user.id, `Tu código de invitación es: ${inviteCode}\n\nCompártelo para que se conecten contigo. Es válido por 24 horas.`, options);
        return true;
    }

    // Intercepting an invite code text matching KODA-XXXX
    const codeMatch = text.match(/KODA-[A-Z0-9]{4}/i);
    if (codeMatch && !text.toLowerCase().includes('mi código')) {
        const inviteCode = codeMatch[0].toUpperCase();
        
        // Find the pending connection
        const { data: connection } = await supabase.from('koda_connections')
            .select('*')
            .eq('invite_code', inviteCode)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
            
        if (!connection) {
            await bot.sendMessage(user.id, "Ese código de invitación no es válido o ya expiró.", options);
            return true;
        }

        if (connection.user_id_1 === user.id) {
            await bot.sendMessage(user.id, "No puedes usar tu propio código de invitación.", options);
            return true;
        }

        // Check if connection already exists
        const { data: existingConnection } = await supabase.rpc('get_koda_connection', {
            user_a: user.id,
            user_b: connection.user_id_1
        });

        if (existingConnection) {
            await bot.sendMessage(user.id, "Ya estás conectado con este usuario.", options);
            return true;
        }

        // Update connection status
        await supabase.from('koda_connections')
            .update({ 
                user_id_2: user.id, 
                status: 'active',
                connected_at: new Date().toISOString()
            })
            .eq('id', connection.id);

        const { data: user1 } = await supabase.from('users').select('name, koda_id').eq('id', connection.user_id_1).single();
        
        await bot.sendMessage(user.id, `¡Conexión exitosa! Ahora estás conectado con ${user1.name} (@${user1.koda_id || 'Usuario'}).\n\nPuedes escribirle diciendo "abrir chat con @${user1.koda_id || 'Usuario'}".`, options);
        
        const notifyText = `¡${user.name} (@${user.koda_id || 'Usuario'}) ha aceptado tu invitación y ahora están conectados!`;
        // Use bot to send directly if possible
        await bot.sendMessage(connection.user_id_1, notifyText, options);
        
        return true;
    }

    // View contacts
    if (/^(mis contactos|ver contactos)$/i.test(text)) {
        const { data: connections } = await supabase.from('koda_connections')
            .select(`
                id,
                user_id_1,
                user_id_2,
                user_1:users!koda_connections_user_id_1_fkey(id, name, koda_id),
                user_2:users!koda_connections_user_id_2_fkey(id, name, koda_id)
            `)
            .eq('status', 'active')
            .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);
            
        if (!connections || connections.length === 0) {
            await bot.sendMessage(user.id, "Aún no tienes contactos. Genera un código de invitación para conectar con alguien.", options);
            return true;
        }

        let contactList = "Tus contactos:\n\n";
        connections.forEach((c: any) => {
            const contact = c.user_id_1 === user.id ? c.user_2 : c.user_1;
            if (contact) {
                contactList += `- ${contact.name} (@${contact.koda_id || 'sin_KODA_ID'})\n`;
            }
        });
        
        await bot.sendMessage(user.id, contactList, options);
        return true;
    }

    return false;
}

export async function connectByUsername(bot: any, userId: string, targetKodaIdWithAt: string, user: any): Promise<string> {
    const targetKodaId = targetKodaIdWithAt.replace('@', '');

    const { data: target } = await supabase
        .from('users')
        .select('id, name, koda_id, telegram_id, whatsapp_id')
        .eq('koda_id', targetKodaId)
        .single();

    if (!target) {
        return `No encontré a ${targetKodaIdWithAt} en KODA.`;
    }

    const { data: existing } = await supabase
        .from('koda_connections')
        .select('id, status')
        .or(`and(user_id_1.eq.${userId},user_id_2.eq.${target.id}),and(user_id_1.eq.${target.id},user_id_2.eq.${userId})`)
        .maybeSingle();

    if (existing?.status === 'active') {
        return `Ya estás conectado con ${targetKodaIdWithAt} ✅\nEscribe "abrir chat con ${targetKodaIdWithAt}" para enviarle un mensaje.`;
    }

    if (existing?.status === 'pending') {
        return `Ya tienes una solicitud pendiente con ${targetKodaIdWithAt}.`;
    }

    const userA = userId < target.id ? userId : target.id;
    const userB = userId < target.id ? target.id : userId;

    await supabase.from('koda_connections').insert({
        user_id_1: userA,
        user_id_2: userB,
        initiated_by: userId,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    const targetChatId = target.whatsapp_id || target.telegram_id;
    const targetChannel = target.whatsapp_id ? 'whatsapp' : 'telegram';
    if (targetChatId) {
        await sendChannelMessage(bot, targetChatId, 
            `📨 *${user.koda_id ? '@'+user.koda_id : user.name}* quiere conectarse contigo en KODA.\n\n` +
            `Responde *ACEPTAR* o *RECHAZAR*`, 
            { parse_mode: 'Markdown' }, targetChannel
        );

        await supabase.from('users')
            .update({
                exclusive_mode: 'action_pending',
                exclusive_data: {
                    action: 'connection_request',
                    from_user_id: userId,
                    from_koda_id: user.koda_id ? '@'+user.koda_id : user.name
                }
            })
            .eq('id', target.id);
    }

    return `✅ Solicitud enviada a ${targetKodaIdWithAt}.\nTe aviso aquí mismo cuando la acepte.`;
}

export async function handleConnectionAction(bot: any, msg: any, user: any, options: any): Promise<string | null> {
    const text = msg.text?.toLowerCase().trim() || '';
    const data = user.exclusive_data || {};

    if (data.action === 'connection_request') {
        if (text === 'aceptar') {
            const userA = data.from_user_id < user.id ? data.from_user_id : user.id;
            const userB = data.from_user_id < user.id ? user.id : data.from_user_id;

            await supabase.from('koda_connections')
                .update({ status: 'active', connected_at: new Date().toISOString() })
                .eq('user_id_1', userA)
                .eq('user_id_2', userB)
                .eq('status', 'pending');
            
            await supabase.from('users').update({ exclusive_mode: null, exclusive_data: null }).eq('id', user.id);

            const { data: initiator } = await supabase.from('users').select('telegram_id, whatsapp_id').eq('id', data.from_user_id).single();
            const initChatId = initiator?.whatsapp_id || initiator?.telegram_id;
            const initChannel = initiator?.whatsapp_id ? 'whatsapp' : 'telegram';
            
            if (initChatId) {
                await sendChannelMessage(bot, initChatId, 
                    `✅ ${user.koda_id ? '@'+user.koda_id : user.name} aceptó tu solicitud.\n` +
                    `Escribe "abrir chat con ${user.koda_id ? '@'+user.koda_id : user.name}" para chatear.`,
                    { parse_mode: 'Markdown' }, initChannel);
            }

            return `✅ ¡Conectado con ${data.from_koda_id}!\nEscribe "abrir chat con ${data.from_koda_id}" para enviarle un mensaje.`;
        }
        
        if (text === 'rechazar') {
            const userA = data.from_user_id < user.id ? data.from_user_id : user.id;
            const userB = data.from_user_id < user.id ? user.id : data.from_user_id;

            await supabase.from('koda_connections')
                .delete()
                .eq('user_id_1', userA)
                .eq('user_id_2', userB)
                .eq('status', 'pending');
                
            await supabase.from('users').update({ exclusive_mode: null, exclusive_data: null }).eq('id', user.id);
            return `Solicitud rechazada.`;
        }

        return "Por favor responde ACEPTAR o RECHAZAR a la solicitud de conexión.";
    }

    return null;
}
