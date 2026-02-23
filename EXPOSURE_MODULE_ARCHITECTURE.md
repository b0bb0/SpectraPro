# Exposure Module Architecture

## Overview

The Exposure Module provides comprehensive subdomain enumeration and attack surface discovery capabilities. It identifies all subdomains associated with a root domain, determines which are active, captures visual screenshots, and presents results in an intuitive hierarchical tree visualization.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend UI                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Exposure Page                                           │   │
│  │  - Domain input form                                     │   │
│  │  - Progress indicator (enumeration phases)               │   │
│  │  - Tree visualization (hierarchical subdomain display)   │   │
│  │  - Screenshot modal viewer                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├─ POST /api/exposure/enumerate
                              ├─ GET /api/exposure/scans/:id
                              └─ GET /api/exposure/scans
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Services                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. Exposure Orchestration Service                       │   │
│  │     - Coordinates entire enumeration pipeline            │   │
│  │     - Updates scan status and progress                   │   │
│  │     - Error handling and recovery                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────┴───────────────────────────────┐   │
│  │                                                            │   │
│  ├─ 2. Subdomain Enumeration Service (Sublist3r)            │   │
│  │    - Spawns Sublist3r subprocess                          │   │
│  │    - Parses output                                        │   │
│  │    - Deduplicates and normalizes subdomains              │   │
│  │                                                            │   │
│  ├─ 3. Active Host Detection Service                         │   │
│  │    - Tests HTTP/HTTPS connectivity                        │   │
│  │    - Resolves IP addresses                                │   │
│  │    - Determines protocol and status                       │   │
│  │                                                            │   │
│  └─ 4. Screenshot Capture Service (Playwright)               │   │
│       - Headless browser automation                           │   │
│       - Screenshot capture with timeout protection           │   │
│       - Image storage and URL generation                     │   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer (PostgreSQL)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ExposureScan                                            │   │
│  │  - id, rootDomain, status, progress, phase               │   │
│  │  - totalSubdomains, activeSubdomains                     │   │
│  │  - startedAt, completedAt, tenantId                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Subdomain                                               │   │
│  │  - id, exposureScanId, subdomain, isActive               │   │
│  │  - protocol, ipAddress, statusCode, responseTime         │   │
│  │  - screenshotUrl, screenshotCapturedAt                   │   │
│  │  - createdAt, tenantId                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Execution Pipeline

### Phase 1: Subdomain Enumeration (20-60s)
```
Input: example.com
↓
Run Sublist3r:
  sublist3r -d example.com -o /tmp/output.txt
↓
Parse output → Extract subdomains
↓
Deduplicate → Normalize → Store
↓
Result: List of unique subdomains
```

### Phase 2: Active Host Detection (10-30s per batch)
```
For each subdomain:
  ├─ Test HTTPS (timeout: 5s)
  ├─ Test HTTP (timeout: 5s)
  ├─ Resolve IP address
  └─ Store: isActive, protocol, statusCode, responseTime, ipAddress
↓
Result: Active vs Inactive classification
```

### Phase 3: Screenshot Capture (2-10s per subdomain)
```
For each ACTIVE subdomain:
  ├─ Launch Playwright headless browser
  ├─ Navigate to URL (timeout: 10s)
  ├─ Wait for page load
  ├─ Capture viewport screenshot
  ├─ Save to /public/screenshots/exposure/{scanId}/{subdomain}.png
  └─ Store screenshot URL in database
↓
Result: Visual fingerprints of active subdomains
```

### Phase 4: Finalization
```
Update ExposureScan:
  - status = COMPLETED
  - totalSubdomains = count
  - activeSubdomains = active count
  - completedAt = timestamp
↓
Result: Scan ready for visualization
```

---

## Data Model

