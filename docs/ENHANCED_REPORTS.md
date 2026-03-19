# Enhanced HTML Reports

Spectra now generates enhanced HTML reports with interactive features and detailed vulnerability information.

## New Features

### 1. **Prominent Target URL Display**
- Target URL is now displayed in a large, prominent box in the header
- Easy to identify which system was scanned

### 2. **Collapsible Vulnerability Sections** ▶
- Each vulnerability type is collapsible/expandable
- Click on any finding to expand and see all details
- Reduces visual clutter while maintaining full detail access

### 3. **Multiple Occurrences Management**
- Shows count badge for vulnerabilities found multiple times
- Example: "3 occurrences" badge
- All affected URLs are listed in the expandable section

### 4. **Exact URLs for Each Finding**
- Every occurrence shows the exact URL where the vulnerability was found
- Clickable links that open in new tab
- URLs are displayed in monospace font for clarity
- Shows matcher name when available

### 5. **Extracted Data Display**
- When Nuclei extracts data (like API keys, tokens, etc.), it's displayed
- Highlighted in a yellow box for visibility
- Shows up to 5 extracted items per occurrence

### 6. **Better Organization**
- Vulnerabilities grouped by template ID
- Shows template ID as code
- Description boxes with purple background for readability
- Severity badges with color coding:
  - 🔴 Critical (Red)
  - 🟠 High (Orange)
  - 🟡 Medium (Yellow)
  - 🟢 Low (Green)
  - 🔵 Info (Blue)

## Viewing Reports

### Open Latest Report
```bash
# From spectra directory
open data/reports/report_*.html
```

### Regenerate Report from Existing Scan
```bash
# List available scans
./src/spectra_cli.py list

# Regenerate report with enhanced format
python3 scripts/regenerate_report.py <scan_id> html
```

## Screenshot Capability (Optional)

To enable automatic screenshots for visual findings like exposed APIs, dashboards, etc.:

### 1. Install Playwright
```bash
# From spectra directory
source venv/bin/activate
pip install playwright
playwright install chromium
```

### 2. Screenshots Will Be Captured For
- Exposed Swagger APIs
- Admin panels
- Login pages
- Configuration pages
- Directory listings
- Debug consoles
- High/Critical severity findings

### 3. View Screenshots
Screenshots are embedded directly in the HTML report as base64 images.

## Report Structure

```
Enhanced HTML Report
├── Header
│   └── Target URL (prominent display)
├── Risk Assessment
│   └── Overall score and total count
├── Vulnerability Breakdown
│   └── Count by severity table
├── AI Analysis
│   └── Llama-generated insights
└── Detailed Findings
    ├── Finding 1 (Collapsible)
    │   ├── Description
    │   ├── Template ID
    │   ├── Occurrence #1
    │   │   ├── Exact URL (clickable)
    │   │   ├── Matcher name
    │   │   └── Extracted data (if any)
    │   └── Occurrence #2...
    └── Finding 2 (Collapsible)
        └── ...
```

## Interactive Elements

### Expand/Collapse Sections
- Click on any vulnerability header to expand/collapse
- Arrow icon (▶) rotates when expanded
- Hover effect for better UX

### Clickable URLs
- All affected URLs are clickable links
- Open in new tab for investigation
- Monospace font for technical clarity

### Visual Hierarchy
- Color-coded severity badges
- Count badges for multiple occurrences
- Border colors match severity
- Clear visual separation between sections

## Example Usage

### Generate New Scan with Enhanced Report
```bash
./src/spectra_cli.py scan https://example.com --format html
```

### Regenerate Old Scan
```bash
# Find scan ID
./src/spectra_cli.py list

# Regenerate with new format
python3 scripts/regenerate_report.py scan_20260122_152204 html
```

### Generate Multiple Formats
```bash
# HTML (enhanced)
./src/spectra_cli.py scan https://example.com --format html

# Markdown (for documentation)
./src/spectra_cli.py scan https://example.com --format markdown

# JSON (for automation)
./src/spectra_cli.py scan https://example.com --format json
```

## Troubleshooting

### Screenshots Not Working
If screenshots aren't being captured:

1. Check if Playwright is installed:
```bash
pip list | grep playwright
```

2. Install chromium browser:
```bash
playwright install chromium
```

3. Check logs for errors:
```bash
tail -f logs/spectra.log
```

### Report Not Opening
```bash
# Open manually
open /Users/groot/spectra/data/reports/report_XXXXXXXX_XXXXXX.html

# Or use browser directly
firefox data/reports/report_*.html
```

## Benefits

✅ **Better Organization** - Grouped by vulnerability type
✅ **Reduced Clutter** - Collapsible sections
✅ **Full Detail** - All URLs and data available on demand
✅ **Easy Navigation** - Click to expand, clickable URLs
✅ **Visual Clarity** - Color-coded severity, badges, clean layout
✅ **Professional Look** - Modern design, responsive layout
✅ **Investigation Ready** - Direct links to affected endpoints

---

*Report enhancements powered by Spectra AI Penetration Testing*
