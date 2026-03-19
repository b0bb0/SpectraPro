# Spectra Quick Start Guide

Get up and running with Spectra in 5 minutes!

## Prerequisites

Before starting, ensure you have:
- Python 3.8 or higher
- pip (Python package manager)
- Homebrew (for macOS) or appropriate package manager

## Installation

### 1. Automated Setup (Recommended)

Run the setup script:
```bash
cd spectra
./scripts/setup.sh
```

This will automatically:
- Install Nuclei
- Create virtual environment
- Install Python dependencies
- Set up directories
- Update templates

### 2. Manual Setup

If you prefer manual installation:

```bash
# Install Nuclei
brew install nuclei  # macOS
# or
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest  # Linux

# Install Ollama (optional, for AI features)
# Visit https://ollama.ai

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create directories
mkdir -p data/scans data/reports logs

# Copy configuration
cp .env.example .env
```

## First Scan

### Option 1: CLI

```bash
# Activate virtual environment
source venv/bin/activate

# Run your first scan
python src/spectra_cli.py scan https://testfire.net

# View results
python src/spectra_cli.py list
```

### Option 2: API

1. **Start the API server**:
```bash
source venv/bin/activate
cd src/api
python app.py
```

2. **Send a scan request**:
```bash
curl -X POST http://localhost:5000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://testfire.net",
    "auto_analyze": true
  }'
```

### Option 3: Python Script

```bash
source venv/bin/activate
cd examples
python simple_scan.py
```

## Enable AI Analysis

For AI-powered analysis, you need Ollama with Llama:

1. **Install Ollama**:
   - Visit https://ollama.ai
   - Follow installation instructions

2. **Start Ollama**:
```bash
ollama serve
```

3. **Verify your model is available**:
```bash
ollama list | grep "Meta-Llama-3.1-8B-Instruct-abliterated"
```

4. **Run scan with AI**:
```bash
python src/spectra_cli.py scan https://testfire.net
```

The AI analysis will automatically run and provide:
- Risk assessment
- Vulnerability categorization
- Actionable recommendations
- Executive summary

## Understanding Results

### Risk Scores

- **80-100**: Critical - Immediate action required
- **60-79**: High - Address within 24-48 hours
- **40-59**: Medium - Schedule remediation
- **0-39**: Low - Review during maintenance

### Report Formats

1. **HTML** (default): Beautiful, interactive reports
   - Open in any web browser
   - Includes charts and visualizations
   - Perfect for sharing with teams

2. **JSON**: Machine-readable format
   - Integrate with other tools
   - Automated processing
   - API consumption

3. **Markdown**: Documentation-friendly
   - Version control friendly
   - Easy to edit
   - Great for documentation

## Common Tasks

### Filter by Severity
```bash
python src/spectra_cli.py scan https://example.com --severity critical high
```

### Change Report Format
```bash
python src/spectra_cli.py scan https://example.com --format markdown
```

### View Scan History
```bash
python src/spectra_cli.py list --limit 20
```

### Get Scan Details
```bash
python src/spectra_cli.py show scan_20240115_143022
```

### Update Nuclei Templates
```bash
python src/spectra_cli.py update
```

## Configuration

Edit `.env` file:
```bash
# Llama Configuration
LLAMA_API_URL=http://localhost:11434/api/generate
LLAMA_MODEL=hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16

# API Settings
API_HOST=0.0.0.0
API_PORT=5000

# Logging
LOG_LEVEL=INFO
```

Or edit `config/config.yaml` for advanced settings.

## Next Steps

1. **Explore the API**: Check `docs/API.md` for full API documentation
2. **Customize Templates**: Learn about Nuclei templates
3. **Automate Scans**: Set up scheduled scanning
4. **Integrate**: Connect Spectra to your CI/CD pipeline

## Troubleshooting

### "Nuclei not found"
```bash
brew install nuclei
# or
which nuclei  # Check if in PATH
```

### "AI analysis unavailable"
```bash
# Start Ollama
ollama serve

# Verify your model is available
ollama list | grep "Meta-Llama-3.1-8B-Instruct-abliterated"

# If not available, install from HuggingFace
# Visit: https://huggingface.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated
```

### "Permission denied"
```bash
chmod +x scripts/setup.sh
chmod +x src/spectra_cli.py
```

### "Module not found"
```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

## Support

- **Documentation**: Check `docs/` directory
- **Examples**: See `examples/` directory
- **Issues**: Open a GitHub issue
- **API Reference**: See `docs/API.md`

## Test Target

For testing, use authorized targets only:
- http://testfire.net (IBM test site)
- Your own systems with authorization
- CTF platforms
- Lab environments

**Never** scan systems without explicit permission!

---

Happy scanning! 🛡️
