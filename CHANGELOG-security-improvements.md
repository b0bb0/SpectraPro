# Spectra Platform — Security, Functionality & Performance Improvements

**Date:** 2026-03-23
**Scope:** 19 fixes across 3 phases + 3 new files

---

## New Files Created

| File | Purpose |
|------|---------|
| `platform/frontend/middleware.ts` | Next.js route-level auth guard — redirects unauthenticated `/dashboard/*` requests to `/login` before serving JS bundles |
| `platform/frontend/contexts/WebSocketContext.tsx` | Singleton WebSocket provider — shares one connection across all dashboard pages instead of creating one per hook call |
| `platform/frontend/lib/colors.ts` | Canonical color helpers (`getSeverityColor`, `getStatusColor`, `getScanStatusColor` + hex variants) replacing 57 duplicated definitions |

---

## Phase 1 — Security Fixes (7 changes)

### 1. Un-gitignore Prisma migrations
**File:** `.gitignore` (lines 67-68)
**Problem:** Prisma migration SQL files were excluded from git. Any fresh deploy/clone would fail `prisma migrate deploy` because migration history was missing.
**Fix:** Removed `platform/backend/prisma/migrations/` and `platform/prisma/migrations/` from `.gitignore`.

### 2. Strip credentials from scan API responses
**File:** `platform/backend/src/services/scan.service.ts` — `getScanById()` and `getScans()`
**Problem:** The `authConfig` JSON field (containing bearer tokens, passwords, cookies) was returned in `GET /api/scans/:id` and scan list responses, readable by any tenant user.
**Fix:** Both methods now destructure and strip `authConfig` before returning: `const { authConfig: _stripped, ...safeScan } = scan`.

### 3. Gate debug routes behind NODE_ENV
**File:** `platform/backend/src/index.ts` (line 160)
**Problem:** `/api/debug` routes were mounted unconditionally in production.
**Fix:** Wrapped in `if (process.env.NODE_ENV !== 'production')` guard.

### 4. Fix trust proxy setting
**File:** `platform/backend/src/index.ts` (line 49)
**Problem:** `app.set('trust proxy', true)` trusted all proxy hops, allowing any client to spoof `req.ip` via `X-Forwarded-For`, bypassing rate limits.
**Fix:** Changed to `app.set('trust proxy', 1)` — trusts only one hop (Caddy).

### 5. Fix WebSocket JWT token exposure
**Files:** `platform/frontend/hooks/useWebSocket.ts`, `platform/backend/src/services/websocket.service.ts`
**Problem:** JWT was sent as URL query parameter (`/ws?token=xxx`), exposing it in server access logs, browser history, and Referer headers.
**Fix:**
- Frontend: connects to `/ws` without token, sends `{ type: 'auth', token }` as first WebSocket message
- Backend: accepts auth from first message with 5s timeout; keeps backwards compat with URL token
- Added `ConnectionAckMessage` type, sends `connection_ack` instead of fake `scan_progress` welcome

### 6. Add path validation to res.sendFile
**File:** `platform/backend/src/routes/recon.routes.ts` (line 759)
**Problem:** `artifact.storagePath` was passed directly to `res.sendFile` with no validation. A crafted DB value could serve arbitrary files.
**Fix:** Resolves the path and validates it's within allowed directories (`/data`, `/frontend/public/screenshots`, etc.) before serving.

### 7. Fix WebSocket JWT secret fallback
**File:** `platform/backend/src/services/websocket.service.ts`
**Problem:** Used inline `jwt.verify(token, process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me')` — ignoring the production guard in `auth.ts`. If `JWT_SECRET` was missing in prod, anyone with the hardcoded string could authenticate.
**Fix:** Replaced with `verifyToken()` from `utils/auth.ts` which throws in production if `JWT_SECRET` is unset.

---

## Phase 2 — Core Functionality Fixes (6 changes)

