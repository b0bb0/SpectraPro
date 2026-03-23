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

import yaml

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


def load_config(project_root: str) -> Dict:
    """Load configuration from config.yaml, falling back to defaults."""
    config_path = os.path.join(project_root, "config", "config.yaml")
    defaults = {
        'scanner': {
            'nuclei_path': 'nuclei',
            'output_dir': 'data/scans',
            'rate_limit': 150,
            'timeout': 3600,
        },
        'analyzer': {
            'llama_api_url': 'http://localhost:11434/api/generate',
            'model': 'mannix/llama3.1-8b-abliterated',
            'timeout': 60,
        },
        'reporter': {
            'output_dir': 'data/reports',
            'default_format': 'html',
        },
        'database': {
            'path': 'data/spectra.db',
        },
    }

    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                file_config = yaml.safe_load(f) or {}
            # Merge file config over defaults (one level deep)
            for section, values in defaults.items():
                if section in file_config and isinstance(file_config[section], dict):
                    values.update(file_config[section])
            logger.info(f"Loaded config from {config_path}")
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}. Using defaults.")

    return defaults


class SpectraCLI:
    """Main CLI application"""

    def __init__(self):
        # Get project root directory (parent of src/)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)

        # Load config from config.yaml
        config = load_config(project_root)

        # Use absolute paths, with config values
        scanner_cfg = config['scanner']
        analyzer_cfg = config['analyzer']

        self.scanner = NucleiScanner(
            output_dir=os.path.join(project_root, scanner_cfg['output_dir']),
            rate_limit=scanner_cfg['rate_limit'],
            timeout=scanner_cfg['timeout'],
        )
        self.analyzer = AIAnalyzer(
            llama_api_url=analyzer_cfg['llama_api_url'],
            model=analyzer_cfg['model'],
            timeout=analyzer_cfg['timeout'],
        )
        self.reporter = ReportGenerator(
            output_dir=os.path.join(project_root, config['reporter']['output_dir'])
        )
        self.db = Database(
            db_path=os.path.join(project_root, config['database']['path'])
        )

    def run_full_scan(self, target, severity=None, output_format='html'):
        """
        Run complete penetration test workflow

        Args:
            target: Target URL
            severity: Filter by severity
            output_format: Report format (html, json, markdown)
        """
        print(f"\n{'='*60}")
        print(f"  SPECTRA - AI Automated Penetration Testing")
        print(f"{'='*60}\n")
        print(f"Target: {target}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        # Step 1: Scan
        print("[1/4] Running Nuclei vulnerability scan...")
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

        # Step 2: AI Analysis
        print("\n[2/4] Analyzing vulnerabilities with AI...")
        analysis = self.analyzer.analyze_vulnerabilities(
            scan_results['results'],
            target
        )

        print(f"✓ Analysis completed - Risk Score: {analysis['risk_score']}/100")

        # Save analysis
        self.db.save_analysis(scan_results['scan_id'], analysis)

        # Step 3: Generate Report
        print(f"\n[3/4] Generating {output_format.upper()} report...")
        report = self.reporter.generate_report(
            scan_results,
            analysis,
            format=output_format
        )

        print(f"✓ Report generated: {report['file_path']}")

        # Save report metadata
        self.db.save_report(report, scan_results['scan_id'])

        # Step 4: Display Summary
        print(f"\n[4/4] Scan Summary")
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

            print(f"\nTop Recommendations:")
            for i, rec in enumerate(analysis.get('recommendations', [])[:3], 1):
                print(f"  {i}. [{rec['severity'].upper()}] {rec['vulnerability']}")
        else:
            print(f"\n✓ No vulnerabilities found - Target appears secure!")
            print(f"   {analysis.get('message', 'Scan completed successfully')}")

        print(f"\n{'='*60}")
        print(f"Report: {report['file_path']}")
        print(f"{'='*60}\n")

    def run_batch_scan(self, targets: List[str], severity=None, output_format='html', max_workers=3):
        """
        Run vulnerability scans on multiple targets in parallel

        Args:
            targets: List of target URLs
            severity: Filter by severity
            output_format: Report format (html, json, markdown)
            max_workers: Maximum number of parallel scans (default: 3)
        """
        print(f"\n{'='*60}")
        print(f"  SPECTRA - Batch Scanning Mode")
        print(f"{'='*60}\n")
        print(f"Targets: {len(targets)}")
        print(f"Max Parallel Scans: {max_workers}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        results = {
            'total': len(targets),
            'completed': 0,
            'failed': 0,
            'scans': []
        }

        def scan_single_target(target: str, index: int) -> Dict:
            """Scan a single target and return results"""
            try:
                print(f"\n[{index + 1}/{len(targets)}] Starting scan: {target}")

                # Run scan
                scan_results = self.scanner.scan_target(
                    target=target,
                    severity=severity
                )

                if scan_results['status'] != 'completed':
                    print(f"  ❌ [{index + 1}/{len(targets)}] Scan failed: {target}")
                    return {'target': target, 'status': 'failed', 'error': scan_results.get('error', 'Unknown error')}

                # Save to database
                self.db.save_scan(scan_results)

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

                print(f"  ✓ [{index + 1}/{len(targets)}] Completed: {target} - {scan_results['vulnerabilities_found']} vulnerabilities")

                return {
                    'target': target,
                    'status': 'completed',
                    'scan_id': scan_results['scan_id'],
                    'vulnerabilities_found': scan_results['vulnerabilities_found'],
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

  # Multi-target batch scan
  spectra scan --targets-file targets.txt
  spectra scan -f targets.txt --max-workers 5
  spectra scan -f targets.txt --severity critical --format json

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
                    max_workers=args.max_workers
                )
            # Single target mode
            else:
                cli.run_full_scan(
                    target=args.target,
                    severity=args.severity,
                    output_format=args.format
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
