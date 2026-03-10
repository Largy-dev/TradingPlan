# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

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

WORKDIR /app

# Install all deps (prisma CLI needed for migrate deploy)
COPY package*.json ./
RUN npm ci

# Copy generated prisma client and compiled output from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Data directory for SQLite volume
RUN mkdir -p /data

EXPOSE 4000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