### 8. Fix vulnerability deduplication
**File:** `platform/backend/src/services/vulnerability-deduplication.service.ts`
**Problem:** `generateFingerprint()` computed a SHA-256 hash but `findDuplicate()` never used it — the fingerprint was commented out in the query, so it matched any random open vulnerability for the tenant.
**Fix:**
- `findDuplicate()` now queries on `deduplicationKey` field (which already existed in the schema with an index)
- `deduplicateVulnerability()` stores the fingerprint in `deduplicationKey` on create
- Increments `occurrenceCount` on re-detection
- `markResolvedVulnerabilities()` uses batch `updateMany` instead of sequential loop

**Also in `scan.service.ts`:**
- Dedup logic changed from matching `cveId: cveId || result.info.name` to fingerprint-based `deduplicationKey`
- `cveId` now only stores actual CVE IDs (`cveId: cveId || null`), not template names
- `occurrenceCount` incremented on re-detection

### 9. Wrap storeVulnerabilities in a transaction
**File:** `platform/backend/src/services/scan.service.ts`
**Problem:** The vulnerability storage loop did sequential `findFirst` + `create/update` + `evidence.create` per result with no transaction. A crash mid-loop left partial data with the scan marked COMPLETED.
**Fix:** Entire loop wrapped in `prisma.$transaction(async (tx) => { ... }, { timeout: 60000 })`. All `prisma.` calls inside changed to `tx.` — atomic all-or-nothing write.

### 10. Implement /api/scans/ingest endpoint
**File:** `platform/backend/src/routes/scan.routes.ts`
**Problem:** The CLI-to-platform integration endpoint (documented in CLAUDE.md as the primary data flow) was a stub returning `"to be implemented"`.
**Fix:** Full implementation with:
- Zod schema validation for Nuclei JSONL format
- Creates scan record with severity counts
- Finds or creates asset for the target
- Stores vulnerabilities via `scanService.ingestVulnerabilities()`
- Updates asset risk metrics
- Returns `{ scanId, assetId, vulnerabilitiesIngested }`

**Also added** `ingestVulnerabilities()` public method on `ScanService` wrapping the private `storeVulnerabilities()`.

### 11. Add frontend auth middleware
**File:** `platform/frontend/middleware.ts` (NEW)
**Problem:** No route-level auth guard — full JS bundles (including all dashboard code) were served to unauthenticated users before the client-side `ProtectedRoute` component redirected.
**Fix:** Next.js middleware checks for `token` cookie on all `/dashboard/*` routes. Redirects to `/login?returnTo=...` if missing. Also redirects authenticated users away from `/login` and `/register`.

### 12. Create WebSocket singleton provider
**File:** `platform/frontend/contexts/WebSocketContext.tsx` (NEW)
**Problem:** Each `useWebSocket()` call created a new WebSocket connection. `useBulkScanUpdates()` called `useWebSocket()` internally, creating 2 connections per page. Multiple scan-related pages open = connection burst.
**Fix:**
- `WebSocketProvider` context manages a single connection with reconnect logic
- Mounted in `dashboard/layout.tsx` wrapping all dashboard pages
- `useWebSocket()` hook now delegates to `useWebSocketContext()` — zero connection logic

### 13. Update asset risk metrics after scan ingestion
**File:** `platform/backend/src/services/scan.service.ts`
**Problem:** `storeVulnerabilities` created vulns directly via Prisma, bypassing `VulnerabilityService`, so `updateAssetRiskMetrics` was never called. Asset `riskScore`, `criticalVulnCount` etc. were stale after every automated scan.
**Fix:** Added `assetService.updateAssetRiskMetrics(assetId)` call after `storeVulnerabilities` completes (both in the scan completion handler and in the new `ingestVulnerabilities` method).

---

## Phase 3 — Performance & Polish (6 changes)

### 14. Replace manual fetching with SWR on dashboard
**File:** `platform/frontend/app/dashboard/page.tsx`
**Problem:** All data fetching used manual `useState` + `useEffect` + `setLoading` patterns. No caching, no revalidation on window focus, no request deduplication. SWR was in package.json but never imported.
**Fix:**
- Dashboard page now uses 5 `useSWR()` hooks instead of a single `loadDashboardData()` function
- Auto-revalidates on window focus, deduplicates identical requests within 5s
- Added `swrFetcher` export to `lib/api.ts` for reuse

