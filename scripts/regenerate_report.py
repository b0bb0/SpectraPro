#!/usr/bin/env python3
"""
Regenerate Report Script
Regenerate an enhanced report from an existing scan
"""

import sys
import os

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import Database
from core.reporter import ReportGenerator
import json

def main():
    if len(sys.argv) < 2:
        print("Usage: python regenerate_report.py <scan_id> [format]")
        print("Example: python regenerate_report.py scan_20260122_152204 html")
        sys.exit(1)

    scan_id = sys.argv[1]
    report_format = sys.argv[2] if len(sys.argv) > 2 else 'html'

    # Initialize components
    project_root = os.path.join(os.path.dirname(__file__), '..')
    db = Database(db_path=os.path.join(project_root, 'data/spectra.db'))
    reporter = ReportGenerator(output_dir=os.path.join(project_root, 'data/reports'))

    print(f"Retrieving scan: {scan_id}")

    # Get scan data
    scan = db.get_scan(scan_id)
    if not scan:
        print(f"Error: Scan {scan_id} not found")
        sys.exit(1)

    # Parse scan data
    scan_data = json.loads(scan['scan_data'])

    # Get analysis
    analysis = db.get_analysis(scan_id)
    if not analysis:
        print(f"Error: No analysis found for scan {scan_id}")
        sys.exit(1)

    print(f"Generating {report_format.upper()} report...")

    # Generate report
    report = reporter.generate_report(
        scan_data,
        analysis,
        format=report_format
    )

    print(f"✓ Report generated: {report['file_path']}")
    print(f"\nOpen with: open {report['file_path']}")

if __name__ == '__main__':
    main()
