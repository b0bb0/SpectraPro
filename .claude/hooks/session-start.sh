#!/bin/bash
set -euo pipefail

# Only run in remote environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "==> Installing Python dependencies..."
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --quiet -r requirements.txt

echo "==> Installing platform backend dependencies..."
cd "$CLAUDE_PROJECT_DIR/platform/backend"
PUPPETEER_SKIP_DOWNLOAD=true npm install --silent
npm run prisma:generate --silent

echo "==> Installing platform frontend dependencies..."
cd "$CLAUDE_PROJECT_DIR/platform/frontend"
npm install --silent

echo "==> Session start complete."
