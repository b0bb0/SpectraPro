# SpectraPro — Full Project Analysis

## 1. Project Overview

**SpectraPro** is an AI-powered penetration testing and vulnerability management platform with two integrated components:

| Component | Stack | Port | Purpose |
|-----------|-------|------|---------|
| **CLI Scanner** (`src/`) | Python 3.10+ | — | Nuclei scanning + Ollama AI analysis + report generation |
| **Python API** (`src/api/`) | Flask | :5000 | REST API wrapper around CLI scanner |
| **Platform Backend** (`platform/backend/`) | Express.js + TypeScript | :5001 | Enterprise SaaS API with Prisma ORM |
| **Platform Frontend** (`platform/frontend/`) | Next.js 14 (App Router) | :3003 (dev) / :3000 (prod) | Dashboard web UI |
| **Reverse Proxy** | Caddy 2 | :80 | Routes `/api/*` → backend, everything else → frontend |
| **Database (CLI)** | SQLite | — | Local scan history at `data/spectra.db` |
| **Database (Platform)** | PostgreSQL 16+ | :5432 | Enterprise multi-tenant data |

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      DOCKER COMPOSE                         │
│                                                             │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐              │
│  │  Caddy   │───▶│ Frontend │    │ PostgreSQL│              │
│  │  :80     │    │ Next.js  │    │  :5432    │              │
│  │         │───▶│ :3000    │    └─────┬─────┘              │
│  └─────────┘    └──────────┘          │                    │
│       │                               │                    │
│       │         ┌──────────┐    ┌─────▼─────┐              │
│       └────────▶│ Backend  │───▶│  Prisma   │              │
│                 │ Express  │    │  ORM      │              │
│                 │ :5001    │    └───────────┘              │
│                 │   ↕ WS   │                               │
│                 └──────────┘                               │
└─────────────────────────────────────────────────────────────┘

