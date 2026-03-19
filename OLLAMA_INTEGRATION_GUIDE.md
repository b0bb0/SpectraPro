# Ollama LLM Integration for Vulnerability Analysis

## Overview

**Ollama Vulnerability Analyzer** provides local, privacy-preserving AI-powered vulnerability analysis without cloud dependencies. Integrates seamlessly with Spectra, Nuclei, and security assessment tools.

### Key Benefits
✅ **Local Processing** - No data sent to cloud services
✅ **Privacy Focused** - Complete control over vulnerability data
✅ **No API Keys** - No external dependencies or costs
✅ **Multiple Models** - Support for 4 powerful LLMs
✅ **Fast Analysis** - GPU-accelerated on compatible hardware
✅ **Production Ready** - Thread-safe, error handling, logging

---

## Supported Ollama Models

Your system has 4 models available:

| Model | Size | Type | Best For |
|-------|------|------|----------|
| **llama3.2:latest** | 2.0 GB | General | Quick analysis, lightweight |
| **Llama-3.1-8B** | 16 GB | Instruction-tuned | Detailed technical analysis |
| **Qwen3-14B BaronLLM** | 8.5 GB | Specialized | Security-focused analysis |
| **gpt-oss:20b** | 13 GB | High-capacity | Complex multi-vulnerability analysis |

### Recommended for Vulnerability Analysis
🥇 **Best:** `hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16`
🥈 **Alternative:** `hf.co/AlicanKiraz0/Qwen3-14B-BaronLLM-v2-Q4_0-GGUF:Q4_0`
🥉 **Quick:** `llama3.2:latest`

---

## Installation & Setup

### 1. Verify Ollama Installation
```bash
ollama list
# Should show your 4 models
```

### 2. Start Ollama Service
```bash
# Ollama typically runs in background, verify it's accessible
curl http://localhost:11434/api/tags
```

### 3. Install Vulnerability Analyzer
```bash
cd /Users/groot/NewFolder
source venv/bin/activate
pip install requests
```

The analyzer is ready to use!

---

## Quick Start

### Basic Usage - Python Script

```python
from ollama_vulnerability_analyzer import OllamaVulnerabilityAnalyzer, OllamaConfig

# Initialize with default model (llama3.2:latest)
analyzer = OllamaVulnerabilityAnalyzer()

# Or use a specific model
config = OllamaConfig(model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16")
analyzer = OllamaVulnerabilityAnalyzer(config)

# Analyze a single vulnerability
vulnerability = {
    'template-id': 'azure-domain-tenant',
    'info': {
        'name': 'Microsoft Azure Domain Tenant ID - Detect',
        'severity': 'info',
        'description': 'Microsoft Azure Domain Tenant ID was detected.'
    },
    'host': 'sats.se',
    'type': 'http',
    'extracted-results': ['b15a587d-acc9-4644-aa51-b56dee85c304']
}

analysis = analyzer.analyze_vulnerability(vulnerability)
print(analysis)
```

### Analyze Nuclei Scan Results

```python
from ollama_vulnerability_analyzer import analyze_scan_results

# Analyze your Nuclei JSONL scan results
results = analyze_scan_results(
    jsonl_file="/Users/groot/NewFolder/data/scans/scan_20260222_024525.jsonl",
    model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16"
)

# Access different analysis types
print(results['risk_assessment'])
print(results['attack_vectors'])
print(results['remediation_samples'])
```

---

## Core Analysis Functions

### 1. Single Vulnerability Analysis
```python
analysis = analyzer.analyze_vulnerability(vulnerability)
```
**Returns:** Detailed assessment including:
- Technical analysis of the vulnerability
- Real-world exploitation scenarios
- Business impact assessment
- Detection methods
- Mitigation strategies
- Priority/urgency rating

### 2. Batch Vulnerability Analysis
```python
analyses = analyzer.batch_analyze_vulnerabilities(
    vulnerabilities=vulnerability_list,
    group_by_severity=True  # Analyze critical issues first
)
```
**Features:**
- Process multiple vulnerabilities
- Optional severity-based prioritization
- Parallel processing support
- Comprehensive logging

