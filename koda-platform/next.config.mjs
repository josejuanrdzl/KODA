/** @type {import('next').NextConfig} */
const nextConfig = {
    // Configuración optimizada para producción (ej. Docker/Fly.io)
    output: 'standalone',
    swcMinify: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    experimental: {
        instrumentationHook: true,
        serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "node-telegram-bot-api"],
    }
};

export default nextConfig;
