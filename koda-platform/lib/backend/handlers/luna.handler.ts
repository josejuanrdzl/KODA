import { getCycleData } from '../services/supabase';

// Helper function to calculate phase
function calculatePhase(cycleStart: Date | string, cycleLength: number): { phase: string, daysSinceStart: number, daysUntilNext: number } {
    const today = new Date();
    const start = new Date(cycleStart);

    // Normalize times to midnight for accurate day calculation
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - start.getTime(); // can be negative if future date, but let's assume past/present
    const daysSinceStart = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Day 1 is cycleStart

    const daysUntilNext = cycleLength - daysSinceStart;

    let phase = 'Desconocida';
    if (daysSinceStart >= 1 && daysSinceStart <= 5) {
        phase = 'Menstruación (Invierno)';
    } else if (daysSinceStart >= 6 && daysSinceStart <= 13) {
        phase = 'Folicular (Primavera)';
    } else if (daysSinceStart >= 14 && daysSinceStart <= 16) {
        phase = 'Ovulación (Verano)';
    } else if (daysSinceStart >= 17 && daysSinceStart <= cycleLength) {
        phase = 'Lútea (Otoño)';
    } else if (daysSinceStart > cycleLength) {
        phase = 'Atraso (Esperando nuevo ciclo)';
    }

    return { phase, daysSinceStart, daysUntilNext };
}

export async function processLunaContext(userId: string): Promise<string> {
    try {
        const cycleData = await getCycleData(userId);

        if (!cycleData) {
            return `[LUNA CONTEXT]
La usuaria tiene activado el módulo Luna pero no ha registrado ningún ciclo aún. 
Si el tema surge o te menciona algo sobre menstruación/regla, ofrécele registrar su último periodo usando el formato: [KODA_ACTION:LUNA_LOG_CYCLE:YYYY-MM-DD|duracion_habitual|notas]
Ejemplo: [KODA_ACTION:LUNA_LOG_CYCLE:2026-03-01|28|Flujo normal]`;
        }

        const { cycle_start, cycle_length, symptoms } = cycleData;
        const { phase, daysSinceStart, daysUntilNext } = calculatePhase(cycle_start, cycle_length);

        const symptomsList = symptoms && symptoms.length > 0 ? symptoms.join(', ') : 'Ninguno registrado recientemente';

        return `[LUNA CONTEXT]
Ciclo Actual: Día ${daysSinceStart} de ${cycle_length} (Inició: ${cycle_start})
Fase Estimada: ${phase}
Días para próximo ciclo: ${daysUntilNext > 0 ? daysUntilNext : 'Debería iniciar pronto'}
Síntomas Recientes del ciclo actual: ${symptomsList}

Instrucciones para KODA (Luna Activo):
- Usa este contexto de fondo SI la usuaria menciona temas de salud, cansancio, emociones, síntomas físicos, o pregunta expresamente por su ciclo.
- Durante la fase Lútea o de Menstruación, la usuaria puede estar bajoneada o con menos energía; sé más empático y recomienda priorizar el descanso o autocuidado.
- Durante fase Folicular u Ovulación, suele haber más energía; puedes motivarla a actividades de impacto.
- Si la usuaria reporta un NUEVO síntoma o molestia aislada, regístralo con: [KODA_ACTION:LUNA_LOG_SYMPTOM:síntoma] (ej. dolor de cabeza, cólicos, antojos).
- Si la usuaria reporta que INICIÓ su regla u otro ciclo HOY (o da una fecha nueva), regístralo con: [KODA_ACTION:LUNA_LOG_CYCLE:YYYY-MM-DD|${cycle_length}|notas]`;

    } catch (error) {
        console.error('Error fetching Luna context:', error);
        return '[LUNA CONTEXT] Error al obtener datos del ciclo.';
    }
}
