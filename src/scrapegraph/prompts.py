"""LLM prompt templates for each ScrapeGraphAI scraping mode."""

SENSITIVE_EXTRACTION_PROMPT = """
Analyze the content of this webpage and extract all sensitive information present.

Look specifically for:
- API keys, tokens, and secrets (AWS, GCP, Azure, GitHub, Stripe, Twilio, etc.)
- Credentials: usernames, passwords, password hashes
- Private keys and certificates (PEM, RSA, DSA, EC)
- Authentication tokens (JWT, OAuth, session tokens, cookies with sensitive values)
- Database connection strings and credentials
- Internal IP addresses, hostnames, and network topology
- Email addresses and phone numbers (PII)
- Social security numbers, credit card numbers, or other financial data
- Hardcoded configuration secrets (e.g., in JavaScript source, HTML comments)
- S3 bucket names or cloud storage URIs
- Internal API endpoints not meant for public exposure

Return a JSON object with this exact structure:
{
  "findings": [
    {
      "type": "api_key|credential|private_key|token|pii|network_info|other",
      "severity": "critical|high|medium|low",
      "description": "what was found",
      "value_preview": "first 8 chars... (truncated for safety)",
      "location": "where on the page it was found (e.g., JS source, HTML comment, form field)"
    }
  ],
  "summary": "Brief overview of sensitive data found",
  "risk_level": "critical|high|medium|low|none"
}

If no sensitive information is found, return an empty findings array with risk_level "none".
"""

STRUCTURED_EXTRACTION_PROMPT = """
Perform a structured reconnaissance analysis of this webpage and extract technical details.

Extract all of the following:
1. **Endpoints & APIs**: All URLs, API endpoints, form action URLs, AJAX endpoints, WebSocket URLs
2. **Forms**: All HTML forms with their fields, methods, action URLs, and any hidden fields
3. **Technology Stack**: Frameworks, libraries, CMS, server software (from headers, meta tags, JS files, etc.)
4. **JavaScript Files**: All external JS file URLs loaded by the page
5. **External Resources**: CDN resources, third-party scripts, embedded iframes
6. **Meta Information**: Page title, description, robots meta, canonical URL
7. **Comments**: Any HTML or JS comments that reveal developer notes or system information
8. **Input Validation**: Client-side validation patterns or lack thereof on forms

Return a JSON object with this exact structure:
{
  "endpoints": [
    {"url": "...", "method": "GET|POST|...", "type": "page|api|form|websocket|other"}
  ],
  "forms": [
    {
      "action": "...",
      "method": "GET|POST",
      "fields": [{"name": "...", "type": "...", "required": true|false}],
      "has_csrf_token": true|false
    }
  ],
  "technology_stack": {
    "frontend": [],
    "backend": [],
    "cms": null,
    "server": null,
    "cdn": []
  },
  "javascript_files": [],
  "external_resources": [],
  "meta": {
    "title": "...",
    "description": "...",
    "robots": "...",
    "canonical": "..."
  },
  "comments": [],
  "security_observations": []
}
"""

CRAWL_EXTRACTION_PROMPT = """
Analyze this webpage and extract a comprehensive summary for security reconnaissance purposes.

Extract:
1. **Page Purpose**: What is this page for?
2. **Key Content**: Main content, important data displayed
3. **Links Found**: All internal and external links
4. **Interactive Elements**: Buttons, forms, input fields
5. **Sensitive Indicators**: Any signs of authentication requirements, access controls, or sensitive data
6. **Technical Indicators**: Any visible technology clues, error messages, debug information

Return a JSON object with this exact structure:
{
  "page_purpose": "brief description of what this page does",
  "key_content": "summary of main content",
  "internal_links": ["url1", "url2"],
  "external_links": ["url1", "url2"],
  "forms_present": true|false,
  "requires_auth": true|false,
  "sensitive_indicators": [],
  "technical_indicators": [],
  "notes": "any other security-relevant observations"
}
"""

RESEARCH_PROMPT_TEMPLATE = """
Conduct OSINT research on the following topic: {query}

Gather and synthesize information from multiple sources to provide:
1. **Overview**: What is this (vulnerability, company, technology, person, etc.)?
2. **Key Facts**: Most important findings relevant to security research
3. **Known Issues/CVEs**: Any known vulnerabilities, exploits, or security issues
4. **Public Exposure**: Publicly visible infrastructure, leaked data, or sensitive information
5. **Related Entities**: Associated domains, IPs, organizations, or individuals
6. **Recommended Actions**: For defensive or investigative purposes

Return a JSON object with this exact structure:
{{
  "query": "{query}",
  "overview": "...",
  "key_facts": [],
  "known_vulnerabilities": [
    {{"cve": "...", "severity": "...", "description": "..."}}
  ],
  "public_exposure": [],
  "related_entities": {{
    "domains": [],
    "ips": [],
    "organizations": [],
    "individuals": []
  }},
  "sources": [],
  "recommended_actions": [],
  "confidence": "high|medium|low"
}}
"""
