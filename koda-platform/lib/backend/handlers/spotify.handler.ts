import axios from 'axios';

// In-memory token cache
let spotifyTokens: { access_token: string, expires_at: number } | null = null;

async function getSpotifyToken() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Credenciales de Spotify no configuradas.");
    }

    if (spotifyTokens && Date.now() < spotifyTokens.expires_at) {
        return spotifyTokens.access_token;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const data = response.data;
    spotifyTokens = {
        access_token: data.access_token,
        // Subtract 5 minutes to be safe
        expires_at: Date.now() + (data.expires_in - 300) * 1000,
    };

    return spotifyTokens.access_token;
}

export async function searchSpotify(query: string): Promise<string> {
    try {
        const token = await getSpotifyToken();

        const response = await axios.get(`https://api.spotify.com/v1/search`, {
            params: {
                q: query,
                type: 'track,artist',
                limit: 3
            },
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const tracks = response.data.tracks?.items || [];
        if (tracks.length === 0) {
            return `No encontré resultados musicales para: ${query}`;
        }

        let report = `🎵 *Resultados en Spotify para "${query}"*:\n`;
        tracks.forEach((t: any, idx: number) => {
            const artists = t.artists?.map((a: any) => a.name).join(', ') || 'Artista desconocido';
            report += `${idx + 1}. *${t.name}* por ${artists}\n   🔗 Escúchala aquí: ${t.external_urls?.spotify}\n\n`;
        });

        return report;
    } catch (e: any) {
        console.error("Error fetching from Spotify:", e.message);
        return "Lo siento, tuve un problema conectándome a Spotify en este momento.";
    }
}
