# Project: Spectra - AI Automated Penetration Testing

## 1. Project Overview

Spectra is an advanced AI-powered penetration testing and security assessment tool. It integrates the Nuclei vulnerability scanner for comprehensive detection and uses a Llama-based AI model (via Ollama) for in-depth analysis, risk assessment, and reporting.

The project is a Python application with two main interfaces:
1.  **CLI (`src/spectra_cli.py`):** A command-line tool for initiating scans, listing results, and managing the tool.
2.  **REST API (`src/api/`):** A Flask-based API for programmatic integration, allowing for scans to be triggered and results retrieved remotely.

Key technologies include:
- **Backend:** Python
- **Scanning Engine:** Nuclei
- **AI Analysis:** Ollama with Llama models
- **API:** Flask
- **Database:** SQLite for storing scan history and results.
- **Dependency Management:** Pip (`requirements.txt`)

The architecture is modular, with distinct components for scanning, AI analysis, report generation, and data persistence located in the `src/core/` directory.

## 2. Building and Running the Project

### Prerequisites
- Python 3.8+
- Nuclei
- Ollama (optional, for AI features)

### Setup
A quick setup script is provided. It creates a Python virtual environment, installs dependencies, and configures the tool.
```bash
# Make the script executable
chmod +x scripts/setup.sh

# Run the setup
./scripts/setup.sh
```

### Running the CLI
The primary entry point for manual scans. Activate the virtual environment first.
```bash
# Activate the virtual environment
source venv/bin/activate

# Run a full scan on a single target
python src/spectra_cli.py scan https://example.com

# Run a batch scan using a file with a list of targets
python src/spectra_cli.py scan --targets-file targets.txt
```

### Running the API Server
To use the RESTful API for integration.
```bash
# Activate the virtual environment
source venv/bin/activate

# Start the API server
cd src/api
python app.py
```
The API will be available at `http://localhost:5000`.

### Running Tests
The project uses `pytest` for testing.
```bash
# Activate the virtual environment
source venv/bin/activate

# Run the test suite
pytest tests/
```

## 3. Development Conventions

### Code Style & Linting
The project uses `black` for code formatting and `flake8` for linting to maintain a consistent code style.
```bash
# Format code with black
black src/

# Check for style issues with flake8
flake8 src/
```

### Environment Configuration
Application settings are managed through a `.env` file and a main configuration file at `config/config.yaml`. The `.env` file should be created by copying `.env.example`.

### Contribution Guidelines
Contributions are managed via GitHub Pull Requests. The standard workflow is:
1. Fork the repository.
2. Create a new feature branch.
3. Make changes and add corresponding tests.
4. Ensure all tests and style checks pass.
5. Submit a pull request.
