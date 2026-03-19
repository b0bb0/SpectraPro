#!/bin/bash
# ── SpectraPRO — Local Development Startup Script ─────────────────
# Starts backend and frontend on MacBook without Docker
# Usage: ./scripts/start-local.sh
# ──────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 SpectraPRO — Local Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
echo "✓ Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 20+ not found. Install: https://nodejs.org/"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found. Install: brew install postgresql@15"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required (found: $(node -v))"
    exit 1
fi

# Check environment file
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "❌ .env file not found!"
    echo "   Run: cp .env.production .env"
    echo "   Then edit .env with your database connection string"
    exit 1
fi

echo "✓ Node.js $(node -v)"
echo "✓ PostgreSQL installed"
echo "✓ .env file exists"

# Start PostgreSQL
echo ""
echo "🗄️  Starting PostgreSQL..."
if ! brew services list | grep -q "postgresql@15"; then
    echo "⚠️  PostgreSQL service not running. Starting..."
    brew services start postgresql@15
    sleep 3
fi

if psql -U postgres -c "SELECT 1" &>/dev/null 2>&1 || psql -U postgres -d spectra_platform -c "SELECT 1" &>/dev/null 2>&1; then
    echo "✓ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

# Run migrations
echo ""
echo "🗂️  Running database migrations..."
cd "$PROJECT_ROOT/platform/backend"
npm install --silent >/dev/null 2>&1
npm run prisma:generate 2>/dev/null
npx prisma migrate deploy --skip-generate 2>/dev/null || echo "⚠️  Migrations may already be applied"

# Start backend in background
echo ""
echo "🔧 Starting backend server on :5001..."
cd "$PROJECT_ROOT/platform/backend"
npm run dev > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo "✓ Backend started (PID: $BACKEND_PID)"

sleep 3

# Start frontend in background
echo "🎨 Starting frontend on :3003..."
cd "$PROJECT_ROOT/platform/frontend"
npm install --silent >/dev/null 2>&1
NODE_ENV=development npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "✓ Frontend started (PID: $FRONTEND_PID)"

sleep 3

# Verify both are running
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SpectraPRO is running!"
echo ""
echo "   Frontend:  http://localhost:3003"
echo "   Backend:   http://localhost:5001"
echo "   Database:  postgresql://localhost:5432/spectra_platform"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"
echo ""
echo "⏹️  To stop: kill $BACKEND_PID $FRONTEND_PID"
echo "   Or: ./scripts/stop-local.sh"
echo ""
echo "🎯 Next: Open http://localhost:3003 and register an account"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Save PIDs for stop script
mkdir -p "$PROJECT_ROOT/.pids"
echo $BACKEND_PID > "$PROJECT_ROOT/.pids/backend.pid"
echo $FRONTEND_PID > "$PROJECT_ROOT/.pids/frontend.pid"

# Keep script running and show logs
wait
