# Sublist3r - Complete Tool Function Analysis

## Overview
**Sublist3r v1.0** is a passive subdomain enumeration tool designed to discover subdomains associated with a target domain. It uses multiple search engines and DNS intelligence sources, with optional bruteforce capabilities.

**Author:** Ahmed Aboul-Ela (@aboul3la)
**License:** Open Source
**Purpose:** Subdomain enumeration for security research and penetration testing

---

## Core Architecture

### 1. Base Classes

#### `enumratorBase`
Base class for all search engine enumerators. Provides common functionality:
- **HTTP Request Handling**: Manages session, headers, timeouts
- **Domain Extraction**: Parses responses to extract subdomains
- **Pagination**: Handles multi-page search results
- **Error Checking**: Validates responses from search engines
- **Query Generation**: Creates search engine queries

**Key Methods:**
- `send_req(query, page_no)` - Send HTTP request to search engine
- `extract_domains(resp)` - Extract subdomains from response (overridden by subclasses)
- `enumerate()` - Main enumeration loop with retry logic
- `check_response_errors(resp)` - Detect blocking/errors
- `should_sleep()` - Implement anti-bot detection delays

#### `enumratorBaseThreaded`
Extends `enumratorBase` with multiprocessing support:
- Runs each search engine in a separate process
- Collects results in a thread-safe queue
- Enables parallel enumeration across multiple engines

---

## Search Engine Implementations

### 2. Google Enumeration (`GoogleEnum`)
**Engine:** Google Search
- **Base URL:** `https://google.com/search`
- **Max Domains:** 11 per query
- **Max Pages:** 200
- **Extraction Method:** HTML parsing with regex for `<cite>` tags
- **Anti-Bot:** 5-second sleep between requests
- **Detection:** Identifies "unusual traffic" blocks

**Regex:** `<cite.*?>(.*?)<\/cite>`

**Features:**
- Excludes www subdomain initially
- Iteratively excludes found subdomains to discover more
- Detects Google rate limiting

---

### 3. Yahoo Enumeration (`YahooEnum`)
**Engine:** Yahoo Search
- **Base URL:** `https://search.yahoo.com/search`
- **Max Domains:** 10 per query
- **Max Pages:** Unlimited
- **Extraction Method:** Dual regex patterns for different HTML structures
- **Pagination:** +10 results per page

**Regexes:**
- `<span class=" fz-.*? fw-m fc-12th wr-bw.*?">(.*?)</span>`
- `<span class="txt"><span class=" cite fw-xl fz-15px">(.*?)</span>`

---

### 4. Ask.com Enumeration (`AskEnum`)
**Engine:** Ask.com Search
- **Base URL:** `https://www.ask.com/web`
- **Max Domains:** 11 per query
- **Extraction Method:** HTML parsing for result URLs
- **Pagination:** +1 page per request

**Regex:** `<p class="web-result-url">(.*?)</p>`

---

### 5. Bing Enumeration (`BingEnum`)
**Engine:** Microsoft Bing Search
- **Base URL:** `https://www.bing.com/search`
- **Max Domains:** 30 per query
- **Max Pages:** Unlimited
- **Extraction Method:** Dual regex for different HTML structures
- **Pagination:** First parameter pagination

**Regexes:**
- `<li class="b_algo"><h2><a href="(.*?)"`
- `<div class="b_title"><h2><a href="(.*?)"`

---

### 6. Baidu Enumeration (`BaiduEnum`)
**Engine:** Baidu (Chinese search engine)
- **Base URL:** `https://www.baidu.com/s`
- **Max Domains:** 2 per query
- **Max Pages:** 760
- **Extraction Method:** Complex with dynamic subdomain selection
- **Anti-Bot:** Random 2-5 second sleep
- **Smart Query:** Uses `findsubs()` to find most common subdomains for next query

**Regex:** `<a.*?class="c-showurl".*?>(.*?)</a>`

**Special Feature:**
- `findsubs()` method uses Counter to identify most frequently appearing subdomains
- Adapts query strategy based on results

---

### 7. Netcraft Enumeration (`NetcraftEnum`)
**Engine:** Netcraft DNS Database
- **Base URL:** `https://searchdns.netcraft.com`
- **Method:** GET request with domain restriction
- **Cookie Handling:** Creates SHA1-based verification cookies
- **Anti-Bot:** 1-2 second random sleep
- **Pagination:** Follows "Next Page" links

**Cookie Handling:**
```python
cookies['netcraft_js_verification_response'] = hashlib.sha1(
    urllib.unquote(cookies_list[1]).encode('utf-8')
).hexdigest()
```

---

### 8. DNSdumpster Enumeration (`DNSdumpster`)
**Engine:** DNSdumpster.com
- **Base URL:** `https://dnsdumpster.com/`
- **Method:** POST request with CSRF token
- **Active Verification:** Validates found subdomains via DNS queries
- **Threading:** Uses BoundedSemaphore with 70 threads
- **Nameservers:** Google DNS (8.8.8.8, 8.8.4.4)

