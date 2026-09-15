# Imagen de producciÃ³n de Just Another VTT: Node 22 + la app, sin dependencias de desarrollo.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Sólo para construir en un PC cuyo antivirus intercepta TLS (Norton): el override local pasa
# NPM_STRICT_SSL=false. En producción se deja el valor por defecto.
ARG NPM_STRICT_SSL=true
COPY package.json package-lock.json ./
RUN npm config set strict-ssl ${NPM_STRICT_SSL}   && npm ci --omit=dev --no-audit --no-fund   && npm cache clean --force

COPY server.js ./
COPY server ./server
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
