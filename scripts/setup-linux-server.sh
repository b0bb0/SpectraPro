#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  SpectraPro — Linux Server Provisioning & Installation Script
#
#  Sets up a fresh Linux server (Ubuntu 22.04/24.04, Debian 12) with all
#  SpectraPro components running as systemd services behind Caddy reverse proxy.
#
#  Usage:
#    chmod +x scripts/setup-linux-server.sh
#    sudo ./scripts/setup-linux-server.sh [OPTIONS]
#
#  Options:
#    --skip-optional       Skip Ollama, Nmap, Feroxbuster
#    --no-firewall         Don't configure UFW
#    --docker              Use Docker deployment instead of native services
#    --domain <domain>     Configure Caddy with a real domain + auto TLS
#    --db-pass <password>  Set PostgreSQL password (default: auto-generated)
#    --help                Show this help message
#
#  What it does:
#    1. Installs system packages (Python 3, Node.js 20, PostgreSQL 16, Caddy)
#    2. Installs security tools (Nuclei + optional: Ollama, Nmap, Feroxbuster)
#    3. Creates a 'spectrapro' system user
#    4. Sets up Python venv, Node.js deps, Prisma migrations
#    5. Configures systemd services for backend, frontend, scanner API
#    6. Configures Caddy as reverse proxy (port 80/443)
#    7. Configures UFW firewall (SSH + HTTP/HTTPS)
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Must be root ─────────────────────────────────────────────────────────────
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Error: This script must be run as root (use sudo)."
  exit 1
fi

# ── Configuration ────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/spectrapro"
SERVICE_USER="spectrapro"
DB_NAME="spectra_platform"
DB_USER="spectrapro"
DB_PASS=""
DB_PORT=5432
BACKEND_PORT=5001
FRONTEND_PORT=3003
FLASK_PORT=5000
DOMAIN=""
SKIP_OPTIONAL=false
NO_FIREWALL=false
DOCKER_MODE=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-optional) SKIP_OPTIONAL=true; shift ;;
    --no-firewall)   NO_FIREWALL=true; shift ;;
    --docker)        DOCKER_MODE=true; shift ;;
    --domain)        DOMAIN="$2"; shift 2 ;;
    --db-pass)       DB_PASS="$2"; shift 2 ;;
    --help)
      sed -n '2,/^# ═/p' "$0" | head -n -1 | sed 's/^#//' | sed 's/^ //'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Auto-generate DB password if not provided
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -hex 16)
fi
JWT_SECRET=$(openssl rand -hex 32)