**Process:**
1. GET request to fetch CSRF token
2. Extract token: `<input type="hidden" name="csrfmiddlewaretoken" value="(.*?)"`
3. POST request with domain and token
4. Parse table: `<a name="hostanchor"><\/a>Host Records.*?<table.*?>(.*?)</table>`
5. Verify each subdomain with DNS A record lookup
6. Return only live subdomains

---

### 9. VirusTotal Enumeration (`Virustotal`)
**Engine:** VirusTotal API
- **Base URL:** `https://www.virustotal.com/ui/domains/{domain}/subdomains`
- **Format:** JSON API responses
- **Pagination:** Follows `links.next` URL
- **Data Type:** Filters for `type == 'domain'`
- **Error Detection:** Identifies blocking responses

**Features:**
- Pagination through JSON API
- Extracts domain IDs from response data
- Handles API rate limiting gracefully

---

### 10. ThreatCrowd Enumeration (`ThreatCrowd`)
**Engine:** ThreatCrowd API
- **Base URL:** `https://www.threatcrowd.org/searchApi/v2/domain/report/`
- **Format:** JSON API response
- **Extraction:** Direct JSON array of subdomains

**Response Format:**
```json
{
  "subdomains": ["subdomain1.example.com", "subdomain2.example.com"]
}
```

---

### 11. SSL Certificate Enumeration (`CrtSearch`)
**Engine:** Censys.io crt.sh (SSL Certificate Transparency)
- **Base URL:** `https://crt.sh/?q=%25.{domain}`
- **Data Source:** Certificate Transparency Logs
- **Extraction:** HTML table cells (`<TD>` tags)
- **Features:**
  - Handles multi-subdomain entries (`<BR>` separated)
  - Filters out wildcard certificates
  - Cleans email addresses from certificate CN

**Regex:** `<TD>(.*?)</TD>`

**Filtering:**
- Removes wildcards (`*` in subdomain)
- Extracts domain from email addresses (if CN contains email)

---

### 12. Passive DNS Enumeration (`PassiveDNS`)
**Engine:** Sublist3r's own Passive DNS API
- **Base URL:** `https://api.sublist3r.com/search.php?domain={domain}`
- **Format:** JSON array response
- **Purpose:** Aggregates results from various passive DNS sources

---

## Bruteforce Module (`subbrute`)

### Overview
Optional DNS-based subdomain bruteforcing:
- **Uses:** subbrute library (`subbrute.print_target()`)
- **Wordlist:** `subbrute/names.txt` (common subdomain names)
- **Resolvers:** `subbrute/resolvers.txt` (DNS resolver list)
- **Threading:** Configurable thread count (default: 30)
- **Integration:** Combines results with search engine results

### Execution
```python
bruteforce_list = subbrute.print_target(
    parsed_domain.netloc,
    record_type=False,
    subs='path/to/names.txt',
    resolvers='path/to/resolvers.txt',
    process_count=threads,
    output=False,
    json_output=False,
    search_list=search_list,
    verbose=verbose
)
```

---

## Port Scanning Module (`portscan`)

### Features
- **Method:** TCP socket connection scanning
- **Threading:** BoundedSemaphore with 20 concurrent threads
- **Timeout:** 2 seconds per port
- **Output:** Lists open ports for each subdomain
- **Supported:** Any comma-separated list of ports

### Implementation
```python
def port_scan(self, host, ports):
    for port in ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        result = s.connect_ex((host, int(port)))
        if result == 0:  # Port open
            openports.append(port)
```

---

## Command-Line Interface (CLI)

### Arguments
```
-d, --domain         REQUIRED: Domain to enumerate (e.g., example.com)
-b, --bruteforce     Enable subbrute bruteforce (optional, default: disabled)
-p, --ports          Comma-separated ports to scan (e.g., 80,443)
-v, --verbose        Show subdomains as found in realtime
-t, --threads        Number of threads for bruteforce (default: 30)
-e, --engines        Comma-separated list of specific engines
-o, --output         Save results to file
-n, --no-color       Disable colored output
```

### Usage Examples
```bash
# Basic enumeration
python sublist3r.py -d google.com

# With bruteforce
python sublist3r.py -d google.com -b

# With port scanning
python sublist3r.py -d google.com -p 80,443,8080

# Specific engines only
python sublist3r.py -d google.com -e google,bing,ssl

# Verbose output with file save
python sublist3r.py -d google.com -v -o results.txt

# Full scan with bruteforce and ports
python sublist3r.py -d google.com -b -p 80,443,8080,22,25 -t 50 -o results.txt -v
```

---

## Data Flow