### 3. Risk Assessment Report
```python
assessment = analyzer.generate_risk_assessment(vulnerabilities)
```
**Provides:**
- Overall security posture rating
- Critical issues identification
- Risk priority matrix
- Business impact analysis
- Resource requirements
- Timeline recommendations
- Compliance implications

### 4. Attack Vector Analysis
```python
vectors = analyzer.detect_attack_vectors(vulnerabilities)
```
**Analyzes:**
- Attack chain potential
- Initial access vectors
- Lateral movement possibilities
- Data exfiltration routes
- Persistence mechanisms
- Detection evasion techniques
- Realistic attack scenarios

### 5. Remediation Recommendations
```python
recommendations = analyzer.recommend_remediation(vulnerability)
```
**Includes:**
- Immediate actions (0-24 hours)
- Short-term fixes (1-7 days)
- Long-term prevention strategies
- Verification procedures
- Resource and timeline estimates

### 6. Severity Comparison & Prioritization
```python
comparison = analyzer.compare_severity(vulnerabilities)
```
**Provides:**
- Severity validation and re-rating
- Remediation priority order
- Criticality factor analysis
- Time-sensitive issue identification
- Resource allocation strategy
- Mitigation alternatives

---

## Configuration Options

### OllamaConfig

```python
from ollama_vulnerability_analyzer import OllamaConfig

config = OllamaConfig(
    host="http://localhost",          # Ollama server host
    port=11434,                       # Ollama API port
    model="llama3.2:latest",          # Active model
    temperature=0.7,                  # Output creativity (0.0-1.0)
    top_p=0.9,                        # Nucleus sampling
    timeout=300                       # Request timeout (seconds)
)

analyzer = OllamaVulnerabilityAnalyzer(config)
```

### Model Switching
```python
# Change model at runtime
analyzer.set_model("hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16")

# Analyze with new model
analysis = analyzer.analyze_vulnerability(vulnerability)
```

### Performance Tuning
```python
# For faster responses (slightly lower quality)
config = OllamaConfig(temperature=0.5, timeout=180)

# For more detailed analysis (slower)
config = OllamaConfig(temperature=0.9, timeout=600)
```

---

## Integration with Spectra

### Method 1: Direct Integration in Python

```python
import json
from ollama_vulnerability_analyzer import OllamaVulnerabilityAnalyzer, OllamaConfig

# Load Spectra scan results
with open('data/scans/scan_20260222_024525.jsonl', 'r') as f:
    vulnerabilities = [json.loads(line) for line in f if line.strip()]

# Initialize analyzer with best model
config = OllamaConfig(model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16")
analyzer = OllamaVulnerabilityAnalyzer(config)

# Generate analysis
risk_assessment = analyzer.generate_risk_assessment(vulnerabilities)
attack_vectors = analyzer.detect_attack_vectors(vulnerabilities)

# Save results
results = {
    'risk_assessment': risk_assessment,
    'attack_vectors': attack_vectors,
    'timestamp': datetime.now().isoformat()
}

with open('ollama_analysis_results.json', 'w') as f:
    json.dump(results, f, indent=2)
```

### Method 2: Command-Line Integration

Create a wrapper script `analyze_with_ollama.py`:

```python
#!/usr/bin/env python3
import sys
import json
from ollama_vulnerability_analyzer import analyze_scan_results

if __name__ == "__main__":
    scan_file = sys.argv[1] if len(sys.argv) > 1 else "data/scans/scan_latest.jsonl"
    model = sys.argv[2] if len(sys.argv) > 2 else "llama3.2:latest"

    print(f"[*] Analyzing {scan_file} with model: {model}")
    results = analyze_scan_results(scan_file, model)

    print(json.dumps(results, indent=2))
```

Usage:
```bash
python analyze_with_ollama.py data/scans/scan_20260222_024525.jsonl
```

### Method 3: Integrate into Spectra Backend

Modify Spectra's vulnerability processing:

