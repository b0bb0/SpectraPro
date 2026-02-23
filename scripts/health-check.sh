#!/bin/bash
# ── SpectraPro — Health Check / Diagnostics ───────────────────────────
# Checks all dependencies, services, ports, and connections.
# Usage:  ./scripts/health-check.sh
set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}○${NC} $1"; WARN=$((WARN+1)); }
has()  { command -v "$1" &>/dev/null; }

PASS=0
FAIL=0
WARN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Add local bin to PATH for locally-installed tools
export PATH="$PROJECT_ROOT/.local/bin:$PATH"

echo ""
echo -e "${BOLD}SpectraPro — System Health Check${NC}"
echo -e "${BOLD}════════════════════════════════════════════════${NC}"

# ── Required Tools ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Required Dependencies:${NC}"

if has python3; then
  PY_VER=$(python3 --version 2>&1 | cut -d' ' -f2)
  PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  [[ "$PY_MINOR" -ge 10 ]] && ok "Python $PY_VER" || fail "Python $PY_VER (need 3.10+)"
else
  fail "Python 3 not found"
fi

if has node; then
  NODE_VER=$(node -v | tr -d 'v')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  [[ "$NODE_MAJOR" -ge 20 ]] && ok "Node.js v$NODE_VER" || fail "Node.js v$NODE_VER (need 20+)"
else
  fail "Node.js not found"
fi

has npm && ok "npm $(npm -v)" || fail "npm not found"

if has psql; then
  PG_VER=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
  ok "PostgreSQL client $PG_VER"
else
  fail "PostgreSQL client (psql) not found"
fi

has nuclei && ok "Nuclei $(nuclei -version 2>&1 | grep -oE 'v[0-9.]+' | head -1)" || fail "Nuclei not found"

# ── Optional Tools ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Optional Dependencies:${NC}"
has ollama      && ok "Ollama installed"       || warn "Ollama not installed (AI analysis disabled)"
has nmap        && ok "Nmap installed"         || warn "Nmap not installed (recon limited)"
has feroxbuster && ok "Feroxbuster installed"  || warn "Feroxbuster not installed (content discovery limited)"
(has sublist3r || python3 -c "import sublist3r" 2>/dev/null) && ok "Sublist3r installed" || warn "Sublist3r not installed (subdomain enum limited)"

# ── Services Running ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Services:${NC}"

# PostgreSQL
if pg_isready -h localhost -p 5432 &>/dev/null; then
  ok "PostgreSQL running on :5432"
else
  fail "PostgreSQL not running on :5432"
fi

# Backend
if curl -s --max-time 3 http://localhost:5001/health 2>/dev/null | grep -q "ok"; then
  ok "Backend API running on :5001"
else
  fail "Backend API not running on :5001"
fi

# Frontend
if curl -s --max-time 3 http://localhost:3003 &>/dev/null; then
  ok "Frontend running on :3003"
else
  fail "Frontend not running on :3003"
fi

# Ollama
if curl -s --max-time 3 http://localhost:11434/api/tags &>/dev/null; then
  ok "Ollama running on :11434"
  # Check for model
  if curl -s --max-time 3 http://localhost:11434/api/tags | grep -q "llama3"; then
    ok "Ollama llama3 model available"
  else
    warn "Ollama running but no llama3 model — run: ollama pull llama3.2:latest"
  fi
else
  warn "Ollama not running (AI features disabled)"
fi

# ── Database Connection ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}Database:${NC}"

DB_URL=$(grep DATABASE_URL "$PROJECT_ROOT/platform/backend/.env" 2>/dev/null | cut -d'"' -f2)
if [[ -n "$DB_URL" ]]; then
  ok "DATABASE_URL configured"
  DB_NAME=$(echo "$DB_URL" | grep -oE '[^/]+$')
  if psql "$DB_URL" -c "SELECT 1" &>/dev/null; then
    ok "Database '$DB_NAME' connection successful"
    TABLE_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')
    [[ "$TABLE_COUNT" -gt 0 ]] && ok "$TABLE_COUNT tables found (migrations applied)" || fail "No tables found — run migrations"
  else
    fail "Cannot connect to database"
  fi
else
  fail "DATABASE_URL not configured in backend .env"
fi

# ── Files & Config ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Configuration:${NC}"
[[ -f "$PROJECT_ROOT/.env" ]]                        && ok "Root .env exists"             || fail "Root .env missing"
[[ -f "$PROJECT_ROOT/platform/backend/.env" ]]       && ok "Backend .env exists"          || fail "Backend .env missing"
[[ -f "$PROJECT_ROOT/platform/frontend/.env.local" ]] && ok "Frontend .env.local exists"  || fail "Frontend .env.local missing"
[[ -f "$PROJECT_ROOT/config/config.yaml" ]]          && ok "config.yaml exists"           || warn "config.yaml missing"
[[ -d "$PROJECT_ROOT/platform/backend/node_modules" ]] && ok "Backend node_modules"       || fail "Backend deps not installed"
[[ -d "$PROJECT_ROOT/platform/frontend/node_modules" ]] && ok "Frontend node_modules"     || fail "Frontend deps not installed"
[[ -d "$PROJECT_ROOT/venv" ]]                        && ok "Python venv exists"            || warn "Python venv not created"

# ── Ports ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Port Availability:${NC}"
for port in 5432 5001 3003 5000 11434; do
  if has lsof; then
    if lsof -i:$port &>/dev/null; then
      PROC=$(lsof -ti:$port 2>/dev/null | head -1)
      PNAME=$(ps -p "$PROC" -o comm= 2>/dev/null || echo "unknown")
      ok "Port $port in use by $PNAME (PID $PROC)"
    else
      echo -e "  ${CYAN}○${NC} Port $port is free"
    fi
  elif has ss; then
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
      ok "Port $port is in use"
    else
      echo -e "  ${CYAN}○${NC} Port $port is free"
    fi
  else
    echo -e "  ${CYAN}○${NC} Port $port — cannot check (no lsof/ss)"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed: $PASS${NC}  ${RED}Failed: $FAIL${NC}  ${YELLOW}Warnings: $WARN${NC}"

if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}System is healthy!${NC}"
else
  echo -e "  ${RED}${BOLD}$FAIL issue(s) need attention.${NC}"
  echo -e "  Run ${CYAN}./scripts/auto-setup.sh${NC} to fix."
fi
echo ""
