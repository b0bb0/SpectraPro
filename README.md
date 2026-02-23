# SpectraPRO — Enterprise Vulnerability Management Platform

**A complete, production-ready AI-powered penetration testing and vulnerability management platform.**

## 🚀 What's Included

This deployment package contains everything needed to run SpectraPRO on any server:

### Platform Components

1. **Web UI (Next.js 14)**
   - Modern React-based admin dashboard
   - Real-time scan monitoring via WebSocket
   - Cosmic deep-space theme
   - Responsive design for desktop/tablet
   - User authentication with JWT

2. **Backend API (Express.js + TypeScript)**
   - RESTful API with comprehensive endpoints
   - Multi-tenant support with role-based access
   - Database ORM (Prisma) with PostgreSQL
   - WebSocket support for real-time updates
   - Integrated scan orchestration

3. **CLI Scanner (Python)**
   - `spectra_cli.py` — Command-line vulnerability scanner
   - Nuclei integration for template-based scanning
   - Local SQLite database for scan results
   - Multi-format report generation (JSON, HTML, Markdown)

### Deployment Methods

- **🐳 Docker Compose** (recommended) — Single command deployment
- **🍎 Local MacBook** — Development deployment without containers

## 📖 Quick Start

Choose your deployment method:

### Docker (3 minutes)

```bash
cp .env.production .env
nano .env          # Edit with your database password
./scripts/start-docker.sh
```

**Access:** http://localhost

### Local MacBook (5 minutes)

```bash
cp .env.production .env
nano .env          # Edit database connection
./scripts/start-local.sh
```

**Access:** http://localhost:3003

👉 **Full instructions in [QUICKSTART.md](./QUICKSTART.md)**

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [QUICKSTART.md](./QUICKSTART.md) | **→ Start here!** Quick 10-minute setup |
| [DEPLOY.md](./DEPLOY.md) | Complete deployment guide with troubleshooting |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | Verification of all deployment components |

## 🏗️ Architecture

```
┌─────────────────────┐
│   Your Browser      │
│  http://localhost   │
└──────────┬──────────┘
           │
      ┌────v────────┐
      │ Caddy (80)  │
      │ Reverse     │
      │ Proxy       │
      └────┬────────┘
    ┌──────┼──────────┐
    │      │          │
    v      v          v
  Backend Frontend  WebSocket
  :5001   :3000     :5001
    │      │
    └──────┼──────────┐
           │          │
           v          v
      PostgreSQL   Files
```

## 🔧 Configuration

### Environment Variables

Create `.env` from `.env.production` template:

```bash
cp .env.production .env
nano .env
```

Key variables:
- `POSTGRES_PASSWORD` — Database password (generate: `openssl rand -base64 32`)
- `JWT_SECRET` — API authentication secret (generate: `openssl rand -base64 48`)
- `NEXT_PUBLIC_API_URL` — Frontend API endpoint (default: `http://localhost:5001`)
- `OLLAMA_API_URL` — Optional AI analysis server (e.g., `http://localhost:11434`)

