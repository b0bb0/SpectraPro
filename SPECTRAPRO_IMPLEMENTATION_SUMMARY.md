# SpectraPRO Enterprise Implementation Summary

## STATUS: Phase 1 Complete - Database Schema ✅

**Date:** January 27, 2026
**Implementation By:** Principal Security Architect + Staff Full-Stack Engineer + Product UX Lead

---

## What Was Implemented

### 1. Database Schema Enhancements ✅

Added 4 new enterprise models to `/Users/groot/spectra/platform/backend/prisma/schema.prisma`:

#### **RulesOfEngagement Model**
- **Purpose:** Authorization framework for scan phases and scope
- **Key Fields:**
  - `scopeDomains`, `scopeIPs`, `scopeUrls`, `excludedTargets` - Define what can be scanned
  - `allowedMethods` - Which scan phases are permitted (DISCOVERY_ONLY | BASELINE | TARGETED | VALIDATION | FULL_ASSESSMENT)
  - `validationEnabled` - Toggle for exploitability validation
  - `validationRequiresApproval` - RBAC gate for Phase 3
  - `maxRequestsPerSecond`, `maxConcurrentScans` - Rate limiting
  - `allowedStartTime`, `allowedEndTime`, `allowedDaysOfWeek` - Time windows
  - `validFrom`, `validUntil` - Validity period
  - `approvedBy`, `approvedAt` - Authorization tracking
- **Relations:** `Scan.roeId` links scans to ROE

#### **AIDecisionLedger Model**
- **Purpose:** Transparent tracking of all AI decisions
- **Key Fields:**
  - `decisionType` - TEMPLATE_SELECTION | RISK_ASSESSMENT | VALIDATION_PRIORITY | IMPACT_ANALYSIS | REMEDIATION_ADVICE
  - `phase` - Which orchestration phase generated this decision
  - `discoveryContextHash`, `endpointMapHash` - Input fingerprints
  - `modelName`, `modelVersion`, `temperature` - AI model info
  - `decisionJson` - Full AI output (structured)
  - `selectedTemplates`, `selectedTags`, `selectedScopes` - What AI chose
  - `confidenceScore`, `rationale` - Why AI made this choice
  - `outcome` - ACCEPTED | REJECTED | OVERRIDDEN | FALLBACK_USED
  - `validationErrors` - Why a decision was rejected
  - `fallbackTriggered`, `fallbackReason` - Deterministic fallback tracking
  - `templatesExecuted`, `findingsGenerated`, `executionTime` - Results
- **Relations:** Links to `Scan` and `Tenant`
- **Transparency:** Every AI decision is logged with inputs, outputs, validation, and outcomes

#### **EndpointMap Model**
- **Purpose:** Discovered URLs and parameters from Phase 1.5 crawling
- **Key Fields:**
  - `path`, `fullUrl`, `method` - Endpoint identification
  - `discoveredFrom` - Where this endpoint was found
  - `depth` - Crawl depth
  - `queryParameters`, `formParameters`, `jsonKeys` - Extracted parameters
  - `headers` - Observed request headers
  - `isApi`, `hasAuth`, `hasFileUpload` - Classification
  - `statusCode`, `responseTime`, `responseSize` - Response metadata
- **Relations:** Links to `Scan` and `Asset`
- **Unique Constraint:** `(scanId, fullUrl, method)` prevents duplicates
- **Use Case:** Feeds into Phase 2 AI decisions for targeted scanning

#### **ScanControl Model**
- **Purpose:** Kill switch and scan control actions
- **Key Fields:**
  - `action` - PAUSE | RESUME | STOP | SKIP_PHASE
  - `reason` - Why the action was taken
  - `executedBy`, `executedAt` - Who and when
  - `phaseBefore`, `phaseAfter` - State transitions
  - `progressBefore`, `progressAfter` - Progress tracking
- **Relations:** Links to `Scan`, `Tenant`, and `User`
- **Audit Trail:** Complete history of all control actions

### 2. Schema Enhancements to Existing Models ✅

#### **Scan Model Updates:**
- Added `roeId` foreign key to link scans to Rules of Engagement
- Added kill switch fields:
  - `killRequested` (Boolean)
  - `killRequestedAt` (DateTime)
  - `killRequestedById` (User FK)
  - `killRequestedBy` (User relation)
- Added relations: `aiDecisions`, `endpointMaps`, `controls`

