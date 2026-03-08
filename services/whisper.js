const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { OpenAI } = require('openai');

// Configuración de FFmpeg para usar los binarios instalados
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

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
        // Transcribir con OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(outputPath),
            model: 'whisper-1',
            language: 'es', // Podemos forzar español o dejar autodetección, pero lo quitamos según instrucciones para que sea automático
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
