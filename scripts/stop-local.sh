#!/bin/bash
# ── SpectraPRO — Local Shutdown Script ──────────────────────────
# Stops backend and frontend
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Stopping SpectraPRO..."

if [ -f "$PROJECT_ROOT/.pids/backend.pid" ]; then
    BACKEND_PID=$(cat "$PROJECT_ROOT/.pids/backend.pid")
    kill $BACKEND_PID 2>/dev/null && echo "✓ Backend stopped" || echo "✓ Backend already stopped"
    rm "$PROJECT_ROOT/.pids/backend.pid"
fi

if [ -f "$PROJECT_ROOT/.pids/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$PROJECT_ROOT/.pids/frontend.pid")
    kill $FRONTEND_PID 2>/dev/null && echo "✓ Frontend stopped" || echo "✓ Frontend already stopped"
    rm "$PROJECT_ROOT/.pids/frontend.pid"
fi

echo "✅ SpectraPRO stopped"
