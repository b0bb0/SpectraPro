#!/bin/bash
# ── Spectra — Host Locally on MacBook via Cloudflare Tunnel ─────────
# Makes spectrapro.ai serve from your MacBook. Free. No port forwarding.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  SpectraPro.ai — Local MacBook Hosting Setup${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Check prerequisites ────────────────────────────────────
echo -e "${CYAN}[1/6]${NC} Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not found. Install Docker Desktop:${NC}"
  echo "  https://docs.docker.com/desktop/install/mac-install/"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker"

if ! docker compose version &> /dev/null; then
  echo -e "${RED}✗ Docker Compose not found${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker Compose"

if ! command -v cloudflared &> /dev/null; then
  echo -e "${YELLOW}✗ cloudflared not found. Installing...${NC}"
  brew install cloudflared
fi
echo -e "  ${GREEN}✓${NC} cloudflared"
echo ""

# ── Step 2: Cloudflare login ───────────────────────────────────────
echo -e "${CYAN}[2/6]${NC} Cloudflare authentication..."

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo -e "  ${YELLOW}Opening browser for Cloudflare login...${NC}"
  cloudflared tunnel login
else
  echo -e "  ${GREEN}✓${NC} Already authenticated"
fi
echo ""

# ── Step 3: Create tunnel ──────────────────────────────────────────
echo -e "${CYAN}[3/6]${NC} Setting up tunnel..."

TUNNEL_NAME="spectra"
TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null | python3 -c "
import json, sys
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
" 2>/dev/null || echo "")

if [ -z "$TUNNEL_ID" ]; then
  echo -e "  Creating tunnel '${TUNNEL_NAME}'..."
  cloudflared tunnel create $TUNNEL_NAME
  TUNNEL_ID=$(cloudflared tunnel list --output json | python3 -c "
import json, sys
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
")
  echo -e "  ${GREEN}✓${NC} Tunnel created: ${TUNNEL_ID}"
else
  echo -e "  ${GREEN}✓${NC} Tunnel exists: ${TUNNEL_ID}"
fi

# Copy credentials into project
CRED_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [ -f "$CRED_FILE" ]; then
  cp "$CRED_FILE" ./cloudflared/credentials.json
  echo -e "  ${GREEN}✓${NC} Credentials copied"
else
  echo -e "${RED}✗ Credentials file not found at ${CRED_FILE}${NC}"
  echo "  Try: cloudflared tunnel create $TUNNEL_NAME"
  exit 1
fi

# Update config with tunnel ID
sed -i '' "s/TUNNEL_ID_HERE/${TUNNEL_ID}/" ./cloudflared/config.yml
echo -e "  ${GREEN}✓${NC} Config updated with tunnel ID"
echo ""

# ── Step 4: DNS routing ───────────────────────────────────────────
echo -e "${CYAN}[4/6]${NC} Configuring DNS..."
echo -e "  ${YELLOW}Note: spectrapro.ai must be on Cloudflare DNS${NC}"

cloudflared tunnel route dns $TUNNEL_NAME spectrapro.ai 2>/dev/null && \
  echo -e "  ${GREEN}✓${NC} spectrapro.ai → tunnel" || \
  echo -e "  ${YELLOW}!${NC} DNS route may already exist (OK)"

cloudflared tunnel route dns $TUNNEL_NAME www.spectrapro.ai 2>/dev/null && \
  echo -e "  ${GREEN}✓${NC} www.spectrapro.ai → tunnel" || \
  echo -e "  ${YELLOW}!${NC} www DNS route may already exist (OK)"
echo ""

# ── Step 5: Build and start ───────────────────────────────────────
echo -e "${CYAN}[5/6]${NC} Building and starting containers..."
docker compose -f docker-compose.local.yml up -d --build

echo ""
echo -e "${CYAN}[6/6]${NC} Running database migrations..."
sleep 8
docker compose -f docker-compose.local.yml exec -T backend npx prisma migrate deploy 2>/dev/null || \
  echo -e "  ${YELLOW}!${NC} Migrations may need manual run (DB might still be starting)"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SpectraPro.ai is LIVE from your MacBook!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Public URL:${NC}  https://spectrapro.ai"
echo -e "  ${BOLD}API:${NC}         https://spectrapro.ai/api"
echo -e "  ${BOLD}Health:${NC}      https://spectrapro.ai/health"
echo ""
echo -e "  ${BOLD}Logs:${NC}        docker compose -f docker-compose.local.yml logs -f"
echo -e "  ${BOLD}Stop:${NC}        docker compose -f docker-compose.local.yml down"
echo -e "  ${BOLD}Seed DB:${NC}     docker compose -f docker-compose.local.yml exec backend npx prisma db seed"
echo ""
echo -e "  ${YELLOW}⚠  Keep your MacBook open & connected to serve traffic${NC}"
echo ""
