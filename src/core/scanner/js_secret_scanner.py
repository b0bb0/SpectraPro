"""
JavaScript Secret Scanner Module
Fetches website source and loaded JS files, scans for secrets using TruffleHog
"""

import subprocess
import json
import os
import re
import tempfile
import shutil
from typing import Dict, List, Optional
from datetime import datetime
from urllib.parse import urljoin, urlparse
import logging

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Severity mapping for TruffleHog detector types
DETECTOR_SEVERITY = {
    'aws': 'critical',
    'github': 'critical',
    'gitlab': 'critical',
    'gcp': 'critical',
    'azure': 'critical',
    'stripe': 'critical',
    'slack': 'high',
    'twilio': 'high',
    'sendgrid': 'high',
    'mailgun': 'high',
    'firebase': 'high',
    'heroku': 'high',
    'digitalocean': 'high',
    'npm': 'high',
    'pypi': 'high',
    'docker': 'high',
    'jdbc': 'high',
    'privatekey': 'critical',
    'generic': 'medium',
}


class JSSecretScanner:
    """Scans website source code and loaded JavaScript files for leaked secrets using TruffleHog"""

    def __init__(self, output_dir: str = "data/scans", timeout: int = 1800):
        """
        Initialize JS Secret Scanner

        Args:
            output_dir: Directory to store scan results
            timeout: TruffleHog scan timeout in seconds
        """
        self.output_dir = output_dir
        self.timeout = timeout
        self.trufflehog_path = self._find_trufflehog()
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

    def _find_trufflehog(self) -> str:
        """Find trufflehog binary path"""
        result = subprocess.run(['which', 'trufflehog'], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(
                "TruffleHog not found. Install with: curl -sSfL "
                "https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin"
            )
        return result.stdout.strip()

    def scan_target(self, target: str) -> Dict:
        """
        Fetch website source + JS files and scan for secrets with TruffleHog

        Args:
            target: Target URL to scan

        Returns:
            Dict containing scan results in the standard SpectraPro format
        """
        logger.info(f"Starting JS secret scan on target: {target}")

        scan_id = f"secrets_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        output_file = os.path.join(self.output_dir, f"{scan_id}.jsonl")
        os.makedirs(self.output_dir, exist_ok=True)

        tmp_dir = tempfile.mkdtemp(prefix="spectra_js_")

        try:
            # Step 1: Fetch page and extract JS
            js_files = self._fetch_and_extract_js(target, tmp_dir)
            logger.info(f"Collected {len(js_files)} files (HTML source + JS) from {target}")

            if not js_files:
                logger.warning(f"No content fetched from {target}")
                return {
                    'scan_id': scan_id,
                    'target': target,
                    'timestamp': datetime.now().isoformat(),
                    'status': 'completed',
                    'vulnerabilities_found': 0,
                    'results': [],
                    'output_file': output_file,
                    'scanner_type': 'trufflehog'
                }

            # Step 2: Run TruffleHog on collected files
            raw_findings = self._run_trufflehog(tmp_dir, output_file)
            logger.info(f"TruffleHog found {len(raw_findings)} raw secrets")

            # Step 3: Convert to SpectraPro vulnerability format
            results = self._convert_to_vulnerabilities(raw_findings, target, js_files)
            logger.info(f"Converted to {len(results)} vulnerability entries")

            # Write results to output JSONL
            with open(output_file, 'w') as f:
                for result in results:
                    f.write(json.dumps(result) + '\n')

            return {
                'scan_id': scan_id,
                'target': target,
                'timestamp': datetime.now().isoformat(),
                'status': 'completed',
                'vulnerabilities_found': len(results),
                'results': results,
                'output_file': output_file,
                'scanner_type': 'trufflehog',
                'js_files_scanned': len(js_files)
            }

        except subprocess.TimeoutExpired:
            logger.error("TruffleHog scan timeout exceeded")
            return {
                'scan_id': scan_id,
                'target': target,
                'timestamp': datetime.now().isoformat(),
                'status': 'timeout',
                'error': 'TruffleHog scan exceeded timeout limit',
                'scanner_type': 'trufflehog'
            }
        except Exception as e:
            logger.error(f"JS secret scan failed: {str(e)}")
            return {
                'scan_id': scan_id,
                'target': target,
                'timestamp': datetime.now().isoformat(),
                'status': 'failed',
                'error': str(e),
                'scanner_type': 'trufflehog'
            }
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _fetch_and_extract_js(self, target: str, tmp_dir: str) -> List[Dict]:
        """
        Fetch the target page HTML, save it, then download all referenced JS files.

        Returns:
            List of dicts with 'url', 'local_path', and 'type' for each collected file
        """
        collected = []
        parsed_target = urlparse(target)
        base_url = f"{parsed_target.scheme}://{parsed_target.netloc}"

        # Fetch main page
        try:
            resp = self.session.get(target, timeout=30, allow_redirects=True)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"Failed to fetch {target}: {e}")
            return collected

        # Save page source
        page_path = os.path.join(tmp_dir, "page_source.html")
        with open(page_path, 'w', encoding='utf-8', errors='replace') as f:
            f.write(resp.text)
        collected.append({'url': target, 'local_path': page_path, 'type': 'html'})

        # Parse and find script tags
        soup = BeautifulSoup(resp.text, 'html.parser')
        script_tags = soup.find_all('script')

        js_urls = set()
        inline_count = 0

        for tag in script_tags:
            src = tag.get('src')
            if src:
                # External JS file
                absolute_url = urljoin(target, src)
                js_urls.add(absolute_url)
            elif tag.string and tag.string.strip():
                # Inline script with content
                inline_count += 1
                inline_path = os.path.join(tmp_dir, f"inline_{inline_count}.js")
                with open(inline_path, 'w', encoding='utf-8', errors='replace') as f:
                    f.write(tag.string)
                collected.append({
                    'url': f"{target}#inline-script-{inline_count}",
                    'local_path': inline_path,
                    'type': 'inline_js'
                })

        # Also look for JS loaded dynamically via common patterns in the source
        # e.g., loadScript("..."), src="...\.js", import("...")
        dynamic_js_pattern = re.compile(
            r'''(?:src|href|url)\s*[=:]\s*["']([^"']+\.js(?:\?[^"']*)?)["']''',
            re.IGNORECASE
        )
        for match in dynamic_js_pattern.finditer(resp.text):
            js_url = urljoin(target, match.group(1))
            js_urls.add(js_url)

        # Download external JS files
        for js_url in js_urls:
            try:
                js_resp = self.session.get(js_url, timeout=15)
                js_resp.raise_for_status()

                # Create safe filename from URL
                parsed = urlparse(js_url)
                safe_name = re.sub(r'[^\w\-.]', '_', parsed.path.split('/')[-1] or 'script.js')
                if not safe_name.endswith('.js'):
                    safe_name += '.js'

                # Avoid name collisions
                js_path = os.path.join(tmp_dir, safe_name)
                counter = 1
                while os.path.exists(js_path):
                    name, ext = os.path.splitext(safe_name)
                    js_path = os.path.join(tmp_dir, f"{name}_{counter}{ext}")
                    counter += 1

                with open(js_path, 'w', encoding='utf-8', errors='replace') as f:
                    f.write(js_resp.text)

                collected.append({'url': js_url, 'local_path': js_path, 'type': 'external_js'})
                logger.debug(f"Downloaded JS: {js_url}")

            except requests.RequestException as e:
                logger.warning(f"Failed to download JS file {js_url}: {e}")

        return collected

    def _run_trufflehog(self, scan_dir: str, output_file: str) -> List[Dict]:
        """
        Run TruffleHog filesystem scan on the collected files.

        Returns:
            List of raw TruffleHog finding dicts
        """
        cmd = [
            self.trufflehog_path,
            'filesystem',
            scan_dir,
            '--json',
            '--no-update',
        ]

        logger.info(f"Running TruffleHog: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self.timeout
        )

        if result.stderr:
            logger.debug(f"TruffleHog stderr: {result.stderr[:500]}")

        findings = []
        if result.stdout:
            for line in result.stdout.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    finding = json.loads(line)
                    findings.append(finding)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse TruffleHog output line: {line[:100]}")

        return findings

    def _convert_to_vulnerabilities(
        self, findings: List[Dict], target: str, js_files: List[Dict]
    ) -> List[Dict]:
        """
        Convert TruffleHog findings to SpectraPro vulnerability format,
        matching the Nuclei output structure so the rest of the pipeline
        (AI analyzer, report generator, database) works unchanged.
        """
        # Build a mapping from local path back to URL
        path_to_url = {}
        for f in js_files:
            path_to_url[f['local_path']] = f['url']

        results = []
        seen = set()

        for finding in findings:
            detector_name = finding.get('DetectorName', finding.get('detectorName', 'unknown'))
            raw_secret = finding.get('Raw', finding.get('raw', ''))
            source_meta = finding.get('SourceMetadata', finding.get('sourceMetadata', {}))
            verified = finding.get('Verified', finding.get('verified', False))
            decoder_name = finding.get('DecoderName', finding.get('decoderName', ''))

            # Extract the file path from source metadata
            file_data = source_meta.get('Data', source_meta.get('data', {}))
            filesystem_data = file_data.get('Filesystem', file_data.get('filesystem', {}))
            local_file = filesystem_data.get('file', '')
            line_num = filesystem_data.get('line', 0)

            # Map back to the original URL
            source_url = path_to_url.get(local_file, target)

            # Deduplicate on detector + redacted secret + source
            redacted = self._redact_secret(raw_secret)
            dedup_key = f"{detector_name}:{redacted}:{source_url}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            # Determine severity from detector type
            severity = self._classify_severity(detector_name, verified)

            # Build Nuclei-compatible vulnerability object
            vuln = {
                'template-id': f"secret:{detector_name.lower()}",
                'type': 'secret',
                'info': {
                    'name': f"Exposed Secret: {detector_name}",
                    'severity': severity,
                    'description': (
                        f"A {'verified' if verified else 'potential'} {detector_name} secret "
                        f"was found in {'the page source' if source_url == target else 'a JavaScript file'}. "
                        f"Exposed secrets in client-side code can be harvested by anyone viewing the page."
                    ),
                    'remediation': (
                        f"Remove the {detector_name} secret from client-side code immediately. "
                        f"Rotate the credential, revoke the old value, and move it to a server-side "
                        f"environment variable or secrets manager."
                    ),
                    'tags': ['secret', 'javascript', 'trufflehog', detector_name.lower()],
                },
                'matched-at': source_url,
                'matcher-name': detector_name,
                'extracted-results': [redacted],
                'secret-details': {
                    'detector': detector_name,
                    'decoder': decoder_name,
                    'verified': verified,
                    'redacted_value': redacted,
                    'source_file': os.path.basename(local_file) if local_file else '',
                    'line': line_num,
                },
            }

            results.append(vuln)

        return results

    @staticmethod
    def _redact_secret(raw: str) -> str:
        """Redact a secret value, keeping only first 4 and last 4 chars"""
        if len(raw) <= 12:
            return raw[:3] + '***' + raw[-2:] if len(raw) > 5 else '***'
        return raw[:4] + '...' + raw[-4:]

    @staticmethod
    def _classify_severity(detector_name: str, verified: bool) -> str:
        """Classify secret severity based on detector type and verification status"""
        detector_lower = detector_name.lower()

        # Check known detector mappings
        for key, sev in DETECTOR_SEVERITY.items():
            if key in detector_lower:
                if verified:
                    # Verified secrets are always at least high
                    return sev
                # Unverified: drop one level for non-critical
                if sev == 'critical':
                    return 'high'
                if sev == 'high':
                    return 'medium'
                return 'low'

        # Default: medium if verified, low if not
        return 'medium' if verified else 'low'
