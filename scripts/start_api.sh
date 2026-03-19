#!/bin/bash

# Start Spectra API Server

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "  Starting Spectra API Server"
echo "========================================="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${RED}❌ Virtual environment not found${NC}"
    echo "Run ./scripts/setup.sh first"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if Ollama is running (optional but recommended)
if command -v ollama &> /dev/null; then
    if ! pgrep -x "ollama" > /dev/null; then
        echo -e "${YELLOW}⚠ Ollama is not running${NC}"
        echo "AI features will be limited. Start Ollama with: ollama serve"
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Ollama is running${NC}"
    fi
fi

# Create data directories if they don't exist
mkdir -p data/scans data/reports data/templates logs

# Start API server
echo ""
echo -e "${GREEN}Starting API server on http://0.0.0.0:5000${NC}"
echo "Press Ctrl+C to stop"
echo ""

cd src/api
python app.py
