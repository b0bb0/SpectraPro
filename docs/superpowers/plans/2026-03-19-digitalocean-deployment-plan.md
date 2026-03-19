# DigitalOcean Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all infrastructure files needed to deploy Spectra on a single DigitalOcean Droplet with automated CI/CD.

**Architecture:** Standalone `docker-compose.prod.yml` with Caddy on port 80, hardened bootstrap script for Ubuntu 24.04, and GitHub Actions pipeline with deploy/rollback/health-check. Configuration files only — no application code changes.

**Tech Stack:** Docker Compose, Caddy 2, GitHub Actions, Bash, UFW, fail2ban, autossh

**Spec:** `docs/superpowers/specs/2026-03-19-digitalocean-deployment-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `docker-compose.prod.yml` | Create | Standalone production Docker Compose — Caddy:80, no PG ports, resource limits, log rotation, host.docker.internal |
| `scripts/bootstrap-droplet.sh` | Create | One-time Droplet provisioning — Docker, UFW, fail2ban, swap, SSH hardening, GatewayPorts, repo clone |
| `.github/workflows/deploy.yml` | Create | CI/CD — lint, test, SSH deploy, pg_dump backup, health check, auto-rollback |
| `Caddyfile` | Modify (in Task 1) | Change `:3005` to `:80` — committed with docker-compose.prod.yml to avoid broken intermediate state |
| `platform/backend/Dockerfile` | Modify | Pin Nuclei to v3.7.1 |
| `.env.production` | Modify | Update `OLLAMA_API_URL` default to `http://host.docker.internal:11434` |

---

### Task 1: Create `docker-compose.prod.yml`

**Files:**
- Create: `docker-compose.prod.yml`

This is a standalone file modeled after `docker-compose.local.yml`. Key differences from `docker-compose.yml`: Caddy on port 80, PostgreSQL has no published ports, frontend build args from `.env`, backend has `extra_hosts` for Ollama tunnel, all services have resource limits and log rotation.

- [ ] **Step 1: Create `docker-compose.prod.yml`**

```yaml
# ── Spectra Platform — DigitalOcean Production ───────────────────────
# Standalone production config for a single Droplet deployment.
#
# Prerequisites:
#   1. Copy .env.production to .env and fill in real values
#   2. Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL to http://<droplet-ip>
#   3. Set FRONTEND_URL to http://<droplet-ip>
#
# Run:
#   docker compose -f docker-compose.prod.yml up -d --build
#   docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
# ─────────────────────────────────────────────────────────────────────

services:
  # ── Reverse Proxy ──────────────────────────────────────────────────
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - spectra
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ── PostgreSQL (internal only — no published ports) ────────────────
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-spectra_platform}
      POSTGRES_USER: ${POSTGRES_USER:-spectra}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-spectra} -d ${POSTGRES_DB:-spectra_platform}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - spectra
    deploy:
      resources:
        limits:
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ── Backend API ────────────────────────────────────────────────────
  backend:
    build:
      context: ./platform/backend
      dockerfile: Dockerfile
    restart: unless-stopped
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      NODE_ENV: production
      PORT: 5001
      DATABASE_URL: postgresql://${POSTGRES_USER:-spectra}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-spectra_platform}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-24h}
      FRONTEND_URL: ${FRONTEND_URL:?Set FRONTEND_URL in .env}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      OLLAMA_API_URL: ${OLLAMA_API_URL:-http://host.docker.internal:11434}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-}
      OLLAMA_TIMEOUT: ${OLLAMA_TIMEOUT:-120000}
      AI_ANALYSIS_ENABLED: ${AI_ANALYSIS_ENABLED:-false}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:5001/health || exit 1"]
      interval: 10s
      timeout: 5s
      start_period: 60s
      retries: 5
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - spectra
    deploy:
      resources:
        limits:
          memory: 1536M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ── Frontend ───────────────────────────────────────────────────────
  frontend:
    build:
      context: ./platform/frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?Set NEXT_PUBLIC_API_URL in .env}
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:?Set NEXT_PUBLIC_APP_URL in .env}
    restart: unless-stopped
    environment:
      NODE_ENV: production
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
    networks:
      - spectra
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  postgres_data:
  caddy_data:

networks:
  spectra:
    driver: bridge
```

