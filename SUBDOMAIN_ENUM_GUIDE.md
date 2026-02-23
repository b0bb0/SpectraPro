# Sublist3r - Subdomain Enumeration Tool Guide

## Quick Start

### Installation
Sublist3r is already installed on your system:
```bash
which sublist3r
# Output: /opt/homebrew/bin/sublist3r
```

### Basic Usage
```bash
# Simple enumeration
sublist3r -d example.com

# With verbose output (show results in realtime)
sublist3r -d example.com -v

# Save results to file
sublist3r -d example.com -o results.txt

# With bruteforce (slower but finds more subdomains)
sublist3r -d example.com -b

# With port scanning
sublist3r -d example.com -p 80,443,8080
```

---

## Command-Line Options

### Required Arguments
```
-d, --domain DOMAIN
    Domain name to enumerate subdomains for (e.g., example.com)
    Example: sublist3r -d google.com
```

### Optional Arguments

#### 1. Bruteforce Module
```
-b, --bruteforce [BRUTEFORCE]
    Enable DNS-based subdomain bruteforcing using subbrute
    Uses wordlist to guess common subdomain names
    Slower but discovers hidden subdomains

    Example:
    sublist3r -d example.com -b
    sublist3r -d example.com --bruteforce
```

#### 2. Port Scanning
```
-p, --ports PORTS
    Comma-separated list of TCP ports to scan
    Scans discovered subdomains against these ports
    Helps identify active services

    Example:
    sublist3r -d example.com -p 80,443
    sublist3r -d example.com -p 22,80,443,8080,3306
```

#### 3. Verbosity
```
-v, --verbose [VERBOSE]
    Display results in realtime as they're discovered
    Shows progress from each search engine
    Useful for large domains with many subdomains

    Example:
    sublist3r -d example.com -v
    sublist3r -d example.com --verbose
```

#### 4. Threading (Bruteforce Only)
```
-t, --threads THREADS
    Number of concurrent threads for bruteforce
    Default: 30
    Range: 1-100+ (higher = faster but more resource intensive)

    Example:
    sublist3r -d example.com -b -t 50
    sublist3r -d example.com -b --threads 100
```

#### 5. Search Engines
```
-e, --engines ENGINES
    Comma-separated list of specific search engines to use
    Default: All 11 engines

    Available engines:
    - baidu       (Chinese search engine)
    - yahoo       (Yahoo Search)
    - google      (Google Search)
    - bing        (Microsoft Bing)
    - ask         (Ask.com)
    - netcraft    (Netcraft DNS)
    - dnsdumpster (DNSdumpster.com)
    - virustotal  (VirusTotal API)
    - threatcrowd (ThreatCrowd API)
    - ssl         (SSL Certificate Transparency)
    - passivedns  (PassiveDNS API)

    Example:
    sublist3r -d example.com -e google,bing,ssl
    sublist3r -d example.com --engines yahoo,netcraft
```

#### 6. Output File
```
-o, --output OUTPUT
    Save results to a text file (one subdomain per line)
    Creates file if it doesn't exist

    Example:
    sublist3r -d example.com -o results.txt
    sublist3r -d example.com --output /path/to/output.txt
```

#### 7. No Color Output
```
-n, --no-color
    Disable colored terminal output
    Useful for piping to files or scripts

    Example:
    sublist3r -d example.com -n
    sublist3r -d example.com --no-color
```

#### 8. Help
```
-h, --help
    Display help message and exit

    Example:
    sublist3r -h
    sublist3r --help
```

---

## Usage Examples

### Example 1: Basic Enumeration
```bash
sublist3r -d example.com
```
**Output:**
```
[*] Enumerating subdomains for example.com
[*] Searching in Google...
[*] Searching in Bing...
[*] Searching in Yahoo...
[+] api.example.com
[+] app.example.com
[+] blog.example.com
[+] www.example.com
[*] Total: 4 subdomains found
```

### Example 2: Verbose Mode with File Output
```bash
sublist3r -d example.com -v -o subdomains.txt
```
**What happens:**
- Searches all 11 engines
- Displays each subdomain as found
- Saves results to `subdomains.txt`
- Shows progress from each engine in realtime

### Example 3: Bruteforce + Port Scanning
```bash
sublist3r -d example.com -b -p 80,443,8080,3000
```
**What happens:**
- Searches all passive sources
- Runs bruteforce with default 30 threads
- Scans ports 80, 443, 8080, 3000 on each subdomain
- Shows open ports for discovered hosts

### Example 4: Specific Engines Only
```bash
sublist3r -d example.com -e google,bing,ssl -v
```
**What happens:**
- Uses only Google, Bing, and SSL Certificate Transparency
- Faster than all engines
- Still finds most common subdomains
- Verbose output shows progress

### Example 5: High-Thread Bruteforce
```bash
sublist3r -d example.com -b -t 100 -v
```
**What happens:**
- Fast bruteforce with 100 concurrent threads
- Good for powerful machines
- May trigger rate limiting on some networks
- High resource consumption

