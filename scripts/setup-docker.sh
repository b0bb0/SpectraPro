#!/usr/bin/env bash
# ── SpectraPRO — Fresh Docker Install ─────────────────────────────
# Sets up SpectraPRO from scratch on any machine with Docker.
#
# Usage:
#   ./scripts/setup-docker.sh              # Standard setup
#   ./scripts/setup-docker.sh --with-ai    # Include Ollama for AI analysis
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Parse args ──────────────────────────────────────────────────────
PROFILE_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --with-ai) PROFILE_FLAG="--profile ai" ;;
    *) err "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Prerequisites ───────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  err "Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  err "Docker Compose V2 is required. Please update Docker."
  exit 1
fi

ok "Docker and Docker Compose found."

# ── Create .env if missing ──────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from template..."
  cp .env.template .env

  # Auto-generate secrets
  POSTGRES_PW=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
  JWT_SEC=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)

  # Portable sed — works on both macOS and Linux
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PW}|" .env
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" .env
  else
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PW}|" .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" .env
  fi

  ok "Generated .env with random secrets."
else
  warn ".env already exists — skipping secret generation."
fi

# ── Build and start services ───────────────────────────────────────
info "Building and starting containers..."
docker compose $PROFILE_FLAG up -d --build

# ── Wait for PostgreSQL to be healthy ──────────────────────────────
info "Waiting for PostgreSQL to be healthy..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U spectra -d spectra_platform &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    err "PostgreSQL failed to become healthy."
    exit 1
  fi
  sleep 2
done
ok "PostgreSQL is ready."

# ── Run Prisma migrations ──────────────────────────────────────────
info "Applying database migrations..."
docker compose exec -T backend npx prisma migrate deploy
ok "Migrations applied."

# ── Seed the database ──────────────────────────────────────────────
info "Seeding database with demo data..."
if docker compose exec -T backend npx prisma db seed 2>/dev/null; then
  ok "Database seeded."
else
  warn "Seeding skipped or failed (may already be seeded)."
fi

# ── Wait for all services to be healthy ────────────────────────────
info "Waiting for all services to become healthy..."
sleep 5

# ── Print summary ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SpectraPRO is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Web UI:     ${CYAN}http://localhost${NC}"
echo -e "  Backend:    ${CYAN}http://localhost/api/health${NC}"
echo -e "  Scanner:    ${CYAN}http://localhost/scanner/health${NC}"
echo ""
echo -e "  Login:      ${YELLOW}admin@demo.com${NC} / ${YELLOW}admin123${NC}"
echo ""
if [ -n "$PROFILE_FLAG" ]; then
  echo -e "  Ollama:     ${CYAN}http://localhost:11434${NC} (AI enabled)"
  echo ""
fi
echo -e "  Logs:       docker compose logs -f"
echo -e "  Stop:       docker compose down"
echo -e "  Health:     ./scripts/health-check-docker.sh"
echo ""