- [ ] **Step 2: Validate the compose file**

Run: `docker compose -f docker-compose.prod.yml config --quiet 2>&1 || echo "INVALID"`
Expected: No output (valid YAML). If it complains about missing .env vars, that's expected — the `:?` syntax requires them at runtime.

- [ ] **Step 3: Modify `Caddyfile` — Change Listener to Port 80**

The Caddyfile must be updated in the same commit as the prod compose file to avoid a broken intermediate state (the base `docker-compose.yml` maps port 3005, so changing the Caddyfile alone would break it).

In `Caddyfile`, replace `:3005` with `:80` on line 6. Also update the header comment:

Old (line 1-6):
```
# ── Spectra Platform — Caddy Reverse Proxy ──────────────────────────
# HTTP-only config for local network deployment.
# No TLS — private IPs can't get Let's Encrypt certificates.
# ─────────────────────────────────────────────────────────────────────

:3005 {
```

New (line 1-6):
```
# ── Spectra Platform — Caddy Reverse Proxy ──────────────────────────
# HTTP-only config. To enable HTTPS, replace :80 with your domain name
# (e.g., spectrapro.ai) and Caddy will auto-provision Let's Encrypt certs.
# ─────────────────────────────────────────────────────────────────────

:80 {
```

All other directives remain unchanged.

- [ ] **Step 4: Commit both together**

```bash
git add docker-compose.prod.yml Caddyfile
git commit -m "feat: add production Docker Compose and update Caddy to port 80

Standalone docker-compose.prod.yml with Caddy on port 80, no published
PostgreSQL ports, resource limits, log rotation, host.docker.internal
for Ollama tunnel. Caddyfile updated to match."
```

---

### Task 2: Modify Backend Dockerfile — Pin Nuclei Version

**Files:**
- Modify: `platform/backend/Dockerfile` (lines 40-47: Nuclei install section)

- [ ] **Step 1: Pin Nuclei to v3.7.1**

In `platform/backend/Dockerfile`, replace the dynamic Nuclei install (lines 40-47) with a pinned version.

Old (lines 40-47):
```dockerfile
RUN apk add --no-cache wget unzip \
 && NUCLEI_VERSION=$(wget -qO- https://api.github.com/repos/projectdiscovery/nuclei/releases/latest | grep tag_name | cut -d'"' -f4 | tr -d v) \
 && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') \
 && wget -qO /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
 && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
 && rm /tmp/nuclei.zip \
 && chmod +x /usr/local/bin/nuclei \
 && apk del unzip
```

New:
```dockerfile
# Pin Nuclei version for reproducible builds (update explicitly when upgrading)
ENV NUCLEI_VERSION=3.7.1
RUN apk add --no-cache wget unzip \
 && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') \
 && wget -qO /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
 && unzip /tmp/nuclei.zip -d /usr/local/bin/ \
 && rm /tmp/nuclei.zip \
 && chmod +x /usr/local/bin/nuclei \
 && apk del unzip
```

- [ ] **Step 2: Commit**

```bash
git add platform/backend/Dockerfile
git commit -m "feat: pin Nuclei to v3.7.1 for reproducible Docker builds"
```

---

### Task 3: Update `.env.production` — Set OLLAMA_API_URL Default

**Files:**
- Modify: `.env.production` (line 33)

The spec requires `OLLAMA_API_URL` to default to `http://host.docker.internal:11434` for the autossh tunnel. Currently it's blank.

- [ ] **Step 1: Update OLLAMA_API_URL**

In `.env.production`, change line 33 from:
```
OLLAMA_API_URL=
```
to:
```
OLLAMA_API_URL=http://host.docker.internal:11434
```

- [ ] **Step 2: Commit**

```bash
git add .env.production
git commit -m "feat: set OLLAMA_API_URL default for Droplet Ollama tunnel"
```

---

### Task 4: Create `scripts/bootstrap-droplet.sh`

**Files:**
- Create: `scripts/bootstrap-droplet.sh`

This script runs once on a fresh Ubuntu 24.04 Droplet as root. It provisions everything needed to run the Spectra stack.

- [ ] **Step 1: Create the bootstrap script**

