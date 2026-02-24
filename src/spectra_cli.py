#!/usr/bin/env python3
"""
Spectra CLI
Command-line interface for AI-powered penetration testing
"""

import argparse
import sys
import os
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.scanner import NucleiScanner
from core.analyzer import AIAnalyzer
from core.reporter import ReportGenerator
from core.database import Database

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SpectraCLI:
    """Main CLI application"""

    def __init__(self):
        # Get project root directory (parent of src/)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)

        # Use absolute paths
        self.scanner = NucleiScanner(output_dir=os.path.join(project_root, "data/scans"))
        self.analyzer = AIAnalyzer()
        self.reporter = ReportGenerator(output_dir=os.path.join(project_root, "data/reports"))
        self.db = Database(db_path=os.path.join(project_root, "data/spectra.db"))

        # Secret scanner is initialized lazily when --secret-scan is used
        self._secret_scanner = None
        self._project_root = project_root

    def _get_secret_scanner(self):
        """Lazily initialize the JS secret scanner (requires TruffleHog + bs4 installed)"""
        if self._secret_scanner is None:
            from core.scanner import get_js_secret_scanner
            JSSecretScanner = get_js_secret_scanner()
            self._secret_scanner = JSSecretScanner(
                output_dir=os.path.join(self._project_root, "data/scans")
            )
        return self._secret_scanner

    def run_full_scan(self, target, severity=None, output_format='html', secret_scan=False):
        """
        Run complete penetration test workflow

        Args:
            target: Target URL
            severity: Filter by severity
            output_format: Report format (html, json, markdown)
            secret_scan: Also scan website JS files for leaked secrets via TruffleHog
        """
        total_steps = 5 if secret_scan else 4

        print(f"\n{'='*60}")
        print(f"  SPECTRA - AI Automated Penetration Testing")
        print(f"{'='*60}\n")
        print(f"Target: {target}")
        if secret_scan:
            print(f"Mode:   Vulnerability + JS Secret Scan (TruffleHog)")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        # Step 1: Nuclei Scan
        print(f"[1/{total_steps}] Running Nuclei vulnerability scan...")
        scan_results = self.scanner.scan_target(
            target=target,
            severity=severity
        )

        if scan_results['status'] != 'completed':
            print(f"❌ Scan failed: {scan_results.get('error', 'Unknown error')}")
            return

        print(f"✓ Scan completed - {scan_results['vulnerabilities_found']} vulnerabilities found")

        # Save to database
        self.db.save_scan(scan_results)

        # Step 1b: JS Secret Scan (optional)
        secret_results = None
        if secret_scan:
            step = 2
            print(f"\n[{step}/{total_steps}] Scanning website source & JS files for secrets (TruffleHog)...")
            try:
                secret_scanner = self._get_secret_scanner()
                secret_results = secret_scanner.scan_target(target)

                if secret_results['status'] == 'completed':
                    js_count = secret_results.get('js_files_scanned', 0)
                    secrets_found = secret_results['vulnerabilities_found']
                    print(f"✓ Secret scan completed - {js_count} files scanned, {secrets_found} secrets found")

                    # Merge secret findings into the main scan results
                    scan_results['results'].extend(secret_results.get('results', []))
                    scan_results['vulnerabilities_found'] += secrets_found

                    # Save the secret scan separately too
                    self.db.save_scan(secret_results)
                else:
                    print(f"⚠ Secret scan issue: {secret_results.get('error', 'Unknown')}")
            except RuntimeError as e:
                print(f"⚠ Secret scan skipped: {e}")

        # Step 2/3: AI Analysis
        analysis_step = 3 if secret_scan else 2
        print(f"\n[{analysis_step}/{total_steps}] Analyzing vulnerabilities with AI...")
        analysis = self.analyzer.analyze_vulnerabilities(
            scan_results['results'],
            target
        )

        print(f"✓ Analysis completed - Risk Score: {analysis['risk_score']}/100")

        # Save analysis
        self.db.save_analysis(scan_results['scan_id'], analysis)

        # Step 3/4: Generate Report
        report_step = 4 if secret_scan else 3
        print(f"\n[{report_step}/{total_steps}] Generating {output_format.upper()} report...")
        report = self.reporter.generate_report(
            scan_results,
            analysis,
            format=output_format
        )

        print(f"✓ Report generated: {report['file_path']}")

        # Save report metadata
        self.db.save_report(report, scan_results['scan_id'])

        # Step 4/5: Display Summary
        summary_step = 5 if secret_scan else 4
        print(f"\n[{summary_step}/{total_steps}] Scan Summary")
        print(f"{'='*60}")
        print(f"Scan ID: {scan_results['scan_id']}")
        print(f"Risk Score: {analysis['risk_score']}/100")

        # Check if vulnerabilities were found
        if 'categorized_vulnerabilities' in analysis:
            print(f"\nVulnerabilities by Severity:")
            by_severity = analysis['categorized_vulnerabilities']['by_severity']
            print(f"  Critical: {by_severity['critical']}")
            print(f"  High:     {by_severity['high']}")
            print(f"  Medium:   {by_severity['medium']}")
            print(f"  Low:      {by_severity['low']}")
            print(f"  Info:     {by_severity['info']}")

            # Show secret-specific summary when applicable
            if secret_results and secret_results.get('vulnerabilities_found', 0) > 0:
                secret_count = secret_results['vulnerabilities_found']
                print(f"\n  Leaked Secrets: {secret_count} (included above)")

            print(f"\nTop Recommendations:")
            for i, rec in enumerate(analysis.get('recommendations', [])[:3], 1):
                print(f"  {i}. [{rec['severity'].upper()}] {rec['vulnerability']}")
        else:
            print(f"\n✓ No vulnerabilities found - Target appears secure!")
            print(f"   {analysis.get('message', 'Scan completed successfully')}")

        print(f"\n{'='*60}")
        print(f"Report: {report['file_path']}")
        print(f"{'='*60}\n")

    def run_batch_scan(self, targets: List[str], severity=None, output_format='html', max_workers=3, secret_scan=False):
        """
        Run vulnerability scans on multiple targets in parallel

        Args:
            targets: List of target URLs
            severity: Filter by severity
            output_format: Report format (html, json, markdown)
            max_workers: Maximum number of parallel scans (default: 3)
            secret_scan: Also scan website JS files for leaked secrets via TruffleHog
        """
        print(f"\n{'='*60}")
        print(f"  SPECTRA - Batch Scanning Mode")
        print(f"{'='*60}\n")
        print(f"Targets: {len(targets)}")
        if secret_scan:
            print(f"Mode: Vulnerability + JS Secret Scan (TruffleHog)")
        print(f"Max Parallel Scans: {max_workers}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        results = {
            'total': len(targets),
            'completed': 0,
            'failed': 0,
            'scans': []
        }

        # Pre-init secret scanner if needed so threads can share it
        if secret_scan:
            try:
                self._get_secret_scanner()
            except RuntimeError as e:
                print(f"⚠ TruffleHog not available, skipping secret scans: {e}")
                secret_scan = False

        def scan_single_target(target: str, index: int) -> Dict:
            """Scan a single target and return results"""
            try:
                print(f"\n[{index + 1}/{len(targets)}] Starting scan: {target}")

                # Run Nuclei scan
                scan_results = self.scanner.scan_target(
                    target=target,
                    severity=severity
                )

                if scan_results['status'] != 'completed':
                    print(f"  ❌ [{index + 1}/{len(targets)}] Scan failed: {target}")
                    return {'target': target, 'status': 'failed', 'error': scan_results.get('error', 'Unknown error')}

                # Save to database
                self.db.save_scan(scan_results)

                # Run JS secret scan if enabled
                secrets_found = 0
                if secret_scan:
                    try:
                        secret_results = self._get_secret_scanner().scan_target(target)
                        if secret_results['status'] == 'completed':
                            secrets_found = secret_results['vulnerabilities_found']
                            scan_results['results'].extend(secret_results.get('results', []))
                            scan_results['vulnerabilities_found'] += secrets_found
                            self.db.save_scan(secret_results)
                    except Exception as e:
                        logger.warning(f"Secret scan failed for {target}: {e}")

                # AI Analysis
                analysis = self.analyzer.analyze_vulnerabilities(
                    scan_results['results'],
                    target
                )

                # Save analysis
                self.db.save_analysis(scan_results['scan_id'], analysis)

                # Generate Report
                report = self.reporter.generate_report(
                    scan_results,
                    analysis,
                    format=output_format
                )

                # Save report metadata
                self.db.save_report(report, scan_results['scan_id'])

                vuln_msg = f"{scan_results['vulnerabilities_found']} vulnerabilities"
                if secrets_found:
                    vuln_msg += f" ({secrets_found} secrets)"
                print(f"  ✓ [{index + 1}/{len(targets)}] Completed: {target} - {vuln_msg}")

                return {
                    'target': target,
                    'status': 'completed',
                    'scan_id': scan_results['scan_id'],
                    'vulnerabilities_found': scan_results['vulnerabilities_found'],
                    'secrets_found': secrets_found,
                    'risk_score': analysis['risk_score'],
                    'report_path': report['file_path']
                }

            except Exception as e:
                print(f"  ❌ [{index + 1}/{len(targets)}] Error scanning {target}: {str(e)}")
                return {'target': target, 'status': 'error', 'error': str(e)}

        # Execute scans in parallel
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_target = {
                executor.submit(scan_single_target, target, i): target
                for i, target in enumerate(targets)
            }

            for future in as_completed(future_to_target):
                result = future.result()
                results['scans'].append(result)

                if result['status'] == 'completed':
                    results['completed'] += 1
                else:
                    results['failed'] += 1

        # Display summary
        print(f"\n{'='*60}")
        print(f"Batch Scan Summary")
        print(f"{'='*60}")
        print(f"Total Targets: {results['total']}")
        print(f"Completed: {results['completed']}")
        print(f"Failed: {results['failed']}")

        if results['completed'] > 0:
            print(f"\n{'Target':<40} {'Vulns':<8} {'Risk':<10} {'Status'}")
            print(f"{'='*70}")
            for scan in results['scans']:
                if scan['status'] == 'completed':
                    target = scan['target'][:38]
                    vulns = str(scan['vulnerabilities_found'])
                    risk = f"{scan['risk_score']}/100"
                    status = "✓"
                    print(f"{target:<40} {vulns:<8} {risk:<10} {status}")

            total_vulns = sum(s['vulnerabilities_found'] for s in results['scans'] if s['status'] == 'completed')
            avg_risk = sum(s['risk_score'] for s in results['scans'] if s['status'] == 'completed') / results['completed']
            print(f"{'='*70}")
            print(f"Total Vulnerabilities: {total_vulns}")
            print(f"Average Risk Score: {avg_risk:.1f}/100")

        if results['failed'] > 0:
            print(f"\n{'='*60}")
            print(f"Failed Scans:")
            for scan in results['scans']:
                if scan['status'] in ['failed', 'error']:
                    print(f"  ❌ {scan['target']}: {scan.get('error', 'Unknown error')}")

        print(f"\n{'='*60}\n")

        return results

    def load_targets_from_file(self, file_path: str) -> List[str]:
        """
        Load target URLs from a file (one per line)

        Args:
            file_path: Path to file containing targets

        Returns:
            List of target URLs
        """
        targets = []

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Targets file not found: {file_path}")

        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith('#'):
                    targets.append(line)

        if not targets:
            raise ValueError(f"No valid targets found in file: {file_path}")

        return targets

    def list_scans(self, limit=10):
        """List recent scans"""
        scans = self.db.get_all_scans(limit=limit)

        if not scans:
            print("No scans found.")
            return

        print(f"\n{'='*80}")
        print(f"{'Scan ID':<25} {'Target':<30} {'Risk Score':<12} {'Date'}")
        print(f"{'='*80}")

        for scan in scans:
            scan_id = scan['scan_id'][:23]
            target = scan['target'][:28]
            risk_score = f"{scan['risk_score']}/100" if scan['risk_score'] else "N/A"
            date = scan['start_time'][:19] if scan['start_time'] else "N/A"

            print(f"{scan_id:<25} {target:<30} {risk_score:<12} {date}")

        print(f"{'='*80}\n")

    def show_scan_details(self, scan_id):
        """Show detailed scan information"""
        scan = self.db.get_scan(scan_id)
        if not scan:
            print(f"Scan '{scan_id}' not found.")
            return

        analysis = self.db.get_analysis(scan_id)
        vulnerabilities = self.db.get_vulnerabilities_by_scan(scan_id)

        print(f"\n{'='*60}")
        print(f"Scan Details: {scan_id}")
        print(f"{'='*60}")
        print(f"Target: {scan['target']}")
        print(f"Status: {scan['status']}")
        print(f"Date: {scan['start_time']}")
        print(f"Vulnerabilities: {scan['vulnerabilities_count']}")
        print(f"Risk Score: {scan['risk_score']}/100")

        if analysis:
            print(f"\n{'='*60}")
            print("AI Analysis Summary")
            print(f"{'='*60}")
            print(analysis['ai_analysis'][:500] + "...")

        print(f"\n{'='*60}\n")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Spectra - AI Automated Penetration Testing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single target scan
  spectra scan https://example.com
  spectra scan https://example.com --severity critical high
  spectra scan https://example.com --format markdown

  # Scan with JS secret detection (TruffleHog)
  spectra scan https://example.com --secret-scan
  spectra scan https://example.com --secret-scan --format json

  # Multi-target batch scan
  spectra scan --targets-file targets.txt
  spectra scan -f targets.txt --max-workers 5
  spectra scan -f targets.txt --severity critical --format json
  spectra scan -f targets.txt --secret-scan

  # List and view scans
  spectra list
  spectra list --limit 20
  spectra show scan_20240115_143022

  # Update Nuclei templates
  spectra update
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')

    # Scan command
    scan_parser = subparsers.add_parser('scan', help='Run vulnerability scan')
    scan_parser.add_argument('target', nargs='?', help='Target URL (required unless --targets-file is used)')
    scan_parser.add_argument(
        '--targets-file',
        '-f',
        help='File containing multiple targets (one per line)'
    )
    scan_parser.add_argument(
        '--max-workers',
        '-w',
        type=int,
        default=3,
        help='Maximum number of parallel scans for batch mode (default: 3)'
    )
    scan_parser.add_argument(
        '--severity',
        nargs='+',
        choices=['critical', 'high', 'medium', 'low', 'info'],
        help='Filter by severity'
    )
    scan_parser.add_argument(
        '--format',
        choices=['html', 'json', 'markdown'],
        default='html',
        help='Report format (default: html)'
    )
    scan_parser.add_argument(
        '--secret-scan',
        action='store_true',
        default=False,
        help='Scan website source and loaded JS files for leaked secrets using TruffleHog'
    )

    # List command
    list_parser = subparsers.add_parser('list', help='List recent scans')
    list_parser.add_argument(
        '--limit',
        type=int,
        default=10,
        help='Number of scans to show (default: 10)'
    )

    # Show command
    show_parser = subparsers.add_parser('show', help='Show scan details')
    show_parser.add_argument('scan_id', help='Scan ID to display')

    # Update command
    update_parser = subparsers.add_parser('update', help='Update nuclei templates')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    cli = SpectraCLI()

    try:
        if args.command == 'scan':
            # Validate scan arguments
            if not args.target and not args.targets_file:
                parser.error('Either target or --targets-file must be specified')

            if args.target and args.targets_file:
                parser.error('Cannot specify both target and --targets-file')

            # Batch scan mode
            if args.targets_file:
                targets = cli.load_targets_from_file(args.targets_file)
                cli.run_batch_scan(
                    targets=targets,
                    severity=args.severity,
                    output_format=args.format,
                    max_workers=args.max_workers,
                    secret_scan=args.secret_scan
                )
            # Single target mode
            else:
                cli.run_full_scan(
                    target=args.target,
                    severity=args.severity,
                    output_format=args.format,
                    secret_scan=args.secret_scan
                )
        elif args.command == 'list':
            cli.list_scans(limit=args.limit)
        elif args.command == 'show':
            cli.show_scan_details(args.scan_id)
        elif args.command == 'update':
            print("Updating nuclei templates...")
            scanner = NucleiScanner()
            if scanner.update_templates():
                print("✓ Templates updated successfully")
            else:
                print("❌ Failed to update templates")

    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
