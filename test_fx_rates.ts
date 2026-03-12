import { getExchangeRates } from './koda-platform/lib/backend/handlers/fx-rates.handler';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing getExchangeRates...");
    try {
        const result = await getExchangeRates('MXN');
        console.log("Result:\n", result);
        
        if (result.includes("Tipo de Cambio Hoy") && result.includes("USD") && result.includes("MXN")) {
            console.log("✅ Test Passed: Result looks correctly formatted.");
        } else if (result.includes("No tengo el servicio de tipo de cambio configurado")) {
             console.log("⚠️ Test Partial: API Key missing, but handler returned gracefully.");
        } else {
            console.log("❌ Test Failed: Unexpected result format.");
        }
    } catch (e: any) {
        console.error("❌ Test Failed with error:", e.message);
    }
}

test();
