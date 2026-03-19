#!/bin/bash

# Spectra Setup Script
# Installs dependencies and prepares the environment

set -e

echo "========================================="
echo "  Spectra Setup"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Python version
echo "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}✓ Python $PYTHON_VERSION found${NC}"

# Check if nuclei is installed
echo ""
echo "Checking for Nuclei..."
if ! command -v nuclei &> /dev/null; then
    echo -e "${YELLOW}⚠ Nuclei not found${NC}"
    echo "Installing Nuclei..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install nuclei
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
    else
        echo -e "${RED}❌ Unsupported OS. Please install Nuclei manually${NC}"
        echo "Visit: https://github.com/projectdiscovery/nuclei"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Nuclei found${NC}"
fi

# Check if Ollama is installed (for AI features)
echo ""
echo "Checking for Ollama (for AI features)..."
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}⚠ Ollama not found${NC}"
    echo "Ollama is required for AI-powered analysis."
    echo "Install from: https://ollama.ai"
    echo ""
    read -p "Continue without Ollama? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ Ollama found${NC}"

    # Check if llama model is available
    if ollama list | grep -q "Meta-Llama-3.1-8B-Instruct-abliterated"; then
        echo -e "${GREEN}✓ Meta-Llama-3.1-8B-Instruct-abliterated model found${NC}"
    else
        echo -e "${YELLOW}⚠ Meta-Llama-3.1-8B-Instruct-abliterated model not found${NC}"
        echo "Note: This model needs to be installed manually from HuggingFace"
        echo "Visit: https://huggingface.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated"
    fi
fi

# Create virtual environment
echo ""
echo "Setting up Python virtual environment..."
if [ -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment already exists${NC}"
else
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create necessary directories
echo ""
echo "Creating data directories..."
mkdir -p data/scans data/reports data/templates logs
echo -e "${GREEN}✓ Directories created${NC}"

# Copy environment file
echo ""
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Environment file created (.env)${NC}"
    echo -e "${YELLOW}⚠ Please edit .env with your configuration${NC}"
else
    echo -e "${YELLOW}.env file already exists${NC}"
fi

# Update nuclei templates
echo ""
echo "Updating Nuclei templates..."
nuclei -update-templates
echo -e "${GREEN}✓ Templates updated${NC}"

# Make CLI executable
chmod +x src/spectra_cli.py

echo ""
echo "========================================="
echo -e "${GREEN}✓ Setup complete!${NC}"
echo "========================================="
echo ""
echo "To get started:"
echo "  1. Activate virtual environment: source venv/bin/activate"
echo "  2. Start API server: python src/api/app.py"
echo "  3. Or use CLI: python src/spectra_cli.py scan https://example.com"
echo ""
echo "For AI features, make sure Ollama is running:"
echo "  ollama serve"
echo ""
