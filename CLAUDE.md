# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Spectra** is an AI-powered penetration testing and vulnerability management platform with two integrated components:

1. **CLI Scanner** (`src/`) — Python-based pen testing tool: Nuclei vulnerability scanning + Ollama/Llama AI analysis + multi-format report generation + SQLite local storage
2. **Platform Web UI** (`platform/`) — Enterprise SaaS application: Next.js 14 frontend + Express.js backend + PostgreSQL (Prisma ORM) + WebSocket real-time updates

Data flows from CLI scans into the platform via `POST /api/scans/ingest`.

## Build & Run Commands

### Python Scanner (CLI)
```bash
# Activate venv (required for all Python commands)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run a scan
python src/spectra_cli.py scan https://example.com
python src/spectra_cli.py scan https://example.com --severity critical high --format json

# Batch scan
python src/spectra_cli.py scan -f targets.txt --max-workers 5

# List/show scans
python src/spectra_cli.py list
python src/spectra_cli.py show <scan_id>

# Update Nuclei templates
python src/spectra_cli.py update
```

### Python API Server
```bash
cd src/api && python app.py   # Runs on :5000
```

### Platform Backend (TypeScript)
```bash
cd platform/backend
npm install
npm run prisma:generate       # Generate Prisma client
npm run prisma:migrate        # Run database migrations
npm run dev                   # Dev server on :5001
npm run build                 # TypeScript compile
npm run prisma:studio         # DB GUI on :5555
npm run prisma:seed           # Seed test data
```

### Platform Frontend (Next.js)
```bash
cd platform/frontend
npm install
npm run dev                   # Dev server on :3001
npm run build                 # Production build
```

### Testing
```bash
# Python tests
pytest tests/ -v
pytest tests/test_report_generator.py -v    # Single test file

# Platform backend tests
cd platform/backend
npm test
npm test -- scan-orchestrator.service       # Single service test

# Linting
black src/                                  # Python formatting
flake8 src/                                 # Python linting
cd platform/backend && npm run lint         # Backend linting
cd platform/frontend && npm run lint        # Frontend linting
```

## Architecture

### Python Scanner Pipeline
```
spectra_cli.py → NucleiScanner (subprocess) → AIAnalyzer (Ollama HTTP) → ReportGenerator → Database (SQLite)
```
- `NucleiScanner` (`src/core/scanner/nuclei_scanner.py`) — Builds Nuclei CLI commands, executes via subprocess, parses JSONL output
- `AIAnalyzer` (`src/core/analyzer/ai_analyzer.py`) — Calls Ollama API at `localhost:11434`, categorizes vulns, computes risk scores, falls back to basic analysis if Ollama unavailable
- `ReportGenerator` (`src/core/reporter/report_generator.py`) — HTML/JSON/Markdown output
- `Database` (`src/core/database/models.py`) — SQLite for local scan history
- `parallel_processor.py` / `cache_manager.py` — Root-level utilities for batch processing with ThreadPoolExecutor

### Platform Stack
```
Next.js 14 (App Router, :3001) → Express.js API (:5001) → Prisma → PostgreSQL
                                  ↕ WebSocket (ws)
                                  ↕ JWT auth + multi-tenant isolation
```

**Key backend services** (`platform/backend/src/services/`):
- `scan-orchestrator.service.ts` — Multi-phase scanning (Preflight → Discovery → Targeted → Deep) with intelligent template selection
- `executive-dashboard.service.ts` — Risk metrics, severity trends, asset prioritization
- `vulnerability-deduplication.service.ts` — Fingerprint-based duplicate detection (template ID + target + response hash)
- `websocket.service.ts` — Real-time scan progress broadcasting per tenant
- `exposure-orchestration.service.ts` — External attack surface discovery

**Frontend** (`platform/frontend/`): Next.js 14 App Router, Tailwind CSS dark theme, shadcn/ui components, Framer Motion animations, Recharts, SWR for data fetching

### Multi-Tenancy
Every platform DB query must include `tenantId` filtering. Middleware chain: `Auth Check → Tenant Isolation → Role Check → Handler`. Roles: ADMIN, ANALYST, VIEWER.

### Database
- **CLI**: SQLite at `data/spectra.db`
- **Platform**: PostgreSQL with Prisma ORM. Schema at `platform/prisma/schema.prisma`. Core entities: Tenant, User, Asset, Vulnerability, Scan, Evidence, AuditLog, DailyMetric

## Conventions

### Python
- Use `logging` module, not print statements (except CLI output)
- Always capture stderr/stdout from subprocess calls and check return codes
- Use `os.path.join()` for file paths, relative to project root
- Nuclei outputs JSONL — parse with `json.loads()` per line
- Config lives in `config/config.yaml` (Nuclei path, Ollama URL, rate limits, timeouts)

### TypeScript (Platform)
- Zod schemas for all request validation
- Prisma methods only, never raw SQL
- Always filter by `req.tenant?.id` in business logic routes
- Winston for structured logging
- Express error handling via `errorHandler` middleware

## External Dependencies
- **Nuclei** — Must be installed and in PATH (or configured in `config/config.yaml`)
- **Ollama** — Local LLM server at `http://localhost:11434` (start with `ollama serve`). Model: `Meta-Llama-3.1-8B-Instruct-abliterated`. Scanner gracefully falls back if unavailable.
- **PostgreSQL 15+** — Required for platform. Connection via `DATABASE_URL` env var.
- **Node.js 20+** — Required for platform backend/frontend.

## Known Gotchas
- Ollama must be running before AI analysis works (`ollama serve`)
- Nuclei rate limit defaults to 150 req/s — adjust in `config/config.yaml` for sensitive targets
- AI analysis has a 60-second timeout per request
- Vulnerability deduplication fingerprinting is case-sensitive and URL-order dependent
- Platform Prisma migrations: drop schema before applying new migrations to avoid conflicts
- Screenshot capture (Playwright) may timeout on complex pages — retry logic is built in