┌──────────────────── CLI (standalone) ───────────────────────┐
│  spectra_cli.py → NucleiScanner → AIAnalyzer → Reporter    │
│                                       ↕                     │
│                                   Ollama :11434             │
│                       ↓                                     │
│                   SQLite (data/spectra.db)                  │
└─────────────────────────────────────────────────────────────┘
```

**CLI → Platform bridge:** `POST /api/scans/ingest` sends CLI scan results into the platform.

---

## 3. Database Schemas & Migrations

### 3.1 SQLite (CLI Scanner)

Located at `data/spectra.db`. 4 tables, created inline via `models.py`:

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `scans` | scan_id (PK), target, status, risk_score, scan_data (JSON) | Scan metadata |
| `vulnerabilities` | id (auto), scan_id (FK), template_id, severity, vulnerability_data (JSON) | Individual findings |
| `reports` | report_id (PK), scan_id (FK), format, file_path | Generated report references |
| `analysis` | id (auto), scan_id (FK), ai_analysis (text), recommendations (JSON), risk_score | AI analysis results |

### 3.2 PostgreSQL (Platform)

**Connection:** `DATABASE_URL` env var → Prisma ORM → PostgreSQL 16+

**Schema location:** `platform/backend/prisma/schema.prisma` (1,244 lines)

**Migrations (4 total):**

| Migration | Date | What it does |
|-----------|------|-------------|
| `0_init` | Initial | Creates all base tables, enums, indexes |
| `20260127154420` | Jan 27 | Adds offensive security models (recon, exploitation, attack chains, impact) |
| `20260127181209` | Jan 27 | Adds `authConfig` JSON field to scans for authenticated scanning |
| `20260128123931` | Jan 28 | Adds interactive recon models (selections, AI decisions, artifacts) |

**Core entities (30+ models):**

| Model | Purpose | Key Relations |
|-------|---------|---------------|
| `tenants` | Multi-tenant isolation | Parent of almost everything |
| `users` | Auth (bcrypt hashed passwords) | Belongs to tenant, roles: ADMIN/ANALYST/VIEWER |
| `assets` | Targets (domains, IPs, APIs, etc.) | Has vulns, scans, child assets |
| `vulnerabilities` | Findings with dedup keys | Belongs to asset + scan + tenant |
| `scans` | Scan runs with orchestration phases | Multi-phase: PREFLIGHT → DISCOVERY → TARGETED → DEEP → PROCESSING |
| `evidence` | Proof artifacts per vulnerability | Screenshots, HTTP evidence |
| `audit_logs` | All user actions | CRUD + LOGIN/LOGOUT tracking |
| `daily_metrics` | Time-series risk data | For executive dashboard trends |
| `reports` | Generated PDF/HTML/JSON/CSV reports | Per tenant |
| `NucleiTemplate` | Custom scan templates | Uploaded + validated per tenant |
| `ScheduledScan` | Cron-based recurring scans | With execution history |
| `exposure_scans` / `subdomains` | Attack surface discovery | Subdomain enumeration results |
| `rules_of_engagement` | Scan permission rules | Scope, allowed methods, time windows |
| `recon_sessions` | Interactive reconnaissance | 4 phases: PASSIVE → ACTIVE → CONTENT → TECH_STACK |
| `exploitation_attempts` | Exploit validation | SQLi, XSS, RCE, IDOR proofs |
| `impact_assessments` | Business impact scoring | Privilege escalation, lateral movement |
| `attack_chains` | Kill chain visualization | Links vulns → exploits → impact |
| `global_kill_switch` | Emergency scan halt | Per-tenant emergency stop |
| `tool_integrations` | External tool connections | Shodan, HTTP/JSON endpoints |

**Key enums (30+):** Severity, ScanStatus, ScanType, ScanProfile, OrchestrationPhase, ExploitState, ExploitTechnique, ImpactLevel, UserRole, AssetType, etc.

---

## 4. Python Scanner (CLI)

### 4.1 Core Modules

| Module | File | Purpose |
|--------|------|---------|
| `SpectraCLI` | `src/spectra_cli.py` | Main entry point, orchestrates scan → analyze → report pipeline |
| `NucleiScanner` | `src/core/scanner/nuclei_scanner.py` | Builds Nuclei CLI commands, executes via subprocess, parses JSONL |
| `AIAnalyzer` | `src/core/analyzer/ai_analyzer.py` | Calls Ollama API, categorizes vulns, calculates risk scores, generates recommendations |
| `ReportGenerator` | `src/core/reporter/report_generator.py` | HTML/JSON/Markdown reports with collapsible sections, HTTP evidence |
| `Database` | `src/core/database/models.py` | SQLite CRUD for scans, vulns, reports, analysis |

### 4.2 CLI Commands

```
spectra scan <target>              # Single scan
spectra scan -f targets.txt -w 5   # Batch scan (parallel)
spectra list                       # List scans
spectra show <scan_id>             # Scan details
spectra update                     # Update Nuclei templates
```

### 4.3 Utility Modules (root level)

| File | Purpose |
|------|---------|
| `parallel_processor.py` | ThreadPoolExecutor batch processing with progress bars |
| `cache_manager.py` | Caching layer for scan results |
| `progress_utils.py` | tqdm-based CLI progress bars |
| `report_generator.py` | Standalone enhanced report generator (root-level duplicate) |
| `analyze_vulnerabilities_with_ollama.py` | Standalone Ollama analysis script |
| `ollama_vulnerability_analyzer.py` | Alternative Ollama analyzer |

### 4.4 ScrapeGraph Module (`src/scrapegraph/`)

| File | Purpose |
|------|---------|
| `scraper.py` | Web scraping via scrapegraphai |
| `config.py` | Scraper configuration |
| `prompts.py` | AI prompts for scraping |
| `output.py` | Output formatting |

### 4.5 Python API Server (`src/api/app.py`)

Flask REST API on port 5000 with endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/scan` | POST | Start a scan (with optional auto-analyze) |
| `/api/analyze/<scan_id>` | POST | AI analysis of scan results |
| `/api/report/<scan_id>` | POST | Generate report (HTML/JSON/MD) |
| `/api/scans` | GET | List all scans |
| `/api/scans/<scan_id>` | GET | Scan details with vulns + analysis |
| `/api/vulnerabilities/<scan_id>` | GET | Vulnerabilities for a scan |
| `/api/templates/update` | POST | Update Nuclei templates |

