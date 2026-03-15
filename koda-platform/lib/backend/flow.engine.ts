import { SessionObject, updateSession } from './session.manager';

export interface FlowResponse {
  response: string;
  nextStep?: number;
  updateData?: object;
  endFlow?: boolean;
  error?: string;
}

export interface FlowModule {
  flowId: string;
  moduleSlug: string;
  startFlow(session: SessionObject, options: any): Promise<FlowResponse>;
  continueFlow(message: string, session: SessionObject, options: any): Promise<FlowResponse>;
}

// Registry to avoid circular dependencies and load modules dynamically
const FLOW_REGISTRY: Record<string, () => Promise<any>> = {
  'onboarding': () => import('../modules/onboarding/onboarding.handler'),
  'confirmation': () => import('../modules/core/confirmation.flow'),
};

async function getModuleBySlug(slug: string): Promise<FlowModule | null> {
    const loader = FLOW_REGISTRY[slug];
    if (!loader) return null;
    const mod = await loader();
    // Find the exported object that implements FlowModule for this slug
    const flowModule = Object.values(mod).find((val: any) => val?.moduleSlug === slug) as FlowModule;
    return flowModule || null;
}

export function isFlowActive(session: SessionObject): boolean {
    return session.mode === 'flow' && session.flowOwner !== null;
}

/**
 * Changes session mode to 'flow'. The caller module is responsible for returning
 * the appropriate initial response to the user.
 */
export async function startFlow(moduleSlug: string, flowId: string, initialData: any, session: SessionObject): Promise<string | null> {
    if (session.mode === 'flow') {
        return 'Ya hay un proceso activo. Escribe "cancelar" para interrumpirlo primero.';
    }

    session.mode = 'flow';
    session.flowId = flowId;
    session.flowStep = 1;
    session.flowData = initialData || {};
    session.flowOwner = moduleSlug;

    await updateSession(session, {
        mode: 'flow',
        flowId: flowId,
        flowStep: 1,
        flowData: session.flowData,
        flowOwner: moduleSlug
    });
    
    return null; // Signals success
}

export async function continueFlow(message: string, session: SessionObject, options: any): Promise<string> {
    const CANCEL_TRIGGERS = ['cancelar', 'salir', 'stop', 'cancel', 'exit', '0'];
    const text = message.toLowerCase().trim();
    
    if (CANCEL_TRIGGERS.includes(text)) {
        await endFlow(session);
        return 'Cancelado. ¿En qué te ayudo?';
    }

    if (!session.flowOwner) {
        await endFlow(session);
        return 'Ocurrió un error interno. ¿En qué te ayudo?';
    }

    const flowModule = await getModuleBySlug(session.flowOwner);
    if (!flowModule) {
        await endFlow(session);
        return 'Ocurrió un error (módulo de flujo no encontrado). ¿En qué te ayudo?';
    }

    try {
        const flowResponse = await flowModule.continueFlow(message, session, options);
        
        if (flowResponse.error) {
           return flowResponse.error;
        }

        if (flowResponse.updateData) {
            session.flowData = { ...(session.flowData || {}), ...flowResponse.updateData };
        }
        
        if (flowResponse.nextStep !== undefined) {
            session.flowStep = flowResponse.nextStep;
        }
        
        if (flowResponse.endFlow) {
            await endFlow(session);
        } else {
            await updateSession(session, {
                flowStep: session.flowStep,
                flowData: session.flowData
            });
        }

        return flowResponse.response;
    } catch (e: any) {
        console.error(`[FlowEngine] Error in module ${session.flowOwner}:`, e);
        await endFlow(session);
        return `Ocurrió un error inesperado al procesar tu respuesta. Operación cancelada.`;
    }
}

export async function endFlow(session: SessionObject): Promise<void> {
    session.mode = 'koda';
    session.flowId = null;
    session.flowStep = null;
    session.flowData = null;
    session.flowOwner = null;

    await updateSession(session, {
        mode: 'koda',
        flowId: null,
        flowStep: null,
        flowData: null,
        flowOwner: null
    });
}
