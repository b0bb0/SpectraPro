"""
Database Models
SQLite database models for storing scan results
"""

import sqlite3
import json
from datetime import datetime
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class Database:
    """Database handler for Spectra"""

    def __init__(self, db_path: str = "data/spectra.db"):
        """Initialize database connection"""
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Create database tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()

            # Scans table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scans (
                    scan_id TEXT PRIMARY KEY,
                    target TEXT NOT NULL,
                    status TEXT NOT NULL,
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP,
                    vulnerabilities_count INTEGER DEFAULT 0,
                    risk_score REAL DEFAULT 0,
                    scan_data TEXT
                )
            """)

            # Vulnerabilities table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vulnerabilities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scan_id TEXT NOT NULL,
                    template_id TEXT,
                    name TEXT,
                    severity TEXT,
                    matched_at TEXT,
                    vulnerability_data TEXT,
                    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
                )
            """)

            # Reports table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                    report_id TEXT PRIMARY KEY,
                    scan_id TEXT NOT NULL,
                    format TEXT,
                    file_path TEXT,
                    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
                )
            """)

            # Analysis table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scan_id TEXT NOT NULL,
                    ai_analysis TEXT,
                    recommendations TEXT,
                    risk_score REAL,
                    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
                )
            """)

            conn.commit()
            logger.info("Database initialized successfully")
        finally:
            conn.close()

    def save_scan(self, scan_data: Dict) -> bool:
        """Save scan results to database"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO scans (scan_id, target, status, vulnerabilities_count, scan_data, end_time)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                scan_data['scan_id'],
                scan_data['target'],
                scan_data['status'],
                scan_data.get('vulnerabilities_found', 0),
                json.dumps(scan_data),
                datetime.now()
            ))

            # Save individual vulnerabilities
            for vuln in scan_data.get('results', []):
                cursor.execute("""
                    INSERT INTO vulnerabilities (scan_id, template_id, name, severity, matched_at, vulnerability_data)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    scan_data['scan_id'],
                    vuln.get('template-id', ''),
                    vuln.get('info', {}).get('name', ''),
                    vuln.get('info', {}).get('severity', ''),
                    vuln.get('matched-at', ''),
                    json.dumps(vuln)
                ))

            conn.commit()
            logger.info(f"Scan {scan_data['scan_id']} saved to database")
            return True

        except Exception as e:
            logger.error(f"Error saving scan to database: {str(e)}")
            return False
        finally:
            conn.close()

    def save_analysis(self, scan_id: str, analysis_data: Dict) -> bool:
        """Save analysis results to database"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO analysis (scan_id, ai_analysis, recommendations, risk_score)
                VALUES (?, ?, ?, ?)
            """, (
                scan_id,
                analysis_data.get('ai_analysis', ''),
                json.dumps(analysis_data.get('recommendations', [])),
                analysis_data.get('risk_score', 0)
            ))

            # Update risk score in scans table
            cursor.execute("""
                UPDATE scans SET risk_score = ? WHERE scan_id = ?
            """, (analysis_data.get('risk_score', 0), scan_id))

            conn.commit()
            logger.info(f"Analysis for scan {scan_id} saved to database")
            return True

        except Exception as e:
            logger.error(f"Error saving analysis to database: {str(e)}")
            return False
        finally:
            conn.close()

    def save_report(self, report_data: Dict, scan_id: str) -> bool:
        """Save report metadata to database"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO reports (report_id, scan_id, format, file_path)
                VALUES (?, ?, ?, ?)
            """, (
                report_data['report_id'],
                scan_id,
                report_data['format'],
                report_data['file_path']
            ))

            conn.commit()
            logger.info(f"Report {report_data['report_id']} saved to database")
            return True

        except Exception as e:
            logger.error(f"Error saving report to database: {str(e)}")
            return False
        finally:
            conn.close()

    def get_scan(self, scan_id: str) -> Optional[Dict]:
        """Retrieve scan by ID"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM scans WHERE scan_id = ?", (scan_id,))
            row = cursor.fetchone()

            if row:
                return dict(row)
            return None

        except Exception as e:
            logger.error(f"Error retrieving scan: {str(e)}")
            return None
        finally:
            conn.close()

    def get_all_scans(self, limit: int = 50) -> List[Dict]:
        """Retrieve all scans"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("""
                SELECT scan_id, target, status, start_time, vulnerabilities_count, risk_score
                FROM scans
                ORDER BY start_time DESC
                LIMIT ?
            """, (limit,))

            rows = cursor.fetchall()
            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Error retrieving scans: {str(e)}")
            return []
        finally:
            conn.close()

    def get_analysis(self, scan_id: str) -> Optional[Dict]:
        """Retrieve analysis for a scan"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM analysis WHERE scan_id = ?", (scan_id,))
            row = cursor.fetchone()

            if row:
                data = dict(row)
                data['recommendations'] = json.loads(data.get('recommendations', '[]'))
                return data
            return None

        except Exception as e:
            logger.error(f"Error retrieving analysis: {str(e)}")
            return None
        finally:
            conn.close()

    def get_vulnerabilities_by_scan(self, scan_id: str) -> List[Dict]:
        """Get all vulnerabilities for a scan"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM vulnerabilities WHERE scan_id = ?
                ORDER BY
                    CASE severity
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END
            """, (scan_id,))

            rows = cursor.fetchall()
            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Error retrieving vulnerabilities: {str(e)}")
            return []
        finally:
            conn.close()
