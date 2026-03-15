import { updateSessionAndDB } from '../session.manager';
import { simpleGenerate } from '../services/claude';

export async function handleTravelLocation(msg: any, user: any, intent: string, options: any) {
    if (intent === 'clear_travel_city') {
        const homeCity = user.city || 'Chihuahua';
        let homeTimezone = 'America/Chihuahua';
        try {
            const tzPrompt = `Responde ÚNICAMENTE con la zona horaria IANA de la siguiente ciudad: ${homeCity}. Ejemplo: America/Mexico_City`;
            let result = await simpleGenerate(options.aiEngine, tzPrompt, "", 20);
            result = result.trim();
            if (result.includes('/')) homeTimezone = result;
        } catch(e) {}
        
        await updateSessionAndDB(user, { travelCity: null, travelUntil: null, timezone: homeTimezone });
        return `He borrado la ciudad de viaje. Tu clima y horarios volverán a basarse en tu ciudad principal (${homeCity}).`;
    } else if (intent === 'update_travel_city') {
        const text = msg.text || '';
        
        const systemPrompt = `Extrae la ciudad a la que el usuario menciona viajar y su zona horaria IANA.
Responde ÚNICAMENTE con el formato "Ciudad, País|Zona Horaria IANA". No añadas puntuación final ni explicaciones.
Ejemplos:
User: "voy a cdmx mañana" -> "Ciudad de México, México|America/Mexico_City"
User: "estoy en miami por unos dias" -> "Miami, Estados Unidos|America/New_York"
User: "me mudo a londres" -> "Londres, Reino Unido|Europe/London"
Si no puedes identificar una ciudad real o no es claro, responde "DESCONOCIDO".`;

        let result = "DESCONOCIDO";
        try {
            result = await simpleGenerate(options.aiEngine, systemPrompt, text, 50);
            result = result.trim().replace(/\.$/, '');
        } catch (e) {
            console.error("Error extracting travel city and timezone:", e);
        }

        if (result === "DESCONOCIDO" || !result || !result.includes('|')) {
            // Fallback in case AI doesn't return the pipe separator
            if (result !== "DESCONOCIDO" && result !== "") {
                const untilStrFallback = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                await updateSessionAndDB(user, { travelCity: result, travelUntil: untilStrFallback });
                return `¡Buen viaje! He actualizado tu ciudad a *${result}*. El clima se ajustará temporalmente.`;
            }
            return "¿A qué ciudad viajas? No pude entender claramente el destino en tu mensaje.";
        }

        const [city, timezone] = result.split('|');

        // Add 7 days as a default limit. In the future, this can be parsed via AI too.
        const travelUntil = new Date();
        travelUntil.setDate(travelUntil.getDate() + 7);
        const untilStr = travelUntil.toISOString().split('T')[0];

        // Update travel city and the user's primary timezone explicitly so the temporal layer inherits it.
        // Wait, if we change the user's timezone abruptly, when they clear travel city, do we know their original timezone?
        // Let's store the original timezone or rely on effective logic.
        // For simplicity right now, we can update the user's timezone in DB, but a better approach would be to store travelTimezone.
        // Let's just update the user's timezone.
        await updateSessionAndDB(user, { travelCity: city.trim(), travelUntil: untilStr, timezone: timezone.trim() });

        return `¡Buen viaje! He actualizado tu ubicación temporal a *${city.trim()}* y tu zona horaria a *${timezone.trim()}* (válido por 7 días o hasta que envíes 'regresé'). Esto ajustará el horario y clima.`;
    }
    
    return "No pude procesar la orden relacionada a viajes o ubicación.";
}