### ExposureScan
```prisma
model ExposureScan {
  id                String              @id @default(uuid())
  rootDomain        String              // e.g., "example.com"
  status            ExposureScanStatus  @default(PENDING)
  progress          Int                 @default(0)  // 0-100
  currentPhase      String?             // User-friendly phase name

  // Results
  totalSubdomains   Int                 @default(0)
  activeSubdomains  Int                 @default(0)
  errorMessage      String?

  // Timing
  startedAt         DateTime?
  completedAt       DateTime?
  duration          Int?                // Seconds

  // Metadata
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  // Multi-tenancy
  tenantId          String
  tenant            Tenant              @relation(...)

  // Relations
  subdomains        Subdomain[]
}

enum ExposureScanStatus {
  PENDING
  ENUMERATING
  DETECTING
  CAPTURING
  COMPLETED
  FAILED
}
```

### Subdomain
```prisma
model Subdomain {
  id                    String          @id @default(uuid())
  exposureScanId        String
  exposureScan          ExposureScan    @relation(...)

  // Subdomain info
  subdomain             String          // e.g., "api.example.com"
  isActive              Boolean         @default(false)
  protocol              String?         // "https" or "http"
  ipAddress             String?
  statusCode            Int?            // HTTP status code
  responseTime          Int?            // Milliseconds

  // Screenshot
  screenshotUrl         String?
  screenshotCapturedAt  DateTime?

  // Metadata
  createdAt             DateTime        @default(now())
  tenantId              String
  tenant                Tenant          @relation(...)
}
```

---

## API Endpoints

### 1. Start Enumeration
```http
POST /api/exposure/enumerate
Content-Type: application/json
Authorization: Bearer <token>

{
  "domain": "example.com"
}

Response:
{
  "success": true,
  "data": {
    "scanId": "uuid",
    "status": "PENDING",
    "message": "Enumeration started"
  }
}
```

### 2. Get Scan Status
```http
GET /api/exposure/scans/:scanId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "rootDomain": "example.com",
    "status": "CAPTURING",
    "progress": 75,
    "currentPhase": "Capturing screenshots",
    "totalSubdomains": 24,
    "activeSubdomains": 12,
    "subdomains": [
      {
        "id": "uuid",
        "subdomain": "api.example.com",
        "isActive": true,
        "protocol": "https",
        "ipAddress": "1.2.3.4",
        "statusCode": 200,
        "screenshotUrl": "/screenshots/exposure/scan-id/api.example.com.png"
      },
      ...
    ],
    "startedAt": "2026-01-26T12:00:00Z",
    "completedAt": null
  }
}
```

### 3. List Scans
```http
GET /api/exposure/scans
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "rootDomain": "example.com",
      "status": "COMPLETED",
      "totalSubdomains": 24,
      "activeSubdomains": 12,
      "createdAt": "2026-01-26T12:00:00Z",
      "completedAt": "2026-01-26T12:05:00Z"
    },
    ...
  ]
}
```

---

## Frontend Tree Visualization

### Structure
```jsx
<TreeView>
  <RootNode domain="example.com" active={true}>
    <SubdomainNode
      subdomain="api.example.com"
      active={true}
      screenshot="/screenshots/..."
      ip="1.2.3.4"
      protocol="https"
    />
    <SubdomainNode
      subdomain="admin.example.com"
      active={true}
      screenshot="/screenshots/..."
    />
    <SubdomainNode
      subdomain="old.example.com"
      active={false}
    />
  </RootNode>
</TreeView>
```

### Visual Style
- **Active subdomains**: Green indicator, screenshot thumbnail
- **Inactive subdomains**: Grey indicator, no screenshot
- **Expandable nodes**: Click to expand/collapse
- **Screenshot modal**: Click thumbnail for full view
- **Dark mode compatible**: Glass-panel styling

---

## Security Considerations

### Input Validation
- Strip protocols (`http://`, `https://`)
- Validate domain format (regex)
- Reject IP addresses
- Reject wildcards
- Maximum domain length

