# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine

# OpenSSL requis par le client Prisma sur Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Installe les dépendances sans exécuter les scripts postinstall
# (prisma generate échouerait car le schéma n'est pas encore copié)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copie le client Prisma généré depuis le builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copie le code compilé et le schéma Prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

RUN mkdir -p /data

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