#### **Vulnerability Model Updates:**
- Added deduplication fields:
  - `deduplicationKey` - Computed hash for finding uniqueness
  - `normalizedEndpoint` - URL without query params/trailing slash
  - `affectedParameter` - Specific parameter affected (for injection vulns)
  - `occurrenceCount` - How many times found across scans
- Added index on `deduplicationKey`

#### **Asset Model Updates:**
- Added `endpointMaps` relation

#### **Tenant Model Updates:**
- Added relations: `rulesOfEngagement`, `aiDecisionLedger`, `endpointMaps`, `scanControls`

#### **User Model Updates:**
- Added relations: `createdROEs`, `approvedROEs`, `scanControls`, `killRequestedScans`

### 3. New Enums ✅

- `ROEStatus` - DRAFT | PENDING_APPROVAL | APPROVED | ACTIVE | EXPIRED | REVOKED
- `ScanMethod` - DISCOVERY_ONLY | BASELINE | TARGETED | VALIDATION | FULL_ASSESSMENT
- `AIDecisionType` - TEMPLATE_SELECTION | RISK_ASSESSMENT | VALIDATION_PRIORITY | IMPACT_ANALYSIS | REMEDIATION_ADVICE
- `AIDecisionOutcome` - ACCEPTED | REJECTED | OVERRIDDEN | FALLBACK_USED
- `EndpointMethod` - GET | POST | PUT | PATCH | DELETE | OPTIONS | HEAD | UNKNOWN
- `ScanControlAction` - PAUSE | RESUME | STOP | SKIP_PHASE

---

## Next Steps (Implementation Roadmap)

### Phase 2: Backend Services (PENDING)

Create the following service files in `/Users/groot/spectra/platform/backend/src/services/`:

#### **1. roe.service.ts** (Rules of Engagement Service)
```typescript
// Functions to implement:
- createROE(data): Create new ROE with draft status
- validateTarget(target: string, roeId: string): Check if target is in scope
- validateScanMethod(method: ScanMethod, roeId: string): Check if method is allowed
- validateTimeWindow(roeId: string): Check if current time is within allowed window
- approveROE(roeId: string, userId: string): Approve ROE and activate it
- checkValidationAllowed(roeId: string): Check if exploitability validation is permitted
- enforceRateLimits(roeId: string, currentRate: number): Enforce rate limiting
- getActiveROEForScan(scanId: string): Get the ROE associated with a scan
- revokeROE(roeId: string, reason: string): Revoke an ROE
```

#### **2. ai-ledger.service.ts** (AI Decision Ledger Service)
```typescript
// Functions to implement:
- logDecision(params): Record an AI decision with inputs and outputs
- validateAIOutput(aiJson: any, allowedTags: string[], allowedScopes: string[]): Validate AI response
- markDecisionAccepted(ledgerId: string, results): Update with execution results
- markDecisionRejected(ledgerId: string, errors: string[]): Mark invalid decision
- markFallbackTriggered(ledgerId: string, reason: string): Log fallback usage
- getDecisionsForScan(scanId: string): Retrieve all AI decisions for a scan
- getDecisionStats(): Dashboard metrics for AI transparency
- hashInput(data: any): SHA256 hash for input fingerprinting
```

#### **3. endpoint-discovery.service.ts** (Phase 1.5 Crawler)
```typescript
// Functions to implement:
- discoverEndpoints(scanId: string, target: string, options): Lightweight crawl
- fetchPage(url: string): Fetch HTML content
- extractLinks(html: string, baseUrl: string): Extract same-origin links
- extractForms(html: string): Parse form fields and parameters
- extractJSEndpoints(html: string): Parse JS references for API endpoints
- classifyEndpoint(url: string, response): Determine if API, has auth, etc.
- normalizeUrl(url: string): Normalize for deduplication
- persistEndpoints(scanId: string, endpoints): Save to EndpointMap table
- getEndpointMapForScan(scanId: string): Retrieve discovered endpoints
- generateEndpointMapHash(endpoints): SHA256 hash for AI ledger
```

Crawling Rules:
- Max depth: 3 levels
- Max pages: 50 per scan
- Timeout: 5 minutes total
- Same-origin only
- Respect robots.txt
- Bounded requests (no infinite loops)

