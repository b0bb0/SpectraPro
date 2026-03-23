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

# ── Stage 3: Download Feroxbuster in glibc image ─────────────────
FROM node:20-slim AS ferox-downloader
ARG FEROXBUSTER_VERSION=2.13.1
RUN apt-get update -qq && apt-get install -y -qq wget unzip \
 && FEROX_ARCH=$(uname -m) \
 && wget -qO /tmp/feroxbuster.zip "https://github.com/epi052/feroxbuster/releases/download/v${FEROXBUSTER_VERSION}/${FEROX_ARCH}-linux-feroxbuster.zip" \
 && unzip /tmp/feroxbuster.zip -d /usr/local/bin/ \
 && rm /tmp/feroxbuster.zip \
 && chmod +x /usr/local/bin/feroxbuster \
 # Verify it runs
 && feroxbuster --version

# ── Stage 4: Production image ────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
    openssl nmap wget curl python3 python3-pip ncat \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 spectra \
 && useradd  --system --uid 1001 --gid spectra --create-home spectra

# Copy compiled app + production deps + prisma
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma     ./prisma
COPY --from=builder /app/package.json ./

# Install runtime tooling used by reconnaissance/exposure features.
# Pin Nuclei version for reproducible builds (update explicitly when upgrading).
ENV NUCLEI_VERSION=3.7.1
RUN pip3 install --no-cache-dir --break-system-packages sublist3r \
 && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') \
 && curl -fsSL -o /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
 && apt-get update -qq && apt-get install -y -qq --no-install-recommends unzip \
 && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
 && rm /tmp/nuclei.zip \
 && chmod +x /usr/local/bin/nuclei \
 && apt-get remove -y unzip && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Copy Feroxbuster binary from glibc downloader stage
COPY --from=ferox-downloader /usr/local/bin/feroxbuster /usr/local/bin/feroxbuster

# Install SecLists wordlists for directory enumeration
RUN mkdir -p /usr/share/wordlists \
 && wget -qO /usr/share/wordlists/common.txt "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt" \
 && wget -qO /usr/share/wordlists/raft-medium-directories.txt "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/raft-medium-directories.txt"

RUN mkdir -p logs data/source-scans \
      /data/scans /data/reports /data/custom-templates /data/recon \
      /frontend/public/screenshots/exposure \
 && chown -R spectra:spectra logs data /data /frontend

USER spectra

# Download Nuclei templates at build time so scans work immediately
RUN nuclei -update-templates
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q --spider http://localhost:5001/health || exit 1

CMD ["node", "dist/index.js"]