**Auth:** Optional API key via `X-API-Key` header + `SPECTRA_API_KEY` env var.

---

## 5. Platform Backend (TypeScript/Express)

### 5.1 Entry Point (`src/index.ts`)

- Loads dotenv, configures Express with Helmet, CORS, Morgan logging
- Creates HTTP server for WebSocket support
- Recovers orphaned RUNNING scans on startup
- Initializes WebSocket service + scheduler service
- Graceful shutdown on SIGTERM/SIGINT

### 5.2 Middleware

| File | Purpose |
|------|---------|
| `auth.middleware.ts` | JWT auth (Bearer token or cookie), tenant isolation, role-based access |
| `audit.middleware.ts` | Logs all user actions to audit_logs table |
| `errorHandler.ts` | Centralized Express error handling |

**Auth flow:** `requireAuth` → `enforceTenantIsolation` → `requireRole(ADMIN/ANALYST/VIEWER)` → Handler

### 5.3 Routes (26 route files)

| Route | Path | Purpose |
|-------|------|---------|
| `auth.routes` | `/api/auth` | Login, register, logout, refresh, me |
| `scan.routes` | `/api/scans` | CRUD scans, start/stop/kill, bulk scan, ingest CLI results |
| `vulnerability.routes` | `/api/vulnerabilities` | CRUD vulns, AI analysis, status updates |
| `asset.routes` | `/api/assets` | CRUD assets, hierarchy, bulk create, promote from exposure |
| `dashboard.routes` | `/api/dashboard` | Metrics, risk trends, severity distribution |
| `executive.routes` | `/api/executive` | Executive dashboard with KPIs and trends |
| `report.routes` | `/api/reports` | PDF generation (executive + detailed) |
| `user.routes` | `/api/users` | User management, password changes |
| `audit.routes` | `/api/audit` | Audit log viewing + CSV export |
| `graph.routes` | `/api/graph` | Attack surface graph, threat paths, radial views |
| `exposure.routes` | `/api/exposure` | Subdomain enumeration, attack surface discovery |
| `template.routes` | `/api/templates` | Custom Nuclei template upload + validation |
| `scheduled-scans.routes` | `/api/scheduled-scans` | Cron-based recurring scan management |
| `recon.routes` | `/api/recon` | Interactive reconnaissance sessions |
| `exploitation.routes` | `/api/exploitation` | Exploit validation (SQLi, XSS, RCE, IDOR) |
| `discovery-scan.routes` | `/api/discovery-scan` | Discovery scan management |
| `impact.routes` | `/api/impact` | Business impact assessments |
| `attack-chain.routes` | `/api/attack-chains` | Kill chain visualization |
| `kill-switch.routes` | `/api/kill-switch` | Global emergency scan halt |
| `console.routes` | `/api/console` | Interactive console |
| `integrations.routes` | `/api/integrations` | Shodan, HTTP/JSON tool integrations |
| `source-scanner.routes` | `/api/source-scanner` | Source code scanning |
| `roe.routes` | `/api/roe` | Rules of engagement management |
| `debug.routes` | `/api/debug` | Debug endpoints |

### 5.4 Services (35 service files)