#### **4. scan-control.service.ts** (Kill Switch Service)
```typescript
// Functions to implement:
- requestKill(scanId: string, userId: string, reason?: string): Set kill flag
- checkKillRequested(scanId: string): Poll for kill signal
- pauseScan(scanId: string, userId: string, reason: string): Pause scan execution
- resumeScan(scanId: string, userId: string): Resume paused scan
- skipPhase(scanId: string, phase: OrchestrationPhase, userId: string, reason: string): Skip current phase
- logControlAction(scanId: string, action, userId, before, after): Persist to ScanControl table
- getScanControls(scanId: string): Get control history for scan
```

Integration with Orchestrator:
- Check `scan.killRequested` flag at start of each phase
- Check `checkKillRequested()` in long-running loops
- Gracefully stop Nuclei subprocess
- Update scan status to FAILED with reason "User requested stop"
- Log control action

### Phase 3: Backend Routes (PENDING)

Create REST API routes in `/Users/groot/spectra/platform/backend/src/routes/`:

#### **1. roe.routes.ts**
```typescript
// Endpoints to implement:
GET    /api/roe                   - List all ROEs (paginated, filtered)
POST   /api/roe                   - Create new ROE (ADMIN/ANALYST only)
GET    /api/roe/:id               - Get ROE details
PUT    /api/roe/:id               - Update ROE (ADMIN only)
DELETE /api/roe/:id               - Delete ROE (ADMIN only)
POST   /api/roe/:id/approve       - Approve ROE (ADMIN only)
POST   /api/roe/:id/revoke        - Revoke ROE (ADMIN only)
GET    /api/roe/:id/validate      - Validate current ROE (check time window, expiry)
GET    /api/roe/active            - Get currently active ROEs
POST   /api/roe/validate-target   - Validate if a target is in any active ROE scope
```

#### **2. ai-ledger.routes.ts**
```typescript
// Endpoints to implement:
GET    /api/ai-ledger              - List all AI decisions (paginated, filtered by type/outcome)
GET    /api/ai-ledger/:id          - Get specific AI decision details
GET    /api/ai-ledger/scan/:scanId - Get all AI decisions for a scan
GET    /api/ai-ledger/stats        - Get AI decision statistics (acceptance rate, fallback rate)
POST   /api/ai-ledger/:id/override - Manually override an AI decision (ANALYST+)
```

#### **3. scan-control.routes.ts**
```typescript
// Endpoints to implement:
POST   /api/scans/:id/kill         - Request immediate stop (ANALYST+)
POST   /api/scans/:id/pause        - Pause scan execution (ANALYST+)
POST   /api/scans/:id/resume       - Resume paused scan (ANALYST+)
POST   /api/scans/:id/skip-phase   - Skip current phase (ADMIN only)
GET    /api/scans/:id/controls     - Get control action history
GET    /api/scans/:id/kill-status  - Check if kill was requested
```

### Phase 4: Orchestrator Integration (PENDING)

Update `/Users/groot/spectra/platform/backend/src/services/scan-orchestrator.service.ts`:

#### **1. ROE Enforcement**
- At scan start, check if `scan.roeId` is set
- Call `roe.service.validateTarget()` to verify target is in scope
- Call `roe.service.validateTimeWindow()` to check allowed time
- Call `roe.service.validateScanMethod()` before each phase
- Before Phase 3 (DEEP_SCAN/Validation):
  - Check `roe.checkValidationAllowed()`
  - Require ADMIN role
  - Require explicit user approval flag

#### **2. AI Decision Ledger Integration**
- In Phase 2 (AI template selection):
  - Before calling LLaMA, hash discovery context and endpoint map
  - After AI response, call `aiLedger.logDecision()` with inputs
  - Validate AI output with `aiLedger.validateAIOutput()`
  - If validation fails, call `aiLedger.markDecisionRejected()` and trigger fallback
  - If fallback triggered, call `aiLedger.markFallbackTriggered()`
  - After scan execution, call `aiLedger.markDecisionAccepted()` with results

#### **3. Endpoint Discovery Integration**
- Add Phase 1.5 (PASSIVE_SIGNALS) to orchestration sequence:
  ```typescript
  // After Phase 1 (DISCOVERY), before Phase 2 (TARGETED_SCAN):
  if (scanProfile === 'BALANCED' || scanProfile === 'DEEP') {
    await this.executePhase1_5_EndpointDiscovery(scanId, target);
  }
  ```
- In `executePhase1_5_EndpointDiscovery()`:
  - Call `endpointDiscovery.discoverEndpoints(scanId, target)`
  - Store results in `EndpointMap` table
  - Generate endpoint map hash
  - Pass endpoint map to Phase 2 AI decision

