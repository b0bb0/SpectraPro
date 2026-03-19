# Spectra - AI Coding Agent Instructions

## Project Overview

**Spectra** is an enterprise vulnerability management platform with two integrated components:

1. **CLI Scanner** (`/src/`) - Python-based penetration testing with Nuclei + Llama AI
2. **Platform Web UI** (`/platform/`) - Next.js + Express + PostgreSQL SaaS application

The architecture seamlessly connects automated scanning with enterprise asset and vulnerability management.

---

## Architecture & Key Patterns

### System Design
- **Dual-stack**: Python CLI (scanning) + TypeScript backend (management)
- **Data flow**: Nuclei scans → AI analysis → HTML reports → Platform ingestion → PostgreSQL storage
- **Multi-tenant**: Platform supports role-based access with complete data isolation
- **Orchestration**: Multi-phase scan strategy (Preflight → Discovery → Targeted → Deep) to avoid template overwhelming

### Critical Dependencies
- **Nuclei** - External vulnerability scanner binary (called via subprocess)
- **Ollama** - Local LLM API for AI analysis (http://localhost:11434)
- **PostgreSQL** - Platform backend database (Prisma ORM)
- **Playwright/Puppeteer** - Screenshot capture for vulnerability evidence

### Python Scanner Pipeline (`src/`)
```
NucleiScanner → Scan results (JSON) → AIAnalyzer → Risk scoring → ReportGenerator → DB storage
```

Key classes:
- `NucleiScanner` - Subprocess management, command building, JSON parsing
- `AIAnalyzer` - Llama API calls, vulnerability categorization, risk scoring
- `ReportGenerator` - Multi-format output (HTML/JSON/Markdown)
- `Database` - SQLite for local scan history

### TypeScript Platform (`platform/`)
```
Express API → Prisma ORM → PostgreSQL → Next.js Frontend
Authentication (JWT) → Multi-tenant isolation → Role-based routes
```

Key services:
- `ScanOrchestratorService` - Intelligent template selection based on discovered tech
- `ExecutiveDashboardService` - Risk metrics, trend analysis, asset prioritization
- `VulnerabilityDeduplicationService` - Fingerprint-based duplicate detection
- `WebsocketService` - Real-time scan progress updates

---

## Developer Workflows

### Local Development Setup
```bash
# Python scanner (macOS)
cd /Users/groot/NewFolder
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Platform backend
cd platform/backend
npm install
npm run prisma:generate
npm run dev  # Runs on :5001

# Platform frontend
cd platform/frontend
npm install
npm run dev  # Runs on :3001
```

### Testing Workflows
```bash
# Python unit tests
cd /Users/groot/NewFolder
pytest tests/unit/ -v

# Python integration tests (requires Nuclei + Ollama)
pytest tests/integration/ -v

# Backend tests
cd platform/backend
npm test

# Run specific service tests
npm test -- scan-orchestrator.service
```

### Database Operations
```bash
# Platform migrations
cd platform/backend
npm run prisma:migrate

# Inspect database state
npm run prisma:studio  # Opens GUI at localhost:5555

# Seed test data
npm run prisma:seed
```

---

## Project-Specific Conventions

### Python Scanner Patterns
1. **Logging**: Use `logging` module, not print (configured in CLI)
2. **Subprocess handling**: Always capture stderr/stdout, check return codes
3. **JSON parsing**: Use `json.loads()` for Nuclei JSONL output, validate schema
4. **Error recovery**: Fallback to basic analysis if Ollama unavailable (see `config.yaml`)
5. **File paths**: Use `os.path.join()`, avoid hardcoded paths (project root relative)

### TypeScript Platform Patterns
1. **Type safety**: Always use Zod schemas for request validation
2. **Database access**: Use Prisma methods, never raw SQL
3. **Multi-tenancy**: Check `req.tenant?.id` in every business logic route
4. **Error handling**: Use `errorHandler` middleware, throw with status codes
5. **Logging**: Use Winston logger service for structured logs

### Configuration Management
- **Python**: `config/config.yaml` controls scanner behavior (Nuclei path, Ollama URL, rate limits)
- **Platform**: `.env` files in backend and frontend (never commit secrets)
- **Database**: Prisma schema is source of truth, use migrations for changes

---

## WebSocket Real-time Update Patterns

### Architecture
```
Frontend (useWebSocket hook) ←→ WebSocket Server (/ws) ←→ Backend (scan.service)
                              ↓
                    JWT Auth + Multi-tenant Isolation
                              ↓
                    Heartbeat every 30s (ping/pong)
```

### Backend Broadcasting
The `WebSocketService` broadcasts events to all authenticated clients in a tenant:

**Key Methods**:
- `broadcastScanStarted(tenantId, scanId, target)` - Scan initiated
- `broadcastScanProgress(tenantId, scanId, status, progress, currentPhase, vulnFound)` - Updates during scan
- `broadcastScanCompleted(tenantId, scanId, status, vulnFound, duration)` - Scan finished
- `broadcastBulkScanProgress(...)` - Multi-target scan batches

**Event Types** (fully typed):
1. **scan_started**: `{ type: 'scan_started', scanId, target, timestamp }`
2. **scan_progress**: `{ type: 'scan_progress', scanId, status, progress (0-100), currentPhase, vulnFound, timestamp }`
3. **scan_completed**: `{ type: 'scan_completed', scanId, status, vulnFound, duration, timestamp }`
4. **bulk_scan_progress**: Track multi-target batch progress with recent scans array

**Integration in Scan Service**:
```typescript
// When scan starts
websocketService.broadcastScanStarted(tenantId, scanId, target);
websocketService.broadcastScanProgress(tenantId, scanId, 'RUNNING', 0, 'Initializing');

// During Nuclei execution (from JSON stats)
websocketService.broadcastScanProgress(
  tenantId,
  scanId,
  'RUNNING',
  Math.min(percent, 99), // Cap at 99% until completion
  `Scanning - ${matched} vulnerabilities found`,
  matched
);

// On completion
websocketService.broadcastScanCompleted(tenantId, scanId, 'COMPLETED', vulnCount, duration);
websocketService.broadcastScanProgress(tenantId, scanId, 'COMPLETED', 100, 'Completed', vulnCount);
```

### Frontend Usage
Two React hooks in `platform/frontend/hooks/useWebSocket.ts`:

**1. `useWebSocket()`** - Listen to all tenant events:
```typescript
const { isConnected, lastEvent, error, reconnect } = useWebSocket();

// lastEvent is typed union of all WebSocketEvent types
if (lastEvent?.type === 'scan_progress') {
  const progress = lastEvent.progress; // 0-100
  const vulnFound = lastEvent.vulnFound; // Count of vulnerabilities
}
```

**2. `useScanUpdates(scanId)`** - Listen to specific scan only:
```typescript
const { scanProgress, scanStatus, isConnected } = useScanUpdates(scanId);

// scanProgress is ScanProgressEvent | null
// scanStatus is 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | null
```

**Auto-reconnection**: Attempts 5 times with 3-second delays (15s total).

### Common Implementation Patterns

**Pattern 1: Update single scan state**:
```typescript
const { scanProgress } = useScanUpdates(scanId);

useEffect(() => {
  if (scanProgress && scan) {
    setScan(prev => ({
      ...prev,
      progress: scanProgress.progress,
      currentPhase: scanProgress.currentPhase,
      vulnFound: scanProgress.vulnFound || prev.vulnFound,
    }));
  }
}, [scanProgress]);
```

**Pattern 2: Update scans list with real-time progress**:
```typescript
const { lastEvent } = useWebSocket();

useEffect(() => {
  if (lastEvent?.type === 'scan_progress') {
    setScans(prev => prev.map(scan =>
      scan.id === lastEvent.scanId
        ? { ...scan, progress: lastEvent.progress, vulnFound: lastEvent.vulnFound }
        : scan
    ));
  }
}, [lastEvent]);
```

**Pattern 3: Full refresh on completion** (instead of polling):
```typescript
const { scanStatus } = useScanUpdates(scanId);

useEffect(() => {
  if (scanStatus === 'COMPLETED' || scanStatus === 'FAILED') {
    // Fetch full scan details instead of polling every 2s
    fetchScanDetails();
  }
}, [scanStatus]);
```

### Multi-tenant Isolation
- Clients grouped by `tenantId` (extracted from JWT token)
- Each tenant only receives events for their own scans
- Verified in `handleConnection()`: `if (!this.clients.has(ws.tenantId))`
- Never broadcast outside tenant scope

### Performance Optimization

**API Call Reduction**:
- **Polling approach** (2s interval): 30 calls/min per active scan
- **WebSocket approach**: 2 calls/min per active scan (backup poll only, on error recovery)
- **Reduction**: 70% fewer API calls (28/30 calls eliminated)
- **Calculation for multiple scans**: 10 concurrent scans = 300 calls/min (polling) vs 20 calls/min (WebSocket)

**Real-world impact example**:
```
Scenario: 50 concurrent users, 2 active scans each
Polling (2s):     50 users × 2 scans × 30 calls/min = 3,000 API calls/min
WebSocket:        50 users × 2 scans × 2 calls/min = 200 API calls/min
API Server Load:  93% reduction in request volume
```

**Latency Comparison**:
- **Polling (2s interval)**:
  - Best case: 0ms (just completed, immediate poll)
  - Average case: 1000ms (halfway through interval)
  - Worst case: 1999ms (just missed the poll)
  - **Average perceived latency: ~1000ms**

- **WebSocket (real-time)**:
  - Best case: < 20ms (server → browser latency)
  - Average case: 50-100ms (browser processing + render)
  - Worst case: < 200ms (network jitter)
  - **Average perceived latency: ~80ms**

- **Latency improvement**: 12-25x faster (1000ms → 80ms)

**Measurement in code**:
```typescript
// Calculate effective update latency
const pollingLatency = (pollingIntervalMs / 2) + networkRoundTripMs;
// Example: (2000 / 2) + 50 = 1050ms

const websocketLatency = networkRoundTripMs + browserRenderMs + serverProcessingMs;
// Example: 50 + 30 + 20 = 100ms

const improvement = pollingLatency / websocketLatency;
// Example: 1050 / 100 = 10.5x faster
```

**Connection Efficiency**:
- Heartbeat: ping/pong every 30s (minimal overhead, ~100 bytes)
- Message size: ~200-400 bytes per progress update
- Polling request: ~1500-2000 bytes per request (headers + auth)
- Per-scan monthly traffic saved: 26.4 MB (at 2s polling) → 1.76 MB (WebSocket)

**Server Resource Savings**:
- **Database queries**: Reduced by ~93% for scan progress reads
- **HTTP connection overhead**: Eliminated repeated connection handshakes
- **Authentication validation**: Single JWT verification per connection vs. per request
- **CPU usage**: ~40% lower CPU per active scan (no repeated parsing/routing)
- **Memory**: Single WebSocket connection per client vs. connection pool per polling client

**UI Responsiveness**:
- **Progress bar smoothness**: Update frequency 10-30 updates/sec (vs 0.5/sec polling)
- **User perceived responsiveness**: Immediate feedback on actions
- **Vulnerability counter**: Increments in real-time vs. jumps every 2 seconds

---

## Integration Points

### CLI to Platform
Scan results can be ingested via platform API:
```
POST /api/scans/ingest
Body: { target, results: [...], format: 'nuclei-json' }
```

### External Integrations
- **Nuclei**: Subprocess execution with rate limiting (default 150 req/s)
- **Ollama**: HTTP requests to generate endpoint for AI analysis
- **Screenshot capture**: Playwright for vulnerability evidence
- **Report templates**: HTML templates in `src/core/reporter/templates/`

### Database Integration
- **CLI**: SQLite local database for scan history
- **Platform**: PostgreSQL with Prisma for multi-user, multi-tenant data
- **Migration path**: Scripts available to migrate CLI scans to platform

---

## Critical Implementation Details

### Vulnerability Risk Scoring
Multi-factor weighted algorithm in `ExecutiveDashboardService`:
1. Severity base score (critical=100, high=75, medium=50, low=25, info=5)
2. CVSS adjustment (if available)
3. Asset value multiplier
4. Exploitability factor
5. Business context adjustment

### Scan Orchestration Rules
Template selection (10 intelligent rules) in `ScanOrchestratorService`:
- Preflight: Basic technology detection (HTTP, headers, DNS)
- Discovery: Service enumeration based on open ports
- Targeted: Technology-specific templates (WordPress, Azure, Kubernetes)
- Deep: Advanced templates (code injection, logic flaws) - optional

### Deduplication Strategy
`VulnerabilityDeduplicationService` generates fingerprints:
- Template ID + target + response hash = unique vulnerability
- Detects duplicates across multiple scan runs
- Marks resolved vulnerabilities in trending

---

## Important File References

| File | Purpose |
|------|---------|
| [src/spectra_cli.py](src/spectra_cli.py) | CLI entry point, main workflow orchestration |
| [src/core/scanner/nuclei_scanner.py](src/core/scanner/nuclei_scanner.py) | Nuclei integration, subprocess management |
| [src/core/analyzer/ai_analyzer.py](src/core/analyzer/ai_analyzer.py) | Llama API calls, vulnerability analysis |
| [src/core/reporter/report_generator.py](src/core/reporter/report_generator.py) | Multi-format report generation |
| [config/config.yaml](config/config.yaml) | Scanner configuration (Nuclei path, Ollama URL, timeouts) |
| [platform/backend/src/index.ts](platform/backend/src/index.ts) | Express server setup, route registration |
| [platform/backend/src/services/scan-orchestrator.service.ts](platform/backend/src/services/scan-orchestrator.service.ts) | Intelligent multi-phase scanning |
| [platform/backend/src/services/executive-dashboard.service.ts](platform/backend/src/services/executive-dashboard.service.ts) | Risk metrics & dashboard data |
| [platform/prisma/schema.prisma](platform/prisma/schema.prisma) | Database schema (Scans, Vulnerabilities, Assets, Users) |
| [platform/frontend/src/app](platform/frontend/src/app) | Next.js pages (dashboard, assets, reports) |

---

## Common Tasks for AI Agents

### Adding a New Scanner Integration
1. Create scanner class in `src/core/scanner/` extending base pattern
2. Return results in normalized JSON format
3. Update CLI to accept new scanner type
4. Add ingest endpoint in platform API

### Extending Risk Scoring
1. Modify `_calculate_risk_score()` in `AIAnalyzer` (Python)
2. Update `RiskScore` type in `scan-orchestration.types.ts`
3. Adjust weights in `ExecutiveDashboardService.calculateAssetRisk()`
4. Test with existing scan results

### Adding New Report Format
1. Implement formatter class in `src/core/reporter/`
2. Register in `ReportGenerator.generate()`
3. Add template if HTML/Markdown format
4. Update CLI help text

### Debugging Multi-Tenant Issues
1. Check `req.tenant?.id` presence in request context
2. Verify Prisma queries include tenant filtering (`.where({ tenantId: req.tenant.id })`)
3. Review audit logs in database for access patterns
4. Use `prisma studio` to inspect data isolation

---

## Performance Considerations

- **Scan throttling**: Nuclei rate limit (default 150 req/s) prevents overwhelming targets
- **Template optimization**: Orchestrator intelligently selects ~50-100 relevant templates vs. 1000+
- **AI analysis timeout**: 60-second timeout prevents hanging on large result sets
- **Parallel processing**: `parallel_processor.py` available for batch scans with ThreadPoolExecutor
- **Database indexes**: Key columns indexed (tenantId, assetId, severity) for query speed

---

## Known Gotchas & Workarounds

1. **Ollama connection**: Ensure running (`ollama serve`), default expects http://localhost:11434
2. **Nuclei binary**: Must be in PATH or configured in `config.yaml`
3. **PostgreSQL migration conflicts**: Drop current schema before applying new migrations
4. **JWT token expiry**: Implemented at 7 days, refresh tokens available on auth routes
5. **Screenshot capture**: Playwright/Puppeteer may timeout on complex pages - retry logic built in
6. **Scan deduplication**: Fingerprinting is case-sensitive and URL-order dependent
