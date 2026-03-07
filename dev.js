const axios = require('axios');
const { spawn, execSync } = require('child_process');
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ ignoreEnvFile: true, silent: true });
}

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function start() {
    console.log('🔄 Iniciando Servidor KODA...');

    // 1. Matar procesos anteriores
    try {
        execSync('pkill -f ngrok');
    } catch (e) {
        // Ignorar si no hay procesos
    }

    // 2. Iniciar el servidor local (index.js)
    const server = spawn('node', ['index.js'], { stdio: 'inherit' });

    console.log('\\n🌐 Iniciando proceso Ngrok (binario)...');

    const ngrokProcess = spawn('npx', ['ngrok', 'http', PORT.toString()], { stdio: 'ignore' });

    // 3. Esperar 5 segundos a que carguen
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // 4. Obtener URL del túnel desde la API local de ngrok
        const response = await axios.get('http://127.0.0.1:4040/api/tunnels');
        const tunnels = response.data.tunnels;

        if (tunnels && tunnels.length > 0) {
            const url = tunnels[0].public_url;
            console.log(`✅ Túnel Ngrok en vivo: ${url}`);

            // 5. Configurar Webhook en Telegram automáticamente
            console.log('🤖 Configurando Webhook de Telegram...');
            const webhookUrl = `${url}/webhook`;

            const whResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${webhookUrl}`);

            if (whResponse.data.ok) {
                console.log(`✅ Webhook configurado exitosamente a: ${webhookUrl}`);
                console.log('\\n🚀 ¡KODA está 100% en línea y listo para usarse desde Telegram!');
            } else {
                console.error('❌ Error configurando Webhook:', whResponse.data);
            }
        } else {
            console.error('❌ Error: Ngrok no generó ningún túnel activo.');
        }
    } catch (error) {
        console.error('❌ Error API de Ngrok (asegúrate de que ngrok está instalado y autenticado):', error.message);
    }
}

start();
