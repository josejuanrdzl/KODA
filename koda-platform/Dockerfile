FROM node:20-alpine AS base

# Stage 1: Install dependencies and build the app
FROM base AS builder
# Agregar apk para dependencias necesarias si existen
# RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./
# Instalar todas las dependencias (incluyendo devDependencies para el build)
RUN npm ci

# Copiar el código fuente
COPY . .

# Deshabilitar telemetría de Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Construir la aplicación (usando output: 'standalone' en next.config.mjs)
RUN npm run build

# Stage 2: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Instalar FFmpeg y libc6-compat para compatibilidad en Alpine
RUN apk add --no-cache ffmpeg libc6-compat

# Crea un usuario no root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar carpeta public y assets estáticos generados
COPY --from=builder /app/public ./public
# Set correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copiar la salida standalone y estáticos generados
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Cambiar a usuario no root
USER nextjs

# Exponer el puerto
EXPOSE 3000

ENV PORT=3000
# Importante: usar hostname que escuche en todas las interfaces para Fly.io
ENV HOSTNAME="0.0.0.0"

# Inicializar con el servidor standalone
CMD ["node", "server.js"]
