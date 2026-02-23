# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SpectraPRO** is an AI-powered penetration testing and vulnerability management platform with two integrated components:

1. **CLI Scanner** (`src/`) — Python-based pen testing tool: Nuclei vulnerability scanning + Ollama/Llama AI analysis + multi-format report generation + SQLite local storage
2. **Platform Web UI** (`platform/`) — Enterprise SaaS application: Next.js 14 frontend + Express.js backend + PostgreSQL (Prisma ORM) + WebSocket real-time updates

Data flows from CLI scans into the platform via `POST /api/scans/ingest`.

## Build & Run Commands

### Python Scanner (CLI)
```bash
source venv/bin/activate              # Required for all Python commands
pip install -r requirements.txt

python src/spectra_cli.py scan https://example.com
python src/spectra_cli.py scan https://example.com --severity critical high --format json
python src/spectra_cli.py scan -f targets.txt --max-workers 5
python src/spectra_cli.py list
python src/spectra_cli.py show <scan_id>
python src/spectra_cli.py update      # Update Nuclei templates
```

### Python API Server
```bash
cd src/api && python app.py           # Runs on :5000
```

### Platform Backend (TypeScript)
```bash
cd platform/backend
npm install
npm run prisma:generate               # Generate Prisma client
npm run prisma:migrate                # Run database migrations
npm run dev                           # Dev server on :5001 (uses tsx watch)
npm run build                         # TypeScript compile to dist/
npm run start                         # Production (node dist/index.js)
npm run prisma:studio                 # DB GUI on :5555
npm run prisma:seed                   # Seed test data (tsx prisma/seed.ts)
```

### Platform Frontend (Next.js)
```bash
cd platform/frontend
npm install
npm run dev                           # Dev server on :3003
npm run build                         # Production build
```

### Docker (Full Stack)
```bash
cp .env.production .env && nano .env  # Set POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d --build
# Services: Caddy (:80 reverse proxy), PostgreSQL, backend (:5001), frontend
```

### Testing
```bash
# Python tests
pytest tests/ -v
pytest tests/test_report_generator.py -v        # Single test file

# Platform backend tests (Jest)
cd platform/backend
npm test
npm test -- scan-orchestrator.service           # Single service test

# Linting
black src/                                       # Python formatting
flake8 src/                                      # Python linting
cd platform/backend && npm run lint              # Backend (eslint)
cd platform/frontend && npm run lint             # Frontend (eslint)
```

### Helper Scripts
```bash
./scripts/start-all.sh                # Launch all services
./scripts/stop-all.sh                 # Graceful shutdown
./scripts/health-check.sh             # Service health monitoring
./scripts/auto-setup.sh               # Automated first-time configuration
```

## Architecture

### Python Scanner Pipeline
```
spectra_cli.py → NucleiScanner (subprocess) → AIAnalyzer (Ollama HTTP) → ReportGenerator → Database (SQLite)
```
- `NucleiScanner` (`src/core/scanner/nuclei_scanner.py`) — Builds Nuclei CLI commands, executes via subprocess, parses JSONL output
- `AIAnalyzer` (`src/core/analyzer/ai_analyzer.py`) — Calls Ollama API at `localhost:11434`, categorizes vulns, computes risk scores, falls back to basic analysis if Ollama unavailable
- `ReportGenerator` (`src/core/reporter/report_generator.py`) — HTML/JSON/Markdown output via Jinja2 templates (in `src/core/reporter/templates/`)
- `Database` (`src/core/database/models.py`) — SQLite ORM for local scan history
- `parallel_processor.py` / `cache_manager.py` — Root-level utilities for batch processing with ThreadPoolExecutor

### Platform Stack
```
Next.js 14 (App Router, :3003) → Express.js API (:5001) → Prisma → PostgreSQL
                                   ↕ WebSocket (ws)
                                   ↕ JWT auth + multi-tenant isolation
```

