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
                                          |        PostgreSQL:5432 (internal only)
                                          |             |
                                     reverse proxy   Prisma ORM

[MacBook] --autossh tunnel--> [Droplet 0.0.0.0:11434] --> Docker host-gateway --> Backend container
```

### Components

| Component | Details |
|-----------|---------|
| **Droplet** | 4GB RAM / 2 vCPU / 80GB SSD, Ubuntu 24.04 LTS, ~$24/mo |
| **Region** | `ams3` (Amsterdam) or closest to user |
| **Caddy** | Reverse proxy on port 80, routes `/api/*` and `/ws` to backend, catch-all to frontend |
| **PostgreSQL 16** | Containerized, internal network only, **no published ports** |
| **Backend** | Express.js + Prisma + Nuclei scanner, port 5001 internal |
| **Frontend** | Next.js 14 standalone, port 3000 internal |
| **Ollama** | Remote on MacBook via `autossh` persistent SSH tunnel, accessible to containers via `host.docker.internal` |
| **CI/CD** | GitHub Actions: lint, test, SSH deploy, health check, auto-rollback with DB backup |

---

## Droplet Provisioning (One-Time Bootstrap)

The `scripts/bootstrap-droplet.sh` script provisions a fresh Ubuntu 24.04 Droplet:

1. **Create `deploy` user** with sudo, SSH key auth
2. **Install Docker Engine** + Docker Compose v2
3. **Configure UFW firewall**: allow 22 (SSH), 80 (HTTP), 443 (HTTPS future)
4. **Fix Docker/UFW bypass**: Configure `/etc/docker/daemon.json` with `"iptables": false` and set up `DOCKER_OPTS` to prevent Docker from bypassing UFW iptables rules. This ensures UFW is the sole traffic gatekeeper.
5. **Set up 2GB swap** as memory safety net
6. **Install fail2ban** for SSH brute-force protection
7. **Enable unattended-upgrades** for automatic security patches
8. **Disable password login** and root SSH access
9. **Enable `GatewayPorts yes`** in `/etc/ssh/sshd_config` so the autossh reverse tunnel binds to `0.0.0.0:11434` (reachable from Docker containers), then restart sshd
10. **Clone repo** to `/opt/spectra`
11. **Create `.env`** with production secrets (including `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `FRONTEND_URL`)
12. **Start stack**: `docker compose -f docker-compose.prod.yml up -d`
13. **Run migrations**: `docker compose exec -T backend npx prisma migrate deploy`

### SSH Hardening

- Key-only authentication
- Root login disabled
- Password login disabled
- Fail2ban: ban after 5 failed attempts for 10 minutes
- `GatewayPorts yes` (required for Ollama tunnel — scoped to the deploy user if possible)

---

## Docker Compose Production Configuration

**`docker-compose.prod.yml` is a standalone file** (not a merge/override of the base `docker-compose.yml`). This avoids Docker Compose sequence-merge pitfalls with ports and build args. It is modeled after `docker-compose.local.yml` which follows the same standalone pattern.

### Key Differences from Base

1. **Caddy port**: `"80:80"` (not `3005:3005`)
2. **Frontend build args**: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL` sourced from `.env` file
3. **PostgreSQL**: No `ports:` mapping — internal Docker network only (prevents accidental internet exposure)
4. **Backend extra_hosts**: `host.docker.internal:host-gateway` so the backend can reach the Ollama tunnel on the Droplet host
5. **All services**: `restart: unless-stopped`
6. **All services**: Docker json-file log driver with rotation

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

### Frontend Build Args

The frontend `NEXT_PUBLIC_*` variables are **baked at Docker build time** (not runtime). The `docker-compose.prod.yml` must source them from the `.env` file:

```yaml
frontend:
  build:
    context: ./platform/frontend
    args:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
```

**Important**: When transitioning from HTTP to HTTPS, these values must be updated in `.env` and the frontend image must be rebuilt. The browser makes requests to these URLs directly, so protocol matters for CORS.

---

## Caddy Configuration

The only change to `Caddyfile` is replacing `:3005` with `:80` in the listener directive. All routing rules (`/api/*`, `/ws`, `/health` to backend, catch-all to frontend), security headers, and logging configuration remain identical.

When SSL is needed later, replace `:80` with `spectrapro.ai` and Caddy auto-provisions Let's Encrypt certificates. **When switching to HTTPS, also update**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, and `FRONTEND_URL` in `.env`, then rebuild the frontend image.

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
- **Database backup**: `docker compose exec -T postgres pg_dump --clean --if-exists -U spectra spectra_platform > /opt/spectra/backups/pre-deploy-<timestamp>.sql`
- `git pull origin main`
- `docker compose -f docker-compose.prod.yml build`
- `docker compose -f docker-compose.prod.yml up -d`
- `docker compose exec -T backend npx prisma migrate deploy`

#### 3. Health Check & Migration Verification
- Curl `http://<droplet-ip>/health` with 60s timeout, retry 5 times at 10s intervals
- **Verify migrations applied**: `docker compose exec -T backend npx prisma migrate status` — fail pipeline if unapplied migrations remain
- If both pass: deployment succeeds

#### 4. Auto-Rollback (on health check or migration failure)
- **Restore database** (backup includes `DROP TABLE` statements via `--clean`): `docker compose exec -T postgres psql -U spectra spectra_platform < /opt/spectra/backups/pre-deploy-<timestamp>.sql`
- `git checkout <pre-deploy tag>`
- Rebuild and restart containers
- Notify via GitHub Actions annotation
- **Note**: If rollback itself fails, the pipeline alerts and requires manual intervention

### Nuclei Binary Pinning

The backend Dockerfile downloads the latest Nuclei release from GitHub at build time. To avoid non-reproducible builds and GitHub API rate limits on the Droplet:

- **Pin a specific Nuclei version** in the Dockerfile: `ENV NUCLEI_VERSION=v3.x.y`
- Update the pinned version explicitly when upgrading Nuclei

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `DROPLET_SSH_KEY` | Private SSH key for `deploy` user |
| `DROPLET_IP` | Droplet IP address |
| `POSTGRES_PASSWORD` | Production database password |
| `JWT_SECRET` | Production JWT signing secret |

### Environment Variables on Droplet `.env`

The `.env` file on the Droplet must also contain the frontend build args and CORS URL. These are **not** GitHub Secrets — they live on the Droplet and are read by `docker compose` at build/run time:

```env
NEXT_PUBLIC_API_URL=http://<droplet-ip>
NEXT_PUBLIC_APP_URL=http://<droplet-ip>
FRONTEND_URL=http://<droplet-ip>
```

---

## Ollama Remote Connection

### Setup

MacBook runs Ollama locally on port 11434. An `autossh` persistent tunnel forwards this to the Droplet, binding to `0.0.0.0` so Docker containers can reach it.

### Prerequisites on Droplet

The bootstrap script must set `GatewayPorts yes` in `/etc/ssh/sshd_config` so the reverse tunnel binds to all interfaces (not just `127.0.0.1`). Without this, the tunnel is only reachable from the Droplet host itself, not from inside Docker containers.

### From MacBook

```bash
autossh -M 0 -f -N -R 0.0.0.0:11434:localhost:11434 deploy@<droplet-ip> \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3
```

Recommended: set up as a macOS LaunchAgent for persistence across reboots.

### Docker Container Access

The backend container reaches Ollama via `host.docker.internal`, which resolves to the Docker host IP. This is configured in `docker-compose.prod.yml`:

```yaml
backend:
  extra_hosts:
    - "host.docker.internal:host-gateway"
  environment:
    OLLAMA_API_URL: http://host.docker.internal:11434
```

### Fallback Behavior

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

# Frontend Build Args (baked at Docker build time)
NEXT_PUBLIC_API_URL=http://<droplet-ip>
NEXT_PUBLIC_APP_URL=http://<droplet-ip>

# Backend CORS
FRONTEND_URL=http://<droplet-ip>

# AI Analysis (via autossh tunnel from MacBook)
OLLAMA_API_URL=http://host.docker.internal:11434
OLLAMA_MODEL=mannix/llama3.1-8b-abliterated
OLLAMA_TIMEOUT=120000
AI_ANALYSIS_ENABLED=true
```

This file lives only on the Droplet at `/opt/spectra/.env` with `chmod 600`. Never committed to git.

**CORS gotcha**: `FRONTEND_URL` must **exactly match** the `Origin` header the browser sends. During the IP-only phase (before DNS is configured), use `http://<droplet-ip>`. Only switch to `http://spectrapro.ai` after DNS resolves to the Droplet. Any mismatch (trailing slash, wrong port, domain before DNS propagates) causes CORS 403 on all API calls with no fallback — the Droplet's public IP is not a private RFC-1918 address, so the backend's private-network regex does not apply.

**SSL transition checklist**: When adding HTTPS, update `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, and `FRONTEND_URL` from `http://` to `https://spectrapro.ai`, then rebuild the frontend image.

---

## Files to Create

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD pipeline |
| `scripts/bootstrap-droplet.sh` | One-time Droplet provisioning script |
| `docker-compose.prod.yml` | Standalone production Docker Compose (not an override) |

## Files to Modify

| File | Change |
|------|--------|
| `Caddyfile` | Listen on `:80` instead of `:3005` |
| `.env.production` | Add `OLLAMA_API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `FRONTEND_URL` |
| `platform/backend/Dockerfile` | Pin Nuclei version (`ENV NUCLEI_VERSION=v3.x.y`) |

## No Changes Required

- Backend application code
- Frontend application code
- Frontend Dockerfile
- Scanner/Nuclei code
- Prisma schema

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Docker bypasses UFW** | Set `"iptables": false` in Docker daemon config; only Caddy publishes ports |
| **Migration rollback** | Pre-deploy `pg_dump` backup; restore on failure |
| **Ollama tunnel drops** | `autossh` auto-reconnects; backend falls back to basic analysis |
| **Nuclei download fails during build** | Pinned version avoids API rate limits; cached Docker layers reduce rebuilds |
| **Frontend baked with wrong URL** | Build args sourced from `.env`; SSL transition checklist documented |
| **CORS mismatch on SSL transition** | `FRONTEND_URL` update included in SSL checklist |

---

## Future Enhancements (Not In Scope)

- **SSL/TLS**: Change Caddy config from `:80` to `spectrapro.ai`, Caddy auto-provisions Let's Encrypt. Update `.env` URLs to `https://`.
- **Container Registry**: Push images to GitHub Container Registry or DigitalOcean CR in CI, pull on Droplet instead of building there (faster, reproducible deploys)
- **Managed PostgreSQL**: Migrate to DigitalOcean Managed Database for automated backups/HA
- **Cloud AI**: Replace MacBook Ollama with cloud API (Claude, OpenAI) for reliability
- **Monitoring**: Add Prometheus + Grafana or DigitalOcean monitoring
- **Backups**: Automated scheduled PostgreSQL backup to DigitalOcean Spaces
