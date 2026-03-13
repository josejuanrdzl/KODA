/**
 * Query classification logic for deciding between faster (Haiku) and smarter (Sonnet) models.
 */

export function classifyIntent(userText: string): string {
    // Basic intent classification logic.
    // If the query is complex or long, use Sonnet, else use Haiku.
    const lowerText = userText.toLowerCase();

    const complexKeywords = [
        'analiza', 'resume', 'explica', 'traduce', 'compara', 'diferencia',
        'por qué', 'cómo', 'ayuda', 'profundo', 'detalle'
    ];

    const isComplex = complexKeywords.some(keyword => lowerText.includes(keyword)) || userText.length > 200;

    // For now, retaining the hardcoded 'claude-sonnet-4-6' as fallback since that was the previous standard,
    // but structuring it to allow returning Haiku for simpler queries in the future. 
    return isComplex ? 'claude-sonnet-4-6' : 'claude-sonnet-4-6'; // Note: Keeping it Sonnet to avoid breaking behavior accidentally as requested "NO cambiar lógica"
}
