"""
Spectra API Server
REST API for vulnerability scanning and analysis
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import sys
import os
from functools import wraps

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.scanner import NucleiScanner
from core.analyzer import AIAnalyzer
from core.reporter import ReportGenerator
from core.database import Database

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=['http://localhost:3001', 'http://localhost:3003', os.environ.get('FRONTEND_URL', 'http://localhost:3001')])

# Initialize services
scanner = NucleiScanner(output_dir="data/scans")
analyzer = AIAnalyzer()
reporter = ReportGenerator(output_dir="data/reports")
db = Database(db_path="data/spectra.db")

# API Key Authentication Middleware
SPECTRA_API_KEY = os.environ.get('SPECTRA_API_KEY')
if not SPECTRA_API_KEY:
    logger.warning("SPECTRA_API_KEY environment variable not set. API authentication is disabled for development mode.")

def require_api_key(f):
    """Decorator to require API key authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if SPECTRA_API_KEY:
            api_key = request.headers.get('X-API-Key')
            if not api_key or api_key != SPECTRA_API_KEY:
                logger.warning(f"Unauthorized API access attempt from {request.remote_addr}")
                return jsonify({'error': 'Unauthorized - Invalid or missing API key'}), 401
        return f(*args, **kwargs)
    return decorated_function


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Spectra AI Penetration Testing',
        'version': '1.0.0'
    })


@app.route('/api/scan', methods=['POST'])
@require_api_key
def initiate_scan():
    """
    Initiate a new vulnerability scan

    Request body:
    {
        "target": "https://example.com",
        "scan_type": "full",
        "severity": ["critical", "high"],
        "tags": ["cve"],
        "auto_analyze": true
    }
    """
    try:
        data = request.get_json()

        if not data or 'target' not in data:
            return jsonify({'error': 'Target URL is required'}), 400

        target = data['target']
        scan_type = data.get('scan_type', 'full')
        severity = data.get('severity')
        tags = data.get('tags')
        auto_analyze = data.get('auto_analyze', True)

        logger.info(f"Initiating scan for target: {target}")

        # Perform scan
        scan_results = scanner.scan_target(
            target=target,
            scan_type=scan_type,
            severity=severity,
            tags=tags
        )

        # Save scan to database
        db.save_scan(scan_results)

        response = {
            'scan_id': scan_results['scan_id'],
            'target': target,
            'status': scan_results['status'],
            'vulnerabilities_found': scan_results.get('vulnerabilities_found', 0)
        }

        # Auto-analyze if requested
        if auto_analyze and scan_results['status'] == 'completed':
            logger.info("Auto-analyzing scan results")
            analysis = analyzer.analyze_vulnerabilities(
                scan_results['results'],
                target
            )
            db.save_analysis(scan_results['scan_id'], analysis)
            response['analysis'] = analysis

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Scan error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze/<scan_id>', methods=['POST'])
@require_api_key
def analyze_scan(scan_id):
    """
    Analyze scan results with AI

    Path parameter:
    - scan_id: ID of the scan to analyze
    """
    try:
        # Retrieve scan from database
        scan_data = db.get_scan(scan_id)

        if not scan_data:
            return jsonify({'error': 'Scan not found'}), 404

        # Parse scan data
        import json
        scan_results = json.loads(scan_data['scan_data'])

        # Perform analysis
        analysis = analyzer.analyze_vulnerabilities(
            scan_results.get('results', []),
            scan_data['target']
        )

        # Save analysis
        db.save_analysis(scan_id, analysis)

        return jsonify(analysis), 200

    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/report/<scan_id>', methods=['POST'])
@require_api_key
def generate_report(scan_id):
    """
    Generate security report

    Request body:
    {
        "format": "html"  // json, html, markdown
    }
    """
    try:
        data = request.get_json() or {}
        report_format = data.get('format', 'html')

        # Retrieve scan and analysis
        scan_data = db.get_scan(scan_id)
        analysis_data = db.get_analysis(scan_id)

        if not scan_data:
            return jsonify({'error': 'Scan not found'}), 404

        if not analysis_data:
            return jsonify({'error': 'Analysis not found. Please analyze scan first.'}), 404

        # Parse scan data
        import json
        scan_results = json.loads(scan_data['scan_data'])

        # Generate report
        report = reporter.generate_report(
            scan_results,
            analysis_data,
            format=report_format
        )

        # Save report metadata
        db.save_report(report, scan_id)

        return jsonify(report), 200

    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/scans', methods=['GET'])
@require_api_key
def list_scans():
    """List all scans"""
    try:
        limit = request.args.get('limit', 50, type=int)
        scans = db.get_all_scans(limit=limit)
        return jsonify({'scans': scans, 'count': len(scans)}), 200

    except Exception as e:
        logger.error(f"Error listing scans: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/scans/<scan_id>', methods=['GET'])
@require_api_key
def get_scan_details(scan_id):
    """Get detailed scan information"""
    try:
        scan = db.get_scan(scan_id)
        if not scan:
            return jsonify({'error': 'Scan not found'}), 404

        vulnerabilities = db.get_vulnerabilities_by_scan(scan_id)
        analysis = db.get_analysis(scan_id)

        return jsonify({
            'scan': scan,
            'vulnerabilities': vulnerabilities,
            'analysis': analysis
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving scan: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/vulnerabilities/<scan_id>', methods=['GET'])
@require_api_key
def get_vulnerabilities(scan_id):
    """Get vulnerabilities for a scan"""
    try:
        vulnerabilities = db.get_vulnerabilities_by_scan(scan_id)
        return jsonify({
            'scan_id': scan_id,
            'count': len(vulnerabilities),
            'vulnerabilities': vulnerabilities
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving vulnerabilities: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/update', methods=['POST'])
@require_api_key
def update_templates():
    """Update nuclei templates"""
    try:
        success = scanner.update_templates()
        if success:
            return jsonify({'status': 'success', 'message': 'Templates updated'}), 200
        else:
            return jsonify({'status': 'failed', 'message': 'Failed to update templates'}), 500

    except Exception as e:
        logger.error(f"Template update error: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Spectra API server")
    app.run(host='0.0.0.0', port=5000, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
