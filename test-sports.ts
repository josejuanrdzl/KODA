import { fetchSportsData, fetchLiveMatches } from './koda-platform/lib/backend/handlers/sports.handler.ts';

async function test() {
    console.log("=== LIGA MX (Today/Recent) ===");
    console.log(await fetchSportsData('ligamx'));
    console.log("\n=== NBA (Live) ===");
    console.log(await fetchLiveMatches('nba'));
    console.log("\n=== LIGA MX (Live) ===");
    console.log(await fetchLiveMatches('ligamx'));
}

test();
