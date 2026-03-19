#!/bin/bash
# ── SpectraPRO — Deploy to New Folder ─────────────────────────────
# Copies the entire deployment package to a target folder
#
# Usage:
#   ./scripts/deploy-to-folder.sh /Users/groot/SpectraPro
#   ./scripts/deploy-to-folder.sh ~/SpectraPro
# ──────────────────────────────────────────────────────────────────

set -e

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
    echo "❌ Usage: $0 <target-folder>"
    echo "   Example: $0 /Users/groot/SpectraPro"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$(dirname "$SCRIPT_DIR")"

echo "🚀 SpectraPRO — Deploy to New Folder"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Source:  $SOURCE"
echo "  Target:  $TARGET"
echo ""

# Create target directory
mkdir -p "$TARGET"

# Copy everything, excluding build artifacts
echo "📦 Copying files..."
rsync -av \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'venv' \
  --exclude 'dist' \
  --exclude '__pycache__' \
  --exclude '.pids' \
  --exclude 'logs' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude '.git' \
  "$SOURCE/" "$TARGET/"

echo ""
echo "📦 Installing backend dependencies..."
cd "$TARGET/platform/backend"
npm install --silent 2>/dev/null
npx prisma generate 2>/dev/null

echo ""
echo "📦 Installing frontend dependencies..."
cd "$TARGET/platform/frontend"
npm install --silent 2>/dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SpectraPRO deployed to: $TARGET"
echo ""
echo "📋 Next steps:"
echo "   cd $TARGET"
echo "   cp .env.production .env"
echo "   nano .env          # Edit with your secrets"
echo ""
echo "   # Then start with Docker:"
echo "   ./scripts/start-docker.sh"
echo ""
echo "   # Or start locally:"
echo "   ./scripts/start-local.sh"
echo ""
echo "📖 Read QUICKSTART.md for full instructions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
