import { getExchangeRates } from '../../backend/handlers/fx-rates.handler';

export async function execute(req: any): Promise<{ response: string; success: boolean }> {
    try {
        const baseCurrency = req.location?.country === 'MX' ? 'MXN' : 'USD';
        const report = await getExchangeRates(baseCurrency);
        return { response: report, success: true };
    } catch (error: any) {
        console.error('[fx-rates.module] Error:', error.message);
        return {
            response: 'No pude obtener el tipo de cambio en este momento. Intenta de nuevo más tarde.',
            success: false,
        };
    }
}
