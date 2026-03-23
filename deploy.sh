#!/bin/bash
# ── Spectra Platform — Deploy Script ────────────────────────────────
# Deploys SpectraPro.ai via Docker Compose with automatic HTTPS.
# Pulls pre-built images from GitHub Container Registry (GHCR).
#
# Prerequisites:
#   - Docker & Docker Compose installed
#   - DNS A record: spectrapro.ai → your server IP
#   - DNS A record: www.spectrapro.ai → your server IP
#   - Port 80 and 443 open
#   - .env file with production secrets (cp .env.production .env)
#
# Usage:
#   ./deploy.sh            # Pull latest images and deploy
#   ./deploy.sh --build    # Build images locally instead of pulling
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.production.yml"
BUILD_LOCAL=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --build) BUILD_LOCAL=true ;;
  esac
done

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  SpectraPro.ai — Production Deployment${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Pre-flight checks ──────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed${NC}"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}Error: Docker Compose v2 is not installed${NC}"
  exit 1
fi

if [ ! -f .env ]; then
  echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
  cp .env.production .env
  echo -e "${RED}IMPORTANT: Edit .env with real secrets before continuing!${NC}"
  echo -e "  ${BOLD}vim .env${NC}"
  echo ""
  echo "Required changes:"
  echo "  - POSTGRES_PASSWORD  (strong random password)"
  echo "  - JWT_SECRET         (run: openssl rand -base64 48)"
  exit 1
fi

# Check required vars are not defaults
source .env
if [ "${POSTGRES_PASSWORD}" = "CHANGE_ME_USE_STRONG_PASSWORD" ]; then
  echo -e "${RED}Error: POSTGRES_PASSWORD still has default value. Edit .env first.${NC}"
  exit 1
fi
if [ "${JWT_SECRET}" = "CHANGE_ME_GENERATE_WITH_OPENSSL" ]; then
  echo -e "${RED}Error: JWT_SECRET still has default value. Run: openssl rand -base64 48${NC}"
  exit 1
fi

# ── Deploy ─────────────────────────────────────────────────────────
if [ "$BUILD_LOCAL" = true ]; then
  echo -e "${YELLOW}Building containers locally...${NC}"
  docker compose -f docker-compose.yml build --no-cache
  COMPOSE_FILE="docker-compose.yml"
else
  echo -e "${YELLOW}Pulling latest images from GHCR...${NC}"
  docker compose -f "$COMPOSE_FILE" pull
fi

echo -e "${YELLOW}Starting services...${NC}"
docker compose -f "$COMPOSE_FILE" up -d

echo -e "${YELLOW}Waiting for database to be ready...${NC}"
sleep 5

echo -e "${YELLOW}Running database migrations...${NC}"
docker compose -f "$COMPOSE_FILE" exec -T backend npx prisma migrate deploy

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Site:    ${BOLD}https://spectrapro.ai${NC}"
echo -e "  API:     ${BOLD}https://spectrapro.ai/api${NC}"
echo -e "  Health:  ${BOLD}https://spectrapro.ai/health${NC}"
echo ""
echo -e "  Logs:    docker compose -f $COMPOSE_FILE logs -f"
echo -e "  Status:  docker compose -f $COMPOSE_FILE ps"
echo -e "  Seed DB: docker compose -f $COMPOSE_FILE exec backend npx prisma db seed"
echo ""