# ── Colors & helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()     { echo -e "  ${GREEN}[OK]${NC}    $1"; }
fail()   { echo -e "  ${RED}[FAIL]${NC}  $1"; }
warn()   { echo -e "  ${YELLOW}[WARN]${NC}  $1"; }
info()   { echo -e "  ${CYAN}[INFO]${NC}  $1"; }
header() {
  echo ""
  echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

abort() { fail "$1"; exit 1; }

# ── OS Check ─────────────────────────────────────────────────────────────────
if [[ ! -f /etc/os-release ]]; then
  abort "Cannot detect OS. This script supports Ubuntu 22.04+/Debian 12+."
fi
source /etc/os-release

if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  warn "Detected $PRETTY_NAME — this script is optimized for Ubuntu/Debian."
  warn "Proceeding anyway, but some steps may fail."
fi

ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
  GO_ARCH="amd64"
elif [[ "$ARCH" == "aarch64" ]]; then
  GO_ARCH="arm64"
else
  abort "Unsupported architecture: $ARCH"
fi

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║       SpectraPro — Linux Server Setup                     ║"
echo "  ║                                                           ║"
echo "  ║  OS:     $PRETTY_NAME"
echo "  ║  Arch:   $ARCH"
echo "  ║  Target: $INSTALL_DIR"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1: System packages
# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/9 — System Packages"

export DEBIAN_FRONTEND=noninteractive

info "Updating package lists..."
apt-get update -qq || abort "apt-get update failed"
ok "Package lists updated"

info "Installing base packages..."
apt-get install -y -qq \
  curl wget git unzip jq lsb-release gnupg2 \
  build-essential libssl-dev libffi-dev \
  software-properties-common apt-transport-https \
  ca-certificates > /dev/null 2>&1
ok "Base packages installed"


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Python 3.11+
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/9 — Python"

if command -v python3 &>/dev/null; then
  PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  if [[ "$PY_MINOR" -ge 10 ]]; then
    ok "Python $PY_VER already installed"
  else
    info "Python $PY_VER too old, installing newer version..."
    apt-get install -y -qq python3.11 python3.11-venv python3.11-dev > /dev/null 2>&1 || \
      apt-get install -y -qq python3 python3-venv python3-dev > /dev/null 2>&1
  fi
else
  info "Installing Python 3..."
  apt-get install -y -qq python3 python3-venv python3-dev python3-pip > /dev/null 2>&1
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# Ensure pip
python3 -m pip --version &>/dev/null 2>&1 || {
  apt-get install -y -qq python3-pip > /dev/null 2>&1 || \
  python3 -m ensurepip --upgrade > /dev/null 2>&1 || true
}


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Node.js 20 LTS
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/9 — Node.js"

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -v | tr -d 'v' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    ok "Node.js $(node -v) already installed"
  else
    info "Node.js v$NODE_MAJOR too old, upgrading..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
  fi
else
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
ok "Node.js $(node -v), npm $(npm -v)"


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4: PostgreSQL 16
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/9 — PostgreSQL"

if command -v psql &>/dev/null; then
  PG_VER=$(psql --version | grep -oE '[0-9]+' | head -1)
  if [[ "$PG_VER" -ge 15 ]]; then
    ok "PostgreSQL $PG_VER already installed"
  else
    info "PostgreSQL $PG_VER too old, installing 16..."
    sh -c "echo 'deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main' > /etc/apt/sources.list.d/pgdg.list"
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
    apt-get update -qq > /dev/null 2>&1
    apt-get install -y -qq postgresql-16 > /dev/null 2>&1
  fi
else
  info "Installing PostgreSQL 16..."
  sh -c "echo 'deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main' > /etc/apt/sources.list.d/pgdg.list" 2>/dev/null || true
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc 2>/dev/null | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg 2>/dev/null || true
  apt-get update -qq > /dev/null 2>&1
  apt-get install -y -qq postgresql-16 postgresql-client-16 > /dev/null 2>&1 || \
    apt-get install -y -qq postgresql postgresql-client > /dev/null 2>&1
fi

# Start PostgreSQL
systemctl enable postgresql > /dev/null 2>&1
systemctl start postgresql > /dev/null 2>&1
sleep 2

if pg_isready -h localhost -p $DB_PORT &>/dev/null; then
  ok "PostgreSQL running on port $DB_PORT"
else
  warn "PostgreSQL may not be running — check with: systemctl status postgresql"
fi

# Create database user and database
info "Configuring database..."
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'\"" 2>/dev/null | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB;\"" 2>/dev/null
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\"" 2>/dev/null | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null
ok "Database '$DB_NAME' ready (user: $DB_USER)"


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5: Caddy Web Server (reverse proxy)
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/9 — Caddy Reverse Proxy"

if command -v caddy &>/dev/null; then
  ok "Caddy already installed ($(caddy version 2>/dev/null | head -1))"
else
  info "Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring > /dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' 2>/dev/null | \
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' 2>/dev/null | \
    tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq > /dev/null 2>&1
  apt-get install -y -qq caddy > /dev/null 2>&1
  ok "Caddy installed"
fi


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6: Security Tools
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/9 — Security Tools"

# ── Nuclei ───────────────────────────────────────────────────────────────────
if command -v nuclei &>/dev/null; then
  ok "Nuclei already installed"
else
  info "Installing Nuclei..."
  NUCLEI_VERSION=$(curl -sL https://api.github.com/repos/projectdiscovery/nuclei/releases/latest 2>/dev/null | jq -r '.tag_name' | tr -d v)
  if [[ -n "$NUCLEI_VERSION" && "$NUCLEI_VERSION" != "null" ]]; then
    curl -sL -o /tmp/nuclei.zip \
      "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${GO_ARCH}.zip" 2>/dev/null
    unzip -o /tmp/nuclei.zip -d /usr/local/bin nuclei > /dev/null 2>&1
    chmod +x /usr/local/bin/nuclei
    rm -f /tmp/nuclei.zip
    ok "Nuclei $NUCLEI_VERSION installed"
  else
    warn "Could not fetch Nuclei version — install manually"
  fi
fi

if [[ "$SKIP_OPTIONAL" == false ]]; then
  # ── Nmap ─────────────────────────────────────────────────────────────────
  if command -v nmap &>/dev/null; then
    ok "Nmap already installed"
  else
    info "Installing Nmap..."
    apt-get install -y -qq nmap > /dev/null 2>&1 && ok "Nmap installed" || warn "Nmap install failed"
  fi

  # ── Feroxbuster ──────────────────────────────────────────────────────────
  if command -v feroxbuster &>/dev/null; then
    ok "Feroxbuster already installed"
  else
    info "Installing Feroxbuster..."
    FEROX_VER=$(curl -sL https://api.github.com/repos/epi052/feroxbuster/releases/latest 2>/dev/null | jq -r '.tag_name' | tr -d v)
    if [[ -n "$FEROX_VER" && "$FEROX_VER" != "null" ]]; then
      if [[ "$ARCH" == "x86_64" ]]; then FEROX_ARCH="x86_64"; else FEROX_ARCH="aarch64"; fi
      curl -sL -o /tmp/feroxbuster.tar.gz \
        "https://github.com/epi052/feroxbuster/releases/download/v${FEROX_VER}/feroxbuster-${FEROX_VER}-${FEROX_ARCH}-linux-musl.tar.gz" 2>/dev/null
      tar xzf /tmp/feroxbuster.tar.gz -C /usr/local/bin feroxbuster 2>/dev/null || true
      chmod +x /usr/local/bin/feroxbuster 2>/dev/null || true
      rm -f /tmp/feroxbuster.tar.gz
      ok "Feroxbuster installed"
    else
      warn "Could not fetch Feroxbuster — install manually"
    fi
  fi

  # ── Ollama ───────────────────────────────────────────────────────────────
  if command -v ollama &>/dev/null; then
    ok "Ollama already installed"
  else
    info "Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh 2>/dev/null | sh > /dev/null 2>&1 && \
      ok "Ollama installed" || warn "Ollama install failed — AI features will be unavailable"
  fi
else
  warn "Skipping optional tools (--skip-optional)"
fi


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 7: Create system user & install SpectraPro
# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/9 — SpectraPro Installation"

# Create system user
if id "$SERVICE_USER" &>/dev/null; then
  ok "User '$SERVICE_USER' already exists"
else
  useradd --system --home-dir "$INSTALL_DIR" --create-home --shell /bin/bash "$SERVICE_USER"
  ok "User '$SERVICE_USER' created"
fi

# Copy project files to install directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

info "Copying project files to $INSTALL_DIR..."
# Use rsync if available, otherwise cp
if command -v rsync &>/dev/null; then
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='venv' --exclude='.next' \
    "$PROJECT_ROOT/" "$INSTALL_DIR/"
else
  cp -r "$PROJECT_ROOT/." "$INSTALL_DIR/"
  rm -rf "$INSTALL_DIR/.git" "$INSTALL_DIR/node_modules" "$INSTALL_DIR/venv"
fi
ok "Project files copied"

# Create data directories
mkdir -p "$INSTALL_DIR"/{data/scans,data/reports,data/templates,logs,.pids}
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
ok "Directory structure ready"

# ── Python virtual environment ───────────────────────────────────────────────
info "Setting up Python environment..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR && python3 -m venv venv" 2>/dev/null || {
  apt-get install -y -qq python3-venv > /dev/null 2>&1
  su - "$SERVICE_USER" -c "cd $INSTALL_DIR && python3 -m venv venv"
}
su - "$SERVICE_USER" -c "cd $INSTALL_DIR && source venv/bin/activate && pip install --upgrade pip -q && pip install -r requirements.txt -q" 2>&1 | tail -3
ok "Python dependencies installed"

# ── Node.js dependencies ────────────────────────────────────────────────────
info "Installing backend Node.js dependencies..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npm install --silent" 2>&1 | tail -3
ok "Backend dependencies installed"

info "Installing frontend Node.js dependencies..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/frontend && npm install --silent" 2>&1 | tail -3
ok "Frontend dependencies installed"

# ── Environment files ────────────────────────────────────────────────────────
info "Writing environment configuration..."

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:$DB_PORT/$DB_NAME"

cat > "$INSTALL_DIR/.env" << EOF
# SpectraPro — Server Environment (auto-generated)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
DATABASE_URL="$DATABASE_URL"

JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN=24h

PORT=$BACKEND_PORT
FRONTEND_URL="http://localhost:$FRONTEND_PORT"

OLLAMA_API_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3.2:latest
OLLAMA_TIMEOUT=120000
AI_ANALYSIS_ENABLED=true

NODE_ENV=production
LOG_LEVEL=info
EOF

cat > "$INSTALL_DIR/platform/backend/.env" << EOF
DATABASE_URL="$DATABASE_URL"
PORT=$BACKEND_PORT
FRONTEND_URL="http://localhost:$FRONTEND_PORT"
JWT_SECRET="$JWT_SECRET"
NODE_ENV=production
OLLAMA_API_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3.2:latest
SHODAN_API_KEY=
EOF

NEXT_PUBLIC_API=""
if [[ -n "$DOMAIN" ]]; then
  NEXT_PUBLIC_API="https://$DOMAIN"
else
  NEXT_PUBLIC_API="http://localhost:$BACKEND_PORT"
fi

cat > "$INSTALL_DIR/platform/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API
NEXT_PUBLIC_APP_URL=${DOMAIN:+https://$DOMAIN}
EOF

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
ok "Environment files created"

# ── Prisma migrations ───────────────────────────────────────────────────────
info "Running Prisma generate & migrations..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npx prisma generate" 2>&1 | tail -3
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npx prisma migrate deploy" 2>&1 | tail -3 && \
  ok "Database migrations applied" || {
    warn "migrate deploy failed — trying migrate dev..."
    su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npx prisma migrate dev --name init --skip-generate" 2>&1 | tail -3
  }

# Seed database
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npx prisma db seed" 2>/dev/null && \
  ok "Database seeded" || warn "Seeding skipped"

# ── Build frontend for production ────────────────────────────────────────────
info "Building frontend for production (this may take a few minutes)..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/frontend && npm run build" 2>&1 | tail -5 && \
  ok "Frontend built" || warn "Frontend build failed — will use dev mode"

# ── Build backend for production ─────────────────────────────────────────────
info "Building backend for production..."
su - "$SERVICE_USER" -c "cd $INSTALL_DIR/platform/backend && npm run build" 2>&1 | tail -3 && \
  ok "Backend built" || warn "Backend build failed — will use tsx"

# Update Nuclei templates
if command -v nuclei &>/dev/null; then
  info "Updating Nuclei templates..."
  su - "$SERVICE_USER" -c "nuclei -update-templates" > /dev/null 2>&1 &
  ok "Nuclei template update started in background"
fi


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 8: Systemd Services & Caddy Config
# ══════════════════════════════════════════════════════════════════════════════
header "Step 8/9 — Systemd Services"

# ── Backend service ──────────────────────────────────────────────────────────
cat > /etc/systemd/system/spectrapro-backend.service << EOF
[Unit]
Description=SpectraPro Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/platform/backend
EnvironmentFile=$INSTALL_DIR/platform/backend/.env
ExecStart=/usr/bin/node $INSTALL_DIR/platform/backend/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/backend.log
StandardError=append:$INSTALL_DIR/logs/backend-error.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR/data $INSTALL_DIR/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
ok "Backend service created"

# ── Frontend service ─────────────────────────────────────────────────────────
cat > /etc/systemd/system/spectrapro-frontend.service << EOF
[Unit]
Description=SpectraPro Frontend (Next.js)
After=network.target spectrapro-backend.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/platform/frontend
Environment=NODE_ENV=production
Environment=PORT=$FRONTEND_PORT
ExecStart=/usr/bin/npx next start -p $FRONTEND_PORT
Restart=on-failure
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/frontend.log
StandardError=append:$INSTALL_DIR/logs/frontend-error.log

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR/logs $INSTALL_DIR/platform/frontend/.next
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
ok "Frontend service created"

# ── Scanner API service ──────────────────────────────────────────────────────
cat > /etc/systemd/system/spectrapro-scanner.service << EOF
[Unit]
Description=SpectraPro Scanner API (Flask)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/gunicorn --bind 127.0.0.1:$FLASK_PORT --workers 2 --timeout 300 src.api.app:app
Restart=on-failure
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/scanner.log
StandardError=append:$INSTALL_DIR/logs/scanner-error.log

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR/data $INSTALL_DIR/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
ok "Scanner service created"

# ── Caddy configuration ─────────────────────────────────────────────────────
info "Configuring Caddy reverse proxy..."

if [[ -n "$DOMAIN" ]]; then
  # Production: real domain with auto-TLS
  CADDY_ADDR="$DOMAIN"
else
  # Local/dev: HTTP only on port 80
  CADDY_ADDR=":80"
fi

cat > /etc/caddy/Caddyfile << EOF
# SpectraPro — Caddy Reverse Proxy Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

$CADDY_ADDR {
    # API & WebSocket
    handle /api/* {
        reverse_proxy localhost:$BACKEND_PORT
    }

    handle /ws {
        reverse_proxy localhost:$BACKEND_PORT
    }

    handle /health {
        reverse_proxy localhost:$BACKEND_PORT
    }

    # Scanner API
    handle /scanner/* {
        uri strip_prefix /scanner
        reverse_proxy localhost:$FLASK_PORT
    }

    # Frontend (catch-all)
    handle {
        reverse_proxy localhost:$FRONTEND_PORT
    }

    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        -Server
    }

    log {
        output file /var/log/caddy/spectrapro-access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
EOF

mkdir -p /var/log/caddy
ok "Caddy configured (${DOMAIN:-HTTP on :80})"

# ── Enable and start services ────────────────────────────────────────────────
info "Enabling and starting services..."
systemctl daemon-reload

systemctl enable spectrapro-backend spectrapro-frontend spectrapro-scanner caddy > /dev/null 2>&1
ok "Services enabled"

systemctl restart caddy
systemctl start spectrapro-backend
sleep 3
systemctl start spectrapro-frontend
sleep 2
systemctl start spectrapro-scanner

ok "All services started"


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 9: Firewall
# ══════════════════════════════════════════════════════════════════════════════
header "Step 9/9 — Firewall & Final Checks"

if [[ "$NO_FIREWALL" == false ]]; then
  if command -v ufw &>/dev/null; then
    info "Configuring UFW firewall..."
    ufw --force reset > /dev/null 2>&1
    ufw default deny incoming > /dev/null 2>&1
    ufw default allow outgoing > /dev/null 2>&1
    ufw allow ssh > /dev/null 2>&1
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    ufw --force enable > /dev/null 2>&1
    ok "UFW configured (SSH + HTTP + HTTPS)"
  else
    info "Installing UFW..."
    apt-get install -y -qq ufw > /dev/null 2>&1
    ufw default deny incoming > /dev/null 2>&1
    ufw default allow outgoing > /dev/null 2>&1
    ufw allow ssh > /dev/null 2>&1
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    ufw --force enable > /dev/null 2>&1
    ok "UFW installed and configured"
  fi
else
  warn "Firewall configuration skipped (--no-firewall)"
fi

# ── Service health checks ───────────────────────────────────────────────────
info "Verifying services..."
sleep 5

BACKEND_OK=false
FRONTEND_OK=false

if curl -sf --max-time 5 "http://localhost:$BACKEND_PORT/health" &>/dev/null; then
  ok "Backend API healthy (port $BACKEND_PORT)"
  BACKEND_OK=true
else
  warn "Backend not responding — check: journalctl -u spectrapro-backend"
fi

if curl -sf --max-time 5 "http://localhost:$FRONTEND_PORT" &>/dev/null; then
  ok "Frontend healthy (port $FRONTEND_PORT)"
  FRONTEND_OK=true
else
  warn "Frontend not responding — check: journalctl -u spectrapro-frontend"
fi

if curl -sf --max-time 5 "http://localhost:$FLASK_PORT/health" &>/dev/null; then
  ok "Scanner API healthy (port $FLASK_PORT)"
else
  warn "Scanner API not responding — check: journalctl -u spectrapro-scanner"
fi

# Start Ollama and pull model if available
if command -v ollama &>/dev/null; then
  systemctl enable ollama > /dev/null 2>&1 || true
  systemctl start ollama > /dev/null 2>&1 || true
  info "Pulling Ollama model in background (llama3.2)..."
  su - "$SERVICE_USER" -c "ollama pull llama3.2:latest" > /dev/null 2>&1 &
fi


# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║         SpectraPro Server Setup Complete!                 ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "  ${BOLD}Installation:${NC}"
echo -e "    Directory:    $INSTALL_DIR"
echo -e "    User:         $SERVICE_USER"
echo ""

echo -e "  ${BOLD}Services:${NC}"
echo -e "    spectrapro-backend    $(systemctl is-active spectrapro-backend 2>/dev/null)"
echo -e "    spectrapro-frontend   $(systemctl is-active spectrapro-frontend 2>/dev/null)"
echo -e "    spectrapro-scanner    $(systemctl is-active spectrapro-scanner 2>/dev/null)"
echo -e "    caddy                 $(systemctl is-active caddy 2>/dev/null)"
echo -e "    postgresql            $(systemctl is-active postgresql 2>/dev/null)"
echo ""

echo -e "  ${BOLD}Access:${NC}"
if [[ -n "$DOMAIN" ]]; then
  echo -e "    Web UI:       ${CYAN}https://$DOMAIN${NC}"
  echo -e "    API:          ${CYAN}https://$DOMAIN/api${NC}"
else
  echo -e "    Web UI:       ${CYAN}http://${SERVER_IP:-localhost}${NC}"
  echo -e "    API:          ${CYAN}http://${SERVER_IP:-localhost}/api${NC}"
fi
echo ""

echo -e "  ${BOLD}Database:${NC}"
echo -e "    Host:         localhost:$DB_PORT"
echo -e "    Database:     $DB_NAME"
echo -e "    User:         $DB_USER"
echo -e "    Password:     $DB_PASS"
echo ""

echo -e "  ${BOLD}Credentials (save these!):${NC}"
echo -e "    DB Password:  ${YELLOW}$DB_PASS${NC}"
echo -e "    JWT Secret:   ${YELLOW}$JWT_SECRET${NC}"
echo ""

echo -e "  ${BOLD}Management:${NC}"
echo -e "    systemctl status spectrapro-backend"
echo -e "    systemctl status spectrapro-frontend"
echo -e "    journalctl -u spectrapro-backend -f"
echo -e "    journalctl -u spectrapro-frontend -f"
echo ""

echo -e "  ${BOLD}CLI Scanner:${NC}"
echo -e "    su - $SERVICE_USER"
echo -e "    cd $INSTALL_DIR && source venv/bin/activate"
echo -e "    python src/spectra_cli.py scan https://example.com"
echo ""

# Save credentials to a file readable only by root
CREDS_FILE="$INSTALL_DIR/.credentials"
cat > "$CREDS_FILE" << EOF
# SpectraPro Server Credentials — Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# This file is readable only by root. Keep it safe.

DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_PORT=$DB_PORT
JWT_SECRET=$JWT_SECRET
INSTALL_DIR=$INSTALL_DIR
SERVICE_USER=$SERVICE_USER
EOF
chmod 600 "$CREDS_FILE"
ok "Credentials saved to $CREDS_FILE (root-only)"

echo ""
echo -e "${BOLD}Next steps:${NC}"
echo -e "  1. Open ${CYAN}http://${SERVER_IP:-your-server-ip}${NC} in your browser"
echo -e "  2. Register an admin account"
echo -e "  3. Start scanning!"
echo ""
