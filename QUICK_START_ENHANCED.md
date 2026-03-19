# Enhanced Vulnerability Analysis CLI - Quick Start Guide

**Status**: ✅ Phase 1 Implementation Complete
**Date**: 2026-02-22
**Version**: 2.0 (Enhanced)

---

## 🚀 Installation

```bash
# Navigate to project directory
cd /Users/groot/NewFolder/

# Activate virtual environment
source venv/bin/activate

# Install dependencies (if not already done)
python3 -m pip install -r requirements.txt
```

---

## 💡 5-Minute Quick Start

### 1. Preview What Will Be Analyzed
```bash
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl --dry-run
```

**Output**: Shows list of vulnerabilities that would be analyzed (no processing)

### 2. Generate HTML Report
```bash
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl \
  --format html -o report.html
```

**Result**: `report.html` - Professional formatted report, ready to share

### 3. Generate CSV for Excel
```bash
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl \
  --format csv -o vulnerabilities.csv
```

**Result**: `vulnerabilities.csv` - Opens in Excel, sortable & filterable

### 4. Filter by Severity
```bash
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl \
  --severity critical,high \
  --format html -o critical_issues.html
```

**Result**: Report with only CRITICAL and HIGH severity vulnerabilities

---

## 📋 Common Workflows

### Workflow 1: Get Management Summary
```bash
# 1. Preview what will be analyzed
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl --dry-run

# 2. Generate HTML report for presentation
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --format html -o executive_summary.html

# 3. Share executive_summary.html with stakeholders
open executive_summary.html
```

### Workflow 2: Focus on High-Priority Issues
```bash
# 1. Filter to critical/high only
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --severity critical,high \
  --dry-run

# 2. Generate CSV for tracking
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --severity critical,high \
  --format csv -o critical_vulnerabilities.csv

# 3. Import into tracking system
# (Open critical_vulnerabilities.csv in Excel)
```

### Workflow 3: Deep Technical Analysis
```bash
# 1. Get comprehensive analysis with all modes
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --all-analysis \
  --format html \
  -o comprehensive_analysis.html

# 2. Also save as JSON for programmatic access
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --all-analysis \
  --format json \
  -o comprehensive_analysis.json
```

### Workflow 4: Risk Assessment Only
```bash
# Generate risk assessment in plain text
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --risk-only \
  --format txt \
  -o risk_assessment.txt
```

---

## 🎯 Key Features

### ✨ Multi-Format Output
| Format | Use Case | Command |
|--------|----------|---------|
| **JSON** | Data integration, programmatic access | `--format json` |
| **CSV** | Excel spreadsheets, metrics | `--format csv` |
| **HTML** | Presentations, web sharing | `--format html` |
| **TXT** | Email, plain text reports | `--format txt` |

### 🔍 Smart Filtering
```bash
# By severity (critical, high, medium, low, info)
--severity critical,high

# By type (http, dns, network, etc)
--type http,dns

# Include patterns
--include-patterns "sql,injection,rce"

# Exclude patterns
--exclude-patterns "info,low-severity"

# Combine filters
--severity critical,high --type http --exclude-patterns "info"
```

### 👀 Dry-Run Preview
```bash
# See what will be analyzed before running
--dry-run

# Works with all filters
--severity critical,high --dry-run
```

### 📊 Analysis Modes
```bash
# Standard analysis (default)
(no flag)

# Risk assessment only
--risk-only

# Remediation recommendations only
--remediation-only

# Everything (comprehensive)
--all-analysis
```

---

## 📚 Full Help & Examples

```bash
# Show all available flags
python3 analyze_vulnerabilities_with_ollama.py --help

# Show usage examples
python3 analyze_vulnerabilities_with_ollama.py --examples
```

---

## 🛠️ Advanced Options

### Control Number of Vulnerabilities Analyzed
```bash
# Analyze only top 5 instead of default 10
--top 5

# Analyze top 20
--top 20
```

### Use Different Ollama Model
```bash
# Use specific model
-m "llama3.2:latest"

# Use faster model
-m "mistral:latest"

# Use better model (if available)
-m "neural-chat:latest"
```

### Specify Output Filename
```bash
# Default: auto-generated timestamp filename
-o my_report.html

# Or:
--output results.json
```