```bash
#!/usr/bin/env bash
# ── Spectra Platform — DigitalOcean Droplet Bootstrap ────────────────
# Run as root on a fresh Ubuntu 24.04 Droplet:
#   curl -sL <raw-github-url> | bash -s -- <your-ssh-public-key>
#
# Or copy to the Droplet and run:
#   chmod +x bootstrap-droplet.sh
#   sudo ./bootstrap-droplet.sh "<your-ssh-public-key>"
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Validate ─────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run this script as root (sudo)." >&2
  exit 1
fi

SSH_PUBKEY="${1:-}"
if [[ -z "$SSH_PUBKEY" ]]; then
  echo "Usage: $0 '<ssh-public-key>'" >&2
  echo "Example: $0 'ssh-ed25519 AAAA... user@host'" >&2
  exit 1
fi

REPO_URL="${2:-https://github.com/b0bb0/Migrate-spectrapro.git}"
DEPLOY_USER="deploy"
APP_DIR="/opt/spectra"

echo "══════════════════════════════════════════════════════════════"
echo "  Spectra Platform — Droplet Bootstrap"
echo "══════════════════════════════════════════════════════════════"

# ── 1. System updates ────────────────────────────────────────────────
echo "[1/13] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Create deploy user ───────────────────────────────────────────
echo "[2/13] Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEPLOY_USER
  chmod 440 /etc/sudoers.d/$DEPLOY_USER
fi

mkdir -p /home/$DEPLOY_USER/.ssh
echo "$SSH_PUBKEY" > /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# ── 3. SSH hardening ────────────────────────────────────────────────
echo "[3/13] Hardening SSH..."
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# ── 4. Enable GatewayPorts for Ollama SSH tunnel ────────────────────
echo "[4/13] Enabling GatewayPorts for Ollama tunnel..."
if ! grep -q "^GatewayPorts yes" /etc/ssh/sshd_config; then
  echo "" >> /etc/ssh/sshd_config
  echo "# Allow autossh reverse tunnels to bind to all interfaces (Ollama)" >> /etc/ssh/sshd_config
  echo "GatewayPorts yes" >> /etc/ssh/sshd_config
fi
systemctl restart sshd

# ── 5. UFW firewall ─────────────────────────────────────────────────
echo "[5/13] Configuring UFW firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS (future)"
ufw --force enable

# ── 6. Docker/UFW bypass fix ────────────────────────────────────────
echo "[6/13] Fixing Docker/UFW iptables bypass..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DOCKER_CONF'
{
  "iptables": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKER_CONF

# Add DOCKER-USER chain rules after Docker install (step 7)

# ── 7. Install Docker Engine ────────────────────────────────────────
echo "[7/13] Installing Docker Engine..."
apt-get install -y -qq ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

usermod -aG docker $DEPLOY_USER
systemctl enable docker
systemctl restart docker

# ── 8. Fail2ban ──────────────────────────────────────────────────────
echo "[8/13] Installing fail2ban..."
apt-get install -y -qq fail2ban
cat > /etc/fail2ban/jail.local <<'F2B'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 600
findtime = 600
F2B
systemctl enable fail2ban
systemctl restart fail2ban

# ── 9. Unattended upgrades ──────────────────────────────────────────
echo "[9/13] Enabling unattended security upgrades..."
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# ── 10. Swap (2GB) ──────────────────────────────────────────────────
echo "[10/13] Setting up 2GB swap..."
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# ── 11. Clone repo ──────────────────────────────────────────────────
echo "[11/13] Cloning Spectra repository..."
apt-get install -y -qq git
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R $DEPLOY_USER:$DEPLOY_USER "$APP_DIR"

# ── 12. Create backups directory ─────────────────────────────────────
echo "[12/13] Creating backups directory..."
mkdir -p "$APP_DIR/backups"
chown $DEPLOY_USER:$DEPLOY_USER "$APP_DIR/backups"

# ── 13. Final instructions ──────────────────────────────────────────
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Bootstrap complete!"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Droplet IP: $DROPLET_IP"
echo ""
echo "  Next steps (as the deploy user):"
echo ""
echo "  1. SSH in:  ssh $DEPLOY_USER@$DROPLET_IP"
echo ""
echo "  2. Create .env file:"
echo "     cd $APP_DIR"
echo "     cp .env.production .env"
echo "     nano .env"
echo "     # Set POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48)"
echo "     # Set NEXT_PUBLIC_API_URL=http://$DROPLET_IP"
echo "     # Set NEXT_PUBLIC_APP_URL=http://$DROPLET_IP"
echo "     # Set FRONTEND_URL=http://$DROPLET_IP"
echo "     chmod 600 .env"
echo ""
echo "  3. Start the stack:"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo "     docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy"
echo ""
echo "  4. Verify:  curl http://$DROPLET_IP/health"
echo ""
echo "  5. For Ollama AI (from your MacBook):"
echo "     autossh -M 0 -f -N -R 0.0.0.0:11434:localhost:11434 $DEPLOY_USER@$DROPLET_IP"
echo ""
echo "══════════════════════════════════════════════════════════════"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/bootstrap-droplet.sh`

