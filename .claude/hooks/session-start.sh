#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# --- Python dependencies ---
echo "Installing Python dependencies..."
cd "$PROJECT_DIR"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt --quiet

# Persist venv activation for the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export VIRTUAL_ENV=\"$PROJECT_DIR/venv\"" >> "$CLAUDE_ENV_FILE"
  echo "export PATH=\"$PROJECT_DIR/venv/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# --- Platform Backend dependencies ---
echo "Installing platform backend dependencies..."
cd "$PROJECT_DIR/platform/backend"
PUPPETEER_SKIP_DOWNLOAD=true npm install
npx prisma generate

# --- Platform Frontend dependencies ---
echo "Installing platform frontend dependencies..."
cd "$PROJECT_DIR/platform/frontend"
npm install

echo "Session start hook completed successfully."