| Service | Purpose |
|---------|---------|
| `scan-orchestrator.service` | **Core** — Multi-phase scan pipeline (Preflight → Discovery → Targeted → Deep) |
| `scan.service` | Scan CRUD + Nuclei process management |
| `vulnerability.service` | Vuln CRUD with deduplication |
| `vulnerability-deduplication.service` | Fingerprint-based duplicate detection |
| `auth.service` | JWT sign/verify, password hashing, registration |
| `user.service` | User CRUD within tenant |
| `asset.service` | Asset management with vuln count tracking |
| `dashboard.service` | Metrics aggregation for main dashboard |
| `executive-dashboard.service` | Executive KPIs, severity trends, asset prioritization |
| `ai-analysis.service` | Ollama-based vulnerability analysis |
| `ai-report.service` | AI-generated report narratives |
| `ai-ledger.service` | Tracks all AI decisions for auditability |
| `pdf-report.service` | PDFKit-based report generation |
| `websocket.service` | Real-time scan progress via WebSocket per tenant |
| `scheduler.service` | node-cron based scheduled scan execution |
| `notification.service` | Email notifications via Nodemailer |
| `exposure-orchestration.service` | External attack surface discovery |
| `subdomain-enumeration.service` | Subdomain finder (Sublist3r integration) |
| `active-host-detection.service` | Checks if discovered hosts are alive |
| `screenshot-capture.service` | Playwright/Puppeteer screenshots of targets |
| `recon.service` | Interactive reconnaissance (Nmap, Feroxbuster, etc.) |
| `exploitation.service` | Safe exploit validation |
| `impact-assessment.service` | Business impact scoring |
| `attack-chain.service` | Kill chain assembly |
| `kill-switch.service` | Emergency scan halt |
| `graph.service` | Attack surface graph generation |
| `console.service` | Interactive console commands |
| `template.service` | Nuclei template management + validation |
| `audit.service` | Audit log queries |
| `integrations.service` | External tool sync |
| `shodan-assessment.service` | Shodan API integration |
| `nmap-assessment.service` | Nmap scan integration |
| `source-scanner.service` | Source code analysis |
| `scan-integration.service` | CLI ↔ Platform data bridge |
| `scan-ai-phase2.service` | AI-driven scan phase 2 decisions |
| `discovery-scan.service` | Discovery scan orchestration |

### 5.5 Utilities

| File | Purpose |
|------|---------|
| `prisma.ts` | Singleton Prisma client |
| `logger.ts` | Winston structured logging |
| `auth.ts` | JWT token sign/verify helpers |

---

## 6. Platform Frontend (Next.js 14)

### 6.1 Pages (App Router)

| Page | Path | Purpose |
|------|------|---------|
| Landing | `/` | Marketing page |
| Login | `/login` | JWT authentication |
| Register | `/register` | New tenant + user signup |
| Dashboard | `/dashboard` | Main metrics overview |
| Scans | `/dashboard/scans` | Scan list + detail views |
| Scan Detail | `/dashboard/scans/[id]` | Individual scan results |
| Vulnerabilities | `/dashboard/vulnerabilities` | Vuln list + filtering |
| Vuln Detail | `/dashboard/vulnerabilities/[id]` | Individual vuln with evidence |
| Assets | `/dashboard/assets` | Asset inventory |
| Asset Detail | `/dashboard/assets/[id]` | Asset risk profile |
| New Asset | `/dashboard/assets/new` | Create asset form |
| Executive | `/dashboard/executive` | Executive dashboard |
| Reports | `/dashboard/reports` | PDF report generation |
| Attack Surface | `/dashboard/attack-surface` | Graph visualization |
| Exposure | `/dashboard/exposure` | External attack surface |
| Templates | `/dashboard/templates` | Nuclei template management |
| Scheduled Scans | `/dashboard/scheduled-scans` | Recurring scan setup |
| Reconnaissance | `/dashboard/reconnaissance` | Interactive recon |
| Exploitation | `/dashboard/exploitation` | Exploit validation |
| Impact | `/dashboard/impact` | Impact assessments |
| Kill Switch | `/dashboard/kill-switch` | Emergency scan halt |
| Console | `/dashboard/console` | Interactive console |
| Integrations | `/dashboard/integrations` | External tool connections |
| Source Scanner | `/dashboard/source-scanner` | Source code analysis |
| Users | `/dashboard/users` | User management (admin) |
| Audit | `/dashboard/audit` | Audit log viewer |
| Settings | `/dashboard/settings` | Platform settings |