#### **4. Kill Switch Integration**
- At start of each phase:
  ```typescript
  if (await scanControl.checkKillRequested(scanId)) {
    await this.stopScan(scanId, 'User requested stop');
    throw new Error('Scan killed by user');
  }
  ```
- In long-running loops (Nuclei execution):
  - Poll `scan.killRequested` every 5 seconds
  - If true, terminate Nuclei subprocess immediately
  - Update scan status to FAILED
  - Log control action

### Phase 5: Frontend Components (PENDING)

Create/update frontend components in `/Users/groot/spectra/platform/frontend/`:

#### **1. ROE Configuration Interface**

**File:** `app/dashboard/roe/page.tsx`
- ROE list table (name, status, validFrom, validUntil, actions)
- Create ROE button → opens modal
- ROE detail view with scope definition
- Approval workflow UI (for ADMIN)
- Status badges (DRAFT, ACTIVE, EXPIRED, etc.)

**File:** `components/ROEModal.tsx`
- Form fields:
  - Name and description
  - Scope: domains, IPs, URLs, excluded targets
  - Allowed methods (checkboxes)
  - Rate limits
  - Time windows
  - Validity period (date pickers)
- Validation: ensure scope is not empty, dates are valid
- Submit → POST /api/roe

#### **2. AI Decision Ledger Viewer**

**File:** `app/dashboard/ai-ledger/page.tsx`
- Table of all AI decisions:
  - Decision type, phase, scan, confidence, outcome, timestamp
  - Filter by: decision type, outcome, scan, date range
- Click row → opens detail modal

**File:** `components/AIDecisionDetail.tsx`
- Show complete AI decision:
  - Inputs: discovery context hash, endpoint map hash, asset criticality
  - Model: name, version, temperature
  - Output: selected templates, tags, scopes, rationale
  - Validation: outcome, errors (if rejected), fallback reason
  - Execution results: templates executed, findings generated, execution time
- "Why this was tested" / "Why this was skipped" explanation
- Option to override decision (ANALYST+ only)

#### **3. Enhanced Assets Page**

**File:** `app/dashboard/assets/page.tsx` (already exists at 606 lines)
- Add InsightVM-style features:
  - Quick filters: By environment, criticality, type
  - Bulk actions: Tag, set criticality, start scan, delete
  - Export to CSV
  - Vulnerability count column with severity breakdown
  - Last scan timestamp with "Scan now" button
  - Risk score with color-coded badges
- Table columns:
  - Name, Type, Environment, Criticality
  - IP Address, Hostname, URL
  - Risk Score, Vuln Count (Critical/High/Med/Low)
  - Last Scan, Actions
- Click row → navigate to asset detail page

**File:** `app/dashboard/assets/[id]/page.tsx` (already exists at 763 lines)
- Add "What changed since last scan" section:
  - New vulnerabilities
  - Resolved vulnerabilities
  - Risk score delta
  - Timeline visualization
- Add "Start Scan" button with ROE selector
- Add "Endpoint Map" tab showing discovered endpoints from Phase 1.5
- Add "Scan History" tab with all scans for this asset

#### **4. Kill Switch UI**

**File:** `app/dashboard/scans/[id]/page.tsx` (already exists at 322 lines)
- Add "Kill Switch" section when scan is RUNNING:
  - Big red "Stop Scan" button
  - Confirmation modal: "Are you sure? This will immediately stop the scan."
  - After click → POST /api/scans/:id/kill
  - Show status: "Kill requested, stopping scan..."
- Add "Pause" button (ANALYST+)
- Add "Skip Phase" button (ADMIN only)
- Add "Control History" section showing all control actions

**File:** `components/ScanProgress.tsx`
- Update to show phase-based progress (not raw percentages)
- Phase names:
  - "Initializing"
  - "Discovering attack surface"
  - "Collecting passive signals"
  - "Assessing vulnerabilities"
  - "Validating exploitability" (only if enabled)
  - "Correlating findings"
  - "Finalizing report"
- Real-time updates via API polling

#### **5. Scan Initiation with ROE**

**File:** `components/NewScanModal.tsx` (already exists at 13KB)
- Add ROE dropdown:
  - Fetch active ROEs: GET /api/roe/active
  - Show: name, valid until, allowed methods
  - Option: "No ROE (limited scan)"
  - Validation: If DEEP profile selected, require ROE with VALIDATION or FULL_ASSESSMENT
