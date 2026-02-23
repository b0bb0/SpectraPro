#!/usr/bin/env bash
# ── SpectraPRO — Data Migration Tool ──────────────────────────────
# Export data from current machine, import on a new one.
#
# Usage:
#   ./scripts/migrate.sh export          # Creates migration/ directory
#   ./scripts/migrate.sh import          # Restores from migration/ directory
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MIGRATION_DIR="$PROJECT_DIR/migration"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ────────────────────────────────────────────────────────────────────
# EXPORT — Run on the source machine
# ────────────────────────────────────────────────────────────────────
do_export() {
  info "Starting data export..."

  # Clean previous export
  rm -rf "$MIGRATION_DIR"
  mkdir -p "$MIGRATION_DIR"

  # ── 1. PostgreSQL dump ──────────────────────────────────────────
  info "Exporting PostgreSQL database..."

  # Try Docker container first, then local pg_dump
  if docker compose ps postgres --status running &>/dev/null 2>&1; then
    info "Using Docker PostgreSQL container..."
    docker compose exec -T postgres pg_dump \
      -U "${POSTGRES_USER:-spectra}" \
      -d "${POSTGRES_DB:-spectra_platform}" \
      --format=custom \
      --no-owner \
      --no-acl \
      > "$MIGRATION_DIR/pg_backup.dump"
  elif command -v pg_dump &>/dev/null; then
    info "Using local pg_dump..."
    # Source .env for connection details
    if [ -f .env ]; then
      set -a; source .env; set +a
    fi
    pg_dump \
      "${DATABASE_URL:-postgresql://spectra:password@localhost:5432/spectra_platform}" \
      --format=custom \
      --no-owner \
      --no-acl \
      > "$MIGRATION_DIR/pg_backup.dump"
  else
    err "Neither Docker PostgreSQL nor local pg_dump found. Cannot export database."
    exit 1
  fi
  ok "PostgreSQL exported ($(du -h "$MIGRATION_DIR/pg_backup.dump" | cut -f1))"

  # ── 2. Scanner data (SQLite + scans + reports) ─────────────────
  info "Exporting scanner data..."

  SCANNER_FILES=()
  [ -d "data/scans" ] && SCANNER_FILES+=("data/scans")
  [ -d "data/reports" ] && SCANNER_FILES+=("data/reports")
  [ -d "data/custom-templates" ] && SCANNER_FILES+=("data/custom-templates")
  [ -f "data/spectra.db" ] && SCANNER_FILES+=("data/spectra.db")

  if [ ${#SCANNER_FILES[@]} -gt 0 ]; then
    tar czf "$MIGRATION_DIR/scanner_data.tar.gz" "${SCANNER_FILES[@]}"
    ok "Scanner data exported ($(du -h "$MIGRATION_DIR/scanner_data.tar.gz" | cut -f1))"
  else
    warn "No scanner data found — skipping."
  fi

  # ── 3. Config ───────────────────────────────────────────────────
  if [ -f "config/config.yaml" ]; then
    cp "config/config.yaml" "$MIGRATION_DIR/config.yaml"
    ok "Config exported."
  fi

  # ── 4. Checksum manifest ───────────────────────────────────────
  info "Generating checksums..."
  cd "$MIGRATION_DIR"
  shasum -a 256 * > MANIFEST.sha256 2>/dev/null || sha256sum * > MANIFEST.sha256
  cd "$PROJECT_DIR"
  ok "Manifest generated."

  # ── Summary ─────────────────────────────────────────────────────
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Export complete!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Files in migration/:"
  ls -lh "$MIGRATION_DIR/"
  echo ""
  echo "  Total size: $(du -sh "$MIGRATION_DIR" | cut -f1)"
  echo ""
  echo "  Next steps:"
  echo "    1. Copy the migration/ directory to the target machine"
  echo "    2. On the target: git clone <repo> && cd SpectraPro"
  echo "    3. Place migration/ in the project root"
  echo "    4. Run: ./scripts/migrate.sh import"
  echo ""
}

# ────────────────────────────────────────────────────────────────────
# IMPORT — Run on the target machine
# ────────────────────────────────────────────────────────────────────
do_import() {
  info "Starting data import..."

  if [ ! -d "$MIGRATION_DIR" ]; then
    err "migration/ directory not found. Copy it from the source machine first."
    exit 1
  fi

  # ── 1. Verify checksums ────────────────────────────────────────
  info "Verifying file integrity..."
  cd "$MIGRATION_DIR"
  if shasum -a 256 -c MANIFEST.sha256 &>/dev/null 2>&1 || sha256sum -c MANIFEST.sha256 &>/dev/null 2>&1; then
    ok "Checksums verified."
  else
    err "Checksum verification failed! Files may be corrupted."
    exit 1
  fi
  cd "$PROJECT_DIR"

  # ── 2. Ensure .env exists ──────────────────────────────────────
  if [ ! -f .env ]; then
    info "No .env found — running setup to create one..."
    cp .env.template .env
    POSTGRES_PW=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
    JWT_SEC=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PW}|" .env
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" .env
    else
      sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PW}|" .env
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" .env
    fi
    ok "Generated .env with new secrets."
  fi

  # Source .env for Postgres credentials
  set -a; source .env; set +a

  # ── 3. Start PostgreSQL only ───────────────────────────────────
  info "Starting PostgreSQL..."
  docker compose up -d postgres
  info "Waiting for PostgreSQL to be healthy..."
  RETRIES=30
  until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-spectra}" -d "${POSTGRES_DB:-spectra_platform}" &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -le 0 ]; then
      err "PostgreSQL failed to become healthy."
      exit 1
    fi
    sleep 2
  done
  ok "PostgreSQL is ready."

  # ── 4. Apply Prisma migrations (create schema) ─────────────────
  info "Building backend for migration..."
  docker compose build backend
  info "Applying Prisma migrations..."
  docker compose run --rm -T backend npx prisma migrate deploy
  ok "Schema created."

  # ── 5. Restore PostgreSQL data ─────────────────────────────────
  if [ -f "$MIGRATION_DIR/pg_backup.dump" ]; then
    info "Restoring PostgreSQL data..."
    # Use pg_restore with --data-only to avoid schema conflicts (schema already applied by Prisma)
    docker compose exec -T postgres pg_restore \
      -U "${POSTGRES_USER:-spectra}" \
      -d "${POSTGRES_DB:-spectra_platform}" \
      --data-only \
      --no-owner \
      --no-acl \
      --disable-triggers \
      < "$MIGRATION_DIR/pg_backup.dump" || {
        warn "pg_restore reported warnings (this is often normal for partial restores)."
      }
    ok "PostgreSQL data restored."
  else
    warn "No pg_backup.dump found — skipping database restore."
  fi

  # ── 6. Restore scanner data ───────────────────────────────────
  if [ -f "$MIGRATION_DIR/scanner_data.tar.gz" ]; then
    info "Restoring scanner data..."
    tar xzf "$MIGRATION_DIR/scanner_data.tar.gz" -C "$PROJECT_DIR"
    ok "Scanner data restored."
  fi

  # ── 7. Restore config ─────────────────────────────────────────
  if [ -f "$MIGRATION_DIR/config.yaml" ]; then
    cp "$MIGRATION_DIR/config.yaml" "config/config.yaml"
    ok "Config restored."
  fi

  # ── 8. Start all services ──────────────────────────────────────
  info "Starting all services..."
  docker compose up -d --build
  sleep 5

  # ── Summary ─────────────────────────────────────────────────────
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Import complete!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Web UI:  ${CYAN}http://localhost${NC}"
  echo ""
  echo "  Run ./scripts/health-check-docker.sh to verify everything is working."
  echo ""
}

# ────────────────────────────────────────────────────────────────────
# CLI Entry Point
# ────────────────────────────────────────────────────────────────────
case "${1:-}" in
  export) do_export ;;
  import) do_import ;;
  *)
    echo "Usage: $0 {export|import}"
    echo ""
    echo "  export    Dump PostgreSQL + scanner data to migration/"
    echo "  import    Restore data from migration/ into Docker containers"
    exit 1
    ;;
esac