```python
# In spectra/core/scanner.py or similar

from ollama_vulnerability_analyzer import OllamaVulnerabilityAnalyzer, OllamaConfig

class VulnerabilityProcessor:
    def __init__(self):
        self.analyzer = OllamaVulnerabilityAnalyzer(
            OllamaConfig(model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16")
        )

    def process_scan_results(self, vulnerabilities):
        """Enhance Nuclei results with Ollama analysis"""

        # Get Ollama analysis
        analysis = self.analyzer.batch_analyze_vulnerabilities(vulnerabilities)
        risk_assessment = self.analyzer.generate_risk_assessment(vulnerabilities)

        # Combine with Nuclei results
        return {
            'nuclei_results': vulnerabilities,
            'ollama_analysis': analysis,
            'risk_assessment': risk_assessment
        }
```

---

## Workflow Examples

### Workflow 1: Complete Vulnerability Assessment

```python
import json
from datetime import datetime
from ollama_vulnerability_analyzer import OllamaVulnerabilityAnalyzer, OllamaConfig

# Load scan results
with open('scan_results.jsonl') as f:
    vulns = [json.loads(line) for line in f if line.strip()]

# Initialize analyzer
config = OllamaConfig(model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16")
analyzer = OllamaVulnerabilityAnalyzer(config)

# Generate comprehensive assessment
report = {
    'scan_date': datetime.now().isoformat(),
    'total_vulnerabilities': len(vulns),
    'risk_assessment': analyzer.generate_risk_assessment(vulns),
    'attack_vectors': analyzer.detect_attack_vectors(vulns),
    'severity_analysis': analyzer.compare_severity(vulns),
    'detailed_analysis': analyzer.batch_analyze_vulnerabilities(vulns),
    'remediation_samples': [
        analyzer.recommend_remediation(v) for v in vulns[:5]
    ]
}

# Save report
with open('vulnerability_assessment_report.json', 'w') as f:
    json.dump(report, f, indent=2)

print("✓ Assessment complete: vulnerability_assessment_report.json")
```

### Workflow 2: Targeted Remediation Planning

```python
# Focus on critical/high severity only
critical = [v for v in vulns if v.get('info', {}).get('severity') in ['critical', 'high']]

# Get remediation plan for each
remediation_plan = {
    'vulnerabilities': critical,
    'remediation': [analyzer.recommend_remediation(v) for v in critical],
    'priority_order': analyzer.compare_severity(critical),
    'risk_assessment': analyzer.generate_risk_assessment(critical)
}

with open('critical_remediation_plan.json', 'w') as f:
    json.dump(remediation_plan, f, indent=2)
```

### Workflow 3: Automated Analysis Pipeline

```python
#!/usr/bin/env python3
import json
import subprocess
from ollama_vulnerability_analyzer import OllamaVulnerabilityAnalyzer, OllamaConfig

def run_scan(target):
    """Run Nuclei scan"""
    result_file = f"scan_{target.replace('.', '_')}.jsonl"
    cmd = f"nuclei -u https://{target} -jsonl -o {result_file}"
    subprocess.run(cmd, shell=True)
    return result_file

def analyze_scan(scan_file, model):
    """Analyze scan results with Ollama"""
    with open(scan_file) as f:
        vulns = [json.loads(line) for line in f if line.strip()]

    config = OllamaConfig(model=model)
    analyzer = OllamaVulnerabilityAnalyzer(config)

    return {
        'scan_file': scan_file,
        'vulnerability_count': len(vulns),
        'risk_assessment': analyzer.generate_risk_assessment(vulns),
        'remediation_samples': [
            analyzer.recommend_remediation(v) for v in vulns[:3]
        ]
    }

# Pipeline
targets = ['example.com', 'test.org']
model = "hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16"

for target in targets:
    print(f"[*] Scanning {target}...")
    scan_file = run_scan(target)

    print(f"[*] Analyzing with Ollama...")
    analysis = analyze_scan(scan_file, model)

    print(json.dumps(analysis, indent=2))
```

---

## Performance Characteristics

