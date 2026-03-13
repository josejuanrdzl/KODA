require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { getFamilyContext } = require("./lib/backend/handlers/familia.handler");
const { getExchangeRates } = require("./lib/backend/handlers/fx-rates.handler");

async function testHandlers() {
    console.log("--- Testing Handlers Locally ---");
    
    // Test user ID (using a dummy one or searching for the one the user uses)
    // Note: Since I don't have the user's specific ID easily here, I'll just check if they throw errors.
    const dummyId = "00000000-0000-0000-0000-000000000000";

    console.log("\n1. Testing Familia Handler:");
    try {
        const familyRes = await getFamilyContext(dummyId);
        console.log("Response:", familyRes);
    } catch (e) {
        console.error("Familia Error:", e.message);
    }

    console.log("\n2. Testing FX Rates Handler:");
    try {
        const fxRes = await getExchangeRates("MXN");
        console.log("Response:", fxRes);
    } catch (e) {
        console.error("FX Rates Error:", e.message);
    }
}

testHandlers();
