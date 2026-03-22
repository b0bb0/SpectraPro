# ── SpectraPRO Backend — Multi-stage Docker Build ─────────────────
# Produces a lean production image with compiled TS + Prisma + Nuclei
# ──────────────────────────────────────────────────────────────────

# ── Stage 1: Install deps + generate Prisma client ───────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --ignore-scripts
RUN npx prisma generate

# ── Stage 2: Compile TypeScript ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production image ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl nmap \
 && addgroup --system --gid 1001 spectra \
 && adduser  --system --uid 1001 spectra

# Copy compiled app + production deps + prisma
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma     ./prisma
COPY --from=builder /app/package.json ./

# Install runtime tooling used by reconnaissance/exposure features.
# Pin Nuclei version for reproducible builds (update explicitly when upgrading).
ENV NUCLEI_VERSION=3.7.1
RUN apk add --no-cache wget unzip python3 py3-pip \
 && pip3 install --no-cache-dir --break-system-packages sublist3r \
 && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') \
 && wget -qO /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
 && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
 && rm /tmp/nuclei.zip \
 && chmod +x /usr/local/bin/nuclei \
 && apk del unzip

RUN mkdir -p logs data/source-scans \
      /data/scans /data/reports /data/custom-templates /data/recon \
      /frontend/public/screenshots/exposure \
 && chown -R spectra:spectra logs data /data /frontend

USER spectra
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q --spider http://localhost:5001/health || exit 1

CMD ["node", "dist/index.js"]
