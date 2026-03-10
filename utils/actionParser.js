/**
 * Busca y extrae marcadores de acción en el texto generado por KODA.
 * Sintaxis esperadas:
 * [KODA_ACTION:SAVE_NOTE:contenido:etiqueta]
 * [KODA_ACTION:SAVE_REMINDER:contenido:fecha_iso]
 * [KODA_ACTION:SAVE_MEMORY:categoria:clave:valor:contexto]
 */
function parseActions(text) {
    const actions = [];

    const actionRegex = /\[KODA_ACTION:([^:]+):(.+?)\]/g;

    let strippedText = text;
    let match;

    while ((match = actionRegex.exec(text)) !== null) {
        const type = match[1];
        const argsRaw = match[2];

        // Para simplificar, hacemos split por ':' pero OJO: el contenido podría tener ':'
        // Lo mejor es delimitar los argumentos conocidos desde el inicio si es posible,
        // o hacer un split limitado por el número de argumentos que esperamos del lado derecho.

        // Estrategia más segura: split por el símbolo de separador esperado
        const parts = argsRaw.split(':');

        if (type === 'SAVE_NOTE') {
            // Puede que el contenido tenga ":", así que unimos todo excepto el último elemento (tag)
            const tag = parts.pop();
            const content = parts.join(':');
            actions.push({ type, payload: { content, tag: tag === 'null' ? null : tag } });
        }
        else if (type === 'SAVE_REMINDER') {
            // El formato de fecha ISO contiene ":" (ej. 2026-03-08T10:00:00Z), por lo que un simple split falla.
            // Extraer la fecha ISO 8601 del final de la cadena de forma segura:
            const dateMatch = argsRaw.match(/^(.*?):\s*(\d{4}-\d{2}-\d{2}T.*?)\s*$/);
            if (dateMatch) {
                const content = dateMatch[1].trim();
                const remind_at = dateMatch[2].trim();
                actions.push({ type, payload: { content, remind_at } });
            } else {
                // Fallback
                let remind_at = parts.pop().trim();
                let content = parts.join(':').trim();

                // Validate if it's a valid date, otherwise default to tomorrow
                if (isNaN(new Date(remind_at).getTime())) {
                    const fallbackDate = new Date();
                    fallbackDate.setDate(fallbackDate.getDate() + 1);
                    remind_at = fallbackDate.toISOString();
                }

                actions.push({ type, payload: { content, remind_at } });
            }
        }
        else if (type === 'SAVE_MEMORY') {
            // Formato: categoria:clave:valor:contexto
            if (parts.length >= 4) {
                const category = parts[0];
                const key = parts[1];
                // Asumiendo que valor y contexto no contienen :, o si lo hacen, están escapados o limitados
                // Una manera robusta: el contexto es el último, valor es el penúltimo.
                const context = parts.pop();
                const value = parts.slice(2).join(':');
                actions.push({ type, payload: { category, key, value, context } });
            }
        }
        else if (type === 'SAVE_JOURNAL') {
            // Formato: contenido|mood_score|mood_label|summary
            const journalParts = argsRaw.split('|');
            if (journalParts.length >= 4) {
                const content = journalParts[0].trim();
                const mood_score = journalParts[1].trim();
                const mood_label = journalParts[2].trim();
                const summary = journalParts.slice(3).join('|').trim();
                actions.push({ type, payload: { content, mood_score, mood_label, summary } });
            }
        }
        else if (type === 'SAVE_ANALYSIS') {
            // Formato: alias|tono|resumen
            const analysisParts = argsRaw.split('|');
            if (analysisParts.length >= 3) {
                const alias = analysisParts[0].trim();
                const tone = analysisParts[1].trim();
                const summary = analysisParts.slice(2).join('|').trim();
                actions.push({ type, payload: { alias, tone, summary } });
            }
        }
        else if (type === 'CREATE_HABIT') {
            // Formato: nombre|descripcion|frecuencia|hora_recordatorio
            const habitParts = argsRaw.split('|');
            if (habitParts.length >= 1) {
                const name = habitParts[0].trim();
                const description = (habitParts[1] || '').trim();
                const frequency = (habitParts[2] || 'daily').trim();
                const reminder_time = (habitParts[3] || '20:00:00').trim();
                actions.push({ type, payload: { name, description, frequency, reminder_time } });
            }
        }
        else if (type === 'LOG_HABIT') {
            // Formato: habit_id|completed|nota
            const logParts = argsRaw.split('|');
            if (logParts.length >= 2) {
                const habit_id = logParts[0].trim();
                const completed = logParts[1].trim().toLowerCase() === 'true';
                const note = (logParts[2] || '').trim();
                actions.push({ type, payload: { habit_id, completed, note } });
            }
        }
        else if (type === 'UPDATE_HABIT_STATUS') {
            // Formato: habit_id|status
            const statusParts = argsRaw.split('|');
            if (statusParts.length >= 2) {
                const habit_id = statusParts[0].trim();
                const status = statusParts[1].trim();
                actions.push({ type, payload: { habit_id, status } });
            }
        }

        // Limpiar del texto original la ocurrencia que encontramos
        strippedText = strippedText.replace(match[0], '');
    }

    // Limpiar whitespace sobrante o saltos de línea donde estaban las etiquetas
    strippedText = strippedText.trim();

    return { strippedText, actions };
}

module.exports = {
    parseActions
};