- [ ] **Step 3: Validate with shellcheck (if available)**

Run: `shellcheck scripts/bootstrap-droplet.sh 2>&1 || echo "shellcheck not installed — skip"`
Expected: No errors (warnings about variable quoting are acceptable)

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-droplet.sh
git commit -m "feat: add Droplet bootstrap script for one-time provisioning

Installs Docker, UFW, fail2ban, swap, SSH hardening, GatewayPorts
for Ollama tunnel, and clones the repo to /opt/spectra."
```

---

### Task 5: Create `.github/workflows/deploy.yml`

**Files:**
- Create: `.github/workflows/deploy.yml`

GitHub Actions pipeline triggered on push to main. Runs lint + test, then SSHes into the Droplet to deploy.

- [ ] **Step 1: Create the workflow file**

```yaml
# ── Spectra Platform — CI/CD Deploy to DigitalOcean ──────────────────
name: Deploy to DigitalOcean

on:
  push:
    branches: [main]

  # Allow manual trigger
  workflow_dispatch:

env:
  APP_DIR: /opt/spectra
  COMPOSE_FILE: docker-compose.prod.yml

jobs:
  # ── Lint & Test ────────────────────────────────────────────────────
  test:
    name: Lint & Test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install backend dependencies
        working-directory: platform/backend
        run: npm ci

      - name: Lint backend
        working-directory: platform/backend
        run: npm run lint

      - name: Generate Prisma client
        working-directory: platform/backend
        run: npx prisma generate

      - name: Run backend tests
        working-directory: platform/backend
        run: npm test

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install Python linting tools
        run: pip install black flake8

      - name: Lint Python (black)
        run: black --check src/

      - name: Lint Python (flake8)
        run: flake8 src/

      - name: Install frontend dependencies
        working-directory: platform/frontend
        run: npm ci

      - name: Lint frontend
        working-directory: platform/frontend
        run: npm run lint

  # ── Deploy ─────────────────────────────────────────────────────────
  deploy:
    name: Deploy to Droplet
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: deploy
          key: ${{ secrets.DROPLET_SSH_KEY }}
          command_timeout: 15m
          script: |
            set -euo pipefail
            cd ${{ env.APP_DIR }}

            TIMESTAMP=$(date +%Y%m%d-%H%M%S)
            CURRENT_SHA=$(git rev-parse HEAD)

            echo "══ Pre-deploy backup ══════════════════════════════════════"
            # Tag current state for rollback
            git tag "pre-deploy-${TIMESTAMP}" || true

            # Load .env for DB credentials
            set -a; source .env; set +a
            PG_USER="${POSTGRES_USER:-spectra}"
            PG_DB="${POSTGRES_DB:-spectra_platform}"

            # Database backup
            mkdir -p backups
            docker compose -f ${{ env.COMPOSE_FILE }} exec -T postgres \
              pg_dump --clean --if-exists -U "$PG_USER" "$PG_DB" \
              > "backups/pre-deploy-${TIMESTAMP}.sql" 2>/dev/null || echo "WARN: No running database to backup (first deploy?)"

            echo "══ Pulling latest code ═══════════════════════════════════"
            git fetch origin main
            git reset --hard origin/main

            echo "══ Building containers ═══════════════════════════════════"
            docker compose -f ${{ env.COMPOSE_FILE }} build

            echo "══ Starting services ════════════════════════════════════"
            docker compose -f ${{ env.COMPOSE_FILE }} up -d

            echo "══ Running migrations ═══════════════════════════════════"
            # Wait for postgres to be healthy
            sleep 5
            docker compose -f ${{ env.COMPOSE_FILE }} exec -T backend \
              npx prisma migrate deploy

            echo "══ Health check ═════════════════════════════════════════"
            HEALTHY=false
            for i in $(seq 1 6); do
              if curl -sf http://localhost/health > /dev/null 2>&1; then
                HEALTHY=true
                break
              fi
              echo "  Health check attempt $i/6 failed, waiting 10s..."
              sleep 10
            done

            if [ "$HEALTHY" = false ]; then
              echo "══ HEALTH CHECK FAILED — ROLLING BACK ═════════════════"

              # Restore database
              if [ -f "backups/pre-deploy-${TIMESTAMP}.sql" ]; then
                docker compose -f ${{ env.COMPOSE_FILE }} exec -T postgres \
                  psql -U "$PG_USER" "$PG_DB" \
                  < "backups/pre-deploy-${TIMESTAMP}.sql" || echo "WARN: DB restore failed"
              fi

              # Rollback code
              git checkout "pre-deploy-${TIMESTAMP}"
              docker compose -f ${{ env.COMPOSE_FILE }} build
              docker compose -f ${{ env.COMPOSE_FILE }} up -d

              echo "ROLLBACK COMPLETE — deployed commit: $(git rev-parse HEAD)"
              exit 1
            fi

            echo "══ Verifying migrations ═════════════════════════════════"
            docker compose -f ${{ env.COMPOSE_FILE }} exec -T backend \
              npx prisma migrate status

            echo "══ Deploy successful ════════════════════════════════════"
            echo "Commit: $(git rev-parse HEAD)"
            echo "Time: $(date -u)"

            # Clean up old backups (keep last 10)
            ls -1t backups/*.sql 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "VALID" || echo "INVALID"`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions CI/CD pipeline for DigitalOcean deploy

Runs lint + tests on push to main, then SSHes into Droplet to deploy.
Includes pg_dump backup, health check, and auto-rollback on failure."
```

---

### Task 6: Validate and Push

- [ ] **Step 1: Run docker compose config validation**

Run: `docker compose -f docker-compose.prod.yml config --quiet 2>&1; echo "Exit: $?"`
Expected: Exit 0 or only warnings about unset env vars (the `:?` syntax is intentional)

- [ ] **Step 2: Verify all new files exist**

Run:
```bash
for f in docker-compose.prod.yml scripts/bootstrap-droplet.sh .github/workflows/deploy.yml; do
  [ -f "$f" ] && echo "OK: $f" || echo "MISSING: $f"
done
```
Expected: All OK

- [ ] **Step 3: Verify modifications**

Run:
```bash
grep ':80 {' Caddyfile && echo "OK: Caddyfile port 80"
grep 'NUCLEI_VERSION=3.7.1' platform/backend/Dockerfile && echo "OK: Nuclei pinned"
grep 'NEXT_PUBLIC_API_URL' .env.production && echo "OK: .env.production has build args"
```
Expected: All three OK

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

---

## Post-Implementation: Droplet Setup Checklist

After the code is pushed, the user must:

1. **Create a DigitalOcean Droplet**: Ubuntu 24.04, 4GB/2vCPU, Amsterdam region
2. **Run bootstrap**: SSH in as root, run `scripts/bootstrap-droplet.sh "<ssh-pubkey>"`
3. **Configure .env**: SSH as `deploy`, edit `/opt/spectra/.env` with real secrets and Droplet IP
4. **Start stack**: `docker compose -f docker-compose.prod.yml up -d --build`
5. **Run migrations**: `docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy`
6. **Add GitHub Secrets**: `DROPLET_IP`, `DROPLET_SSH_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`
7. **Verify**: `curl http://<droplet-ip>/health`
8. **DNS**: Point domain to Droplet IP at Loopia
9. **Ollama** (optional): Run autossh from MacBook
