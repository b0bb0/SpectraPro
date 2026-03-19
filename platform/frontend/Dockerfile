# ── SpectraPRO Frontend — Multi-stage Docker Build ─────────────────
# Produces a lean Next.js standalone production image
# ──────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: Build Next.js app ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time env vars (passed via docker-compose build args)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production image ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache wget \
 && addgroup --system --gid 1001 spectra \
 && adduser  --system --uid 1001 spectra

# Next.js standalone output copies only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder --chown=spectra:spectra /app/.next/standalone ./
COPY --from=builder --chown=spectra:spectra /app/.next/static ./.next/static

USER spectra
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
