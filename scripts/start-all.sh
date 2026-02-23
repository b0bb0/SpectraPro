#!/bin/bash
# ── SpectraPro — Start All Services ───────────────────────────────────
# Use this after auto-setup.sh to restart services without reinstalling.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/.pids"

BACKEND_PORT=5001
FRONTEND_PORT=${FRONTEND_PORT:-3004}

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }

mkdir -p "$LOG_DIR" "$PID_DIR"

echo ""
echo -e "${BOLD}Starting SpectraPro...${NC}"
echo ""

# ── Stop existing ─────────────────────────────────────────────────────
"$SCRIPT_DIR/stop-all.sh" 2>/dev/null || true
sleep 1

# ── Ensure PostgreSQL ─────────────────────────────────────────────────
info "Checking PostgreSQL..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  brew services list 2>/dev/null | grep -q "postgresql.*started" || \
    brew services start postgresql@16 2>/dev/null || \
    brew services start postgresql 2>/dev/null || true
else
  systemctl is-active --quiet postgresql 2>/dev/null || \
    sudo systemctl start postgresql 2>/dev/null || true
fi
sleep 2
ok "PostgreSQL running"

# ── Ensure Ollama ─────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  if ! curl -s --max-time 3 http://localhost:11434/api/tags &>/dev/null; then
    info "Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 2
  fi
  curl -s --max-time 3 http://localhost:11434/api/tags &>/dev/null && ok "Ollama running" || echo -e "  ${YELLOW}⚠${NC} Ollama not responding"
else
  echo -e "  ${YELLOW}⚠${NC} Ollama not installed — AI features disabled"
fi

# ── Backend ───────────────────────────────────────────────────────────
info "Starting backend on :$BACKEND_PORT..."
cd "$PROJECT_ROOT/platform/backend"
npx tsx watch src/index.ts > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"
ok "Backend started (PID $(cat "$PID_DIR/backend.pid"))"

sleep 3

# ── Frontend ──────────────────────────────────────────────────────────
info "Starting frontend on :$FRONTEND_PORT..."
cd "$PROJECT_ROOT/platform/frontend"
NODE_ENV=development npx next dev -p $FRONTEND_PORT > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$PID_DIR/frontend.pid"
ok "Frontend started (PID $(cat "$PID_DIR/frontend.pid"))"

sleep 4

# ── Health Check ──────────────────────────────────────────────────────
info "Verifying..."
if curl -s --max-time 5 "http://localhost:$BACKEND_PORT/health" 2>/dev/null | grep -q "ok"; then
  ok "Backend health check passed"
else
  echo -e "  ${YELLOW}⚠${NC} Backend not responding yet — check logs/backend.log"
fi

echo ""
echo -e "${BOLD}SpectraPro is running!${NC}"
echo -e "  ${CYAN}Frontend:${NC}  http://localhost:$FRONTEND_PORT"
echo -e "  ${CYAN}Backend:${NC}   http://localhost:$BACKEND_PORT"
echo -e "  ${CYAN}Stop:${NC}      ./scripts/stop-all.sh"
echo ""
