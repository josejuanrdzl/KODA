const db = require('../../backend/services/supabase');
const { supabase } = db;
const { Anthropic } = require('@anthropic-ai/sdk');
import { getGoogleToken, requireGmailConnector } from './google.connector';
import { createViewToken, createActionToken } from '../../portal/portal.tokens';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function handleCalendarModule(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';

    // Intent 1: View Agenda
    const viewAgendaMatch = text.match(/^(qué tengo hoy|mi agenda|mis eventos|tengo reuniones mañana\?|agenda de esta semana|qué tengo el (.+)|eventos de hoy)$/i);
    if (viewAgendaMatch && user.active_context?.mode !== 'calendar_create_confirm' && user.active_context?.mode !== 'calendar_modify_confirm') {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;
         const tokenData = await getGoogleToken(user.id);
         if (!tokenData) return true;

         // Calculate time range
         const now = new Date();
         let startStr = now.toISOString();
         let endStr = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
         let targetDayName = 'hoy';

         const lowerText = text.toLowerCase();
         if (lowerText.includes('mañana')) {
              const tmr = new Date(now);
              tmr.setDate(tmr.getDate() + 1);
              startStr = new Date(tmr.getFullYear(), tmr.getMonth(), tmr.getDate()).toISOString();
              endStr = new Date(tmr.getFullYear(), tmr.getMonth(), tmr.getDate(), 23, 59, 59).toISOString();
              targetDayName = 'mañana';
         } else if (lowerText.includes('esta semana')) {
              const startOfWeek = new Date(now);
              startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
              const endOfWeek = new Date(now);
              endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
              startStr = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()).toISOString();
              endStr = new Date(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate(), 23, 59, 59).toISOString();
              targetDayName = 'esta semana';
         }

         await bot.sendMessage(user.id, `Consultando tu agenda para ${targetDayName}...`, options);

         try {
             const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startStr)}&timeMax=${encodeURIComponent(endStr)}&singleEvents=true&orderBy=startTime`;
             const eventsRes = await fetch(queryUrl, {
                 headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
             });
             const eventsData = await eventsRes.json();
             const events = eventsData.items || [];

             if (events.length === 0) {
                 await bot.sendMessage(user.id, `Tu agenda de ${targetDayName} está libre. ¿Quieres agendar algo?`, options);
                 return true;
             }

             const mappedEvents = events.map((evt: any) => ({
                 id: evt.id,
                 summary: evt.summary || 'Sin título',
                 start: evt.start,
                 end: evt.end,
                 description: evt.description
             }));

             const { url: link } = await createViewToken(user.id, 'agenda', {
                 targetDayName,
                 events: mappedEvents
             });

             await bot.sendMessage(user.id, `📅 Tienes ${events.length} eventos para ${targetDayName}.\n\nRevisa tu agenda completa aquí:\n${link}`, options);
             return true;

         } catch (e) {
             console.error('[Calendar Module] Error fetching events:', e);
             await bot.sendMessage(user.id, "No pude acceder a tu agenda en este momento.", options);
             return true;
         }
    }

    // Intent 2: Create Event
    const createMatch = text.match(/^(agrega a mi calendario|crea evento|agenda reunión con|bloquea el|programa una reunión)\b\s*(.*)$/i);
    if (createMatch && user.active_context?.mode !== 'calendar_create_confirm' && user.active_context?.mode !== 'calendar_modify_confirm') {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;

         const systemPrompt = `Extrae información para crear un evento de calendario a partir de este mensaje.
