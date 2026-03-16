import axios from 'axios';

export async function execute(req: any) {
    try {
        let city = req.location?.city || 'Monterrey'; // Default fallback

        // Validar si el usuario mandó la ciudad en el mensaje (e.g. "clima en Guadalajara")
        const match = req.message?.match(/en\s+([a-zA-Z\s]+)(\?|$)/i);
        if (match && match[1]) {
            city = match[1].trim();
        }

        // Llamar a wttr.in con la ciudad
        // Usamos format=3 (condición + temp) y lang=es
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=%l:+%C+%t+(Viento:+%w,+%h)&lang=es`;
        const currentRes = await axios.get(url);
        
        let report = currentRes.data.trim();
        
        // Si wttr.in retorna algo muy genérico o HTML por error, poner un fallback
        if (report.includes('<html')) {
            return { response: `Lo siento, wttr.in está temporalmente no disponible para ${city}.` };
        }

        return { response: `🌤️ *Clima aproximado:*\n${report}` };
    } catch (error: any) {
        console.error("[Weather Module] Error fetching weather from wttr.in:", error.message);
        return { response: "Lo siento, no pude obtener el clima en este momento. Intenta de nuevo más tarde." };
    }
}