- Add "Exploitability validation" checkbox:
  - Only enabled if ROE allows validation
  - Requires ANALYST+ role
  - Shows warning: "This will attempt to validate findings with controlled proofs"
- Update submit logic to include `roeId`

### Phase 6: Configuration (PENDING)

Add environment variables to `/Users/groot/spectra/platform/backend/.env`:

```bash
# Nuclei Configuration
NUCLEI_BIN=/usr/local/bin/nuclei
NUCLEI_TEMPLATES_DIR=/Users/groot/nuclei-templates
NUCLEI_RATE_LIMIT=150
NUCLEI_CONCURRENCY=100
NUCLEI_TIMEOUT=900

# LLM Configuration
LLM_ENDPOINT=http://localhost:11434
LLM_MODEL=Meta-Llama-3.1-8B-Instruct-abliterated
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=2000

# Endpoint Discovery (Phase 1.5)
ENDPOINT_DISCOVERY_MAX_DEPTH=3
ENDPOINT_DISCOVERY_MAX_PAGES=50
ENDPOINT_DISCOVERY_TIMEOUT=300000
ENDPOINT_DISCOVERY_SAME_ORIGIN_ONLY=true

# ROE Enforcement
ROE_STRICT_MODE=true
ROE_VALIDATION_REQUIRES_APPROVAL=true

# AI Decision Ledger
AI_LEDGER_ENABLED=true
AI_LEDGER_LOG_INPUTS=true
```

### Phase 7: Testing (PENDING)

Create test files in `/Users/groot/spectra/platform/backend/src/services/__tests__/`:

#### **1. roe.service.test.ts**
- Test scope validation (in/out of scope)
- Test time window enforcement
- Test method validation
- Test approval workflow
- Test revocation

#### **2. ai-ledger.service.test.ts**
- Test decision logging
- Test AI output validation
- Test allowlist enforcement
- Test fallback triggering
- Test hash generation

#### **3. endpoint-discovery.service.test.ts**
- Test crawling with max depth
- Test max pages limit
- Test same-origin enforcement
- Test parameter extraction
- Test endpoint deduplication

#### **4. scan-control.service.test.ts**
- Test kill switch mechanism
- Test pause/resume
- Test phase skipping
- Test control action logging

#### **5. scan-orchestrator.test.ts**
- Test ROE enforcement at each phase
- Test AI ledger integration
- Test endpoint discovery integration
- Test kill switch integration
- Test deterministic fallback
- Test "no templates provided" prevention

---

## Database Migration

To apply the schema changes:

```bash
cd /Users/groot/spectra/platform/backend

# Generate migration
npx prisma migrate dev --name add_spectrapro_enterprise_features

# Generate Prisma Client
npx prisma generate

# View migration SQL
cat prisma/migrations/*/migration.sql
```

Expected tables to be created:
- `rules_of_engagement`
- `ai_decision_ledger`
- `endpoint_maps`
- `scan_controls`

Expected alterations:
- `scans` table: add `roeId`, `killRequested`, `killRequestedAt`, `killRequestedById`
- `vulnerabilities` table: add `deduplicationKey`, `normalizedEndpoint`, `affectedParameter`, `occurrenceCount`

---

## Security & Safety Controls

### ✅ Implemented in Schema:
1. **ROE authorization framework** - Explicit scope and method controls
2. **Validation gating** - `validationRequiresApproval` flag
3. **Kill switch** - Immediate scan termination capability
4. **AI transparency** - Complete decision audit trail
5. **Time windows** - Restrict scanning to approved times
6. **Rate limiting** - Configurable request rates
7. **Multi-tenancy** - All tables have `tenantId` for isolation

### ⏳ To Be Enforced in Code:
1. **RBAC checks** - Only ADMIN can approve ROE, trigger Phase 3
2. **Target validation** - Check every target against ROE scope before scanning
3. **Non-destructive validation** - Bounded proof techniques only (no data extraction)
4. **No weaponized payloads** - AI must not generate exploit strings
5. **Deterministic fallback** - If AI fails validation, use rules-based templates
6. **Audit logging** - Log all ROE changes, AI decisions, scan controls

---

## Architecture Principles Applied

### ✅ Asset-Centric Model:
- All findings linked to `assetId`
- Assets have risk scores, vuln counts, and scan history
- Asset hierarchy supported (parent/child relationships)