Regresa JSON estricto con:
{
  "titulo": "título breve",
  "fecha": "YYYY-MM-DD",
  "hora_inicio": "HH:MM",
  "duracion_minutos": numero,
  "participantes": ["email1@ejemplo.com"],
  "descripcion": "..." o null
}
Si no se indica la fecha explícita, asume que es hoy (${new Date().toISOString().split('T')[0]}). Si se menciona a alguien, trata de inferir o dejar vacio email.`;

         await bot.sendMessage(user.id, "Procesando opciones para tu evento...", options);

         try {
             const extractRes = await anthropic.messages.create({
                 model: 'claude-sonnet-4-5',
                 max_tokens: 300,
                 system: systemPrompt,
                 messages: [ { role: 'user', content: text } ]
             });
             const extractText = extractRes.content[0].text;
             const jsonStr = extractText.substring(extractText.indexOf('{'), extractText.lastIndexOf('}') + 1);
             const evtData = JSON.parse(jsonStr);

             if (!evtData.fecha || !evtData.hora_inicio) {
                 await bot.sendMessage(user.id, `Entendido. ¿Para cuándo y a qué hora quieres agendar "${evtData.titulo || 'este evento'}"?`, options);
                 // Save partial context
                 await supabase.from('users').update({
                     active_context: { ...user.active_context, mode: 'calendar_create_missing', draft_event: evtData }
                 }).eq('id', user.id);
                 return true;
             }

             // Compute ISO start/end
             const startISO = `${evtData.fecha}T${evtData.hora_inicio}:00`;
             const startObj = new Date(startISO);
             const endObj = new Date(startObj.getTime() + (evtData.duracion_minutos || 60) * 60000);
             
             evtData.start_iso = startObj.toISOString();
             evtData.end_iso = endObj.toISOString();

             const { url: link } = await createActionToken(user.id, 'new-event', {
                 defaultSummary: evtData.titulo,
                 defaultDate: evtData.fecha,
                 defaultTime: evtData.hora_inicio,
                 defaultEndTime: endObj.toTimeString().substring(0, 5)
             });

             let msgReply = `He preparado el evento "${evtData.titulo}".\n\nRevisa y confirma los detalles aquí para agregarlo a tu calendario:\n${link}`;
             await bot.sendMessage(user.id, msgReply, options);
             return true;

         } catch (e) {
             console.error('[Calendar Module] Error extracting event draft:', e);
             await bot.sendMessage(user.id, "Hubo un problema procesando los datos de tu evento. Intenta de nuevo.", options);
             return true;
         }
    }

    if (user.active_context?.mode === 'calendar_create_missing') {
         // Completing missing date/time from previous extraction
         await bot.sendMessage(user.id, "Por favor dame los detalles completos de fecha y hora en un solo mensaje para programarlo correctamente. (Ej: 'mañana a las 4pm por 30 mins').", options);
         await supabase.from('users').update({
             active_context: { ...user.active_context, mode: 'koda', draft_event: null }
         }).eq('id', user.id);
         return true;
    }

    // Intent 3: Delete / Modify Event (Simplified for now)
    const delMatch = text.match(/^(cancela el evento de|borra la reunión del)\b\s*(.*)$/i);
    if (delMatch) {
         if (!(await requireGmailConnector(user.id, bot, options))) return true;
         // Note: robust implementation requires searching for the event first, confirming, then sending DELETE.
         // As per instructions, we implement the structure.
         const query = delMatch[2].trim();
         await bot.sendMessage(user.id, `Busco el evento "${query}" para cancelarlo. Dame un momento...`, options);
         
         const tokenData = await getGoogleToken(user.id);
         if (!tokenData) return true;

         // Search events today to next 30 days
         const now = new Date();
         const end = new Date(); end.setDate(end.getDate() + 30);
         try {
             const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&q=${encodeURIComponent(query)}&singleEvents=true`;
             const searchRes = await fetch(searchUrl, {
                 headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
             });
             const searchData = await searchRes.json();
             
             if (!searchData.items || searchData.items.length === 0) {
                 await bot.sendMessage(user.id, `No encontré ningún evento próximo llamado o relacionado con "${query}".`, options);
                 return true;
             }

             const targetEvent = searchData.items[0]; // pick first matching
             
             await supabase.from('users').update({
                 active_context: { ...user.active_context, mode: 'calendar_modify_confirm', target_event_id: targetEvent.id, action: 'delete' }
             }).eq('id', user.id);

             await bot.sendMessage(user.id, `¿Cancelo el evento "${targetEvent.summary}" programado para el ${new Date(targetEvent.start.dateTime || targetEvent.start.date).toLocaleString()}?\n\nResponde SÍ o NO.`, options);
             return true;

         } catch (e) {
             console.error('[Calendar Module] Error searching for event to delete:', e);
         }
    }

    if (user.active_context?.mode === 'calendar_modify_confirm') {
         const confirmText = text.toLowerCase();
         if (confirmText === 'no' || confirmText === 'cancelar' || confirmText === 'cancela') {
             await supabase.from('users').update({
                 active_context: { ...user.active_context, mode: 'koda', target_event_id: null, action: null }
             }).eq('id', user.id);
             await bot.sendMessage(user.id, "Operación cancelada.", options);
             return true;
         }

         if (confirmText === 'sí' || confirmText === 'si' || confirmText === 'hazlo') {
             const tokenData = await getGoogleToken(user.id);
             const eventId = user.active_context.target_event_id;
             if (!tokenData || !eventId) return true;

             if (user.active_context.action === 'delete') {
                 try {
                     await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                         method: 'DELETE',
                         headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                     });
                     
                     await supabase.from('users').update({
                         active_context: { ...user.active_context, mode: 'koda', target_event_id: null, action: null }
                     }).eq('id', user.id);

                     await bot.sendMessage(user.id, "✅ Evento cancelado exitosamente en tu Google Calendar.", options);
                     return true;
                 } catch (e) {
                     console.error('[Calendar Module] Error deleting event:', e);
                     await bot.sendMessage(user.id, "No pude cancelar el evento debido a un error.", options);
                     return true;
                 }
             }
         }
    }

    return false;
}
