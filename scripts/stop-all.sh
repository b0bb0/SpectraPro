#!/bin/bash
# ── SpectraPro — Stop All Services ────────────────────────────────────
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_DIR="$PROJECT_ROOT/.pids"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Stopping SpectraPro services..."

# Stop by saved PIDs
for svc in backend frontend flask; do
  PID_FILE="$PID_DIR/$svc.pid"
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null && echo -e "  ${GREEN}✓${NC} Stopped $svc (PID $PID)"
      # Also kill child processes (tsx, next, etc.)
      pkill -P "$PID" 2>/dev/null || true
    else
      echo -e "  ${YELLOW}○${NC} $svc already stopped"
    fi
    rm -f "$PID_FILE" 2>/dev/null || true
  fi
done

# Fallback: kill by port
for port in 5001 3003 5000; do
  if command -v lsof &>/dev/null; then
    PIDS=$(lsof -ti:$port 2>/dev/null || true)
  elif command -v fuser &>/dev/null; then
    PIDS=$(fuser $port/tcp 2>/dev/null || true)
  else
    PIDS=""
  fi
  if [[ -n "$PIDS" ]]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Killed processes on port $port"
  fi
done

echo ""
echo "All SpectraPro services stopped."
echo "PostgreSQL is still running (managed by your OS)."
echo "To stop PostgreSQL: brew services stop postgresql@16  (macOS)"
