# Spectra Platform — DigitalOcean Droplet Deployment

## Overview

Deploy the Spectra penetration testing platform on a single DigitalOcean Droplet with automated CI/CD via GitHub Actions. Replaces the current MacBook + Cloudflare Tunnel setup with a dedicated server.

## Goals

- Production-grade single-server deployment
- Automated deploy on push to `main` via GitHub Actions
- Remote Ollama AI analysis via SSH tunnel to MacBook
- HTTP-only initially, SSL added later via Caddy
- DNS managed externally at Loopia

## Non-Goals

- High availability / multi-server
- Managed database (using containerized PostgreSQL)
- GPU compute for AI (using remote Ollama)
- SSL/TLS (deferred — HTTP-only to start)

---

## Architecture

```
[GitHub] --push to main--> [GitHub Actions] --SSH--> [DigitalOcean Droplet]
                                                        |
                                          +-------------+-------------+
                                          |             |             |
                                        Caddy:80   Backend:5001  Frontend:3000
                                          |             |
                                          |        PostgreSQL:5432
                                          |             |
                                     reverse proxy   Prisma ORM

[MacBook] --autossh tunnel--> [Droplet localhost:11434] --> Ollama AI Analysis
```

### Components

| Component | Details |
|-----------|---------|
| **Droplet** | 4GB RAM / 2 vCPU / 80GB SSD, Ubuntu 24.04 LTS, ~$24/mo |
| **Region** | `ams3` (Amsterdam) or closest to user |
| **Caddy** | Reverse proxy on port 80, routes `/api/*` and `/ws` to backend, catch-all to frontend |
| **PostgreSQL 16** | Containerized, data persisted via Docker volume |
| **Backend** | Express.js + Prisma + Nuclei scanner, port 5001 internal |
| **Frontend** | Next.js 14 standalone, port 3000 internal |
| **Ollama** | Remote on MacBook via `autossh` persistent SSH tunnel to localhost:11434 |
| **CI/CD** | GitHub Actions: lint, test, SSH deploy, health check, auto-rollback |

---

## Droplet Provisioning (One-Time Bootstrap)

The `scripts/bootstrap-droplet.sh` script provisions a fresh Ubuntu 24.04 Droplet:

1. **Create `deploy` user** with sudo, SSH key auth
2. **Install Docker Engine** + Docker Compose v2
3. **Configure UFW firewall**: allow 22 (SSH), 80 (HTTP), 443 (HTTPS future)
4. **Set up 2GB swap** as memory safety net
5. **Install fail2ban** for SSH brute-force protection
6. **Enable unattended-upgrades** for automatic security patches
7. **Disable password login** and root SSH access
8. **Clone repo** to `/opt/spectra`
9. **Create `.env`** with production secrets
10. **Start stack**: `docker compose -f docker-compose.prod.yml up -d`
11. **Run migrations**: `docker compose exec -T backend npx prisma migrate deploy`

### SSH Hardening

- Key-only authentication
- Root login disabled
- Password login disabled
- Fail2ban: ban after 5 failed attempts for 10 minutes

---

## Docker Compose Production Overrides

New file `docker-compose.prod.yml` extends the base `docker-compose.yml` with:

### Restart Policies

All services: `restart: unless-stopped` to survive Droplet reboots.

### Resource Limits

| Service | Memory Limit |
|---------|-------------|
| PostgreSQL | 1GB |
| Backend | 1.5GB |
| Frontend | 512MB |
| Caddy | 256MB |

### Logging

All services use Docker json-file driver with rotation:
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### Port Change

Caddy listens on port 80 (changed from 3005).

---

## Caddy Configuration

Updated `Caddyfile` to listen on `:80`:

```
:80 {
    # /api/* -> backend
    # /ws -> backend (WebSocket)
    # /health -> backend
    # /* -> frontend
    # Security headers retained
}
```

When SSL is needed later, replace `:80` with `spectrapro.ai` and Caddy auto-provisions Let's Encrypt certificates.

---

## GitHub Actions CI/CD Pipeline

**File**: `.github/workflows/deploy.yml`
**Trigger**: Push to `main` branch

### Pipeline Steps

#### 1. Build & Test (GitHub-hosted runner)
- Lint Python (`black --check`, `flake8`)
- Lint TypeScript (`npm run lint` for backend and frontend)
- Run backend tests (`npm test`)
- Build Docker images (verify compilation)

#### 2. Deploy (SSH to Droplet)
- SSH using deploy key from GitHub Secrets
- Tag current commit as `pre-deploy-<timestamp>` for rollback
- `git pull origin main`
- `docker compose -f docker-compose.prod.yml build`
- `docker compose -f docker-compose.prod.yml up -d`
- `docker compose exec -T backend npx prisma migrate deploy`

#### 3. Health Check
- Curl `http://<droplet-ip>/health` with 60s timeout
- Retry 5 times with 10s intervals
- If healthy: deployment succeeds

#### 4. Auto-Rollback (on health check failure)
- `git checkout <pre-deploy tag>`
- Rebuild and restart containers
- Notify via GitHub Actions annotation

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `DROPLET_SSH_KEY` | Private SSH key for `deploy` user |
| `DROPLET_IP` | Droplet IP address |
| `POSTGRES_PASSWORD` | Production database password |
| `JWT_SECRET` | Production JWT signing secret |

---

## Ollama Remote Connection

### Setup

MacBook runs Ollama locally on port 11434. An `autossh` persistent tunnel forwards this to the Droplet.

### From MacBook

```bash
autossh -M 0 -f -N -R 11434:localhost:11434 deploy@<droplet-ip> \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3
```

Recommended: set up as a macOS LaunchAgent for persistence across reboots.

### Backend Configuration

```env
OLLAMA_API_URL=http://localhost:11434
AI_ANALYSIS_ENABLED=true
```

The backend already has fallback logic — if Ollama is unreachable, it falls back to basic analysis without AI. This means the platform works regardless of whether the MacBook tunnel is active.

---

## Environment Variables (.env on Droplet)

```env
# PostgreSQL
POSTGRES_DB=spectra_platform
POSTGRES_USER=spectra
POSTGRES_PASSWORD=<strong-generated-password>

# JWT Auth
JWT_SECRET=<strong-generated-secret>
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=info

# AI Analysis
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=mannix/llama3.1-8b-abliterated
OLLAMA_TIMEOUT=120000
AI_ANALYSIS_ENABLED=true
```

This file lives only on the Droplet at `/opt/spectra/.env` with `chmod 600`. Never committed to git.

---

## Files to Create

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD pipeline |
| `scripts/bootstrap-droplet.sh` | One-time Droplet provisioning script |
| `docker-compose.prod.yml` | Production Docker Compose overrides |

## Files to Modify

| File | Change |
|------|--------|
| `Caddyfile` | Listen on `:80` instead of `:3005` |
| `.env.production` | Add `OLLAMA_API_URL` for remote Ollama |

## No Changes Required

- Backend application code
- Frontend application code
- Scanner/Nuclei code
- Prisma schema
- Dockerfiles

---

## Future Enhancements (Not In Scope)

- **SSL/TLS**: Change Caddy config from `:80` to `spectrapro.ai`, Caddy auto-provisions Let's Encrypt
- **Managed PostgreSQL**: Migrate to DigitalOcean Managed Database for backups/HA
- **Cloud AI**: Replace MacBook Ollama with cloud API (Claude, OpenAI) for reliability
- **Monitoring**: Add Prometheus + Grafana or DigitalOcean monitoring
- **Backups**: Automated PostgreSQL backup to DigitalOcean Spaces
