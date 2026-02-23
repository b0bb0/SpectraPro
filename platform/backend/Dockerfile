# ── SpectraPRO Backend — Multi-stage Docker Build ─────────────────
# Produces a lean production image with compiled TS + Prisma + Nuclei
# ──────────────────────────────────────────────────────────────────

# ── Stage 1: Install deps + generate Prisma client ───────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --ignore-scripts
RUN npx prisma generate

# ── Stage 2: Compile TypeScript ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production image ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install OpenSSL 3.x (required by Prisma on Alpine 3.23+)
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 spectra \
 && adduser  --system --uid 1001 spectra

# Copy compiled app + production deps + prisma
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma     ./prisma
COPY --from=builder /app/package.json ./

# Install Nuclei scanner binary
RUN apk add --no-cache wget unzip \
 && NUCLEI_VERSION=$(wget -qO- https://api.github.com/repos/projectdiscovery/nuclei/releases/latest | grep tag_name | cut -d'"' -f4 | tr -d v) \
 && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') \
 && wget -qO /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
 && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
 && rm /tmp/nuclei.zip \
 && chmod +x /usr/local/bin/nuclei \
 && apk del wget unzip

# Regenerate Prisma client for the correct OpenSSL version
RUN npx prisma generate

# Create directories writable by spectra user
# Services resolve paths relative to cwd (../../data/*, ../frontend/*)
RUN mkdir -p /app/logs /app/data/source-scans \
      /data/scans /data/reports /data/custom-templates \
      /frontend/public/screenshots/exposure \
 && chown -R spectra:spectra /app/logs /app/data /data /frontend

USER spectra
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -q --spider http://127.0.0.1:5001/health || exit 1

CMD ["node", "dist/index.js"]
