#!/usr/bin/env bash
# ── SpectraPRO — Docker Health Check ──────────────────────────────
# Checks all containers, services, and database row counts.
#
# Usage:
#   ./scripts/health-check-docker.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0

check_pass() { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS + 1)); }
check_fail() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}!${NC} $*"; WARN=$((WARN + 1)); }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SpectraPRO Docker Health Check${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Container Status ──────────────────────────────────────────
echo -e "${CYAN}[Containers]${NC}"

EXPECTED_SERVICES=("postgres" "backend" "frontend" "caddy" "scanner")
for svc in "${EXPECTED_SERVICES[@]}"; do
  STATUS=$(docker compose ps "$svc" --format '{{.Status}}' 2>/dev/null || echo "not found")
  if echo "$STATUS" | grep -qi "up"; then
    if echo "$STATUS" | grep -qi "healthy"; then
      check_pass "$svc — running (healthy)"
    else
      check_warn "$svc — running (not yet healthy)"
    fi
  else
    check_fail "$svc — $STATUS"
  fi
done

# Check for optional Ollama
OLLAMA_STATUS=$(docker compose ps ollama --format '{{.Status}}' 2>/dev/null || echo "not found")
if echo "$OLLAMA_STATUS" | grep -qi "up"; then
  check_pass "ollama — running (optional AI service)"
else
  check_warn "ollama — not running (start with: docker compose --profile ai up -d)"
fi

echo ""

# ── 2. PostgreSQL ────────────────────────────────────────────────
echo -e "${CYAN}[PostgreSQL]${NC}"

if docker compose exec -T postgres pg_isready -U spectra -d spectra_platform &>/dev/null; then
  check_pass "pg_isready — accepting connections"
else
  check_fail "pg_isready — not responding"
fi

# Table count
TABLE_COUNT=$(docker compose exec -T postgres psql -U spectra -d spectra_platform -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$TABLE_COUNT" -gt 0 ] 2>/dev/null; then
  check_pass "Schema — $TABLE_COUNT tables in public schema"
else
  check_fail "Schema — no tables found (run prisma migrate deploy)"
fi

# Row counts for critical tables
echo ""
echo -e "${CYAN}[Database Row Counts]${NC}"

TABLES=("Tenant" "User" "Asset" "Scan" "Vulnerability")
for tbl in "${TABLES[@]}"; do
  COUNT=$(docker compose exec -T postgres psql -U spectra -d spectra_platform -t -c \
    "SELECT COUNT(*) FROM \"$tbl\";" 2>/dev/null | tr -d ' ' || echo "?")
  if [ "$COUNT" != "?" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
    check_pass "$tbl — $COUNT rows"
  elif [ "$COUNT" = "0" ]; then
    check_warn "$tbl — 0 rows"
  else
    check_warn "$tbl — could not query"
  fi
done

echo ""

# ── 3. Service Endpoints ────────────────────────────────────────
echo -e "${CYAN}[Service Endpoints]${NC}"

# Backend health
BACKEND_HEALTH=$(curl -sf http://localhost/api/health 2>/dev/null || echo "")
if echo "$BACKEND_HEALTH" | grep -q "healthy"; then
  check_pass "Backend  — http://localhost/api/health"
else
  check_fail "Backend  — http://localhost/api/health not responding"
fi

# Frontend
FRONTEND_STATUS=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" = "200" ]; then
  check_pass "Frontend — http://localhost/ (HTTP $FRONTEND_STATUS)"
else
  check_fail "Frontend — http://localhost/ (HTTP $FRONTEND_STATUS)"
fi

# Scanner health
SCANNER_HEALTH=$(curl -sf http://localhost/scanner/health 2>/dev/null || echo "")
if echo "$SCANNER_HEALTH" | grep -q "healthy"; then
  check_pass "Scanner  — http://localhost/scanner/health"
else
  check_fail "Scanner  — http://localhost/scanner/health not responding"
fi

echo ""

# ── Summary ──────────────────────────────────────────────────────
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All checks passed!${NC}  ($PASS passed, $WARN warnings)"
else
  echo -e "  ${RED}$FAIL checks failed${NC}  ($PASS passed, $WARN warnings)"
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit "$FAIL"
