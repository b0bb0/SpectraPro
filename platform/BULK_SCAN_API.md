# Bulk Scan API Documentation

**Version**: 1.0
**Last Updated**: January 27, 2026

## Overview

The Bulk Scan API endpoint allows you to initiate multiple vulnerability scans in parallel with a single API call. This is ideal for scanning large attack surfaces, conducting assessments across multiple assets, or automated security monitoring.

## Endpoint

```
POST /api/scans/bulk
```

## Authentication

Requires authentication via JWT token (httpOnly cookie). Must be logged in to the platform.

**Headers:**
```
Content-Type: application/json
Cookie: token=<jwt_token>
```

## Request Body

```json
{
  "targets": [
    "https://example.com",
    "https://test.example.com",
    "https://staging.example.com"
  ],
  "scanLevel": "normal",
  "deepScanAuthorized": false,
  "maxConcurrent": 3
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targets` | string[] | ✅ Yes | Array of target URLs to scan (1-50 targets) |
| `scanLevel` | enum | ✅ Yes | Scan intensity: `"light"`, `"normal"`, or `"extreme"` |
| `deepScanAuthorized` | boolean | ❌ No | Authorization for aggressive scanning (default: false) |
| `maxConcurrent` | number | ❌ No | Maximum concurrent scans (1-10, default: 3) |

### Validation Rules

- **targets**:
  - Minimum 1 target
  - Maximum 50 targets per request
  - Each target must be a non-empty string

- **scanLevel**:
  - Must be one of: `light`, `normal`, `extreme`
  - `light`: Quick scan with basic templates
  - `normal`: Comprehensive scan (recommended)
  - `extreme`: Deep scan with all templates (requires authorization)

- **maxConcurrent**:
  - Minimum: 1
  - Maximum: 10
  - Controls server-side parallelism
  - Higher values = faster completion but more resource usage

## Response

### Success Response (202 Accepted)

The bulk scan is initiated asynchronously. The response includes a batch ID for tracking.

```json
{
  "success": true,
  "data": {
    "batchId": "batch_1706356800_abc123",
    "totalTargets": 3,
    "maxConcurrent": 3,
    "message": "Bulk scan initiated. Scans are running in the background.",
    "status": "INITIATED"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful requests |
| `data.batchId` | string | Unique identifier for this bulk scan batch |
| `data.totalTargets` | number | Number of targets in the batch |
| `data.maxConcurrent` | number | Configured concurrent scan limit |
| `data.message` | string | Human-readable status message |
| `data.status` | string | Batch status (always "INITIATED" initially) |

### Error Responses

#### 400 Bad Request - Validation Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "code": "too_small",
        "minimum": 1,
        "type": "array",
        "path": ["targets"],
        "message": "At least one target is required"
      }
    ]
  }
}
```

#### 400 Bad Request - Missing Authentication Data

```json
{
  "success": false,
  "error": {
    "code": "MISSING_AUTH_DATA",
    "message": "Authentication data not found"
  }
}
```

#### 503 Service Unavailable - Scanner Not Available

```json
{
  "success": false,
  "error": {
    "code": "SCANNER_NOT_AVAILABLE",
    "message": "Nuclei scanner is not installed on the server"
  }
}
```

## Usage Examples

### Basic Bulk Scan

```bash
curl -X POST http://localhost:5001/api/scans/bulk \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "targets": [
      "https://example.com",
      "https://test.example.com",
      "https://staging.example.com"
    ],
    "scanLevel": "normal"
  }'
```

### High-Performance Scan (10 Concurrent)

```bash
curl -X POST http://localhost:5001/api/scans/bulk \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "targets": [
      "https://site1.example.com",
      "https://site2.example.com",
      "https://site3.example.com",
      "https://site4.example.com",
      "https://site5.example.com"
    ],
    "scanLevel": "normal",
    "maxConcurrent": 10
  }'
```

### Light Scan for Quick Assessment

```bash
curl -X POST http://localhost:5001/api/scans/bulk \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "targets": [
      "https://subdomain1.example.com",
      "https://subdomain2.example.com"
    ],
    "scanLevel": "light",
    "maxConcurrent": 5
  }'
```

## Frontend Integration

### Using the API Client

```typescript
import { scansAPI } from '@/lib/api';

// Start bulk scan
const result = await scansAPI.bulkScan({
  targets: [
    'https://example.com',
    'https://test.example.com',
    'https://staging.example.com'
  ],
  scanLevel: 'normal',
  maxConcurrent: 3
});

console.log('Batch ID:', result.batchId);
console.log('Status:', result.status);
```

### React Component Example