### 6.2 Key Components

| Component | Purpose |
|-----------|---------|
| `ProtectedRoute` | Auth guard for dashboard routes |
| `AuthContext` | React context for JWT auth state |
| `useWebSocket` | Hook for real-time scan progress |
| `NewScanModal` | Scan creation form |
| `BulkScanModal` | Multi-target scan form |
| `AttackChainGraph` | Kill chain visualization |
| `EvidenceGraph` | Evidence relationship graph |
| `ReconDashboard` | Recon session overview |
| `ExploitationControlPanel` | Exploit validation UI |
| `ImpactAssessmentView` | Impact scoring display |
| `KillSwitchControl` | Emergency halt UI |
| `StarCanvas` | Background animation |
| `CreateScheduleModal` | Scheduled scan creation |
| `TemplateUploadModal` | Template upload form |

### 6.3 Data Fetching

- **SWR** for client-side data caching and revalidation
- **`lib/api.ts`** — centralized API client with typed endpoints for all 15+ API modules
- **WebSocket** — real-time updates via `hooks/useWebSocket.ts`
- **Auth** — JWT in cookies with `credentials: 'include'`

---

## 7. All Dependencies

### 7.1 Python (`requirements.txt`)

| Package | Version | Purpose |
|---------|---------|---------|
| flask | 3.0.0 | REST API framework |
| flask-cors | 4.0.0 | CORS middleware |
| requests | 2.31.0 | HTTP client (Ollama API) |
| pyyaml | 6.0.1 | Config file parsing |
| python-dateutil | 2.8.2 | Date utilities |
| tqdm | 4.66.2 | CLI progress bars |
| pytest | 7.4.3 | Testing |
| pytest-cov | 4.1.0 | Coverage |
| black | 23.12.1 | Code formatting |
| flake8 | 7.0.0 | Linting |
| gunicorn | 21.2.0 | Production WSGI server |
| playwright | 1.40.0 | Screenshot capture |
| scrapegraphai | ≥1.73.0 | AI-powered web scraping |

### 7.2 Backend (`platform/backend/package.json`)

| Package | Purpose |
|---------|---------|
| @prisma/client | PostgreSQL ORM |
| express | HTTP framework |
| cors, helmet | Security middleware |
| jsonwebtoken | JWT auth |
| bcryptjs | Password hashing |
| zod | Request validation |
| winston | Structured logging |
| ws | WebSocket server |
| node-cron | Scheduled scan execution |
| nodemailer | Email notifications |
| pdfkit | PDF report generation |
| playwright | Screenshot capture |
| puppeteer | Alternative browser automation |
| axios | HTTP client |
| cookie-parser | Cookie handling |
| morgan | HTTP request logging |
| express-rate-limit | Rate limiting |
| js-yaml | YAML parsing |
| xml2js | XML parsing |
| dotenv | Environment variables |

### 7.3 Frontend (`platform/frontend/package.json`)

