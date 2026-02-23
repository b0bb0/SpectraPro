import unittest
import sys
import os

# Ensure we can import the module from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from report_generator import ReportGenerator

class TestReportGenerator(unittest.TestCase):
    """Unit tests for ReportGenerator class methods."""

    def test_md_to_html_bold(self):
        """Test converting markdown bold syntax to HTML."""
        input_text = "This is **critical** severity."
        expected = "This is <strong>critical</strong> severity."
        result = ReportGenerator._md_to_html(input_text)
        self.assertEqual(result, expected)

    def test_md_to_html_list(self):
        """Test converting markdown lists to HTML unordered lists."""
        input_text = "- Item 1\n- Item 2"
        result = ReportGenerator._md_to_html(input_text)
        self.assertIn("<ul>", result)
        self.assertIn("<li>Item 1</li>", result)
        self.assertIn("<li>Item 2</li>", result)
        self.assertIn("</ul>", result)

    def test_md_to_html_headers(self):
        """Test converting markdown headers to HTML h3 tags."""
        input_text = "### Impact Analysis"
        expected = "<h3>Impact Analysis</h3>"
        result = ReportGenerator._md_to_html(input_text)
        self.assertEqual(result, expected)

    def test_md_to_html_xss_prevention(self):
        """Ensure HTML input is escaped to prevent XSS."""
        input_text = "<script>alert('xss')</script>"
        result = ReportGenerator._md_to_html(input_text)
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)

    def test_generate_vulnerability_html_structure(self):
        """Test that vulnerability card HTML contains key elements."""
        item = {
            'name': 'SQL Injection',
            'severity': 'critical',
            'id': 'CVE-2024-1234',
            'timestamp': '2026-02-22T12:00:00Z',
            'analysis': '**Critical** issue found.'
        }
        
        html = ReportGenerator._generate_vulnerability_html(item)
        
        self.assertIn('class="vulnerability-card severity-critical"', html)
        self.assertIn('SQL Injection', html)
        self.assertIn('CVE-2024-1234', html)
        self.assertIn('<strong>Critical</strong>', html) # Markdown should be parsed
        self.assertIn('CRITICAL', html) # Badge text

if __name__ == '__main__':
    unittest.main()