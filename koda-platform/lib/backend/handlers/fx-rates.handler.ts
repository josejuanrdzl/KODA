import axios from 'axios';

// Simple in-memory cache to avoid hitting the API too often constraint
const cache = new Map<string, { data: string, timestamp: number }>();

export async function getExchangeRates(baseCurrency: string = 'MXN'): Promise<string> {
    try {
        const apiKey = process.env.EXCHANGE_RATE_API_KEY;
        if (!apiKey) {
            return "No tengo el servicio de tipo de cambio configurado en este momento.";
        }

        const cacheKey = baseCurrency.toUpperCase();
        const cached = cache.get(cacheKey);
        // Cache for 6 hours since FX rates (unless live trading) don't need per-minute updates for typical user
        if (cached && (Date.now() - cached.timestamp < 6 * 60 * 60 * 1000)) {
            return cached.data;
        }

        // We assume ExchangeRate-API (exchangerate-api.com) format
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;

        const response = await axios.get(url);
        if (response.data && response.data.result === 'success') {
            const rates = response.data.conversion_rates;

            // Build a helpful summary for someone in Mexico (or generally interested in major currencies)
            const mxn = rates['MXN'] ? rates['MXN'].toFixed(2) : 'N/A';
            const eur = rates['EUR'] ? (rates['MXN'] / rates['EUR']).toFixed(2) : 'N/A';
            const gbp = rates['GBP'] ? (rates['MXN'] / rates['GBP']).toFixed(2) : 'N/A';
            const btc = rates['BTC'] ? (rates['MXN'] / rates['BTC']).toLocaleString('es-MX', { maximumFractionDigits: 0 }) : 'N/A';

            const report = `💱 *Tipo de Cambio Hoy*\n` +
                `🇺🇸 1 USD = $${mxn} MXN\n` +
                `🇪🇺 1 EUR = $${eur} MXN\n` +
                `🇬🇧 1 GBP = $${gbp} MXN`;

            cache.set(cacheKey, { data: report, timestamp: Date.now() });
            return report;
        } else {
            return "No pude obtener los tipos de cambio actuales.";
        }
    } catch (e: any) {
        console.error("Error fetching exchange rates:", e.message);
        return "Lo siento, hubo un problema al consultar el tipo de cambio.";
    }
}