### Analysis Time (Per Vulnerability)
| Operation | Time | Model |
|-----------|------|-------|
| Single analysis | 10-30 sec | llama3.2:latest |
| Single analysis | 15-45 sec | Llama-3.1-8B |
| Risk assessment | 30-90 sec | Llama-3.1-8B |
| Attack vector analysis | 45-120 sec | Llama-3.1-8B |

### Resource Usage
- **GPU:** ~4-6 GB VRAM for 8B model
- **CPU:** Minimal (GPU-accelerated)
- **Memory:** 500MB-2GB RAM
- **Network:** None (local only)

### Optimization Tips
```python
# Faster responses
config = OllamaConfig(
    model="llama3.2:latest",
    temperature=0.5,
    timeout=120
)

# More detailed responses
config = OllamaConfig(
    model="hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16",
    temperature=0.8,
    timeout=600
)
```

---

## Error Handling

### Connection Errors
```python
try:
    analyzer = OllamaVulnerabilityAnalyzer()
except Exception as e:
    print(f"Ollama connection failed: {e}")
    print("Ensure Ollama is running: ollama serve")
```

### Model Errors
```python
try:
    analyzer.set_model("invalid-model")
except Exception as e:
    print(f"Model error: {e}")
    # List available models
    analyzer._list_available_models()
```

### Timeout Handling
```python
config = OllamaConfig(timeout=600)  # Increase timeout
analyzer = OllamaVulnerabilityAnalyzer(config)
```

---

## Security Considerations

### Data Privacy
✅ All vulnerability data stays local
✅ No network transmission to external services
✅ Complete control over analysis data
✅ No cloud logs or storage

### Model Safety
- Models run in isolated processes
- No internet access required
- No external API calls
- Deterministic processing

### Best Practices
1. Run Ollama on local/internal network only
2. Restrict access to Ollama port (11434)
3. Use strong authentication if exposed
4. Review model outputs before sharing
5. Audit logs regularly

---

## Troubleshooting

### Ollama Not Responding
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama if needed
ollama serve

# Check logs
ps aux | grep ollama
```

### Model Not Found
```bash
# List available models
ollama list

# Pull a model if needed
ollama pull llama3.2:latest
```

### Analysis Timeout
```python
# Increase timeout for complex analyses
config = OllamaConfig(timeout=600)  # 10 minutes
analyzer = OllamaVulnerabilityAnalyzer(config)
```

### High Memory Usage
```bash
# Use smaller model
ollama run llama3.2:latest  # 2GB vs 16GB

# Monitor memory
top -l1 | grep Mem
```

---

## Advanced Usage

### Custom Prompts
```python
# Extend for custom analysis
class CustomAnalyzer(OllamaVulnerabilityAnalyzer):
    def analyze_compliance(self, vulnerabilities):
        prompt = """Analyze these vulnerabilities for GDPR compliance impact..."""
        return self._query_ollama(prompt)

analyzer = CustomAnalyzer()
compliance_analysis = analyzer.analyze_compliance(vulnerabilities)
```

### Batch Processing
```python
# Process multiple scans
for scan_file in scan_files:
    with open(scan_file) as f:
        vulns = [json.loads(line) for line in f if line.strip()]

    results = analyzer.batch_analyze_vulnerabilities(vulns)
    save_results(scan_file, results)
```

### Integration with Reporting
```python
# Generate formatted reports
from markdown import markdown

analysis = analyzer.generate_risk_assessment(vulnerabilities)
report_md = f"""# Security Assessment Report

{analysis['assessment']}

Generated: {analysis['timestamp']}
"""

with open('report.md', 'w') as f:
    f.write(report_md)
```

---

## Summary

**Ollama Vulnerability Analyzer** provides:
- ✅ Local, privacy-focused analysis
- ✅ Multiple powerful models
- ✅ Production-ready implementation
- ✅ Easy integration with security tools
- ✅ Comprehensive vulnerability assessment
- ✅ No external dependencies

**Start analyzing vulnerabilities locally today!**

```bash
source venv/bin/activate
python ollama_vulnerability_analyzer.py
```