### Rate Limiting
- Max 5 scans per tenant per hour
- Max 10 concurrent scans platform-wide
- Queue system for excess requests

### Resource Protection
- Sublist3r timeout: 120 seconds
- HTTP check timeout: 5 seconds per subdomain
- Screenshot timeout: 10 seconds per subdomain
- Max subdomains per scan: 500
- Parallel execution limits

### Authorization
- Enforce tenant isolation
- Require authentication
- Audit log all enumeration activity

### Data Privacy
- Screenshots stored in tenant-isolated directories
- Automatic cleanup after 30 days
- No sensitive data exposure in logs

---

## Performance Optimizations

### Batch Processing
- Process active checks in batches of 10
- Parallel screenshot capture (max 3 concurrent)
- Non-blocking pipeline execution

### Caching
- Cache subdomain results for 24 hours
- Reuse active status if recently checked
- CDN for screenshot delivery

### Progress Tracking
- Real-time status updates
- Granular progress reporting (0-100%)
- Phase-based progress calculation

---

## Error Handling

### Sublist3r Failures
- Retry once on timeout
- Fallback to empty list
- Log error details

### Active Check Failures
- Mark as inactive
- Continue with remaining subdomains
- Don't fail entire scan

### Screenshot Failures
- Skip screenshot
- Mark as "capture_failed"
- Continue with remaining subdomains
- Log error for debugging

### Scan Timeout
- Maximum scan duration: 15 minutes
- Auto-mark as FAILED if exceeded
- Preserve partial results

---

## Monitoring & Logging

### Metrics
- Total scans per day
- Average scan duration
- Success vs failure rate
- Active subdomain ratio
- Screenshot capture rate

### Logs
- Enumeration start/end
- Subdomain count per scan
- Active detection results
- Screenshot capture results
- Error events with context

---

## Technology Stack

### Backend
- **Node.js / TypeScript**: Core runtime
- **Sublist3r**: Subdomain enumeration (Python tool)
- **Playwright**: Screenshot capture
- **Prisma**: Database ORM
- **Express**: API framework

### Frontend
- **Next.js / React**: UI framework
- **React Flow / D3.js**: Tree visualization
- **Tailwind CSS**: Styling
- **Lucide Icons**: UI icons

### Infrastructure
- **PostgreSQL**: Data persistence
- **File System**: Screenshot storage
- **Background Jobs**: Async processing

---

## Deployment Considerations

### Dependencies
```bash
# Install Sublist3r
pip3 install sublist3r

# Install Playwright browsers
npx playwright install chromium
```

### Environment Variables
```env
EXPOSURE_MAX_CONCURRENT_SCANS=10
EXPOSURE_SCAN_TIMEOUT=900000  # 15 minutes
EXPOSURE_SCREENSHOT_TIMEOUT=10000  # 10 seconds
EXPOSURE_SCREENSHOTS_DIR=/public/screenshots/exposure
```

### Storage
- Screenshot directory: `/public/screenshots/exposure/{scanId}/`
- Max storage per scan: 500MB
- Automatic cleanup policy

---

## Future Enhancements

### Phase 2 Features
- Port scanning integration
- SSL certificate analysis
- Technology fingerprinting (Wappalyzer)
- DNS record enumeration
- Historical tracking (subdomain changes over time)
- Export results (CSV, JSON, PDF)
- Webhook notifications on scan completion

### UX Improvements
- Interactive graph visualization
- Subdomain comparison (diff between scans)
- Risk scoring per subdomain
- Integration with vulnerability scanner

---

## Success Criteria

✅ Enumerate subdomains using Sublist3r
✅ Detect active hosts (HTTP/HTTPS)
✅ Capture screenshots automatically
✅ Store results in database
✅ Display hierarchical tree visualization
✅ Handle errors gracefully
✅ Enforce security and rate limits
✅ Production-ready code (zero placeholders)

---

**Status:** Ready for implementation