```
1. Parse arguments and validate domain
2. Initialize all chosen enumeration engines
3. Start parallel processes for each engine:
   ├─ Google (search with pagination)
   ├─ Yahoo (search with pagination)
   ├─ Bing (search with pagination)
   ├─ Ask (search with pagination)
   ├─ Baidu (search with smart query generation)
   ├─ Netcraft (DNS query with cookie handling)
   ├─ DNSdumpster (POST request with verification)
   ├─ VirusTotal (API with pagination)
   ├─ ThreatCrowd (API request)
   ├─ SSL Certificates (CT logs parsing)
   └─ PassiveDNS (API request)
4. Collect results in thread-safe queue
5. Wait for all processes to complete
6. Combine and deduplicate results
7. Optionally: Run bruteforce module
8. Optionally: Port scan discovered subdomains
9. Sort and output results
```

---

## Result Processing

### Deduplication
- Uses `set()` to remove duplicates across all engines
- Combines search engine results with bruteforce results

### Sorting
Custom sorting function (`subdomain_sorting_key`) that:
- Orders from TLD (right) to subdomain (left)
- Places 'www' subdomains at the top of their group
- Maintains hierarchical structure

**Example Output Order:**
```
example.com
www.example.com
a.example.com
www.a.example.com
b.a.example.com
```

### Output Options
1. **Console Display:** Colored output with enumeration progress
2. **File Output:** Plain text, one subdomain per line
3. **Port Scan Results:** Shows open ports for each subdomain

---

## Anti-Bot Detection & Evasion

### Techniques
1. **Request Headers:** Mimics Firefox browser
2. **User Agent:** `Mozilla/5.0 (Windows NT 6.1; WOW64)...`
3. **Delays:**
   - Google: 5-second sleep
   - Baidu: Random 2-5 second sleep
   - Netcraft: Random 1-2 second sleep
4. **Error Detection:** Identifies blocking pages
5. **Query Rotation:** Excludes previously found subdomains
6. **Page Cycling:** Avoids getting stuck on same page

---

## Security Features & Limitations

### Features
- ✅ Passive enumeration (no direct attacks)
- ✅ Multi-source verification
- ✅ Parallel processing for efficiency
- ✅ Active DNS verification (DNSdumpster)
- ✅ Certificate transparency intelligence
- ✅ Open-source and transparent

### Limitations
- ⚠️ Rate limiting/blocking possible
- ⚠️ Search engines may vary results
- ⚠️ Bruteforce limited by wordlist quality
- ⚠️ Port scanning may be detected
- ⚠️ Passive DNS sources may be outdated
- ⚠️ Some APIs require authentication

---

## Supported Search Engines Summary

| Engine | Type | Max Domains | Max Pages | Auth Required |
|--------|------|-------------|-----------|---------------|
| Google | Search | 11 | 200 | No |
| Yahoo | Search | 10 | Unlimited | No |
| Ask | Search | 11 | Unlimited | No |
| Bing | Search | 30 | Unlimited | No |
| Baidu | Search | 2 | 760 | No |
| Netcraft | DNS | Unlimited | Unlimited | No |
| DNSdumpster | DNS | Unlimited | Unlimited | No |
| VirusTotal | API | Unlimited | Paginated | No |
| ThreatCrowd | API | Unlimited | Single | No |
| SSL Certs | CT Logs | Unlimited | Single | No |
| PassiveDNS | API | Unlimited | Single | No |

---

## Performance Characteristics

### Execution Time
- **Search engines only:** 2-5 minutes (varies by domain popularity)
- **With bruteforce:** 5-15 minutes (depends on wordlist size and thread count)
- **With port scanning:** Additional 1-10 minutes per 100 subdomains

### Resource Usage
- **Memory:** ~50-200MB (multiprocessing overhead)
- **Network:** Moderate (rate-limited to avoid blocking)
- **CPU:** Minimal (mostly I/O bound)

### Optimal Settings
- **Threads:** 30-50 (balance between speed and detection)
- **Engines:** All 11 for best coverage
- **Bruteforce:** Only if passive results are insufficient

---

## Typical Use Cases

1. **Reconnaissance:** Initial subdomain discovery for target
2. **Asset Mapping:** Identify all publicly exposed subdomains
3. **Service Discovery:** Find subdomains before port scanning
4. **Vulnerability Assessment:** Enumerate attack surface
5. **Bug Bounty:** Discover targets for security research
6. **Security Testing:** Authorized penetration testing

---

## Integration with Other Tools

Common workflow:
```
sublist3r (discover subdomains)
    ↓
nmap/masscan (port scanning)
    ↓
nuclei/nessus (vulnerability scanning)
    ↓
burp/zap (web application testing)
```

---

## Conclusion

Sublist3r is a comprehensive, multi-source subdomain enumeration tool that combines 11 different intelligence sources with optional bruteforce and port scanning capabilities. Its modular architecture allows for easy extension with additional search engines or data sources, making it a valuable tool for reconnaissance and asset discovery phases of security assessments.

**Key Strengths:**
- Multiple independent data sources reduce single point of failure
- Passive approach avoids direct target interaction
- Active verification ensures discovered subdomains are live
- Flexible and extensible architecture
- No authentication required for most sources

**Best Practices:**
- Use all engines for maximum coverage
- Enable bruteforce for stubborn domains
- Combine with other OSINT tools for validation
- Respect robots.txt and terms of service
- Use in authorized security testing only
