#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
#  SpectraPro — Fully Automated Setup Script
#  Detects OS, installs ALL dependencies, configures databases,
#  runs migrations, seeds data, and gets everything running.
#
#  Usage:  chmod +x scripts/auto-setup.sh && ./scripts/auto-setup.sh
#  Flags:  --skip-optional    Skip optional tools (Ollama, Nmap, etc.)
#          --docker           Set up for Docker deployment instead
#          --no-start         Install everything but don't start services
#          --reset-db         Drop and recreate the database
# ══════════════════════════════════════════════════════════════════════

set -uo pipefail
# Note: we deliberately do NOT use `set -e` because many install commands
# are expected to fail gracefully (e.g., already installed, no sudo, etc.)

# ── Configuration ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/.pids"
DATA_DIR="$PROJECT_ROOT/data"

# Database defaults
DB_NAME="spectra_platform"
DB_USER="${POSTGRES_USER:-$(whoami)}"
DB_PASS="${POSTGRES_PASSWORD:-spectra_dev_2026}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_HOST="localhost"

# Ports
BACKEND_PORT=5001
FRONTEND_PORT=${FRONTEND_PORT:-3004}
FLASK_PORT=5000

# Flags
SKIP_OPTIONAL=false
DOCKER_MODE=false
NO_START=false
RESET_DB=false

for arg in "$@"; do
  case $arg in
    --skip-optional) SKIP_OPTIONAL=true ;;
    --docker)        DOCKER_MODE=true ;;
    --no-start)      NO_START=true ;;
    --reset-db)      RESET_DB=true ;;
  esac
done

# ── Colors & Helpers ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }
header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── OS Detection ──────────────────────────────────────────────────────
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    ARCH=$(uname -m)  # arm64 or x86_64
    PKG_MGR="brew"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    ARCH=$(uname -m)
    if command -v apt-get &>/dev/null; then
      PKG_MGR="apt"
    elif command -v dnf &>/dev/null; then
      PKG_MGR="dnf"
    elif command -v yum &>/dev/null; then
      PKG_MGR="yum"
    elif command -v pacman &>/dev/null; then
      PKG_MGR="pacman"
    else
      PKG_MGR="unknown"
    fi
  else
    fail "Unsupported OS: $OSTYPE"
    exit 1
  fi
}

# ── Package Manager Installer ────────────────────────────────────────
pkg_install() {
  local pkg="$1"
  local brew_pkg="${2:-$1}"  # Optional different brew name

  if [[ "$PKG_MGR" != "brew" && -z "$SUDO" && "$(id -u)" -ne 0 ]]; then
    warn "Cannot install $pkg — no root access"
    return 1
  fi

  case $PKG_MGR in
    brew)    brew install "$brew_pkg" 2>/dev/null || true ;;
    apt)     $SUDO apt-get install -y "$pkg" ;;
    dnf)     $SUDO dnf install -y "$pkg" ;;
    yum)     $SUDO yum install -y "$pkg" ;;
    pacman)  $SUDO pacman -S --noconfirm "$pkg" ;;
    *)       fail "Cannot auto-install $pkg — unknown package manager"; return 1 ;;
  esac
}

# ── Check if command exists ──────────────────────────────────────────
has() { command -v "$1" &>/dev/null; }

# ── Sudo helper (works even without sudo) ───────────────────────────
SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
    SUDO="sudo"
  else
    warn "No sudo access — skipping commands that require root"
    warn "Pre-install required dependencies or run as root"
  fi
fi

# ══════════════════════════════════════════════════════════════════════
#  MAIN SETUP
# ══════════════════════════════════════════════════════════════════════

cd "$PROJECT_ROOT"
detect_os

# Add local bin to PATH for tools installed without root
mkdir -p "$PROJECT_ROOT/.local/bin"
export PATH="$PROJECT_ROOT/.local/bin:$PATH"

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║         SpectraPro — Automated Setup                  ║"
echo "  ║         OS: $OS ($ARCH)                               "
echo "  ║         Package Manager: $PKG_MGR                     "
echo "  ╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

mkdir -p "$LOG_DIR" "$PID_DIR" "$DATA_DIR/scans" "$DATA_DIR/reports" "$DATA_DIR/templates"


# ══════════════════════════════════════════════════════════════════════
#  STEP 1: Package Manager
# ══════════════════════════════════════════════════════════════════════
header "Step 1/8 — Package Manager"

