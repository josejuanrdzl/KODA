import axios from 'axios';

// Cache in-memory for simple rate limiting (optional, but good practice)
const cache = new Map<string, { data: string, timestamp: number }>();

export async function getWeather(userId: string, city?: string): Promise<string> {
    try {
        const rawApiKey = process.env.OPENWEATHER_API_KEY;
        const apiKey = rawApiKey ? rawApiKey.trim() : null;
        if (!apiKey) {
            return "No tengo el servicio de clima configurado en este momento.";
        }

        // The city is now injected from the SessionObject via module.router.ts
        let targetCity = city;
        if (!targetCity) {
            targetCity = 'Monterrey'; // Default fallback if still undefined
        }

        const cacheKey = targetCity.toLowerCase();
        const cached = cache.get(cacheKey);
        // Cache for 30 minutes
        if (cached && (Date.now() - cached.timestamp < 30 * 60 * 1000)) {
            return cached.data;
        }

        // 1. Current weather
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${targetCity}&appid=${apiKey}&units=metric&lang=es`;
        const currentRes = await axios.get(currentUrl);
        const current = currentRes.data;

        // 2. Forecast (5 day / 3 hour, we'll summarize)
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${targetCity}&appid=${apiKey}&units=metric&lang=es`;
        const forecastRes = await axios.get(forecastUrl);
        const forecastList = forecastRes.data.list;

        // Extract today's and tomorrow's simplified forecast
        let tomorrowTemp = "N/A";
        let tomorrowDesc = "N/A";

        // Find a forecast for tomorrow around midday
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const tomorrowData = forecastList.find((f: any) => f.dt_txt.includes(tomorrowStr) && f.dt_txt.includes("12:00:00"));
        if (tomorrowData) {
            tomorrowTemp = `${Math.round(tomorrowData.main.temp)}°C`;
            tomorrowDesc = tomorrowData.weather[0].description;
        }

        const windSpeed = (current.wind.speed * 3.6).toFixed(1); // Convert m/s to km/h

        const report = `🌤️ *Clima en ${current.name}*
Actualmente: ${Math.round(current.main.temp)}°C (${current.weather[0].description})
Sensación térmica: ${Math.round(current.main.feels_like)}°C
Humedad: ${current.main.humidity}% | Viento: ${windSpeed} km/h

📅 *Pronóstico para mañana:*
Temperatura: ${tomorrowTemp} (${tomorrowDesc})`;

        cache.set(cacheKey, { data: report, timestamp: Date.now() });

        return report;
    } catch (e: any) {
        console.error("Error fetching weather:", e.message);
        return "Lo siento, no pude obtener el clima en este momento. Intenta de nuevo más tarde.";
    }
}
