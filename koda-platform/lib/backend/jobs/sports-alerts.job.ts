import db from '../services/supabase';
import { redis } from '../../redis';
import { fetchLiveMatches, LEAGUE_MAP } from '../handlers/sports.handler';
import { sendChannelMessage } from '../utils/messenger';
import { checkModuleAccess } from '../module.router';

const REDIS_CACHE_TTL = 240; // 4 minutes

export async function runSportsAlertsJob(bot: any) {
    console.log('[SportsAlerts] Starting sports live alerts job...');

    const now = new Date();
    const currentHour = now.getHours();

    // Restricted time window: 6 AM to 12 PM (Midnight)
    if (currentHour < 6 && currentHour >= 0) {
        console.log('[SportsAlerts] Outside of active time window (6 AM - 12 PM). Skipping.');
        return;
    }

    try {
        // 1. Get all users
        const users = await db.getAllUsers();
        if (!users || users.length === 0) return;

        // 2. Filter users with sports module active
        const activeUsers = [];
        for (const user of users) {
            const hasSports = await checkModuleAccess(user, 'sports');
            if (hasSports) {
                activeUsers.push(user);
            }
        }

        if (activeUsers.length === 0) {
            console.log('[SportsAlerts] No users with active sports module found.');
            return;
        }

        // 3. Collect unique leagues to check
        const leaguesToCheck = Object.keys(LEAGUE_MAP);
        const liveMatchesByLeague: Record<string, any[]> = {};

        for (const league of leaguesToCheck) {
            const cacheKey = `sports_live_matches_${league}`;
            
            // Try cache first
            let matches = await redis.get<any[]>(cacheKey);
            
            if (!matches) {
                console.log(`[SportsAlerts] Cache miss for league: ${league}. Fetching from ESPN...`);
                matches = await fetchLiveMatches(league);
                
                if (matches && matches.length > 0) {
                    await redis.set(cacheKey, matches, { ex: REDIS_CACHE_TTL });
                }
            } else {
                console.log(`[SportsAlerts] Cache hit for league: ${league}`);
            }

            if (matches && matches.length > 0) {
                liveMatchesByLeague[league] = matches;
            }
        }

        // 4. Process each user
        for (const user of activeUsers) {
            // Get user's favorite teams
            const { data: favoriteTeams, error: teamsError } = await db.supabase
                .from('user_sports_teams')
                .select('team_name, league_slug')
                .eq('user_id', user.id)
                .eq('is_active', true);

            if (teamsError) {
                console.error(`[SportsAlerts] Error fetching favorite teams for user ${user.id}:`, teamsError);
                continue;
            }

            if (!favoriteTeams || favoriteTeams.length === 0) continue;

            for (const fav of favoriteTeams) {
                const leagueMatches = liveMatchesByLeague[fav.league_slug];
                if (!leagueMatches) continue;

                // Find if the favorite team is playing
                const match = leagueMatches.find(m => 
                    m.homeTeam?.toLowerCase().includes(fav.team_name.toLowerCase()) || 
                    m.awayTeam?.toLowerCase().includes(fav.team_name.toLowerCase())
                );

                if (!match) continue;

                const gameId = match.id;
                const currentScoreStr = `${match.homeScore}-${match.awayScore}`;

                // Check if we already sent this alert for this score
                const { data: sentAlert, error: alertError } = await db.supabase
                    .from('sports_alerts_sent')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('game_id', gameId)
                    .maybeSingle();

                if (alertError) {
                    console.error(`[SportsAlerts] Error checking sent alerts:`, alertError);
                    continue;
                }

                if (sentAlert && sentAlert.last_score_alerted === currentScoreStr) {
                    // Alert already sent for this score
                    continue;
                }

                // New alert needed!
                console.log(`[SportsAlerts] Sending alert to ${user.id} for game ${match.name} (${currentScoreStr})`);

                const channel = user.whatsapp_id ? 'whatsapp' : 'telegram';
                const targetId = channel === 'whatsapp' ? user.whatsapp_id : user.telegram_id;

                if (!targetId) continue;

                const alertMessage = `⚽️ **ALERTA DE DEPORTES** 🏀\n\nTu equipo **${fav.team_name}** está jugando ahora.\n\nMarcador actual:\n${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}\nEstado: ${match.description}`;

                try {
                    await sendChannelMessage(bot, targetId, alertMessage, { parse_mode: 'Markdown' }, channel);
                    
                    // Save or update alert status
                    if (sentAlert) {
                        await db.supabase
                            .from('sports_alerts_sent')
                            .update({ last_score_alerted: currentScoreStr, sent_at: new Date().toISOString() })
                            .eq('id', sentAlert.id);
                    } else {
                        await db.supabase
                            .from('sports_alerts_sent')
                            .insert([{
                                user_id: user.id,
                                game_id: gameId,
                                last_score_alerted: currentScoreStr
                            }]);
                    }

                    await db.saveMessage({
                        user_id: user.id,
                        channel: channel,
                        role: 'assistant',
                        content: alertMessage,
                        content_type: 'text'
                    });

                } catch (sendErr) {
                    console.error(`[SportsAlerts] Error sending alert to user ${user.id}:`, sendErr);
                }
            }
        }

    } catch (error) {
        console.error('[SportsAlerts] Global error in sports job:', error);
    }
}
