/** @type {import('next').NextConfig} */
const nextConfig = {
    // Configuración optimizada para producción (ej. Docker/Fly.io)
    output: 'standalone',
    swcMinify: true,
};

export default nextConfig;