### Example 6: Complete Scan (All Features)
```bash
sublist3r -d example.com -b -v -t 50 -p 80,443,8080 -o results.txt
```
**What happens:**
1. Uses all 11 search engines
2. Enables bruteforce with 50 threads
3. Shows realtime progress
4. Scans ports 80, 443, 8080
5. Saves results to `results.txt`
6. Generates comprehensive subdomain list

---

## Real-World Example: sats.se

### Command Executed
```bash
sublist3r -d sats.se -v -o sats_subdomains.txt
```

### Results
```
Total Unique Subdomains Found: 1
- www.sats.se
```

### What Happened
1. **Search Engines Queried:**
   - Baidu, Yahoo, Google, Bing, Ask
   - Netcraft, DNSdumpster, Virustotal
   - ThreatCrowd, SSL Certs, PassiveDNS

2. **Status:**
   - Netcraft: Found www.sats.se ✓
   - Virustotal: Blocked by rate limiting
   - DNSdumpster: CSRF token error
   - Other engines: No additional results

3. **Finding:**
   - Only 1 public subdomain discovered
   - sats.se is tightly locked down
   - Limited public infrastructure exposure

### Output File
```bash
cat sats_subdomains.txt
# www.sats.se
```

---

## How It Works

### Architecture
```
Sublist3r
├── Search Engine Module
│   ├── Google (site: queries)
│   ├── Bing (domain: queries)
│   ├── Yahoo (site: queries)
│   ├── Ask (site: queries)
│   ├── Baidu (site: queries)
│   └── (pagination & result parsing)
│
├── DNS Intelligence Module
│   ├── Netcraft (DNS database)
│   ├── DNSdumpster (CSRF POST requests)
│   └── (Active DNS verification)
│
├── API Module
│   ├── VirusTotal (JSON API)
│   ├── ThreatCrowd (JSON API)
│   └── PassiveDNS (JSON API)
│
├── Certificate Module
│   └── SSL/TLS Certificate Transparency (crt.sh)
│
└── Bruteforce Module
    └── Subbrute (DNS resolution of wordlist)
```

### Search Techniques

#### 1. Search Engine Queries
```
Google:    site:example.com -www.example.com
Bing:      domain:example.com -www.example.com
Yahoo:     site:example.com -www.example.com
Ask:       site:example.com -www.example.com
Baidu:     site:example.com -www.example.com
```

#### 2. DNS Lookups
- Query MX, NS, CNAME, A records
- Netcraft searches DNS database
- DNSdumpster performs active DNS queries with verification

#### 3. API Queries
- VirusTotal: Paginated domain subdomain API
- ThreatCrowd: Single API call with subdomain list
- PassiveDNS: Passive DNS aggregation API

#### 4. Certificate Transparency
- Searches crt.sh for SSL certificates
- Extracts Subject Alternative Names (SANs)
- Discovers subdomains from certificate history

#### 5. Bruteforce
- Uses wordlist of common subdomain names
- Attempts DNS resolution on each
- Only returns live subdomains

---

## Result Deduplication & Sorting

### Deduplication
- Combines results from all sources
- Removes duplicates using set operations
- Merges search engine + bruteforce results

### Sorting
Custom sorting by subdomain hierarchy:
```
example.com
www.example.com
a.example.com
www.a.example.com
b.a.example.com
b.example.com
api.example.com
api.v2.example.com
```

---

## Performance Characteristics

### Execution Time
| Mode | Typical Time | Factors |
|------|---|---|
| Search engines only | 2-5 min | Domain popularity, network latency |
| + Bruteforce | 5-15 min | Thread count, wordlist size |
| + Port scanning | +1-10 min | Number of subdomains × port count |
| Complete scan | 10-30 min | All factors combined |

### Resource Usage
| Resource | Typical | Peak |
|----------|---------|------|
| Memory | 50-100 MB | 200+ MB (bruteforce) |
| Network | Moderate | High (bruteforce) |
| CPU | Low | Moderate (bruteforce) |

### Optimal Settings
- **Fast Reconnaissance:** All engines, no bruteforce
- **Comprehensive Scan:** All engines + bruteforce (30-50 threads)
- **Stealth Mode:** Specific engines (2-3), long delays between requests

---

## Anti-Bot & Rate Limiting

### Built-in Protections
1. **Delays:** 5-second sleeps on Google, 2-5 sec on Baidu
2. **User-Agent Rotation:** Firefox browser headers
3. **Query Variation:** Excludes known subdomains iteratively
4. **Error Detection:** Identifies rate limiting responses

### Evasion Tips
```bash
# Reduce thread count to avoid triggering detection
sublist3r -d example.com -b -t 10

# Use specific, trusted engines only
sublist3r -d example.com -e google,bing,ssl

# Run at different times with delays
sublist3r -d example.com (wait 1 hour) sublist3r -d example.com
```

### Common Blocks
- Google: Blocks after ~200 queries from same IP
- Bing: Generally allows more requests
- DNSdumpster: CSRF token validation issues
- VirusTotal: API rate limits on free tier

---

## Advanced Workflows

