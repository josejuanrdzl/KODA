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

    // For now, returning semantic meaning instead of hardcoded model.
    return isComplex ? 'complex' : 'simple';
}
