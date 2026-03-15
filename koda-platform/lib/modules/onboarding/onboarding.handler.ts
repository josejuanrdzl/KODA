import { FlowModule, FlowResponse, startFlow } from '../../backend/flow.engine';
import { SessionObject, invalidateSession } from '../../backend/session.manager';
const db = require('../../backend/services/supabase');
const { supabase } = db;

/**
 * Función inicializadora llamada desde el router cuando el usuario es nuevo y no está en flow.
 */
export async function handleOnboardingStart(session: SessionObject): Promise<string> {
    const welcomeMsg = `¡Hola! Soy *KODA*, tu copiloto inteligente. 🚀\n\nVoy a ser tu memoria, tu organizador y tu mano derecha. Todo lo que me digas lo recuerdo, y estoy disponible para ayudarte a gestionar tu vida personal y profesional.\n\nPara empezar, **¿cómo te llamas?** (Dime tu nombre como prefieras que te diga)`;
    await startFlow('onboarding', 'onboarding-v1', {}, session);
    return welcomeMsg;
}

export const onboardingFlow: FlowModule = {
  flowId: 'onboarding-v1',
  moduleSlug: 'onboarding',

  async startFlow(session: SessionObject, options: any): Promise<FlowResponse> {
      return { response: '' }; // No need, initial msg handled by handleOnboardingStart
  },

  async continueFlow(message: string, session: SessionObject, options: any): Promise<FlowResponse> {
      const userId = session.userId;
      const text = message.trim();
      const channel = session.channel;
      const step = session.flowStep || 1;

      if (step === 1) {
          if (!text) {
              return { response: "Por favor, dime tu nombre para continuar:" };
          }
          const cleanText = text.toLowerCase().replace(/^[¡!¿?.\s-,]+/, '').trim();
          const commonGreetings = ['hola', 'hi', 'hey', 'buenas', 'hello', 'start', '/start', 'buen dia', 'buenos', 'que onda'];
          if (commonGreetings.some(g => cleanText.startsWith(g)) && text.length < 30) {
              return { response: "¡Hola! Dime tu nombre para continuar:" };
          }
          
          await supabase.from('users').update({ 
              name: text,
              full_name: text
          }).eq('id', userId);

          const kodaIdMsg = `¡Mucho gusto, *${text}*! 🙌\n\nPara que podamos interactuar mejor, necesito que elijas tu *KODA ID*. Es un nombre único (como @usuario) que te servirá para que otros te encuentren.\n\n**Escribe el KODA ID que deseas** (solo letras, números y guiones bajos):`;
          return { response: kodaIdMsg, nextStep: 2 };
      }

      if (step === 2) {
          const requestedId = text.replace(/^@/, '').toLowerCase();
          if (!/^[a-z0-9_]{3,20}$/.test(requestedId)) {
              return { response: "Formato inválido. Usa solo minúsculas, números y guiones bajos (3-20 caracteres). Intenta con otro:" };
          }

          const { data: existing } = await supabase.from('users').select('id').eq('koda_id', requestedId).maybeSingle();
          if (existing && existing.id !== userId) {
              return { response: `⚠️ El KODA ID @${requestedId} ya está en uso. Por favor elige otro:` };
          }

          await supabase.from('users').update({ koda_id: requestedId }).eq('id', userId);

          const configMsg = `¡Perfecto! Tu KODA ID es *@${requestedId}*. ✅\n\nAhora, unas configuraciones rápidas:\n**¿Desde qué ciudad me escribes?** Esto me servirá para darte el clima y noticias locales.`;
          return { response: configMsg, nextStep: 3 };
      }

      if (step === 3) {
          await supabase.from('memories').upsert({
              user_id: userId, category: 'config', key: 'ciudad', value: text, context: 'system'
          }, { onConflict: 'user_id, category, key' });

          await supabase.from('users').update({ city: text }).eq('id', userId);
          // Forzamos invalidar sesión para que el timezone se recalcule desde base en el sig request
          await invalidateSession(channel, session.channelUserId); 

          const timeMsg = `¡Entendido! Te tengo ubicado en *${text}*. 📍\n\n**¿A qué hora te gustaría recibir tu 'Good Morning KODA'?** Es un resumen de tu agenda, clima y pendientes para empezar el día. (Responde en formato HH:MM, ej: 08:30)`;
          return { response: timeMsg, nextStep: 4 };
      }

      if (step === 4) {
          const timeMatch = text.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
          if (!timeMatch) {
              return { response: "⚠️ Por favor usa el formato HH:MM (ejemplo 07:45):" };
          }

          await supabase.from('users').update({ 
              proactive_good_morning: text, 
              onboarding_complete: true 
          }).eq('id', userId);

          const plan = session.plan || 'free';
          let capabilities = `¡Todo listo! Ya estamos configurados. Esto es lo que puedo hacer por ti:\n\n` +
            `🧠 *Memoria Infinita*: Recuerdo todo lo que me digas.\n` +
            `📅 *Agenda*: Puedo ver tus compromisos (conecta tu calendario).\n` +
            `📧 *Gmail*: Puedo leer y resumir tus correos.\n` +
            `💬 *Mensajería*: Puedo ayudarte a redactar y gestionar mensajes.\n\n`;
          
          if (plan === 'executive' || plan === 'business') {
              capabilities += `💼 *Modo Ejecutivo*: Tienes acceso a todas las herramientas avanzadas.\n\n`;
          } else {
              capabilities += `✨ *Plan Personal*: Tienes las funciones esenciales activas. Pregúntame si quieres saber más sobre los planes Executive.\n\n`;
          }
          capabilities += "¿En qué te puedo ayudar hoy?";

          return { response: capabilities, endFlow: true, updateData: { finished: true } };
      }

      return { response: "¿En qué puedo ayudarte?", endFlow: true };
  }
};