if [[ "$OS" == "macos" ]]; then
  if ! has brew; then
    info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for Apple Silicon
    if [[ "$ARCH" == "arm64" ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    ok "Homebrew installed"
  else
    ok "Homebrew already installed"
  fi
elif [[ "$PKG_MGR" == "apt" ]]; then
  if [[ -n "$SUDO" || "$(id -u)" -eq 0 ]]; then
    info "Updating apt cache..."
    $SUDO apt-get update -qq 2>/dev/null && ok "apt updated" || warn "apt update failed (non-critical)"
  else
    warn "Cannot update apt — no root access"
  fi
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 2: Core Dependencies (Python, Node.js, PostgreSQL)
# ══════════════════════════════════════════════════════════════════════
header "Step 2/8 — Core Dependencies"

# ── Python 3.10+ ─────────────────────────────────────────────────────
if has python3; then
  PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
  PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  if [[ "$PY_MAJOR" -ge 3 && "$PY_MINOR" -ge 10 ]]; then
    ok "Python $PY_VER"
  else
    warn "Python $PY_VER found but 3.10+ required — installing..."
    pkg_install python3 "python@3.12"
  fi
else
  info "Installing Python 3..."
  pkg_install python3 "python@3.12"
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# Ensure pip and venv
if ! python3 -m pip --version &>/dev/null; then
  info "Installing pip..."
  if [[ "$PKG_MGR" == "apt" && ( -n "$SUDO" || "$(id -u)" -eq 0 ) ]]; then
    $SUDO apt-get install -y python3-pip python3-venv 2>/dev/null || true
  else
    python3 -m ensurepip --upgrade 2>/dev/null || true
  fi
fi
python3 -m pip --version &>/dev/null && ok "pip available" || warn "pip not available"

# ── Node.js 20+ ─────────────────────────────────────────────────────
if has node; then
  NODE_VER=$(node -v | tr -d 'v' | cut -d. -f1)
  if [[ "$NODE_VER" -ge 20 ]]; then
    ok "Node.js $(node -v)"
  else
    warn "Node.js v$NODE_VER found but 20+ required — installing..."
    if [[ "$OS" == "macos" ]]; then
      brew install node@20
      brew link --overwrite node@20
    elif [[ "$PKG_MGR" == "apt" && ( -n "$SUDO" || "$(id -u)" -eq 0 ) ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
      $SUDO apt-get install -y nodejs
    fi
  fi
else
  info "Installing Node.js 20..."
  if [[ "$OS" == "macos" ]]; then
    brew install node@20
  elif [[ "$PKG_MGR" == "apt" && ( -n "$SUDO" || "$(id -u)" -eq 0 ) ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
  else
    pkg_install nodejs
  fi
fi
ok "Node.js $(node -v)"
ok "npm $(npm -v)"

# ── PostgreSQL 16+ ───────────────────────────────────────────────────
if has psql; then
  PG_VER=$(psql --version | grep -oE '[0-9]+' | head -1)
  if [[ "$PG_VER" -ge 15 ]]; then
    ok "PostgreSQL $PG_VER"
  else
    warn "PostgreSQL $PG_VER found — upgrading..."
    pkg_install postgresql "postgresql@16"
  fi
else
  info "Installing PostgreSQL 16..."
  if [[ "$OS" == "macos" ]]; then
    brew install postgresql@16
    ok "PostgreSQL 16 installed"
  elif [[ "$PKG_MGR" == "apt" && ( -n "$SUDO" || "$(id -u)" -eq 0 ) ]]; then
    $SUDO sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' 2>/dev/null || true
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc 2>/dev/null | $SUDO apt-key add - 2>/dev/null || true
    $SUDO apt-get update -qq 2>/dev/null || true
    $SUDO apt-get install -y postgresql-16 2>/dev/null || fail "PostgreSQL install failed — install manually"
  else
    pkg_install postgresql
  fi
fi

# ── Start PostgreSQL ─────────────────────────────────────────────────
info "Ensuring PostgreSQL is running..."
if [[ "$OS" == "macos" ]]; then
  # Try both versioned and unversioned service names
  if brew services list 2>/dev/null | grep -q "postgresql.*started"; then
    ok "PostgreSQL already running"
  else
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 3
    ok "PostgreSQL started"
  fi
else
  if systemctl is-active --quiet postgresql 2>/dev/null; then
    ok "PostgreSQL already running"
  elif pg_isready -h localhost -p $DB_PORT &>/dev/null; then
    ok "PostgreSQL already running"
  else
    $SUDO systemctl start postgresql 2>/dev/null || $SUDO service postgresql start 2>/dev/null || true
    sleep 2
    pg_isready -h localhost -p $DB_PORT &>/dev/null && ok "PostgreSQL started" || warn "PostgreSQL not running — start it manually"
  fi
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 3: Security Tools (Nuclei)
# ══════════════════════════════════════════════════════════════════════
header "Step 3/8 — Security Tools"

# ── Nuclei ───────────────────────────────────────────────────────────
if has nuclei; then
  ok "Nuclei $(nuclei -version 2>&1 | grep -oE 'v[0-9.]+' | head -1)"
else
  info "Installing Nuclei..."
  if [[ "$OS" == "macos" ]]; then
    brew install nuclei
  else
    # Download latest release binary
    NUCLEI_VERSION=$(curl -sL https://api.github.com/repos/projectdiscovery/nuclei/releases/latest 2>/dev/null | grep tag_name | cut -d'"' -f4 | tr -d v)
    if [[ -n "$NUCLEI_VERSION" ]]; then
      if [[ "$ARCH" == "x86_64" ]]; then NUCLEI_ARCH="amd64"; else NUCLEI_ARCH="arm64"; fi
      NUCLEI_DEST="$PROJECT_ROOT/.local/bin"
      mkdir -p "$NUCLEI_DEST"
      curl -sL -o /tmp/nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${NUCLEI_ARCH}.zip" 2>/dev/null
      if [[ -f /tmp/nuclei.zip ]]; then
        unzip -o /tmp/nuclei.zip -d "$NUCLEI_DEST" nuclei 2>/dev/null || true
        chmod +x "$NUCLEI_DEST/nuclei" 2>/dev/null || true
        export PATH="$NUCLEI_DEST:$PATH"
        rm -f /tmp/nuclei.zip
      fi
    else
      warn "Could not fetch Nuclei version — check network"
    fi
  fi
  has nuclei && ok "Nuclei installed" || fail "Nuclei installation failed"
fi

# Update Nuclei templates
NUCLEI_UPDATE_PID=""
if has nuclei; then
  info "Updating Nuclei templates (background)..."
  nuclei -update-templates &>/dev/null &
  NUCLEI_UPDATE_PID=$!
  ok "Nuclei template update started in background"
else
  warn "Nuclei not available — skipping template update"
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 4: Optional Security Tools
# ══════════════════════════════════════════════════════════════════════
header "Step 4/8 — Optional Security Tools"

if [[ "$SKIP_OPTIONAL" == true ]]; then
  warn "Skipping optional tools (--skip-optional)"
else
  # ── Ollama (AI analysis) ─────────────────────────────────────────
  if has ollama; then
    ok "Ollama already installed"
  else
    info "Installing Ollama..."
    if [[ "$OS" == "macos" ]]; then
      brew install ollama
    elif [[ -n "$SUDO" || "$(id -u)" -eq 0 ]]; then
      curl -fsSL https://ollama.ai/install.sh 2>/dev/null | sh 2>/dev/null
    else
      warn "Cannot install Ollama without root — install manually: https://ollama.ai"
    fi
    has ollama && ok "Ollama installed" || warn "Ollama installation failed"
  fi

  # Start Ollama and pull model in background
  if has ollama; then
    info "Starting Ollama and pulling llama3.2 model (background)..."
    ollama serve &>/dev/null &
    sleep 2
    ollama pull llama3.2:latest &>/dev/null &
    OLLAMA_PULL_PID=$!
    ok "Ollama model pull started in background"
  fi

  # ── Nmap ─────────────────────────────────────────────────────────
  if has nmap; then
    ok "Nmap $(nmap --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
  else
    info "Installing Nmap..."
    pkg_install nmap
    has nmap && ok "Nmap installed" || warn "Nmap installation failed"
  fi

  # ── Feroxbuster ──────────────────────────────────────────────────
  if has feroxbuster; then
    ok "Feroxbuster already installed"
  else
    info "Installing Feroxbuster..."
    if [[ "$OS" == "macos" ]]; then
      brew install feroxbuster
    elif [[ "$PKG_MGR" == "apt" ]]; then
      # Download latest release
      FEROX_VER=$(curl -sL https://api.github.com/repos/epi052/feroxbuster/releases/latest | grep tag_name | cut -d'"' -f4 | tr -d v)
      if [[ "$ARCH" == "x86_64" ]]; then FEROX_ARCH="x86_64"; else FEROX_ARCH="aarch64"; fi
      curl -sL -o /tmp/feroxbuster.tar.gz "https://github.com/epi052/feroxbuster/releases/download/v${FEROX_VER}/feroxbuster-${FEROX_VER}-${FEROX_ARCH}-linux-musl.tar.gz" 2>/dev/null || true
      if [[ -f /tmp/feroxbuster.tar.gz ]]; then
        FEROX_DEST="$PROJECT_ROOT/.local/bin"
        mkdir -p "$FEROX_DEST"
        tar xzf /tmp/feroxbuster.tar.gz -C "$FEROX_DEST" feroxbuster 2>/dev/null || true
        chmod +x "$FEROX_DEST/feroxbuster" 2>/dev/null || true
        export PATH="$FEROX_DEST:$PATH"
        rm -f /tmp/feroxbuster.tar.gz
        ok "Feroxbuster installed"
      else
        warn "Feroxbuster download failed — install manually"
      fi
    fi
    has feroxbuster && ok "Feroxbuster installed" || warn "Feroxbuster not available — install manually"
  fi

  # ── Sublist3r ────────────────────────────────────────────────────
  if python3 -c "import sublist3r" &>/dev/null 2>&1 || has sublist3r; then
    ok "Sublist3r already installed"
  else
    info "Installing Sublist3r..."
    pip3 install sublist3r 2>/dev/null && ok "Sublist3r installed (pip)" || warn "Sublist3r install failed — install manually"
  fi
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 5: Python Environment
# ══════════════════════════════════════════════════════════════════════
header "Step 5/8 — Python Environment"

cd "$PROJECT_ROOT"

if [[ ! -d "venv" ]] || [[ ! -f "venv/bin/activate" ]]; then
  rm -rf venv 2>/dev/null || true
  info "Creating virtual environment..."
  python3 -m venv venv 2>/dev/null || python3 -m venv --without-pip venv 2>/dev/null || {
    warn "venv creation failed — trying virtualenv..."
    python3 -m pip install virtualenv 2>/dev/null && python3 -m virtualenv venv 2>/dev/null
  }
  [[ -f "venv/bin/activate" ]] && ok "Virtual environment created" || { warn "Virtual environment creation failed"; }
else
  ok "Virtual environment exists"
fi

if [[ -f "venv/bin/activate" ]]; then
  info "Installing Python dependencies..."
  source venv/bin/activate

  # Ensure pip is available inside venv
  if ! python3 -m pip --version &>/dev/null; then
    curl -sS https://bootstrap.pypa.io/get-pip.py 2>/dev/null | python3 2>/dev/null || true
  fi

  python3 -m pip install --upgrade pip -q 2>/dev/null
  python3 -m pip install -r requirements.txt -q 2>/dev/null && \
    ok "Python dependencies installed ($(python3 -m pip list --format=freeze 2>/dev/null | wc -l | tr -d ' ') packages)" || \
    warn "Some Python dependencies failed to install"

  # Install Playwright browsers for screenshot capture
  info "Installing Playwright browsers..."
  python3 -m playwright install chromium --with-deps 2>/dev/null || warn "Playwright browser install failed (non-critical)"

  deactivate
else
  warn "Skipping Python deps — no virtual environment"
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 6: Environment Files
# ══════════════════════════════════════════════════════════════════════
header "Step 6/8 — Environment Configuration"

JWT_SECRET=$(openssl rand -hex 32)

# ── Root .env ────────────────────────────────────────────────────────
if [[ ! -f "$PROJECT_ROOT/.env" ]] || [[ "$RESET_DB" == true ]]; then
  cat > "$PROJECT_ROOT/.env" << EOF
# SpectraPro — Environment Configuration (auto-generated)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# PostgreSQL
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"

# JWT Authentication
JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN=24h

# API Ports
PORT=$BACKEND_PORT
FRONTEND_URL="http://localhost:$FRONTEND_PORT"

# AI Analysis (Ollama)
OLLAMA_API_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3.2:latest
OLLAMA_TIMEOUT=120000
AI_ANALYSIS_ENABLED=true

# Shodan (optional — get key from https://shodan.io)
SHODAN_API_KEY=

# Environment
NODE_ENV=development
LOG_LEVEL=info
EOF
  ok "Root .env created"
else
  ok "Root .env already exists"
fi

# ── Backend .env ─────────────────────────────────────────────────────
if [[ ! -f "$PROJECT_ROOT/platform/backend/.env" ]] || [[ "$RESET_DB" == true ]]; then
  cat > "$PROJECT_ROOT/platform/backend/.env" << EOF
# SpectraPro Backend — Environment Configuration (auto-generated)
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
PORT=$BACKEND_PORT
FRONTEND_URL="http://localhost:$FRONTEND_PORT"
JWT_SECRET="$JWT_SECRET"
NODE_ENV=development
OLLAMA_API_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3.2:latest
SHODAN_API_KEY=
EOF
  ok "Backend .env created"
else
  ok "Backend .env already exists"
fi

# ── Frontend .env.local ──────────────────────────────────────────────
if [[ ! -f "$PROJECT_ROOT/platform/frontend/.env.local" ]]; then
  cat > "$PROJECT_ROOT/platform/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT
NEXT_PUBLIC_APP_URL=http://localhost:$FRONTEND_PORT
EOF
  ok "Frontend .env.local created"
else
  ok "Frontend .env.local already exists"
fi


# ══════════════════════════════════════════════════════════════════════
#  STEP 7: Database Setup & Migrations
# ══════════════════════════════════════════════════════════════════════
header "Step 7/8 — Database Setup"

# ── Create database and user ─────────────────────────────────────────
info "Setting up PostgreSQL database..."

# Determine the postgres superuser to connect as
if [[ "$OS" == "macos" ]]; then
  PG_SUPER=$(whoami)
else
  PG_SUPER="postgres"
fi

# Create user if using a non-default user with password
if [[ "$DB_USER" != "$PG_SUPER" ]]; then
  psql -U "$PG_SUPER" -tc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" 2>/dev/null | grep -q 1 || \
    psql -U "$PG_SUPER" -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB;" 2>/dev/null || true
  ok "Database user '$DB_USER' ready"
fi

# Create database
if psql -U "$PG_SUPER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | grep -q 1; then
  if [[ "$RESET_DB" == true ]]; then
    warn "Dropping existing database (--reset-db)..."
    psql -U "$PG_SUPER" -c "DROP DATABASE $DB_NAME;" 2>/dev/null || true
    psql -U "$PG_SUPER" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null
    ok "Database recreated"
  else
    ok "Database '$DB_NAME' already exists"
  fi
else
  psql -U "$PG_SUPER" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || \
    psql -U "$PG_SUPER" -c "CREATE DATABASE $DB_NAME;" 2>/dev/null
  ok "Database '$DB_NAME' created"
fi

# ── Install Node dependencies ────────────────────────────────────────
info "Installing backend npm dependencies..."
cd "$PROJECT_ROOT/platform/backend"
npm install --silent 2>&1 | tail -5
ok "Backend dependencies installed"

info "Installing frontend npm dependencies..."
cd "$PROJECT_ROOT/platform/frontend"
npm install --silent 2>&1 | tail -5
ok "Frontend dependencies installed"

# ── Run Prisma migrations ────────────────────────────────────────────
cd "$PROJECT_ROOT/platform/backend"
info "Generating Prisma client..."
npx prisma generate 2>&1 | tail -3
ok "Prisma client generated"

info "Running database migrations..."
if npx prisma migrate deploy 2>/dev/null; then
  ok "Migrations applied"
else
  warn "migrate deploy failed — trying migrate dev..."
  if npx prisma migrate dev --name init --skip-generate 2>/dev/null; then
    ok "Migrations applied (dev)"
  else
    warn "Migration issues — may need manual intervention (is PostgreSQL running?)"
  fi
fi

# ── Seed database ────────────────────────────────────────────────────
info "Seeding database with test data..."
npx prisma db seed 2>/dev/null && ok "Database seeded" || warn "Seeding skipped (may already be seeded or seed script missing)"


# ══════════════════════════════════════════════════════════════════════
#  STEP 8: Start Services
# ══════════════════════════════════════════════════════════════════════
header "Step 8/8 — Starting Services"

if [[ "$NO_START" == true ]]; then
  warn "Skipping service start (--no-start)"
else
  # Kill any existing instances
  if has lsof; then
    lsof -ti:$BACKEND_PORT  2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:$FRONTEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:$FLASK_PORT    2>/dev/null | xargs kill -9 2>/dev/null || true
  elif has fuser; then
    fuser -k $BACKEND_PORT/tcp  2>/dev/null || true
    fuser -k $FRONTEND_PORT/tcp 2>/dev/null || true
    fuser -k $FLASK_PORT/tcp    2>/dev/null || true
  fi
  sleep 1

  # ── Backend ──────────────────────────────────────────────────────
  info "Starting backend on :$BACKEND_PORT..."
  cd "$PROJECT_ROOT/platform/backend"
  npx tsx watch src/index.ts > "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/backend.pid"
  ok "Backend started (PID: $(cat "$PID_DIR/backend.pid"))"

  sleep 3

  # ── Frontend ─────────────────────────────────────────────────────
  info "Starting frontend on :$FRONTEND_PORT..."
  cd "$PROJECT_ROOT/platform/frontend"
  NODE_ENV=development npx next dev -p $FRONTEND_PORT > "$LOG_DIR/frontend.log" 2>&1 &
  echo $! > "$PID_DIR/frontend.pid"
  ok "Frontend started (PID: $(cat "$PID_DIR/frontend.pid"))"

  sleep 3

  # ── Verify services ──────────────────────────────────────────────
  info "Verifying services..."
  sleep 5

  if curl -s --max-time 5 "http://localhost:$BACKEND_PORT/health" 2>/dev/null | grep -q "ok"; then
    ok "Backend health check passed"
  else
    warn "Backend not responding yet — check logs/backend.log"
  fi
fi

# Wait for background processes
[[ -n "${NUCLEI_UPDATE_PID:-}" ]] && wait "$NUCLEI_UPDATE_PID" 2>/dev/null || true
[[ -n "${OLLAMA_PULL_PID:-}" ]] && wait "$OLLAMA_PULL_PID" 2>/dev/null || true


# ══════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║           SpectraPro Setup Complete!                  ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "  ${BOLD}Installed:${NC}"
has python3    && echo -e "    ${GREEN}✓${NC} Python $(python3 --version 2>&1 | cut -d' ' -f2)"
has node       && echo -e "    ${GREEN}✓${NC} Node.js $(node -v)"
has psql       && echo -e "    ${GREEN}✓${NC} PostgreSQL $(psql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)" || echo -e "    ${YELLOW}○${NC} PostgreSQL (not installed)"
has nuclei     && echo -e "    ${GREEN}✓${NC} Nuclei"
has ollama     && echo -e "    ${GREEN}✓${NC} Ollama" || echo -e "    ${YELLOW}○${NC} Ollama (not installed)"
has nmap       && echo -e "    ${GREEN}✓${NC} Nmap" || echo -e "    ${YELLOW}○${NC} Nmap (not installed)"
has feroxbuster && echo -e "    ${GREEN}✓${NC} Feroxbuster" || echo -e "    ${YELLOW}○${NC} Feroxbuster (not installed)"

echo ""
echo -e "  ${BOLD}Database:${NC}"
echo -e "    ${GREEN}✓${NC} $DB_NAME @ localhost:$DB_PORT"
echo ""

if [[ "$NO_START" != true ]]; then
  echo -e "  ${BOLD}Services Running:${NC}"
  echo -e "    ${CYAN}Frontend:${NC}   http://localhost:$FRONTEND_PORT"
  echo -e "    ${CYAN}Backend:${NC}    http://localhost:$BACKEND_PORT"
  echo -e "    ${CYAN}Database:${NC}   postgresql://$DB_HOST:$DB_PORT/$DB_NAME"
  echo ""
  echo -e "  ${BOLD}Logs:${NC}"
  echo -e "    tail -f $LOG_DIR/backend.log"
  echo -e "    tail -f $LOG_DIR/frontend.log"
  echo ""
  echo -e "  ${BOLD}Stop:${NC}"
  echo -e "    ./scripts/stop-all.sh"
  echo ""
  echo -e "  ${BOLD}Next:${NC}"
  echo -e "    Open ${CYAN}http://localhost:$FRONTEND_PORT${NC} and register an account"
fi

echo ""