```typescript
'use client'

import { useState } from 'react';
import { scansAPI } from '@/lib/api';

export function BulkScanForm() {
  const [targets, setTargets] = useState('');
  const [scanLevel, setScanLevel] = useState<'light' | 'normal' | 'extreme'>('normal');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Parse targets (one per line)
      const targetList = targets
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const result = await scansAPI.bulkScan({
        targets: targetList,
        scanLevel,
        maxConcurrent: 3
      });

      setResult(result);
      alert(`Bulk scan initiated! Batch ID: ${result.batchId}`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={targets}
        onChange={(e) => setTargets(e.target.value)}
        placeholder="Enter targets (one per line)"
        rows={10}
      />

      <select value={scanLevel} onChange={(e) => setScanLevel(e.target.value as any)}>
        <option value="light">Light</option>
        <option value="normal">Normal</option>
        <option value="extreme">Extreme</option>
      </select>

      <button type="submit" disabled={loading}>
        {loading ? 'Starting...' : 'Start Bulk Scan'}
      </button>

      {result && (
        <div>
          <h3>Scan Initiated</h3>
          <p>Batch ID: {result.batchId}</p>
          <p>Targets: {result.totalTargets}</p>
          <p>Status: {result.status}</p>
        </div>
      )}
    </form>
  );
}
```

## Tracking Scan Progress

Currently, scans run in the background. To track progress:

1. **Individual Scans**: Query `/api/scans` endpoint to list all scans
2. **Filter by Tenant**: All scans are automatically filtered by your tenant
3. **Sort by Date**: Recent scans appear first

### Future Enhancement: Real-time Tracking

WebSocket support for real-time progress tracking is planned:

```javascript
// Future API (not yet implemented)
const ws = new WebSocket('ws://localhost:5001/api/scans/bulk/track');
ws.send(JSON.stringify({ batchId: 'batch_123' }));

ws.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Progress: ${progress.completed}/${progress.total}`);
};
```

## Performance Characteristics

### Scan Duration

Approximate times per target (depends on target complexity):

| Scan Level | Avg Duration | Templates |
|------------|--------------|-----------|
| Light | 30-60 sec | ~500 templates |
| Normal | 1-3 min | ~2000 templates |
| Extreme | 3-10 min | ~5000 templates |

### Batch Processing

With `maxConcurrent = 3`:

| Total Targets | Estimated Time |
|---------------|----------------|
| 5 targets | 2-5 minutes |
| 10 targets | 4-10 minutes |
| 20 targets | 7-15 minutes |
| 50 targets | 15-40 minutes |

Higher concurrency reduces total time but increases resource usage.

## Rate Limiting & Best Practices

### Recommended Limits

- **Development**: 1-3 concurrent scans
- **Production Server**: 5-10 concurrent scans
- **Dedicated Scanner**: 10-15 concurrent scans

### Best Practices

1. **Start Small**: Test with 2-3 targets before scaling up
2. **Monitor Resources**: Watch CPU, memory, and network usage
3. **Schedule Off-Peak**: Run large batches during low-traffic periods
4. **Respect Rate Limits**: Some targets may have WAFs or rate limiting
5. **Use Appropriate Scan Levels**:
   - `light` for reconnaissance
   - `normal` for standard assessments
   - `extreme` only when authorized

### Target Authorization

**CRITICAL**: Only scan targets you own or have explicit written authorization to test. Unauthorized scanning is illegal and unethical.

The `deepScanAuthorized` flag should only be set to `true` when:
- You have written authorization
- The target owner expects aggressive testing
- You understand the potential for false positives

## Security Considerations

### Multi-Tenant Isolation

- All scans are automatically associated with your tenant
- You can only view scans from your tenant
- Cross-tenant data leakage is prevented at the database level

### Authentication

- JWT tokens expire after 24 hours (configurable)
- Refresh tokens before long-running operations
- Use httpOnly cookies to prevent XSS attacks

### Scan Authorization

The platform enforces:
- User must be authenticated
- User must belong to an active tenant
- Scan level restrictions based on subscription tier (future feature)

## Troubleshooting

### "Validation failed" Error

Check that:
- `targets` array has 1-50 items
- Each target is a non-empty string
- `scanLevel` is one of: `light`, `normal`, `extreme`
- `maxConcurrent` is between 1-10

### "Nuclei scanner is not installed" Error

The server doesn't have Nuclei installed. Contact your administrator to:
```bash
# Install Nuclei
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# Or via package manager
brew install nuclei  # macOS
```

### "Authentication data not found" Error

Your session has expired. Log in again:
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"user@example.com","password":"password"}'
```

### Scans Not Appearing in List

Scans run asynchronously in the background. Wait a few minutes, then:

```bash
curl http://localhost:5001/api/scans -b cookies.txt
```

Sort by `createdAt` to find recent scans.

## Related Endpoints

- `GET /api/scans` - List all scans
- `GET /api/scans/:id` - Get scan details
- `POST /api/scans` - Start single scan
- `POST /api/scans/ingest` - Ingest external scan results (coming soon)

## Changelog

### v1.0 (January 27, 2026)
- ✅ Initial bulk scan endpoint implementation
- ✅ Validation with Zod schemas
- ✅ Configurable concurrency control
- ✅ Background async execution
- ✅ Multi-tenant isolation
- ✅ Error handling and logging

### Planned Features
- [ ] Real-time progress tracking via WebSocket
- [ ] Batch status endpoint (`GET /api/scans/bulk/:batchId`)
- [ ] Scan cancellation
- [ ] Email notifications on completion
- [ ] Export batch results to CSV
- [ ] Resume interrupted batches

---

**Need Help?**
- GitHub Issues: https://github.com/spectra/issues
- Documentation: /docs
- Support: support@spectra.security
