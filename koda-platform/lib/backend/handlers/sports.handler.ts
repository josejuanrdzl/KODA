export const LEAGUE_MAP: Record<string, string> = {
    'nfl': 'football/nfl',
    'nba': 'basketball/nba',
    'mlb': 'baseball/mlb',
    'nhl': 'hockey/nhl',
    'f1': 'racing/f1',
    'ligamx': 'soccer/mex.1',
    'premierleague': 'soccer/eng.1',
    'laliga': 'soccer/esp.1',
    'championsleague': 'soccer/uefa.champions',
    'europaleague': 'soccer/uefa.europa',
    'mls': 'soccer/usa.1'
};

export async function fetchSportsData(leagueSlug: string, dateYYYYMMDD?: string): Promise<string> {
    const mappedLeague = LEAGUE_MAP[leagueSlug.toLowerCase().replace(/\s+/g, '')];

    if (!mappedLeague) {
        return `Liga no soportada o no encontrada. Ligas soportadas: ${Object.keys(LEAGUE_MAP).join(', ')}`;
    }

    let url = `https://site.api.espn.com/apis/site/v2/sports/${mappedLeague}/scoreboard`;
    if (dateYYYYMMDD) {
        url += `?dates=${dateYYYYMMDD}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`ESPN API error for ${mappedLeague}:`, response.statusText);
            return `Error accediendo a datos de la liga ${leagueSlug}.`;
        }

        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            return `No hay partidos programados para la liga ${leagueSlug} ${dateYYYYMMDD ? `el ${dateYYYYMMDD}` : 'hoy/recientemente'}.`;
        }

        let summary = `==== MARCADORES / AGENDA: ${leagueSlug.toUpperCase()} ====\n`;

        data.events.forEach((event: any) => {
            const name = event.name;
            const date = event.date;
            const status = event.status?.type?.description; // "Scheduled", "In Progress", "Final", etc.

            let detail = `* ${name} - Estado: ${status} (${new Date(date).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })})`;

            if (event.competitions && event.competitions.length > 0) {
                const comp = event.competitions[0];
                if (comp.competitors && comp.competitors.length === 2) {
                    const home = comp.competitors.find((c: any) => c.homeAway === 'home');
                    const away = comp.competitors.find((c: any) => c.homeAway === 'away');

                    if (home && away && status !== 'Scheduled') {
                        detail += `\n  Marcador: ${home.team.displayName} (${home.score}) vs ${away.team.displayName} (${away.score})`;
                    }
                }
            }
            summary += `${detail}\n\n`;
        });

        return summary;
    } catch (e: any) {
        console.error('ESPN Fetch Error:', e);
        return 'Ocurrió un error obteniendo datos deportivos.';
    }
}

export async function fetchLiveMatches(leagueSlug: string): Promise<any[]> {
    const mappedLeague = LEAGUE_MAP[leagueSlug.toLowerCase().replace(/\s+/g, '')];
    if (!mappedLeague) return [];

    let url = `https://site.api.espn.com/apis/site/v2/sports/${mappedLeague}/scoreboard`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];

        const data = await response.json();
        if (!data.events || data.events.length === 0) return [];

        const liveMatches: any[] = [];
        data.events.forEach((event: any) => {
            const status = event.status?.type?.name; // e.g. "STATUS_IN_PROGRESS", "STATUS_HALFTIME"
            const description = event.status?.type?.description;

            // Only pick games that are active (in progress, halftime, etc., but not scheduled or final)
            if (status && !status.includes('SCHEDULED') && !status.includes('FINAL') && !status.includes('CANCELED')) {
                if (event.competitions && event.competitions.length > 0) {
                    const comp = event.competitions[0];
                    if (comp.competitors && comp.competitors.length === 2) {
                        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
                        const away = comp.competitors.find((c: any) => c.homeAway === 'away');

                        liveMatches.push({
                            id: event.id,
                            name: event.name,
                            description,
                            homeTeam: home?.team?.displayName,
                            homeScore: home?.score,
                            awayTeam: away?.team?.displayName,
                            awayScore: away?.score,
                            league: leagueSlug
                        });
                    }
                }
            }
        });

        return liveMatches;
    } catch (e: any) {
        console.error('ESPN Live Fetch Error:', e);
        return [];
    }
}
