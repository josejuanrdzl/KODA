const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { OpenAI } = require('openai');

const { execSync } = require('child_process');

// Intentar encontrar FFmpeg en el sistema (por ejemplo, si se instaló vía apk en Docker)
let ffmpegPath = ffmpegInstaller.path;
try {
    // Verificar si ffmpeg está en el PATH del sistema
    const systemFfmpeg = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (systemFfmpeg) {
        console.log(`✅ Usando FFmpeg del sistema: ${systemFfmpeg}`);
        ffmpegPath = systemFfmpeg;
    }
} catch (e) {
    console.log(`ℹ️ FFmpeg no encontrado en PATH del sistema, usando el instalador de node_modules.`);
}

// Configuración de FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

let openai = null;
try {
    if (process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    } else {
        console.warn("⚠️ OPENAI_API_KEY no detectada. La transcripción de audio (Whisper) fallará.");
    }
} catch (error) {
    console.warn("❌ Error al inicializar OpenAI:", error.message);
}

/**
 * Descarga y transcribe un archivo de audio/voz de Telegram utilizando OpenAI Whisper
 * @param {object} bot Instancia de node-telegram-bot-api
 * @param {string} fileId Identificador del archivo en Telegram
 * @returns {Promise<string|null>} Texto transcrito o null si hay error
 */
async function transcribeAudio(bot, fileId) {
    let inputPath = null;
    let outputPath = null;

    try {
        console.log(`Pidiendo link de archivo a Telegram para ID: ${fileId}`);
        const fileLink = await bot.getFileLink(fileId);

        // Generar rutas únicas en /tmp/
        const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        inputPath = path.join('/tmp', `${uniqueId}_input.ogg`); // Puede ser OGG o MP4, no importa para FFmpeg
        outputPath = path.join('/tmp', `${uniqueId}_output.mp3`);

        console.log(`Descargando audio a: ${inputPath}`);
        // Descargar archivo usando fetch (disponible en Node >= 18)
        const response = await fetch(fileLink);
        if (!response.ok) throw new Error(`Error en fetch: ${response.status} ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(inputPath, buffer);

        console.log(`Convirtiendo a MP3 con FFmpeg...`);
        // Convertir a MP3 compatible con Whisper
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('mp3')
                // Optimizar conversión rápida
                .audioBitrate('64k')
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`FFmpeg falló: ${err.message}`)))
                .save(outputPath);
        });

        console.log(`Enviando MP3 a OpenAI Whisper...`);
        if (!openai) {
            throw new Error("Cliente OpenAI no inicializado por falta de OPENAI_API_KEY.");
        }
        // Transcribir con OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(outputPath),
            model: 'whisper-1',
            // Dejamos que OpenAI detecte el idioma automáticamente para mayor flexibilidad
        });

        const text = transcription.text;
        console.log(`Transcripción exitosa, longitud: ${text.length} caracteres`);
        return text;

    } catch (error) {
        console.error('Error al transcribir archivo de audio:', error);
        return null;
    } finally {
        // Limpieza obligatoria de archivos temporales
        console.log(`Limpiando archivos temporales de audio...`);
        if (inputPath && fs.existsSync(inputPath)) {
            try { fs.unlinkSync(inputPath); } catch (e) { console.error('No se pudo borrar input_path', e); }
        }
        if (outputPath && fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch (e) { console.error('No se pudo borrar output_path', e); }
        }
    }
}

module.exports = {
    transcribeAudio
};