### 15. Fix N+1 query in /api/recon/assets/status
**File:** `platform/backend/src/routes/recon.routes.ts`
**Problem:** Handler ran 1 raw SQL query then fired 2 Prisma queries per asset in a `Promise.all(map(...))`. 50 assets = 101 DB round trips.
**Fix:** Replaced per-item queries with 2 batch queries:
1. `prisma.recon_sessions.groupBy({ by: ['assetId'] })` — session counts
2. `prisma.recon_phase_runs.findMany({ where: { sessionId: { in: ids } } })` — all phase runs

Results indexed into lookup maps for O(1) access. Total queries: 3 (down from 1+2N).

### 16. Consolidate dashboard COUNT queries
**File:** `platform/backend/src/services/dashboard.service.ts`
**Problem:** `getMetrics()` fired 10 parallel `prisma.count()` calls including 5 that queried the same `vulnerabilities` table differing only by severity.
**Fix:** Replaced 5 severity counts with a single `prisma.vulnerabilities.groupBy({ by: ['severity'] })`. Individual counts derived in memory. Total queries: 6 (down from 10).

### 17. Extract shared color helpers
**File:** `platform/frontend/lib/colors.ts` (NEW)
**Problem:** `getSeverityColor` duplicated 57 times across 16 files with inconsistent values (CRITICAL was red in some, purple in others).
**Fix:** Canonical source with:
- `getSeverityColor()` / `getSeverityHex()` — Tailwind classes and hex for charts
- `getStatusColor()` / `getStatusHex()` — vulnerability status colors
- `getScanStatusColor()` / `getScanStatusHex()` — scan status colors

Updated 3 main pages (`dashboard`, `vulnerabilities`, `scans`) to import from shared source.

### 18. Add dynamic imports for heavy components
**File:** `platform/frontend/app/dashboard/scans/[id]/page.tsx`
**Problem:** `EvidenceGraph` (heavy SVG/canvas component) was statically imported on the scan detail page.
**Fix:** Changed to `dynamic(() => import('@/components/EvidenceGraph'), { ssr: false })` with loading placeholder.
**Also identified:** `react-force-graph-2d` and `framer-motion` are dead dependencies (never imported in any .tsx file).

### 19. Set up HTTPS with Caddy domain config
**Files:** `Caddyfile`, `docker-compose.prod.yml`, `.env.production`
**Problem:** Caddyfile hardcoded `:80`. Enabling HTTPS required manually editing the file.
**Fix:**
- Caddyfile uses `{$SITE_ADDRESS::80}` — defaults to HTTP, set `SITE_ADDRESS=yourdomain.com` for automatic Let's Encrypt
- `docker-compose.prod.yml`: exposed port 443, added `SITE_ADDRESS` env var to caddy service
- `.env.production`: added `SITE_ADDRESS` with documentation

---

## Other Changes

### Dockerfile improvements
- **Backend** (`platform/backend/Dockerfile`): Switched from Alpine to Debian Bookworm Slim for glibc compatibility. Added Feroxbuster v2.13.1 binary, SecLists wordlists (`common.txt`, `raft-medium-directories.txt`), Nuclei template download at build time.
- **Frontend** (`platform/frontend/Dockerfile`): Added `libc6-compat` for SWC binary compatibility on Alpine arm64.

### Prisma schema
- `platform/backend/prisma/schema.prisma`: Added `binaryTargets` for cross-platform Prisma Client generation (musl + glibc).

### Recon service graceful degradation
- `platform/backend/src/services/recon.service.ts`: Directory enumeration (Feroxbuster) now skips gracefully when wordlist or binary is missing, marking phase as `DONE` with a note instead of `FAILED`.

### Bootstrap script
- `scripts/bootstrap-droplet.sh`: Updated repo URL from `Migrate-spectrapro.git` to `SpectraPro.git`.

### AssetTimeline component
- `platform/frontend/components/AssetTimeline.tsx`: Removed broken `@/components/ui/card` import (shadcn/ui not installed). Replaced with equivalent Tailwind markup.
