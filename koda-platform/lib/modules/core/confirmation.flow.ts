import { FlowModule, FlowResponse } from '../../backend/flow.engine';
import { SessionObject } from '../../backend/session.manager';
const db = require('../../backend/services/supabase');
const { supabase } = db;

// Action registry para superar la limitación de JSON.stringify() en Redis
// Las funciones JS no se pueden guardar en session.flowData, así que guardamos
// strings que apuntan a este registro de acciones estáticas.
export const ACTION_REGISTRY: Record<string, (pendingData: any, session: SessionObject) => Promise<string>> = {
  'delete_habit': async (data, session) => {
      await supabase.from('habits').delete().eq('id', data.habitId).eq('user_id', session.userId);
      return '✅ Hábito eliminado exitosamente.';
  },
  'test_confirmation': async (data, session) => {
      return `✅ Prueba exitosa. Confirmaste los datos: ${JSON.stringify(data)}`;
  }
};

export const confirmationFlow: FlowModule = {
  flowId: 'confirm-action',
  moduleSlug: 'confirmation',

  async startFlow(session: SessionObject, options: any): Promise<FlowResponse> {
     const flowData = session.flowData as any;
     return {
        response: flowData?.confirmMessage || '¿Estás seguro de continuar con esta acción? (SÍ/NO)'
     };
  },

  async continueFlow(message: string, session: SessionObject, options: any): Promise<FlowResponse> {
      const text = message.toLowerCase().trim();
      const flowData = session.flowData as any;
      const affirmative = ['sí', 'si', 'yes', 's', '1', 'claro', 'seguro', 'va'];

      if (affirmative.includes(text)) {
          const actionName = flowData?.pendingAction;
          if (actionName && ACTION_REGISTRY[actionName]) {
             const result = await ACTION_REGISTRY[actionName](flowData.pendingData, session);
             return { response: result, endFlow: true };
          } else {
             return { response: `Error: Acción no válida (${actionName}). Operación cancelada.`, endFlow: true };
          }
      } else {
          return { response: 'Operación cancelada.', endFlow: true };
      }
  }
};
