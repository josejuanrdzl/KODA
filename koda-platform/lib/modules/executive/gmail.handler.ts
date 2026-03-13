const db = require('../../backend/services/supabase');
const { supabase } = db;
const { Anthropic } = require('@anthropic-ai/sdk');
import { getGoogleToken, requireGmailConnector } from './google.connector';
import { createViewToken, createActionToken } from '../../portal/portal.tokens';

const appUrl = process.env.FLY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function handleGmailModule(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';

    // INTENT 1: Ver emails sin leer
    if (/^(qué emails tengo|revisa mi correo|emails importantes|bandeja de entrada|tengo correos nuevos\?|mis emails|correos sin leer)$/i.test(text)) {
        if (!(await requireGmailConnector(user.id, bot, options))) return true;
        await bot.sendMessage(user.id, "Buscando tus emails sin leer...", options);

        const tokenData = await getGoogleToken(user.id);
        if (!tokenData) return true;

        try {
            const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=15', {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            });
            const listData = await listRes.json();

            if (!listData.messages || listData.messages.length === 0) {
                await bot.sendMessage(user.id, "Tu bandeja de entrada está limpia. No tienes emails sin leer.", options);
                return true;
            }

            const metadataPromises = listData.messages.map((m: any) => 
                fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                }).then(res => res.json())
            );
            
            const messagesMetadata = await Promise.all(metadataPromises);
            
            const simplifiedMessages = messagesMetadata.map(m => {
                const headers = m.payload?.headers || [];
                const fromHeader = headers.find((h: any) => h.name === 'From')?.value || 'Desconocido';
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sin asunto';
                const date = headers.find((h: any) => h.name === 'Date')?.value || '';
                
                // Extract clean name from "Name <email@domain.com>"
                const fromMatch = fromHeader.match(/^([^<]+)/);
                const fromName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : fromHeader;

                return {
                    id: m.id,
                    from_name: fromName,
                    subject,
                    date
                };
            });

            const systemPrompt = `Clasifica estos emails por urgencia. Devuelve SOLO JSON array:
[{ "id": "...", "from_name": "...", "subject": "...", "date": "...", "urgency": "urgent|important|normal|skip", "one_line": "resumen de una línea en español" }]
urgent = requiere acción hoy, important = requiere acción pronto, normal = informativo, skip = newsletters/marketing/notificaciones`;

            const aiResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 1000,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: JSON.stringify(simplifiedMessages) }
                ]
            });

            const aiText = aiResponse.content[0].text;
            const jsonStr = aiText.substring(aiText.indexOf('['), aiText.lastIndexOf(']') + 1);
            const classifiedEmails = JSON.parse(jsonStr);

            // Save to active context
            const relevantEmails = classifiedEmails.filter((e: any) => e.urgency !== 'skip');
            await supabase.from('users').update({
                active_context: { ...user.active_context, gmail_list: relevantEmails }
            }).eq('id', user.id);

            const urgents = relevantEmails.filter((e: any) => e.urgency === 'urgent');
            const importants = relevantEmails.filter((e: any) => e.urgency === 'important');
            const normals = relevantEmails.filter((e: any) => e.urgency === 'normal');

            let replyMsg = `📧 Tienes ${relevantEmails.length} emails sin leer relevantes:\n\n`;
            
            if (urgents.length > 0) {
                replyMsg += `🔴 Urgente (${urgents.length}):\n`;
                urgents.forEach((e: any) => replyMsg += `• ${e.from_name} — '${e.subject}' — ${e.one_line}\n`);
                replyMsg += '\n';
            }
            if (importants.length > 0) {
                replyMsg += `🟡 Importante (${importants.length}):\n`;
                importants.forEach((e: any) => replyMsg += `• ${e.from_name} — '${e.subject}' — ${e.one_line}\n`);
                replyMsg += '\n';
            }
            if (normals.length > 0) {
                replyMsg += `📋 Normal (${normals.length}):\n`;
                normals.forEach((e: any) => replyMsg += `• ${e.from_name} — '${e.subject}'\n`);
                replyMsg += '\n';
            }

            replyMsg += "¿Quieres que lea alguno completo? Dime el nombre o el tema.";
            await bot.sendMessage(user.id, replyMsg, options);
            return true;

        } catch (error) {
            console.error('[Gmail Module] Error fetching unread emails:', error);
            await bot.sendMessage(user.id, "Hubo un error al revisar tu correo. Intenta de nuevo más tarde.", options);
            return true;
        }
    }

    // INTENT 2: Leer email completo
    const readMatch = text.match(/^(lee el de|abre el primero|lee el urgente de|qué dice el de|lee el email sobre|leer el de)\s+(.+)$/i);
    if (readMatch) {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;
         const tokenData = await getGoogleToken(user.id);
         if (!tokenData) return true;

         const query = readMatch[2].trim().toLowerCase();
         await bot.sendMessage(user.id, "Buscando el email...", options);

         let targetEmailId = null;
         
         // Search in context first
         const contextEmails = user.active_context?.gmail_list || [];
         const matchEmail = contextEmails.find((e: any) => 
             e.from_name.toLowerCase().includes(query) || 
             e.subject.toLowerCase().includes(query) ||
             (query === 'el urgente' && e.urgency === 'urgent') ||
             (query === 'urgente' && e.urgency === 'urgent')
         );

         if (matchEmail) {
             targetEmailId = matchEmail.id;
         } else {
             // Search API
             try {
                const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`, {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                });
                const searchData = await searchRes.json();
                if (searchData.messages && searchData.messages.length > 0) {
                    targetEmailId = searchData.messages[0].id;
                }
             } catch (e) {
                 console.error('[Gmail Module] Error searching for specific email:', e);
             }
         }

         if (!targetEmailId) {
             await bot.sendMessage(user.id, `No encontré ningún email reciente que coincida con "${query}".`, options);
             return true;
         }

         try {
             const getRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${targetEmailId}?format=full`, {
                  headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
             });
             const emailData = await getRes.json();

             // Extract body
             let body = '';
             if (emailData.payload?.parts) {
                 const textPart = emailData.payload.parts.find((p: any) => p.mimeType === 'text/plain');
                 if (textPart && textPart.body && textPart.body.data) {
                     body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
                 } else {
                     const htmlPart = emailData.payload.parts.find((p: any) => p.mimeType === 'text/html');
                     if (htmlPart && htmlPart.body && htmlPart.body.data) {
                         body = Buffer.from(htmlPart.body.data, 'base64').toString('utf8').replace(/<[^>]*>?/gm, ''); // stripped HTML
                     }
                 }
             } else if (emailData.payload?.body?.data) {
                  body = Buffer.from(emailData.payload.body.data, 'base64').toString('utf8');
             }

             if (!body) body = "No pude extraer el texto de este email.";

             let finalContent = body.trim();
             
             // Extract HTML content if available and we haven't lost it yet, or use text
             // Actually we should try to pass HTML to the viewer if possible, but plain text goes fine too.
             // We'll pass finalContent which is clean text or HTML.
             
             // Mark as read
             await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${targetEmailId}/modify`, {
                 method: 'POST',
                 headers: { 
                     'Authorization': `Bearer ${tokenData.access_token}`,
                     'Content-Type': 'application/json' 
                 },
                 body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
             });

             const headers = emailData.payload.headers;
             const from = headers.find((h: any) => h.name === 'From')?.value || 'Desconocido';
             const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sin asunto';
             const messageIdHeader = headers.find((h: any) => h.name === 'Message-ID')?.value;
             const toHeader = headers.find((h: any) => h.name === 'To')?.value;

             // Save email as active target
             await supabase.from('users').update({
                 active_context: { 
                     ...user.active_context, 
                     current_email: {
                         id: targetEmailId,
                         message_id_header: messageIdHeader,
                         from: from,
                         to: toHeader,
                         subject: subject
                     } 
                 }
             }).eq('id', user.id);

             const { url: link } = await createViewToken(user.id, 'email', {
                 from,
                 to: toHeader,
                 subject,
                 date: headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString(),
                 body: finalContent
             });

             await bot.sendMessage(user.id, `De: ${from}\nAsunto: ${subject}\n\nHe preparado el correo para ti. Ábrelo aquí para leerlo completo:\n${link}`, options);
             return true;

         } catch (e) {
             console.error('[Gmail Module] Error reading full email:', e);
             await bot.sendMessage(user.id, "Hubo un error al leer el contenido del email.", options);
             return true;
         }
    }

    // INTENT 3: Draft Reply
    const replyMatch = text.match(/^(responde que|contéstale que|redacta respuesta|dile que|responde al email)\b\s*(.*)$/i);
    if (replyMatch && user.active_context?.mode !== 'gmail_reply_confirm') {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;

         const currentEmail = user.active_context?.current_email;
         if (!currentEmail) {
             await bot.sendMessage(user.id, "¿A cuál email quieres responder? Primero tienes que pedirme que lea uno.", options);
             return true;
         }

         const instructions = replyMatch[2].trim() || 'respuesta cortés y concisa';
         await bot.sendMessage(user.id, "Redactando borrador...", options);

         try {
             // Query Sonnet for drafting
             const draftRes = await anthropic.messages.create({
                 model: 'claude-3-5-sonnet-20241022',
                 max_tokens: 300,
                 system: `Redacta una respuesta profesional a un email. 
Tono: profesional pero coloquial (como lo haría un ejecutivo moderno).
Idioma: español.
Máximo 150 palabras. Solo el cuerpo del correo, sin asunto, sin firma (solo tu nombre o el nombre del usuario si se deduce).`,
                 messages: [
                     { role: 'user', content: `Email Original De: ${currentEmail.from}\nAsunto: ${currentEmail.subject}\n\nInstrucción de respuesta: ${instructions}` }
                 ]
             });

             const draftText = draftRes.content[0].text;

             const cleanFromMatch = currentEmail.from.match(/^([^<]+)/);
             const cleanFrom = cleanFromMatch ? cleanFromMatch[1].trim() : currentEmail.from;

             const { url: link } = await createActionToken(user.id, 'reply', {
                 to: currentEmail.from,
                 to_name: cleanFrom,
                 subject: currentEmail.subject,
                 message_id_header: currentEmail.message_id_header,
                 threadId: currentEmail.id,
                 draft: draftText
             });

             await bot.sendMessage(user.id, `📝 He redactado un borrador de respuesta para ${cleanFrom}.\n\nRevísalo, modifícalo (si quieres) y envíalo desde aquí:\n${link}`, options);
             return true;

         } catch (e) {
              console.error('[Gmail Module] Error drafting reply:', e);
              await bot.sendMessage(user.id, "Error redactando la respuesta.", options);
              return true;
         }
    }

    // INTENT 4: Buscar email
    const searchMatch = text.match(/^(busca el (email|correo) de|encuentra el correo sobre|recibí algo de)\s*(.+)$/i);
    if (searchMatch) {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;
         const tokenData = await getGoogleToken(user.id);
         if (!tokenData) return true;

         const queryObj = searchMatch[3].trim();
         
         const systemPrompt = `Convierte esta intención de usuario en una query de Gmail (e.g. from:martha, subject:presupuesto, after:2024/01/01). Solo devuelve la query final como texto plano sin comillas. Intención: "busca ${queryObj}"`;
         
         try {
             const queryRes = await anthropic.messages.create({
                 model: 'claude-3-5-sonnet-20240620',
                 max_tokens: 50,
                 system: systemPrompt,
                 messages: [ { role: 'user', content: "Genera la query." } ]
             });
             const gmailQuery = queryRes.content[0].text.trim();
             
             await bot.sendMessage(user.id, `Buscando: ${gmailQuery}`, options);

             const apiRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=5`, {
                 headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
             });
             const apiData = await apiRes.json();
             
             if (!apiData.messages || apiData.messages.length === 0) {
                 await bot.sendMessage(user.id, "No encontré resultados para esa búsqueda.", options);
                 return true;
             }

             const metadataPromises = apiData.messages.map((m: any) => 
                 fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
                     headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                 }).then(res => res.json())
             );
             const metadataResults = await Promise.all(metadataPromises);

             let replyStr = `Encontré ${metadataResults.length} emails relacionados:\n\n`;
             const contextMails: any[] = [];
             
             metadataResults.forEach((m: any, idx: number) => {
                 const headers = m.payload?.headers || [];
                 const from = headers.find((h: any) => h.name === 'From')?.value || 'Desconocido';
                 const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sin asunto';
                 const date = headers.find((h: any) => h.name === 'Date')?.value || '';
                 
                 const cleanFrom = from.match(/^([^<]+)/) ? from.match(/^([^<]+)/)[1].trim().replace(/"/g, '') : from;
                 const shortDate = new Date(date).toLocaleDateString();

                 replyStr += `• [${idx+1}] ${shortDate} — ${cleanFrom} — '${subject}'\n`;
                 
                 contextMails.push({ id: m.id, from_name: cleanFrom, subject: subject, urgency: 'normal' });
             });

             replyStr += "\n¿Cuál quieres leer? (Ej: 'lee el 1' o dime el nombre)";
             
             await supabase.from('users').update({
                 active_context: { ...user.active_context, gmail_list: contextMails }
             }).eq('id', user.id);

             await bot.sendMessage(user.id, replyStr, options);
             return true;

         } catch (e) {
             console.error('[Gmail Module] Error searching emails:', e);
             await bot.sendMessage(user.id, "Tuvimos un problema con la búsqueda.", options);
             return true;
         }
    }

    // Support index reading from search ('lee el 1')
    const idxMatch = text.match(/^lee el (\d+)$/i);
    if (idxMatch && user.active_context?.gmail_list) {
         const list = user.active_context.gmail_list;
         const idx = parseInt(idxMatch[1]) - 1;
         if (idx >= 0 && idx < list.length) {
             // Mock text to trigger intent 2
             msg.text = `lee el de ${list[idx].from_name.split(' ')[0]}`;
             return handleGmailModule(bot, msg, user, options);
         }
    }

    return false;
}