### ✅ Phase-Based Orchestration:
- State machine with explicit phases (not raw Nuclei progress)
- Each phase has clear inputs, outputs, and success criteria
- Phases can be skipped or repeated based on ROE

### ✅ AI Transparency:
- Every AI decision logged with inputs, outputs, validation, and outcomes
- Users can see "why this was tested" and "why this was skipped"
- Fallback rules are deterministic and auditable

### ✅ Enterprise UX:
- Show phases, not technical internals
- "Discovering attack surface" not "Running templates 1-500"
- InsightVM/Tenable-style asset inventory
- Professional, production-grade UI

---

## Files Modified

### Database Schema:
- `/Users/groot/spectra/platform/backend/prisma/schema.prisma` (✅ Updated)
- `/Users/groot/spectra/platform/backend/prisma/schema.prisma.backup` (✅ Created)
- `/Users/groot/spectra/platform/backend/prisma/schema-additions.prisma` (✅ Created as reference)

### Documentation:
- `/Users/groot/spectra/SPECTRAPRO_IMPLEMENTATION_SUMMARY.md` (✅ Created - this file)

---

## How to Continue Implementation

### Step 1: Apply Database Migration
```bash
cd /Users/groot/spectra/platform/backend
npx prisma migrate dev --name add_spectrapro_enterprise_features
npx prisma generate
```

### Step 2: Implement Backend Services
Create the 4 service files listed in Phase 2 above.

### Step 3: Implement Backend Routes
Create the 3 route files listed in Phase 3 above.

### Step 4: Integrate with Orchestrator
Update `scan-orchestrator.service.ts` as described in Phase 4.

### Step 5: Implement Frontend Components
Create/update the 5 UI components listed in Phase 5 above.

### Step 6: Add Configuration
Update `.env` with the config variables listed in Phase 6.

### Step 7: Write Tests
Create the test files listed in Phase 7 above.

### Step 8: End-to-End Testing
1. Create a test ROE with limited scope
2. Start a scan with the ROE attached
3. Verify ROE enforcement (target validation, time windows)
4. Verify AI ledger captures all decisions
5. Verify endpoint discovery populates EndpointMap
6. Test kill switch (stop scan mid-execution)
7. Verify deduplication works across scans

### Step 9: Documentation
- Update API documentation with new endpoints
- Create user guide for ROE configuration
- Document AI decision ledger interpretation
- Add deployment guide with new env vars

---

## Current Status Summary

### ✅ COMPLETE:
- Database schema design
- All 4 new models created
- All existing models updated with new relations
- Schema validated and formatted
- Comprehensive documentation

### ⏳ PENDING:
- Database migration execution
- Backend service implementation (4 services)
- Backend route implementation (3 route files)
- Orchestrator integration
- Frontend component implementation (5 components)
- Configuration setup
- Test suite creation
- End-to-end testing

### Estimated Remaining Work:
- **Backend Services:** 8-12 hours
- **Backend Routes:** 4-6 hours
- **Orchestrator Integration:** 6-8 hours
- **Frontend Components:** 12-16 hours
- **Testing:** 6-8 hours
- **Total:** ~40-50 hours of focused development

---

## Risk Assessment

### Low Risk:
- Schema changes are additive (no breaking changes)
- New tables are independent
- Existing models only have added relations
- Migration is reversible

### Medium Risk:
- Orchestrator integration requires careful testing
- ROE enforcement must be bulletproof (security-critical)
- Kill switch must work reliably in all phases
- AI validation must prevent invalid templates

### Mitigation:
- Comprehensive test coverage
- Staged rollout (dev → staging → production)
- Feature flags for new functionality
- Rollback plan documented

---

## Questions for Product Owner

1. **ROE Approval Workflow:** Should approval require multiple approvers (e.g., 2-person rule)?
2. **AI Model Selection:** Should users be able to choose LLM model per scan?
3. **Endpoint Discovery:** Should Phase 1.5 run for FAST profile, or only BALANCED/DEEP?
4. **Kill Switch UX:** Should kill be instant, or allow "graceful stop after current phase"?
5. **Deduplication Strategy:** Merge findings or keep separate with occurrence count?
6. **ROE Templates:** Provide pre-built ROE templates (e.g., "Production Safe", "Full Assessment")?

---

**END OF PHASE 1 IMPLEMENTATION SUMMARY**