### Workflow 1: Recon → Port Scan → Vulnerability Scan
```bash
# Step 1: Enumerate subdomains
sublist3r -d example.com -b -o subs.txt

# Step 2: Port scan discovered hosts
nmap -iL subs.txt -p 80,443 -oN ports.txt

# Step 3: Vulnerability scan (using results)
nuclei -l subs.txt -o results.json
```

### Workflow 2: Multiple Domains
```bash
for domain in google.com facebook.com amazon.com; do
  echo "[*] Enumerating $domain"
  sublist3r -d $domain -b -o ${domain}_subs.txt
done

# Merge all results
cat *_subs.txt > all_subdomains.txt | sort -u
```

### Workflow 3: Continuous Monitoring
```bash
#!/bin/bash
while true; do
  sublist3r -d example.com -o current.txt
  diff previous.txt current.txt > new_subs.txt
  if [ -s new_subs.txt ]; then
    echo "[!] New subdomains found:" && cat new_subs.txt
  fi
  cp current.txt previous.txt
  sleep 86400  # Run daily
done
```

### Workflow 4: Asset Discovery Pipeline
```bash
# Find all subdomains
sublist3r -d example.com -b -v -o subs.txt

# Resolve to IPs
cat subs.txt | xargs -I {} dig +short {} > ips.txt

# Check for live hosts
cat ips.txt | xargs -I {} ping -c 1 {} > live_hosts.txt

# Port enumeration
cat live_hosts.txt | nmap -iL - -p- --open > services.txt

# Vulnerability scanning
nuclei -l live_hosts.txt -t cves/ -o vulns.json
```

---

## Troubleshooting

### Issue: "Error: Google probably now is blocking our requests"
**Cause:** Too many queries from same IP
**Solution:**
```bash
# Use fewer engines
sublist3r -d example.com -e bing,ssl,netcraft

# Run later (different session/IP)
# Use VPN to change IP
```

### Issue: "No results found"
**Cause:** Domain has no indexed subdomains
**Solution:**
```bash
# Force bruteforce
sublist3r -d example.com -b -t 100

# Try specific engines
sublist3r -d example.com -e ssl,netcraft
```

### Issue: "Connection timeout"
**Cause:** Network or target unreachable
**Solution:**
```bash
# Check internet connection
ping 8.8.8.8

# Try with single engine
sublist3r -d example.com -e google
```

### Issue: "DNSdumpster IndexError"
**Cause:** DNSdumpster changed HTML structure
**Solution:**
```bash
# Skip DNSdumpster
sublist3r -d example.com -e google,bing,ssl,netcraft
```

---

## Integration with Other Tools

### With Nuclei (Vulnerability Scanning)
```bash
sublist3r -d example.com -o subs.txt
nuclei -l subs.txt -t cves/ -o report.json
```

### With Nmap (Network Scanning)
```bash
sublist3r -d example.com -o subs.txt
nmap -iL subs.txt -p- --open -sV -o scan.txt
```

### With Aquatone (Visual Reconnaissance)
```bash
sublist3r -d example.com -o subs.txt
cat subs.txt | aquatone
```

### With OWASP ZAP (Web Scanning)
```bash
sublist3r -d example.com -p 80,443 -o subs.txt
# Then import subs.txt into ZAP
```

---

## Security Considerations

### Authorized Use Only
- ✅ Use on domains you own or have permission to test
- ❌ Do not use on third-party systems without authorization
- ✅ This is passive enumeration (not harmful)
- ❌ Port scanning may be considered aggressive

### Legal Compliance
- Check local laws regarding security testing
- Get written authorization for penetration testing
- Document all authorized testing activities
- Respect bug bounty program rules

### Operational Security
- Use from isolated network for sensitive testing
- Log all enumeration activities
- Clean up output files containing sensitive data
- Consider IP rotation for large-scale operations

---

## Tips & Tricks

### Quick Subdomain Discovery
```bash
# Fastest possible (Google + Bing only)
sublist3r -d example.com -e google,bing
```

### Maximum Coverage
```bash
# Comprehensive scan
sublist3r -d example.com -b -t 100 -e google,bing,ssl,netcraft -v
```

### Silent Mode (Background)
```bash
# No terminal output
sublist3r -d example.com -n -o results.txt 2>/dev/null &
```

### Combine Multiple Domains
```bash
# Batch enumeration
echo -e "example.com\ntest.com" | \
while read domain; do
  sublist3r -d $domain -o ${domain}.txt
done
```

### Filter Results
```bash
# Find specific subdomains only
sublist3r -d example.com -o results.txt
grep "api\|admin\|dev" results.txt
```

---

## Summary

**Sublist3r** is a powerful, multi-source subdomain enumeration tool that:
- ✅ Combines 11 different intelligence sources
- ✅ Supports passive DNS, search engines, and APIs
- ✅ Includes optional bruteforce capability
- ✅ Can scan ports on discovered subdomains
- ✅ Produces deduplicated, sorted results
- ✅ Requires no authentication for most sources
- ✅ Perfect for reconnaissance phase of penetration testing

**Best used for:**
1. Initial asset discovery
2. Identifying attack surface
3. Finding hidden services
4. Preparing for vulnerability scanning
5. Bug bounty reconnaissance

Use responsibly and only on authorized targets!
