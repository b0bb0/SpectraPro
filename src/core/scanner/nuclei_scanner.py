"""
Nuclei Scanner Module
Handles vulnerability scanning using Nuclei
"""

import subprocess
import json
import os
from typing import Dict, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class NucleiScanner:
    """Manages Nuclei vulnerability scanning operations"""

    def __init__(self, output_dir: str = "data/scans", rate_limit: int = 150, timeout: int = 3600):
        """
        Initialize Nuclei Scanner

        Args:
            output_dir: Directory to store scan results
            rate_limit: Default request rate limit
            timeout: Default scan timeout in seconds
        """
        self.output_dir = output_dir
        self.default_rate_limit = rate_limit
        self.default_timeout = timeout
        self.nuclei_path = self._find_nuclei()

    def _find_nuclei(self) -> str:
        """Find nuclei binary path"""
        result = subprocess.run(['which', 'nuclei'], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError("Nuclei not found. Please install nuclei first.")
        return result.stdout.strip()

    def scan_target(
        self,
        target: str,
        scan_type: str = "full",
        severity: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        templates: Optional[List[str]] = None,
        rate_limit: Optional[int] = None
    ) -> Dict:
        """
        Perform vulnerability scan on target

        Args:
            target: Target URL or IP address
            scan_type: Type of scan (full, quick, custom)
            severity: Filter by severity levels (info, low, medium, high, critical)
            tags: Filter by tags
            templates: Specific templates to use
            rate_limit: Request rate limit

        Returns:
            Dict containing scan results and metadata
        """
        logger.info(f"Starting scan on target: {target}")

        # Use instance defaults if not explicitly provided
        if rate_limit is None:
            rate_limit = self.default_rate_limit

        # Generate unique scan ID
        scan_id = f"scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        output_file = os.path.join(self.output_dir, f"{scan_id}.jsonl")

        # Ensure output directory exists
        os.makedirs(self.output_dir, exist_ok=True)

        # Build nuclei command
        cmd = [
            self.nuclei_path,
            '-u', target,
            '-jsonl',  # Use JSON Lines format
            '-o', output_file,
            '-rate-limit', str(rate_limit),
            '-stats'  # Show statistics
        ]

        # Add severity filters (comma-separated format)
        if severity:
            severity_str = ','.join(severity)
            cmd.extend(['-severity', severity_str])

        # Add tag filters
        if tags:
            for tag in tags:
                cmd.extend(['-tags', tag])

        # Add specific templates
        if templates:
            for template in templates:
                cmd.extend(['-t', template])
        else:
            # Use all templates by default (excluding code/headless by default)
            # Templates will be automatically loaded from default nuclei templates directory
            pass  # Nuclei loads all templates by default

        # Execute scan
        try:
            logger.info(f"Executing command: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.default_timeout
            )

            # Log output for debugging
            if result.stdout:
                logger.debug(f"Nuclei stdout: {result.stdout[:500]}")
            if result.stderr:
                logger.info(f"Nuclei stderr: {result.stderr[:500]}")

            if result.returncode != 0:
                stderr_msg = result.stderr[:500] if result.stderr else 'No error output'
                logger.error(f"Nuclei exited with code {result.returncode}: {stderr_msg}")
                return {
                    'scan_id': scan_id,
                    'target': target,
                    'timestamp': datetime.now().isoformat(),
                    'status': 'failed',
                    'error': f'Nuclei exited with code {result.returncode}: {stderr_msg}'
                }

            # Parse results
            scan_results = self._parse_results(output_file)
            logger.info(f"Parsed {len(scan_results)} results from {output_file}")

            # Prepare response
            response = {
                'scan_id': scan_id,
                'target': target,
                'timestamp': datetime.now().isoformat(),
                'status': 'completed',
                'vulnerabilities_found': len(scan_results),
                'results': scan_results,
                'output_file': output_file
            }

            logger.info(f"Scan completed. Found {len(scan_results)} vulnerabilities")
            return response

        except subprocess.TimeoutExpired:
            logger.error("Scan timeout exceeded")
            return {
                'scan_id': scan_id,
                'target': target,
                'status': 'timeout',
                'error': 'Scan exceeded timeout limit'
            }
        except Exception as e:
            logger.error(f"Scan failed: {str(e)}")
            return {
                'scan_id': scan_id,
                'target': target,
                'status': 'failed',
                'error': str(e)
            }

    def _parse_results(self, output_file: str) -> List[Dict]:
        """Parse nuclei JSON output"""
        results = []

        if not os.path.exists(output_file):
            return results

        try:
            with open(output_file, 'r') as f:
                for line in f:
                    if line.strip():
                        try:
                            results.append(json.loads(line))
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse line: {line}")
        except Exception as e:
            logger.error(f"Error parsing results: {str(e)}")

        return results

    def update_templates(self) -> bool:
        """Update nuclei templates to latest version"""
        try:
            logger.info("Updating nuclei templates")
            result = subprocess.run(
                [self.nuclei_path, '-update-templates'],
                capture_output=True,
                text=True,
                timeout=300
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Failed to update templates: {str(e)}")
            return False