| Package | Purpose |
|---------|---------|
| next (14.x) | React framework (App Router) |
| react / react-dom (18.x) | UI library |
| tailwindcss | Utility CSS |
| @radix-ui/* | Accessible UI primitives (dialog, dropdown, tabs, toast, etc.) |
| framer-motion | Animations |
| recharts | Charts / graphs |
| swr | Data fetching + caching |
| lucide-react | Icon library |
| d3-force | Force-directed graph layouts |
| react-force-graph-2d | Network graph visualization |
| zod | Client-side validation |
| js-cookie | Cookie management |
| date-fns | Date formatting |
| sonner | Toast notifications |
| class-variance-authority + clsx + tailwind-merge | Styling utilities |

---

## 8. External Dependencies & Services

| Service | Required? | Connection | Purpose |
|---------|-----------|-----------|---------|
| **Nuclei** | Yes (for scanning) | Binary in PATH | Vulnerability scanner engine |
| **PostgreSQL 16+** | Yes (platform) | `DATABASE_URL` env var | Platform database |
| **Ollama** | Optional | `http://localhost:11434` | Local LLM for AI analysis |
| **Sublist3r** | Optional | CLI tool | Subdomain enumeration |
| **Nmap** | Optional | CLI tool | Port scanning in recon |
| **Feroxbuster** | Optional | CLI tool | Content discovery in recon |
| **Shodan API** | Optional | `SHODAN_API_KEY` env var | External exposure data |
| **SMTP server** | Optional | Nodemailer config | Email notifications |

---

## 9. Configuration Files

| File | Purpose |
|------|---------|
| `config/config.yaml` | CLI scanner settings (Nuclei path, Ollama URL, rate limits, timeouts) |
| `.env` | Root env vars (PostgreSQL, JWT, Ollama, network URLs) |
| `.env.production` | Production env template |
| `platform/backend/.env` | Backend-specific env (DATABASE_URL, JWT_SECRET, Shodan key) |
| `platform/frontend/.env.local` | Frontend env (NEXT_PUBLIC_API_URL) |
| `docker-compose.yml` | Production deployment (Caddy + Postgres + Backend + Frontend) |
| `docker-compose.dev.yml` | Development overrides |
| `docker-compose.local.yml` | Local network deployment with Cloudflare tunnel |
| `Caddyfile` | Reverse proxy routing rules |
| `platform/backend/tsconfig.json` | TypeScript config |
| `platform/frontend/tailwind.config.ts` | Tailwind CSS config |
| `pyproject.toml` | Python package config (spectra-scanner) |

---

## 10. Deployment Options

### Option A: Docker Compose (Production)

```bash
cp .env.production .env    # Edit with real secrets
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed  # optional
```

Services: Caddy (:80) → Frontend (:3000) + Backend (:5001) → PostgreSQL (:5432)

### Option B: Local Development

```bash
# Terminal 1: PostgreSQL (must be running)
# Terminal 2: Backend
cd platform/backend && npm install && npm run prisma:generate && npm run prisma:migrate && npm run dev
# Terminal 3: Frontend
cd platform/frontend && npm install && npm run dev
# Terminal 4: CLI (optional)
source venv/bin/activate && pip install -r requirements.txt
```

### Option C: Scripts

- `scripts/start-local.sh` — Starts all services locally
- `scripts/stop-local.sh` — Stops all services
- `scripts/start-docker.sh` — Docker-based startup
- `deploy.sh` — Production deployment script
- `local-host.sh` — Local network hosting with Cloudflare tunnel

---

## 11. Testing

| Test | Command | Location |
|------|---------|----------|
| Python unit tests | `pytest tests/ -v` | `tests/test_report_generator.py` |
| Backend service tests | `cd platform/backend && npm test` | `tests/scan-orchestrator.service.spec.ts` |
| Python formatting | `black src/` | — |
| Python linting | `flake8 src/` | — |
| Backend linting | `cd platform/backend && npm run lint` | — |
| Frontend linting | `cd platform/frontend && npm run lint` | — |

---

## 12. Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup.sh` | Initial project setup |
| `scripts/regenerate_report.py` | Re-generate reports from existing scans |
| `platform/backend/prisma/seed.ts` | Seeds test data into PostgreSQL |
| `platform/backend/scripts/fix-all-scan-counts.ts` | Recalculates scan vuln counts |
| `platform/backend/scripts/reprocess-scan-results.ts` | Re-processes raw scan output |
| `platform/backend/scripts/create-default-roe.ts` | Creates default rules of engagement |
| `platform/backend/scripts/reanalyze-info.ts` | Re-runs AI analysis on INFO vulns |

