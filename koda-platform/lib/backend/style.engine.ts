/**
 * Engine for injecting tone and style configuration into the KODA system prompt.
 * Determines the assistant's personality based on user preferences or assigned styles.
 */

export interface StyleConfig {
    genderPrompt: string;
    tonePrompt: string;
}

export function getStyleConfig(user: any): StyleConfig {
    let genderPrompt =
        "Preséntate sin género específico. Usa el nombre KODA como referencia.";
    if (user.gender === "masculino")
        genderPrompt =
            "Eres un asistente masculino. Usa concordancia gramatical masculina.";
    if (user.gender === "femenino")
        genderPrompt =
            "Eres una asistente femenina. Usa concordancia gramatical femenina.";

    let tonePrompt =
        "Tu tono es casual, cercano, y cálido. Como un amigo muy organizado.";
    if (user.tone === "profesional")
        tonePrompt =
            "Tu tono es formal, ejecutivo, y cortés. Como un asistente de directivo.";
    if (user.tone === "directo")
        tonePrompt =
            "Tu tono es sin rodeos y eficiente. Máximas palabras mínimas.";
    if (user.tone === "divertido")
        tonePrompt =
            "Tu tono es energético con humor ligero y emojis ocasionales.";

    return {
        genderPrompt,
        tonePrompt
    };
}