See [DEPLOY.md](./DEPLOY.md#configuration) for complete reference.

## 🗂️ Directory Structure

```
NewFolder/
├── README.md                 ← You are here
├── QUICKSTART.md            ← Start here for 10-min setup
├── DEPLOY.md                ← Detailed deployment guide
├── DEPLOYMENT_CHECKLIST.md  ← Verification checklist
├── docker-compose.yml       ← Docker Compose configuration
├── Caddyfile                ← HTTP reverse proxy config
├── .env.production          ← Environment template
├── scripts/
│   ├── start-docker.sh      ← Start with Docker
│   ├── start-local.sh       ← Start on MacBook
│   └── stop-local.sh        ← Stop local services
├── platform/
│   ├── backend/             ← Express.js API
│   │   ├── Dockerfile       ← Multi-stage build
│   │   ├── .dockerignore
│   │   ├── src/             ← TypeScript source
│   │   ├── prisma/          ← Database schema & migrations
│   │   └── package.json
│   └── frontend/            ← Next.js 14 app
│       ├── Dockerfile       ← Multi-stage build
│       ├── .dockerignore
│       ├── app/             ← Next.js App Router
│       ├── components/      ← React components
│       ├── lib/             ← Utilities & API client
│       └── package.json
└── src/                     ← Python CLI scanner
    ├── spectra_cli.py       ← Main CLI entry point
    ├── core/                ← Scanner logic
    ├── config/              ← Configuration
    ├── requirements.txt     ← Python dependencies
    └── venv/                ← Python virtual environment
```

## 🎯 Features

### Web Dashboard
- **Executive Dashboard** — Risk metrics, severity trends, asset overview
- **Vulnerability Management** — Browse, filter, prioritize findings
- **Scan Management** — Create, schedule, monitor scans
- **Multi-Tenant** — Support for multiple organizations/teams
- **Real-Time Updates** — WebSocket-based live scan progress
- **Role-Based Access** — ADMIN, ANALYST, VIEWER roles
- **Dark Theme** — Cosmic deep-space UI with gold/purple accent colors

### Backend API
- **RESTful API** — Comprehensive endpoint coverage
- **Authentication** — JWT-based with refresh tokens
- **Multi-Tenancy** — Automatic tenant isolation
- **WebSocket** — Real-time scan progress and notifications
- **Rate Limiting** — Built-in DDoS/brute-force protection
- **Logging** — Winston structured logging with configurable levels
- **Health Checks** — Kubernetes/Docker-ready health endpoints

### CLI Scanner
- **Nuclei Integration** — Template-based vulnerability scanning
- **Parallel Processing** — Multi-threaded target scanning
- **AI Analysis** — Optional Llama 2 analysis with Ollama
- **Report Generation** — JSON, HTML, Markdown formats
- **Batch Scanning** — Scan multiple targets from file
- **Local Database** — SQLite for scan result history
- **Caching** — Intelligent caching of Nuclei results

## 🚀 Deployment Checklist

After running the startup script, verify:

- [ ] Frontend loads at http://localhost
- [ ] Backend API responds at http://localhost/api/health
- [ ] Can register a new user account
- [ ] Dashboard displays correctly
- [ ] WebSocket connection works (try creating a scan)

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for complete verification steps.

## 🔐 Security

- **Multi-Tenant Isolation** — Every database query includes tenant filtering
- **Authentication** — JWT tokens with configurable expiration
- **Authorization** — Role-based access control (RBAC)
- **Rate Limiting** — 100 req/min per IP by default
- **Security Headers** — X-Frame-Options, CSP, etc. via Caddy
- **Password Hashing** — bcryptjs with salt rounds
- **Secrets Management** — Environment variables for all sensitive data
- **Network Isolation** — Docker services on internal network only

## 📊 Technologies

### Frontend
- **Framework:** Next.js 14 with App Router
- **UI:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts for data visualization
- **Animations:** Framer Motion for smooth transitions
- **State:** SWR for data fetching and caching

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL 15+ with Prisma ORM
- **Real-Time:** WebSocket via `ws` library
- **Authentication:** JWT via jsonwebtoken
- **Logging:** Winston with structured logs
- **Validation:** Zod for request schemas

### CLI Scanner
- **Language:** Python 3.9+
- **Scanning:** Nuclei (subprocess execution)
- **AI:** Ollama HTTP API (optional)
- **Storage:** SQLite local database
- **Reporting:** Jinja2 templates for HTML/Markdown

## 🆘 Troubleshooting

### "Port already in use"
```bash
# Docker: remove old containers
docker-compose down && docker system prune -a

# Local: kill existing processes
lsof -i :5001 | tail -1 | awk '{print $2}' | xargs kill -9
```

### "Database connection failed"
See [DEPLOY.md#troubleshooting](./DEPLOY.md#troubleshooting) for database issues.

### "Build failed"
```bash
# Rebuild without cache
docker-compose down -v
docker-compose up -d --build --no-cache
```

## 📖 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** — 10-minute setup guide
- **[DEPLOY.md](./DEPLOY.md)** — Complete deployment documentation
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** — Pre-deployment verification
- **[CLAUDE.md](./CLAUDE.md)** — Development instructions for Claude AI

## 🔄 Updates & Maintenance

### Updating the application
```bash
# Stop services
docker-compose down

# Pull new code (or manually update files)

# Rebuild and restart
docker-compose up -d --build
```

### Database backups
```bash
# PostgreSQL backup
docker-compose exec postgres pg_dump -U spectra spectra_platform > backup.sql

# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U spectra spectra_platform
```

## 📝 License & Attribution

SpectraPRO — Enterprise Vulnerability Management Platform
Built with: Next.js, Express.js, PostgreSQL, Nuclei, Prisma, Tailwind CSS

## 🎓 Getting Help

1. **Check the docs** → [QUICKSTART.md](./QUICKSTART.md)
2. **Review troubleshooting** → [DEPLOY.md#troubleshooting](./DEPLOY.md#troubleshooting)
3. **View logs** → `docker-compose logs -f` or `tail -f logs/backend.log`
4. **Database GUI** → `npm run prisma:studio` (http://localhost:5555)

---

**Ready to deploy? → [QUICKSTART.md](./QUICKSTART.md)**
