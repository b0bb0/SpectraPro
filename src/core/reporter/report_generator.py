"""
Report Generator Module
Generates comprehensive security reports
"""

import html
import json
import os
from datetime import datetime
from typing import Dict, Optional
import logging
import requests
import urllib3

# Disable SSL warnings for security scanning
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generates vulnerability assessment reports in multiple formats"""

    def __init__(self, output_dir: str = "data/reports"):
        """
        Initialize Report Generator

        Args:
            output_dir: Directory to store generated reports
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_report(
        self,
        scan_data: Dict,
        analysis_data: Dict,
        format: str = "json"
    ) -> Dict:
        """
        Generate comprehensive security report

        Args:
            scan_data: Raw scan results from nuclei
            analysis_data: AI analysis results
            format: Report format (json, html, pdf, markdown)

        Returns:
            Dict with report metadata and file path
        """
        logger.info(f"Generating {format} report")

        report_id = f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        report_data = self._compile_report_data(scan_data, analysis_data)

        if format == "json":
            file_path = self._generate_json_report(report_id, report_data)
        elif format == "html":
            file_path = self._generate_html_report(report_id, report_data)
        elif format == "markdown":
            file_path = self._generate_markdown_report(report_id, report_data)
        else:
            logger.warning(f"Unsupported format: {format}, defaulting to JSON")
            file_path = self._generate_json_report(report_id, report_data)

        return {
            'report_id': report_id,
            'format': format,
            'file_path': file_path,
            'timestamp': datetime.now().isoformat(),
            'status': 'completed'
        }

    def _compile_report_data(self, scan_data: Dict, analysis_data: Dict) -> Dict:
        """Compile all data into structured report"""
        return {
            'metadata': {
                'report_id': f"SPECTRA-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                'generated_at': datetime.now().isoformat(),
                'tool': 'Spectra AI Penetration Testing',
                'version': '1.0.0'
            },
            'target': {
                'url': scan_data.get('target', 'Unknown'),
                'scan_timestamp': scan_data.get('timestamp', '')
            },
            'scan_results': {
                'scan_id': scan_data.get('scan_id', ''),
                'status': scan_data.get('status', ''),
                'vulnerabilities_found': scan_data.get('vulnerabilities_found', 0),
                'raw_results': scan_data.get('results', [])
            },
            'analysis': analysis_data,
            'summary': {
                'total_vulnerabilities': analysis_data.get('total_vulnerabilities', 0),
                'risk_score': analysis_data.get('risk_score', 0),
                'categorization': analysis_data.get('categorized_vulnerabilities', {}),
                'executive_summary': analysis_data.get('executive_summary', '')
            }
        }

    def _fetch_actual_http_headers(self, url: str, timeout: int = 10) -> Optional[str]:
        """
        Fetch actual HTTP headers from a URL

        Args:
            url: Target URL
            timeout: Request timeout in seconds

        Returns:
            Formatted HTTP response headers or None if failed
        """
        try:
            # Add https:// if no scheme is present
            if not url.startswith(('http://', 'https://')):
                url = f"https://{url}"

            logger.info(f"Fetching actual HTTP headers from: {url}")
            response = requests.get(url, timeout=timeout, verify=False, allow_redirects=True)

            # Format headers nicely
            headers_text = f"HTTP/{response.raw.version/10:.1f} {response.status_code} {response.reason}\n"

            for header, value in response.headers.items():
                headers_text += f"{header}: {value}\n"

            return headers_text

        except Exception as e:
            logger.warning(f"Failed to fetch headers from {url}: {str(e)}")
            return None

    def _generate_json_report(self, report_id: str, data: Dict) -> str:
        """Generate JSON report"""
        file_path = os.path.join(self.output_dir, f"{report_id}.json")

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"JSON report saved to: {file_path}")
        return file_path

    def _generate_markdown_report(self, report_id: str, data: Dict) -> str:
        """Generate Markdown report"""
        file_path = os.path.join(self.output_dir, f"{report_id}.md")

        md_content = f"""# Spectra Security Assessment Report

**Report ID:** {data['metadata']['report_id']}
**Generated:** {data['metadata']['generated_at']}
**Target:** {data['target']['url']}

---

## Executive Summary

{data['summary']['executive_summary']}

---

## Risk Assessment

- **Overall Risk Score:** {data['summary']['risk_score']}/100
- **Total Vulnerabilities Found:** {data['summary']['total_vulnerabilities']}

### Vulnerability Breakdown by Severity

"""
        # Add severity breakdown
        by_severity = data['summary']['categorization'].get('by_severity', {})
        for severity, count in by_severity.items():
            md_content += f"- **{severity.upper()}:** {count}\n"

        md_content += "\n---\n\n## AI Analysis\n\n"
        md_content += data['analysis'].get('ai_analysis', 'No analysis available')

        md_content += "\n\n---\n\n## Recommendations\n\n"

        recommendations = data['analysis'].get('recommendations', [])
        for i, rec in enumerate(recommendations, 1):
            md_content += f"### {i}. {rec['vulnerability']} [{rec['severity'].upper()}]\n\n"
            md_content += f"**Occurrences:** {rec['count']}\n\n"
            md_content += f"**Recommendation:** {rec['recommendation']}\n\n"
            if rec.get('affected_endpoints'):
                md_content += "**Affected Endpoints:**\n"
                for endpoint in rec['affected_endpoints'][:5]:
                    md_content += f"- {endpoint}\n"
            md_content += "\n"

        md_content += "\n---\n\n## Detailed Findings\n\n"

        for i, vuln in enumerate(data['scan_results']['raw_results'][:20], 1):
            info = vuln.get('info', {})
            md_content += f"### Finding {i}: {info.get('name', 'Unknown')}\n\n"
            md_content += f"- **Severity:** {info.get('severity', 'N/A')}\n"
            md_content += f"- **Matched At:** {vuln.get('matched-at', 'N/A')}\n"
            md_content += f"- **Template:** {vuln.get('template-id', 'N/A')}\n"
            if info.get('description'):
                md_content += f"- **Description:** {info.get('description')}\n"
            md_content += "\n"

        md_content += f"\n---\n\n*Report generated by Spectra AI Penetration Testing v{data['metadata']['version']}*\n"

        with open(file_path, 'w') as f:
            f.write(md_content)

        logger.info(f"Markdown report saved to: {file_path}")
        return file_path

    def _group_vulnerabilities_by_template(self, raw_results: list) -> Dict:
        """Group vulnerabilities by template ID"""
        grouped = {}
        for vuln in raw_results:
            template_id = vuln.get('template-id', 'unknown')
            if template_id not in grouped:
                grouped[template_id] = []
            grouped[template_id].append(vuln)
        return grouped

    def _generate_html_report(self, report_id: str, data: Dict) -> str:
        """Generate Enhanced HTML report with collapsible sections and detailed URLs"""
        file_path = os.path.join(self.output_dir, f"{report_id}.html")

        # Group vulnerabilities by template
        grouped_vulns = self._group_vulnerabilities_by_template(data['scan_results']['raw_results'])

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spectra Security Report - {data['metadata']['report_id']}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
        }}
        .target-info {{
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 5px;
            margin-top: 15px;
        }}
        .target-url {{
            font-size: 24px;
            font-weight: bold;
            color: #fff;
            word-break: break-all;
        }}
        .section {{
            background: white;
            padding: 25px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .risk-score {{
            font-size: 48px;
            font-weight: bold;
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .critical {{ background: #ff4444; color: white; }}
        .high {{ background: #ff8800; color: white; }}
        .medium {{ background: #ffbb33; color: white; }}
        .low {{ background: #00C851; color: white; }}
        .info {{ background: #33b5e5; color: white; }}
        .vuln-card {{
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 15px 0;
            background: #f8f9fa;
            border-radius: 5px;
        }}
        .severity-critical {{ border-left-color: #ff4444; }}
        .severity-high {{ border-left-color: #ff8800; }}
        .severity-medium {{ border-left-color: #ffbb33; }}
        .severity-low {{ border-left-color: #00C851; }}
        .severity-info {{ border-left-color: #33b5e5; }}
        .vuln-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            user-select: none;
        }}
        .vuln-header:hover {{
            opacity: 0.8;
        }}
        .severity-badge {{
            display: inline-block;
            padding: 5px 12px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 12px;
            text-transform: uppercase;
        }}
        .badge-critical {{ background: #ff4444; color: white; }}
        .badge-high {{ background: #ff8800; color: white; }}
        .badge-medium {{ background: #ffbb33; color: white; }}
        .badge-low {{ background: #00C851; color: white; }}
        .badge-info {{ background: #33b5e5; color: white; }}
        .collapse-icon {{
            font-size: 20px;
            transition: transform 0.3s;
        }}
        .collapse-icon.expanded {{
            transform: rotate(90deg);
        }}
        .vuln-details {{
            margin-top: 15px;
            display: none;
        }}
        .vuln-details.show {{
            display: block;
        }}
        .occurrence {{
            background: white;
            padding: 12px;
            margin: 8px 0;
            border-left: 3px solid #667eea;
            border-radius: 3px;
        }}
        .url-link {{
            color: #667eea;
            text-decoration: none;
            word-break: break-all;
            font-family: 'Courier New', monospace;
        }}
        .url-link:hover {{
            text-decoration: underline;
        }}
        .description-box {{
            background: #e8eaf6;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
        }}
        .screenshot {{
            max-width: 100%;
            border: 2px solid #ddd;
            border-radius: 5px;
            margin: 10px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        th {{
            background-color: #667eea;
            color: white;
        }}
        .count-badge {{
            background: #667eea;
            color: white;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: bold;
        }}
        details {{
            cursor: pointer;
        }}
        details summary::-webkit-details-marker {{
            display: none;
        }}
        details[open] summary {{
            margin-bottom: 10px;
        }}
        mark {{
            background: #ffeb3b !important;
            padding: 2px 4px;
            border-radius: 2px;
        }}
        pre {{
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
    </style>
    <script>
        function toggleDetails(id) {{
            const details = document.getElementById('details-' + id);
            const icon = document.getElementById('icon-' + id);
            if (details.classList.contains('show')) {{
                details.classList.remove('show');
                icon.classList.remove('expanded');
            }} else {{
                details.classList.add('show');
                icon.classList.add('expanded');
            }}
        }}
    </script>
</head>
<body>
    <div class="header">
        <h1>🛡️ Spectra Security Assessment Report</h1>
        <p><strong>Report ID:</strong> {data['metadata']['report_id']}</p>
        <p><strong>Generated:</strong> {data['metadata']['generated_at']}</p>
        <div class="target-info">
            <div style="font-size: 14px; margin-bottom: 5px;">Target URL:</div>
            <div class="target-url">{html.escape(data['target']['url'])}</div>
        </div>
    </div>

    <div class="section">
        <h2>Risk Assessment</h2>
        <div class="risk-score {self._get_risk_class(data['summary']['risk_score'])}">
            {data['summary']['risk_score']}/100
        </div>
        <p style="text-align: center; font-size: 18px;">
            <strong>{data['summary']['total_vulnerabilities']}</strong> vulnerabilities found
        </p>
    </div>

    <div class="section">
        <h2>Vulnerability Breakdown</h2>
        <table>
            <tr>
                <th>Severity</th>
                <th>Count</th>
            </tr>
"""
        by_severity = data['summary']['categorization'].get('by_severity', {})
        for severity, count in by_severity.items():
            html_content += f"""
            <tr>
                <td><strong>{html.escape(severity.upper())}</strong></td>
                <td>{html.escape(str(count))}</td>
            </tr>
"""

        html_content += """
        </table>
    </div>

    <div class="section">
        <h2>AI Analysis</h2>
        <pre style="white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px;">"""
        html_content += html.escape(data['analysis'].get('ai_analysis', 'No analysis available'))
        html_content += """</pre>
    </div>

    <div class="section">
        <h2>Detailed Findings</h2>
        <p style="color: #666; margin-bottom: 20px;">Click on any finding to expand and view all affected URLs and details</p>
"""

        # Generate detailed vulnerability cards
        vuln_id = 0
        for template_id, vulns in grouped_vulns.items():
            vuln_id += 1
            first_vuln = vulns[0]
            info = first_vuln.get('info', {})
            severity = info.get('severity', 'info').lower()
            name = info.get('name', template_id)
            description = info.get('description', 'No description available')
            count = len(vulns)

            html_content += f"""
        <div class="vuln-card severity-{severity}">
            <div class="vuln-header" onclick="toggleDetails({vuln_id})">
                <div>
                    <h3 style="margin: 0;">
                        <span class="collapse-icon" id="icon-{vuln_id}">▶</span>
                        {html.escape(name)}
                    </h3>
                </div>
                <div>
                    <span class="count-badge">{html.escape(str(count))} occurrence{"s" if count > 1 else ""}</span>
                    <span class="severity-badge badge-{severity}">{html.escape(severity)}</span>
                </div>
            </div>

            <div class="vuln-details" id="details-{vuln_id}">
                <div class="description-box">
                    <strong>Description:</strong><br>
                    {html.escape(description)}
                </div>

                <div style="margin-top: 15px;">
                    <strong>Template ID:</strong> <code>{html.escape(template_id)}</code>
                </div>

                <div style="margin-top: 15px;">
                    <strong>Affected URLs ({count}):</strong>
                </div>
"""

            # Add all occurrences
            for idx, vuln in enumerate(vulns, 1):
                matched_at = vuln.get('matched-at', 'N/A')
                matcher_name = vuln.get('matcher-name', '')

                html_content += f"""
                <div class="occurrence">
                    <strong>#{idx}</strong>
                    <a href="{html.escape(matched_at)}" target="_blank" class="url-link">{html.escape(matched_at)}</a>
"""

                if matcher_name:
                    html_content += f"""
                    <div style="margin-top: 5px; color: #666; font-size: 14px;">
                        Matched: {html.escape(matcher_name)}
                    </div>
"""

                # Add extracted data if available
                extracted = vuln.get('extracted-results', [])
                if extracted:
                    escaped_extracted = ', '.join(html.escape(str(e)) for e in extracted[:5])
                    html_content += f"""
                    <div style="margin-top: 5px; background: #fff3cd; padding: 8px; border-radius: 3px;">
                        <strong>Extracted Data:</strong> {escaped_extracted}
                    </div>
"""

                # Add HTTP request/response evidence if available
                request = vuln.get('request', '')
                response = vuln.get('response', '')

                if request or response:
                    html_content += f"""
                    <details style="margin-top: 10px; background: #f8f9fa; padding: 10px; border-radius: 3px; border: 1px solid #dee2e6;">
                        <summary style="cursor: pointer; font-weight: bold; color: #667eea;">
                            🔍 Show HTTP Evidence
                        </summary>
                        <div style="margin-top: 10px;">
"""

                    if request:
                        # Format and display HTTP request
                        request_preview = request[:1000] if len(request) > 1000 else request
                        request_preview = request_preview.replace('<', '&lt;').replace('>', '&gt;')
                        html_content += f"""
                            <div style="margin-bottom: 15px;">
                                <strong>HTTP Request:</strong>
                                <pre style="background: #fff; padding: 10px; border-left: 3px solid #667eea; overflow-x: auto; font-size: 12px; margin-top: 5px;">{request_preview}</pre>
                            </div>
"""

                    if response:
                        # Check if response is a JavaScript result (array format like [JSESSIONID])
                        is_js_result = response.strip().startswith('[') and response.strip().endswith(']')

                        # For cookie findings with JS results, explain what was found
                        if is_js_result and 'cookie' in template_id.lower():
                            extracted = vuln.get('extracted-results', [])
                            cookie_names = ', '.join(html.escape(str(e)) for e in extracted) if extracted else 'unknown'

                            # Get scan timestamp to show when this was detected
                            scan_time = html.escape(data.get('target', {}).get('scan_timestamp', 'scan time'))

                            html_content += f"""
                            <div>
                                <strong>Vulnerability Details:</strong>
                                <pre style="background: #fff; padding: 10px; border-left: 3px solid #ff8800; overflow-x: auto; font-size: 12px; margin-top: 5px;">Cookie(s) found WITHOUT Secure attribute: <strong>{cookie_names}</strong>

During the scan, Nuclei analyzed the HTTP response headers and detected that the
Set-Cookie header for the above cookie(s) was missing the "Secure" flag.

The Secure flag ensures cookies are only sent over HTTPS connections. Without it,
cookies can be intercepted over unencrypted HTTP connections.

⏰ Detected at: {scan_time}

Example of VULNERABLE Set-Cookie header:
  Set-Cookie: JSESSIONID=xxxxx; Path=/; HttpOnly
                                              ^--- Missing "Secure" flag

Example of SECURE Set-Cookie header:
  Set-Cookie: JSESSIONID=xxxxx; Path=/; Secure; HttpOnly
                                        ^--- Secure flag present</pre>
                            </div>
"""

                            # Optionally try to fetch current headers for comparison
                            logger.info(f"Fetching current headers from {matched_at} for comparison")
                            actual_headers = self._fetch_actual_http_headers(matched_at)

                            if actual_headers and 'Set-Cookie' in actual_headers:
                                response_preview = actual_headers.replace('<', '&lt;').replace('>', '&gt;')

                                # Check if current response has Secure flag
                                has_secure_now = 'secure' in actual_headers.lower() and 'set-cookie' in actual_headers.lower()

                                if has_secure_now:
                                    response_preview = response_preview.replace('Set-Cookie:', '<mark style="background: #90EE90;">Set-Cookie:</mark>')
                                    status_msg = "✅ Current Status: The Secure flag is NOW present (may have been fixed after scan)"
                                    status_color = "#28a745"
                                else:
                                    response_preview = response_preview.replace('Set-Cookie:', '<mark style="background: #ffeb3b;">Set-Cookie:</mark>')
                                    status_msg = "❌ Current Status: The Secure flag is STILL missing (vulnerability confirmed)"
                                    status_color = "#dc3545"

                                html_content += f"""
                            <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
                                <strong>Current HTTP Response Headers (Fresh Request):</strong>
                                <pre style="background: #fff; padding: 10px; border-left: 3px solid #667eea; overflow-x: auto; font-size: 12px; margin-top: 5px;">{response_preview}</pre>
                                <p style="color: {status_color}; font-size: 13px; font-weight: bold; margin-top: 5px;"><em>{status_msg}</em></p>
                                <p style="color: #666; font-size: 11px; margin-top: 5px;"><em>⚠️ Note: This is a fresh HTTP request made during report generation. Results may differ from the original scan if server configuration changed.</em></p>
                            </div>
"""
                        else:
                            # Regular response display for non-JS results
                            response_preview = response[:2000] if len(response) > 2000 else response
                            response_preview = response_preview.replace('<', '&lt;').replace('>', '&gt;')

                            # Highlight Set-Cookie headers for cookie findings
                            if 'cookie' in template_id.lower() and 'Set-Cookie' in response_preview:
                                response_preview = response_preview.replace('Set-Cookie:', '<mark style="background: #ffeb3b;">Set-Cookie:</mark>')

                            html_content += f"""
                            <div>
                                <strong>HTTP Response:</strong>
                                <pre style="background: #fff; padding: 10px; border-left: 3px solid #667eea; overflow-x: auto; font-size: 12px; margin-top: 5px;">{response_preview}</pre>
                                {f'<p style="color: #666; font-size: 12px; margin-top: 5px;"><em>Response truncated. Showing first 2000 characters.</em></p>' if len(response) > 2000 else ''}
                            </div>
"""

                    # Add curl command if available
                    curl_cmd = vuln.get('curl-command', '')
                    if curl_cmd:
                        curl_preview = curl_cmd[:500] if len(curl_cmd) > 500 else curl_cmd
                        curl_preview = curl_preview.replace('<', '&lt;').replace('>', '&gt;')
                        html_content += f"""
                            <div style="margin-top: 15px;">
                                <strong>Reproduce with curl:</strong>
                                <pre style="background: #263238; color: #aed581; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 11px; margin-top: 5px;">{curl_preview}</pre>
                            </div>
"""

                    html_content += """
                        </div>
                    </details>
"""

                html_content += """
                </div>
"""

            html_content += """
            </div>
        </div>
"""

        html_content += """
    </div>

    <div class="section" style="text-align: center; color: #666;">
        <p>Report generated by <strong>Spectra AI Penetration Testing</strong></p>
        <p style="font-size: 12px;">Powered by Nuclei & Llama AI Analysis</p>
    </div>
</body>
</html>"""

        with open(file_path, 'w') as f:
            f.write(html_content)

        logger.info(f"HTML report saved to: {file_path}")
        return file_path

    def _get_risk_class(self, score: float) -> str:
        """Get CSS class based on risk score"""
        if score >= 80:
            return 'critical'
        elif score >= 60:
            return 'high'
        elif score >= 40:
            return 'medium'
        else:
            return 'low'
