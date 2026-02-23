#!/usr/bin/env python3
"""
Simple Spectra Usage Example
Demonstrates basic scanning and reporting workflow
"""

import sys
import os

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.scanner import NucleiScanner
from core.analyzer import AIAnalyzer
from core.reporter import ReportGenerator
from core.database import Database


def main():
    """Run a simple scan example"""

    # Configuration
    TARGET = "https://testfire.net"
    OUTPUT_DIR = "../data"

    print("=" * 60)
    print("Spectra Simple Scan Example")
    print("=" * 60)
    print(f"\nTarget: {TARGET}\n")

    # Initialize components
    scanner = NucleiScanner(output_dir=f"{OUTPUT_DIR}/scans")
    analyzer = AIAnalyzer()
    reporter = ReportGenerator(output_dir=f"{OUTPUT_DIR}/reports")
    db = Database(db_path=f"{OUTPUT_DIR}/spectra.db")

    # Step 1: Scan
    print("[1/4] Scanning for vulnerabilities...")
    scan_results = scanner.scan_target(
        target=TARGET,
        severity=["critical", "high", "medium"]
    )

    if scan_results['status'] != 'completed':
        print(f"❌ Scan failed: {scan_results.get('error')}")
        return

    print(f"✓ Found {scan_results['vulnerabilities_found']} vulnerabilities")

    # Save to database
    db.save_scan(scan_results)

    # Step 2: Analyze
    print("\n[2/4] Analyzing with AI...")
    analysis = analyzer.analyze_vulnerabilities(
        scan_results['results'],
        TARGET
    )

    print(f"✓ Risk Score: {analysis['risk_score']}/100")

    # Save analysis
    db.save_analysis(scan_results['scan_id'], analysis)

    # Step 3: Generate Reports
    print("\n[3/4] Generating reports...")

    # HTML Report
    html_report = reporter.generate_report(
        scan_results,
        analysis,
        format="html"
    )
    print(f"✓ HTML Report: {html_report['file_path']}")

    # JSON Report
    json_report = reporter.generate_report(
        scan_results,
        analysis,
        format="json"
    )
    print(f"✓ JSON Report: {json_report['file_path']}")

    # Markdown Report
    md_report = reporter.generate_report(
        scan_results,
        analysis,
        format="markdown"
    )
    print(f"✓ Markdown Report: {md_report['file_path']}")

    # Step 4: Display Summary
    print("\n[4/4] Summary")
    print("=" * 60)
    print(f"Scan ID: {scan_results['scan_id']}")
    print(f"Risk Score: {analysis['risk_score']}/100")
    print("\nVulnerabilities by Severity:")

    by_severity = analysis['categorized_vulnerabilities']['by_severity']
    for severity, count in by_severity.items():
        print(f"  {severity.capitalize()}: {count}")

    print("\nTop Recommendations:")
    for i, rec in enumerate(analysis['recommendations'][:3], 1):
        print(f"  {i}. [{rec['severity'].upper()}] {rec['vulnerability']}")

    print("\n" + "=" * 60)
    print("Scan complete! Check the reports directory for detailed findings.")
    print("=" * 60)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)