**Key backend services** (`platform/backend/src/services/` — 37 service files):
- `scan-orchestrator.service.ts` (44KB) — Multi-phase scanning (Preflight → Discovery → Targeted → Deep) with intelligent template selection, AI decisions logged to `ai_decision_ledger`
- `recon.service.ts` (74KB, largest) — Reconnaissance pipeline: Nmap, Feroxbuster, AI analysis phases
- `exploitation.service.ts` (36KB) — ROE-gated exploit automation with proof capture
- `executive-dashboard.service.ts` — Risk metrics (multi-factor weighted: severity base + CVSS + asset value + exploitability + business context)
- `vulnerability-deduplication.service.ts` — Fingerprint-based duplicate detection (template ID + target + response hash)
- `websocket.service.ts` — Real-time scan progress broadcasting per tenant
- `exposure-orchestration.service.ts` — External attack surface discovery (subdomain enumeration + screenshots)
- `screenshot-capture.service.ts` — Playwright-based evidence capture
- `scheduler.service.ts` — node-cron scheduled scan management
- `ai-report.service.ts` / `pdf-report.service.ts` — AI-powered and PDF report generation

**Backend routes** (`platform/backend/src/routes/` — 25 route files) cover: auth, scans, assets, vulnerabilities, exploitation, recon, exposure, templates, executive dashboard, scheduled-scans, impact assessments, attack-chains, kill-switch, integrations, rules-of-engagement, audit logs, and more.

**Frontend** (`platform/frontend/`): Next.js 14 App Router with 13+ dashboard sections, Tailwind CSS dark theme (cosmic deep-space: `#0a0a0f` background, purple/pink/orange gradients), shadcn/ui (Radix) components, Framer Motion animations, Recharts, SWR for data fetching, lucide-react icons.

### Scan Orchestration Lifecycle
```
PREFLIGHT → DISCOVERY → TARGETED_SCAN → DEEP_SCAN → PROCESSING → COMPLETED
```
Template selection uses 10 intelligent rules based on discovered technology stack.

### Multi-Tenancy
Every platform DB query must include `tenantId` filtering. Middleware chain: `Auth Check → Tenant Isolation → Role Check → Handler`. Roles: ADMIN, ANALYST, VIEWER.

### WebSocket Real-Time Updates
- **Backend** broadcasts: `scan_started`, `scan_progress` (0-100%, currentPhase, vulnFound), `scan_completed`, `bulk_scan_progress`
- **Frontend hooks** (`hooks/useWebSocket.ts`): `useWebSocket()` for all tenant events, `useScanUpdates(scanId)` for a specific scan
- Auto-reconnection: 5 attempts, 3-second delays
- Clients grouped by `tenantId` from JWT — never broadcast outside tenant scope

### Database
- **CLI**: SQLite at `data/spectra.db`
- **Platform**: PostgreSQL with Prisma ORM. Schema at `platform/backend/prisma/schema.prisma` (1244 lines, 50+ models). Core entities: Tenant, User, Asset, Vulnerability, Scan, Evidence, AuditLog, DailyMetric, ReconSession, ExploitationAttempt, ImpactAssessment, RulesOfEngagement, GlobalKillSwitch, NucleiTemplate, ScheduledScan, ToolIntegration, and 25+ enums.
- **Scan data**: `data/scans/` (JSONL outputs), `data/reports/` (generated reports), `data/custom-templates/` (user Nuclei templates)

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
- Backend dev uses `tsx watch` (not ts-node)

## External Dependencies

**Required:**
- **Nuclei** — Must be installed and in PATH (or configured in `config/config.yaml`)
- **PostgreSQL 15+** — Required for platform. Connection via `DATABASE_URL` env var
- **Node.js 20+** — Required for platform backend/frontend

**Optional (graceful degradation):**
- **Ollama** — Local LLM server at `http://localhost:11434` (start with `ollama serve`). Model: `Meta-Llama-3.1-8B-Instruct-abliterated:BF16`. Falls back to rule-based analysis if unavailable.
- **Nmap** — Used by recon service for network reconnaissance
- **Feroxbuster** — Used by recon service for content discovery
- **Playwright** — Screenshot capture for vulnerability evidence (retry logic built in)

## Known Gotchas
- Ollama must be running before AI analysis works (`ollama serve`)
- Nuclei rate limit defaults to 150 req/s — adjust in `config/config.yaml` for sensitive targets
- AI analysis has a 60-second timeout per request
- Vulnerability deduplication fingerprinting is case-sensitive and URL-order dependent
- Platform Prisma migrations: drop schema before applying new migrations to avoid conflicts
- Screenshot capture (Playwright) may timeout on complex pages — retry logic is built in
- Frontend dev port is **3003** (configured in package.json `next dev -p 3003`), not the default 3000
- JWT token expiry is 7 days; refresh tokens available on auth routes
- The `recon.service.ts` is the largest service file (74KB) — changes need care to avoid regressions
- Docker deployment uses Caddy as reverse proxy on port 80; local dev accesses services directly
