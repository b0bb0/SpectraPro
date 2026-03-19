# SpectraPRO — Deployment Guide

Complete instructions for deploying SpectraPRO on a new server or your MacBook.

## Contents

1. [Docker Deployment (Recommended)](#docker-deployment)
2. [Local Development Deployment](#local-development-deployment)
3. [Configuration](#configuration)
4. [Database Setup](#database-setup)
5. [First Run Checklist](#first-run-checklist)
6. [Troubleshooting](#troubleshooting)

---

## Docker Deployment

### Prerequisites

- **Docker** 20.10+ ([install](https://docs.docker.com/install/))
- **Docker Compose** 2.0+ ([install](https://docs.docker.com/compose/install/))
- **PostgreSQL** 15+ (or use the Docker container)
- 2GB RAM minimum, 4GB+ recommended

### Quick Start (3 steps)

```bash
# 1. Prepare environment
cp .env.production .env
# Edit .env with your secrets:
#   - POSTGRES_PASSWORD: strong random password
#   - JWT_SECRET: run `openssl rand -base64 48`
nano .env

# 2. Build and start
docker compose up -d --build

# 3. Initialize database
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed  # Optional: seed test data
```

The platform will be available at `http://localhost` on your MacBook or `http://<server-ip>` on a remote server.

### What Gets Deployed

```
Docker Compose services:
├── caddy          → Reverse proxy on :80 (routes /api/* to backend, rest to frontend)
├── postgres       → PostgreSQL database on :5432 (internal network only)
├── backend        → Express.js API on :5001 (internal network only)
└── frontend       → Next.js app on :3000 (internal network only)
```

### Logs

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Stopping & Restarting

```bash
# Stop all services
docker compose down

# Stop but preserve volumes (database data persists)
docker compose down -v

# Restart services
docker compose restart

# Full rebuild (if Dockerfiles change)
docker compose up -d --build
```

---

## Local Development Deployment

For running on your MacBook without Docker containers.

### Prerequisites

- **Node.js** 20+ ([install](https://nodejs.org/))
- **PostgreSQL** 15+ ([brew install postgresql@15](https://formulae.brew.sh/formula/postgresql))
- **Nuclei** scanner (optional, for scanning features)
- **Ollama** (optional, for AI analysis)

### Step-by-Step

#### 1. Start PostgreSQL

```bash
# Start PostgreSQL service
brew services start postgresql@15

# Create database and user (run once)
createuser -P spectra  # Creates user "spectra" (prompted for password)
createdb -O spectra spectra_platform
```

#### 2. Configure environment

```bash
# Copy and edit env file
cp .env.production .env

# Edit .env:
# Set DATABASE_URL to your local PostgreSQL:
DATABASE_URL="postgresql://spectra:YOUR_PASSWORD@localhost:5432/spectra_platform"

# Generate JWT_SECRET:
# openssl rand -base64 48
# Paste into .env as JWT_SECRET=...
```

#### 3. Run backend

```bash
cd platform/backend

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations (sets up database schema)
npm run prisma:migrate

# Optional: seed test data
npm run prisma:seed

# Start dev server (on :5001)
npm run dev

# In a separate terminal, to run production build:
npm run build
npm run start
```

#### 4. Run frontend (separate terminal)

```bash
cd platform/frontend

# Install dependencies
npm install

# Start dev server (on :3003, NODE_ENV is set in package.json)
npm run dev

# Or production build:
npm run build
npm run start   # Will run on :3000
```

#### 5. Access the app

- **Frontend**: http://localhost:3003 (dev) or http://localhost:3000 (production)
- **Backend API**: http://localhost:5001
- **Database GUI**: `npm run prisma:studio` (http://localhost:5555)

---

## Configuration

### Environment Variables

Key variables in `.env`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `POSTGRES_PASSWORD` | DB password | `randomStrongPassword123!` |
| `JWT_SECRET` | API auth secret | `base64string...` (from openssl) |
| `JWT_EXPIRES_IN` | Token lifetime | `24h` |
| `LOG_LEVEL` | Logging verbosity | `info`, `debug`, `warn` |
| `NEXT_PUBLIC_API_URL` | Frontend API endpoint | `http://localhost:5001` or `http://server-ip` |
| `NEXT_PUBLIC_APP_URL` | Frontend app URL | `http://localhost` or `http://server-ip` |
| `OLLAMA_API_URL` | AI analysis (optional) | `http://localhost:11434` |
| `OLLAMA_MODEL` | LLM model name (optional) | `llama2`, `neural-chat` |
| `AI_ANALYSIS_ENABLED` | Enable AI analysis | `true` or `false` |

### Port Configuration

- **Caddy (reverse proxy)**: 80 (change in `Caddyfile`)
- **PostgreSQL**: 5432 (Docker internal only, not exposed)
- **Backend**: 5001 (Docker internal only, not exposed)
- **Frontend**: 3000 (Docker internal only, not exposed)

Users access everything through port 80 → Caddy routes to internal services.

---

## Database Setup

### Prisma Migrations

Migrations are pre-created in `platform/prisma/migrations/`. To apply them:

```bash
# Docker
docker compose exec backend npx prisma migrate deploy

# Local
cd platform/backend
npm run prisma:migrate
```

### Seeding Test Data

```bash
# Docker
docker compose exec backend npx prisma db seed

# Local
cd platform/backend
npm run prisma:seed
```

### Reset Database (⚠️ deletes all data)

```bash
# Docker
docker compose exec backend npx prisma migrate reset

# Local
cd platform/backend
npm run prisma:migrate -- --create-only  # Then manually drop schema
```

### Database GUI

Interactive database explorer:

```bash
# Docker
docker compose exec backend npx prisma studio

# Local
cd platform/backend
npm run prisma:studio
# Opens: http://localhost:5555
```

---

## First Run Checklist

After deploying, verify the system is working:

### ✓ Frontend loads

```bash
curl http://localhost/
# Should return HTML (or redirect if using Docker)
```

### ✓ Backend API responds

```bash
curl http://localhost/api/health
# Should return: {"status":"ok"}
```

### ✓ Database is accessible

```bash
# Docker
docker compose exec postgres psql -U spectra -d spectra_platform -c "SELECT COUNT(*) FROM \"User\";"

# Local
psql -U spectra -d spectra_platform -c "SELECT COUNT(*) FROM \"User\";"
```

### ✓ Create first user

1. Open `http://localhost/register` in browser
2. Fill out registration form
3. Verify email confirmation (if enabled)
4. Login at `http://localhost/login`

### ✓ Run a scan (if Nuclei is installed)

```bash
# Backend CLI
cd src
python src/spectra_cli.py scan https://example.com
```

---

## Troubleshooting

### Docker Issues

#### Port already in use

```bash
# Find and kill process on port 80
lsof -i :80
kill -9 <PID>

# Or change port in docker-compose.yml
# Change: ports: - "8080:80"
```

#### Container won't start

```bash
# Check logs
docker compose logs backend

# Rebuild without cache
docker compose down
docker compose up -d --build --no-cache
```

#### Database connection fails

```bash
# Verify DATABASE_URL in .env
echo $DATABASE_URL

# Check PostgreSQL is running
docker compose ps postgres

# Try connecting directly
docker compose exec postgres psql -U spectra -d spectra_platform
```

### Local Deployment Issues

#### "Module not found" errors

```bash
# Reinstall dependencies and regenerate Prisma
cd platform/backend
rm -rf node_modules package-lock.json
npm install
npm run prisma:generate
npm run build
```

#### Port 5001 or 3000 in use

```bash
# Find process
lsof -i :5001
lsof -i :3000

# Kill and restart
kill -9 <PID>
npm run dev  # Restart
```

#### PostgreSQL won't start

```bash
# Check if service is running
brew services list | grep postgresql

# Restart service
brew services restart postgresql@15

# Check data directory permissions
ls -la /usr/local/var/postgres
```

#### "NEXT_PUBLIC_API_URL is undefined"

Next.js requires build-time env vars. Make sure `.env` is present before building:

```bash
cp .env.production .env
# Edit .env with real values
npm run build  # Must happen AFTER .env is set
```

---

## Upgrading

### Backend code

```bash
# Docker
docker compose down
# Pull new code / update files
docker compose up -d --build

# Local
cd platform/backend
git pull  # or manually update files
npm install
npm run build
npm run start
```

### Database schema

```bash
# Docker
docker compose exec backend npx prisma migrate deploy

# Local
cd platform/backend
npm run prisma:migrate deploy
```

---

## Security Notes

- **Change default passwords**: Update `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env` before first run
- **HTTPS in production**: Add Let's Encrypt certs to Caddy when deploying publicly:
  ```
  example.com {
    tls your-email@example.com
    # ... rest of Caddyfile
  }
  ```
- **Network isolation**: Docker services are isolated by default. Only Caddy (port 80) is exposed.
- **Rate limiting**: Backend has built-in rate limiting. Configure in backend code if needed.

---

## Support

For issues or questions:

1. Check **Troubleshooting** section above
2. Review service logs: `docker compose logs -f`
3. Check backend TypeScript types: `npm run build` (catches type errors)
4. Run database checks: `npx prisma studio`