### Verbose Output for Debugging
```bash
# Show detailed logging
-v
# Or:
--verbose
```

---

## 📝 Report Generator Module

New standalone module for custom reporting:

```python
from report_generator import ReportGenerator
import json

# Load analysis results
with open('analysis.json') as f:
    results = json.load(f)

# Create generator
report = ReportGenerator(results)

# Save in any format
report.save("output.html", format="html")
report.save("output.csv", format="csv")
report.save("output.txt", format="txt")
report.save("output.json", format="json")
```

---

## 🔄 Real-World Examples

### Example 1: Generate All Report Types
```bash
SCAN="data/scans/scan_20260222_024525.jsonl"

# JSON (technical, full data)
python3 analyze_vulnerabilities_with_ollama.py $SCAN --format json -o analysis.json

# CSV (spreadsheet, tracking)
python3 analyze_vulnerabilities_with_ollama.py $SCAN --format csv -o analysis.csv

# HTML (presentation, web)
python3 analyze_vulnerabilities_with_ollama.py $SCAN --format html -o analysis.html

# TXT (email, documentation)
python3 analyze_vulnerabilities_with_ollama.py $SCAN --format txt -o analysis.txt
```

### Example 2: Executive Briefing
```bash
# Focus on critical issues, professional format
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --severity critical \
  --format html \
  -o executive_briefing.html

# Share with executives
# (Open in browser for presentation)
```

### Example 3: Remediation Planning
```bash
# Get comprehensive analysis with remediation
python3 analyze_vulnerabilities_with_ollama.py data/scans/scan.jsonl \
  --remediation-only \
  --top 5 \
  --format txt \
  -o remediation_plan.txt

# Use for remediation planning
cat remediation_plan.txt
```

### Example 4: Track Progress Over Time
```bash
# Original scan
python3 analyze_vulnerabilities_with_ollama.py scan_v1.jsonl --format csv -o scan_v1.csv

# After remediation
python3 analyze_vulnerabilities_with_ollama.py scan_v2.jsonl --format csv -o scan_v2.csv

# Compare in Excel:
# Open both CSV files side-by-side to see progress
```

---

## ✅ Checklist: What Works

- ✅ Load JSONL scan files
- ✅ Filter by severity/type/patterns
- ✅ Preview with dry-run
- ✅ Generate JSON reports
- ✅ Generate CSV reports
- ✅ Generate HTML reports
- ✅ Generate TXT reports
- ✅ Risk assessment mode
- ✅ Remediation mode
- ✅ Comprehensive analysis
- ✅ Error handling and recovery
- ✅ Help and examples
- ✅ Verbose logging

---

## 🚀 Next Phase (Coming Soon)

Phase 2 enhancements:
- Progress bars for long operations
- Analysis caching (50-80% faster re-runs)
- Parallel processing (4-6x speed)
- Statistics and trend analysis
- Interactive exploration mode

---

## 💬 Quick Reference Commands

```bash
# Activate environment
source venv/bin/activate

# Basic analysis
python3 analyze_vulnerabilities_with_ollama.py scan.jsonl

# Preview
python3 analyze_vulnerabilities_with_ollama.py scan.jsonl --dry-run

# HTML report
python3 analyze_vulnerabilities_with_ollama.py scan.jsonl --format html -o report.html

# CSV for Excel
python3 analyze_vulnerabilities_with_ollama.py scan.jsonl --format csv -o report.csv

# Critical issues only
python3 analyze_vulnerabilities_with_ollama.py scan.jsonl --severity critical,high

# Help
python3 analyze_vulnerabilities_with_ollama.py --help

# Examples
python3 analyze_vulnerabilities_with_ollama.py --examples
```

---

**Ready to get started!**

Try these commands in order:
1. `source venv/bin/activate`
2. `python3 analyze_vulnerabilities_with_ollama.py --examples`
3. `python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl --dry-run`
4. `python3 analyze_vulnerabilities_with_ollama.py data/scans/scan_20260222_024525.jsonl --format html -o test_report.html`

---

**Documentation**: See `PHASE1_ENHANCEMENTS.md` for detailed feature information
**Technical Details**: See `CLI_TOOLS_REVIEW.md` for architecture and roadmap
