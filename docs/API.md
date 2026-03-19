# Spectra API Documentation

## Base URL
```
http://localhost:5000
```

## Authentication
Currently, API key authentication is optional. Enable it in `config/config.yaml`:

```yaml
security:
  require_api_key: true
  api_keys:
    - "your-secret-key-here"
```

When enabled, include the API key in headers:
```
Authorization: Bearer your-secret-key-here
```

## Endpoints

### Health Check

Check API status.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "service": "Spectra AI Penetration Testing",
  "version": "1.0.0"
}
```

---

### Initiate Scan

Start a new vulnerability scan.

**Endpoint**: `POST /api/scan`

**Request Body**:
```json
{
  "target": "https://example.com",
  "scan_type": "full",
  "severity": ["critical", "high"],
  "tags": ["cve"],
  "auto_analyze": true
}
```

**Parameters**:
- `target` (required): Target URL or IP address
- `scan_type` (optional): Scan type - "full", "quick", or "custom" (default: "full")
- `severity` (optional): Array of severity levels to filter - ["critical", "high", "medium", "low", "info"]
- `tags` (optional): Array of tags to filter templates
- `auto_analyze` (optional): Automatically analyze after scan (default: true)

**Response**:
```json
{
  "scan_id": "scan_20240115_143022",
  "target": "https://example.com",
  "status": "completed",
  "vulnerabilities_found": 15,
  "analysis": {
    "risk_score": 72.5,
    "total_vulnerabilities": 15,
    "categorized_vulnerabilities": {...},
    "ai_analysis": "...",
    "recommendations": [...]
  }
}
```

**Status Codes**:
- `200 OK`: Scan completed successfully
- `400 Bad Request`: Invalid request parameters
- `500 Internal Server Error`: Scan failed

---

### List Scans

Retrieve list of recent scans.

**Endpoint**: `GET /api/scans`

**Query Parameters**:
- `limit` (optional): Number of scans to return (default: 50)

**Response**:
```json
{
  "scans": [
    {
      "scan_id": "scan_20240115_143022",
      "target": "https://example.com",
      "status": "completed",
      "start_time": "2024-01-15T14:30:22",
      "vulnerabilities_count": 15,
      "risk_score": 72.5
    }
  ],
  "count": 1
}
```

---

### Get Scan Details

Retrieve detailed information about a specific scan.

**Endpoint**: `GET /api/scans/<scan_id>`

**Response**:
```json
{
  "scan": {
    "scan_id": "scan_20240115_143022",
    "target": "https://example.com",
    "status": "completed",
    "start_time": "2024-01-15T14:30:22",
    "end_time": "2024-01-15T14:35:45",
    "vulnerabilities_count": 15,
    "risk_score": 72.5,
    "scan_data": "{...}"
  },
  "vulnerabilities": [...],
  "analysis": {...}
}
```

**Status Codes**:
- `200 OK`: Scan found
- `404 Not Found`: Scan ID not found

---

### Analyze Scan

Perform AI analysis on scan results.

**Endpoint**: `POST /api/analyze/<scan_id>`

**Response**:
```json
{
  "status": "completed",
  "timestamp": "2024-01-15T14:35:45",
  "target": "https://example.com",
  "total_vulnerabilities": 15,
  "risk_score": 72.5,
  "categorized_vulnerabilities": {
    "by_severity": {
      "critical": 2,
      "high": 5,
      "medium": 6,
      "low": 2,
      "info": 0
    },
    "by_type": {
      "http": 12,
      "dns": 3
    }
  },
  "ai_analysis": "Detailed AI-generated analysis...",
  "recommendations": [
    {
      "vulnerability": "SQL Injection",
      "severity": "critical",
      "count": 2,
      "recommendation": "Immediate patching required...",
      "affected_endpoints": [...]
    }
  ],
  "executive_summary": "..."
}
```

**Status Codes**:
- `200 OK`: Analysis completed
- `404 Not Found`: Scan not found
- `500 Internal Server Error`: Analysis failed

---

### Generate Report

Generate a security report for a scan.

**Endpoint**: `POST /api/report/<scan_id>`

**Request Body**:
```json
{
  "format": "html"
}
```

**Parameters**:
- `format` (optional): Report format - "json", "html", or "markdown" (default: "html")

**Response**:
```json
{
  "report_id": "report_20240115_143600",
  "format": "html",
  "file_path": "data/reports/report_20240115_143600.html",
  "timestamp": "2024-01-15T14:36:00",
  "status": "completed"
}
```

**Status Codes**:
- `200 OK`: Report generated
- `404 Not Found`: Scan or analysis not found
- `500 Internal Server Error`: Report generation failed

---

### Get Vulnerabilities

Get all vulnerabilities for a specific scan.

**Endpoint**: `GET /api/vulnerabilities/<scan_id>`

**Response**:
```json
{
  "scan_id": "scan_20240115_143022",
  "count": 15,
  "vulnerabilities": [
    {
      "id": 1,
      "scan_id": "scan_20240115_143022",
      "template_id": "CVE-2021-12345",
      "name": "SQL Injection",
      "severity": "critical",
      "matched_at": "https://example.com/login",
      "vulnerability_data": "{...}"
    }
  ]
}
```

---

### Update Templates

Update Nuclei templates to latest version.

**Endpoint**: `POST /api/templates/update`

**Response**:
```json
{
  "status": "success",
  "message": "Templates updated"
}
```

**Status Codes**:
- `200 OK`: Update successful
- `500 Internal Server Error`: Update failed

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

## Rate Limiting

Rate limiting can be enabled in configuration:

```yaml
api:
  rate_limiting:
    enabled: true
    requests_per_minute: 60
```

When rate limit is exceeded:
```json
{
  "error": "Rate limit exceeded. Try again later."
}
```
Status Code: `429 Too Many Requests`

## Example Usage

### Python
```python
import requests

# Start a scan
response = requests.post('http://localhost:5000/api/scan', json={
    'target': 'https://testfire.net',
    'severity': ['critical', 'high'],
    'auto_analyze': True
})

scan_data = response.json()
scan_id = scan_data['scan_id']

# Generate HTML report
report_response = requests.post(
    f'http://localhost:5000/api/report/{scan_id}',
    json={'format': 'html'}
)

report_data = report_response.json()
print(f"Report saved to: {report_data['file_path']}")
```

### cURL
```bash
# Start scan
curl -X POST http://localhost:5000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://testfire.net",
    "severity": ["critical", "high"],
    "auto_analyze": true
  }'

# List scans
curl http://localhost:5000/api/scans

# Get scan details
curl http://localhost:5000/api/scans/scan_20240115_143022

# Generate report
curl -X POST http://localhost:5000/api/report/scan_20240115_143022 \
  -H "Content-Type: application/json" \
  -d '{"format": "html"}'
```

### JavaScript
```javascript
// Start a scan
fetch('http://localhost:5000/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target: 'https://testfire.net',
    severity: ['critical', 'high'],
    auto_analyze: true
  })
})
  .then(response => response.json())
  .then(data => {
    console.log('Scan ID:', data.scan_id);
    console.log('Risk Score:', data.analysis.risk_score);
  });
```

## WebSocket Support (Future)

Real-time scan progress updates will be available via WebSocket in a future release:

```javascript
const ws = new WebSocket('ws://localhost:5000/ws/scan/<scan_id>');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progress:', data.progress);
  console.log('Status:', data.status);
};
```
