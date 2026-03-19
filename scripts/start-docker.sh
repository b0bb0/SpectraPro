#!/bin/bash
# ── SpectraPRO — Docker Startup Script ──────────────────────────
# Builds and starts all services with Docker Compose
# Usage: ./scripts/start-docker.sh
# ───────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🐳 SpectraPRO — Docker Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install: https://docs.docker.com/install/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Install: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker $(docker --version | awk '{print $3}' | cut -d',' -f1)"
echo "✓ Docker Compose $(docker-compose --version | awk '{print $3}' | cut -d',' -f1)"

# Check .env file
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo ""
    echo "⚠️  .env file not found. Creating from template..."
    cp "$PROJECT_ROOT/.env.production" "$PROJECT_ROOT/.env"
    echo ""
    echo "❗ Edit the .env file with your database password and JWT secret:"
    echo "   nano .env"
    echo ""
    echo "Then run this script again:"
    echo "   ./scripts/start-docker.sh"
    exit 1
fi

echo "✓ .env file exists"

# Build
echo ""
echo "🔨 Building Docker images..."
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" build --no-cache

# Start
echo ""
echo "🚀 Starting services..."
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Run migrations
echo ""
echo "🗂️  Running database migrations..."
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T backend npx prisma migrate deploy || true

# Show status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SpectraPRO is running!"
echo ""
echo "   Web UI:  http://localhost"
echo ""
echo "📊 Docker services:"
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" ps
echo ""
echo "📝 Logs:"
echo "   docker-compose logs -f"
echo ""
echo "⏹️  To stop:"
echo "   docker-compose down"
echo ""
echo "🎯 Next: Open http://localhost and register an account"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
