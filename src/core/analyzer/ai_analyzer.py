"""
AI Analyzer Module
Uses Llama AI to analyze vulnerability scan results
"""

import json
import logging
from typing import Dict, List, Optional
from datetime import datetime
import requests

logger = logging.getLogger(__name__)


class AIAnalyzer:
    """AI-powered vulnerability analysis using Llama"""

    def __init__(
        self,
        llama_api_url: str = "http://localhost:11434/api/generate",
        model: str = "hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16"
    ):
        """
        Initialize AI Analyzer

        Args:
            llama_api_url: Ollama API endpoint
            model: Llama model to use
        """
        self.api_url = llama_api_url
        self.model = model
        logger.info(f"AI Analyzer initialized with model: {model}")

    def analyze_vulnerabilities(
        self,
        scan_results: List[Dict],
        target: str
    ) -> Dict:
        """
        Analyze scan results using AI

        Args:
            scan_results: List of vulnerabilities from nuclei scan
            target: Target that was scanned

        Returns:
            Dict containing AI analysis and recommendations
        """
        logger.info(f"Starting AI analysis for {len(scan_results)} vulnerabilities")

        if not scan_results:
            return {
                'status': 'completed',
                'message': 'No vulnerabilities found to analyze',
                'risk_score': 0,
                'recommendations': []
            }

        # Categorize vulnerabilities
        categorized = self._categorize_vulnerabilities(scan_results)

        # Generate AI analysis
        analysis = self._generate_analysis(categorized, target)

        # Calculate risk score
        risk_score = self._calculate_risk_score(scan_results)

        # Generate recommendations
        recommendations = self._generate_recommendations(scan_results, analysis)

        return {
            'status': 'completed',
            'timestamp': datetime.now().isoformat(),
            'target': target,
            'total_vulnerabilities': len(scan_results),
            'categorized_vulnerabilities': categorized,
            'risk_score': risk_score,
            'ai_analysis': analysis,
            'recommendations': recommendations,
            'executive_summary': self._generate_executive_summary(
                risk_score,
                categorized,
                analysis
            )
        }

    def _categorize_vulnerabilities(self, results: List[Dict]) -> Dict:
        """Categorize vulnerabilities by severity and type"""
        categories = {
            'critical': [],
            'high': [],
            'medium': [],
            'low': [],
            'info': [],
            'by_type': {}
        }

        for vuln in results:
            severity = vuln.get('info', {}).get('severity', 'info').lower()
            vuln_type = vuln.get('type', 'unknown')

            # Add to severity category
            if severity in categories:
                categories[severity].append(vuln)

            # Add to type category
            if vuln_type not in categories['by_type']:
                categories['by_type'][vuln_type] = []
            categories['by_type'][vuln_type].append(vuln)

        return {
            'by_severity': {
                'critical': len(categories['critical']),
                'high': len(categories['high']),
                'medium': len(categories['medium']),
                'low': len(categories['low']),
                'info': len(categories['info'])
            },
            'by_type': {k: len(v) for k, v in categories['by_type'].items()},
            'details': categories
        }

    def _calculate_risk_score(self, results: List[Dict]) -> float:
        """Calculate overall risk score (0-100)"""
        severity_weights = {
            'critical': 10,
            'high': 7,
            'medium': 4,
            'low': 2,
            'info': 1
        }

        total_score = 0
        for vuln in results:
            severity = vuln.get('info', {}).get('severity', 'info').lower()
            total_score += severity_weights.get(severity, 1)

        # Normalize to 0-100 scale
        max_possible = len(results) * 10
        if max_possible > 0:
            risk_score = min((total_score / max_possible) * 100, 100)
        else:
            risk_score = 0

        return round(risk_score, 2)

    def _generate_analysis(self, categorized: Dict, target: str) -> str:
        """Generate AI-powered analysis using Llama"""
        prompt = self._build_analysis_prompt(categorized, target)

        try:
            response = requests.post(
                self.api_url,
                json={
                    'model': self.model,
                    'prompt': prompt,
                    'stream': False
                },
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                return result.get('response', 'Analysis completed but no response received')
            else:
                logger.error(f"AI API error: {response.status_code}")
                return self._generate_fallback_analysis(categorized)

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to AI service: {str(e)}")
            return self._generate_fallback_analysis(categorized)

    def _build_analysis_prompt(self, categorized: Dict, target: str) -> str:
        """Build prompt for AI analysis"""
        by_severity = categorized['by_severity']

        prompt = f"""You are a cybersecurity expert analyzing vulnerability scan results.

Target: {target}

Vulnerability Summary:
- Critical: {by_severity['critical']}
- High: {by_severity['high']}
- Medium: {by_severity['medium']}
- Low: {by_severity['low']}
- Info: {by_severity['info']}

Vulnerability Types Found: {', '.join(categorized['by_type'].keys())}

Please provide:
1. Overall security posture assessment
2. Most critical vulnerabilities and their potential impact
3. Attack vectors that could be exploited
4. Priority order for remediation
5. Potential business impact if vulnerabilities are exploited

Keep the analysis concise, technical, and actionable."""

        return prompt

    def _generate_fallback_analysis(self, categorized: Dict) -> str:
        """Generate basic analysis when AI is unavailable"""
        by_severity = categorized['by_severity']

        analysis = "Automated Analysis (AI service unavailable):\n\n"

        if by_severity['critical'] > 0:
            analysis += f"CRITICAL ALERT: {by_severity['critical']} critical vulnerabilities found. Immediate action required.\n"

        if by_severity['high'] > 0:
            analysis += f"HIGH PRIORITY: {by_severity['high']} high-severity vulnerabilities require urgent attention.\n"

        if by_severity['medium'] > 0:
            analysis += f"MEDIUM RISK: {by_severity['medium']} medium-severity issues should be addressed soon.\n"

        analysis += "\nRecommendation: Review all findings and prioritize remediation based on severity."

        return analysis

    def _generate_recommendations(
        self,
        results: List[Dict],
        analysis: str
    ) -> List[Dict]:
        """Generate actionable recommendations"""
        recommendations = []

        # Group by template
        templates = {}
        for vuln in results:
            template_id = vuln.get('template-id', 'unknown')
            if template_id not in templates:
                templates[template_id] = []
            templates[template_id].append(vuln)

        # Generate recommendations for each vulnerability type
        for template_id, vulns in templates.items():
            severity = vulns[0].get('info', {}).get('severity', 'info')
            name = vulns[0].get('info', {}).get('name', template_id)

            recommendations.append({
                'vulnerability': name,
                'severity': severity,
                'count': len(vulns),
                'recommendation': self._get_remediation_guidance(template_id, vulns[0]),
                'affected_endpoints': [v.get('matched-at', 'N/A') for v in vulns[:5]]
            })

        # Sort by severity
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
        recommendations.sort(key=lambda x: severity_order.get(x['severity'].lower(), 5))

        return recommendations

    def _get_remediation_guidance(self, template_id: str, vuln: Dict) -> str:
        """Get remediation guidance for vulnerability"""
        # In production, this would have a comprehensive database
        # For now, extract from vulnerability info or provide generic guidance
        info = vuln.get('info', {})
        remediation = info.get('remediation', '')

        if remediation:
            return remediation

        # Generic guidance based on severity
        severity = info.get('severity', 'info').lower()
        if severity == 'critical':
            return "Immediate patching required. Consider taking system offline until fixed."
        elif severity == 'high':
            return "Apply security updates within 24-48 hours. Monitor for exploitation attempts."
        elif severity == 'medium':
            return "Schedule patching within the next maintenance window."
        else:
            return "Review and apply fixes during regular maintenance cycles."

    def _generate_executive_summary(
        self,
        risk_score: float,
        categorized: Dict,
        analysis: str
    ) -> str:
        """Generate executive summary"""
        by_severity = categorized['by_severity']
        total = sum(by_severity.values())

        summary = f"""
SECURITY ASSESSMENT SUMMARY

Risk Score: {risk_score}/100 - {"CRITICAL" if risk_score >= 80 else "HIGH" if risk_score >= 60 else "MEDIUM" if risk_score >= 40 else "LOW"}

Total Vulnerabilities: {total}
- Critical: {by_severity['critical']}
- High: {by_severity['high']}
- Medium: {by_severity['medium']}
- Low: {by_severity['low']}
- Informational: {by_severity['info']}

{analysis[:500]}...

Immediate Actions Required: {"Yes - Address critical/high vulnerabilities immediately" if by_severity['critical'] + by_severity['high'] > 0 else "No critical issues found"}
"""
        return summary.strip()
