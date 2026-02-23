"""
Screenshot Helper Module
Captures screenshots of URLs for vulnerability documentation
"""

import logging
import os
import base64
from typing import Optional

logger = logging.getLogger(__name__)


class ScreenshotHelper:
    """Helper class to capture screenshots of URLs"""

    def __init__(self, screenshots_dir: str = "data/screenshots"):
        """
        Initialize Screenshot Helper

        Args:
            screenshots_dir: Directory to store screenshots
        """
        self.screenshots_dir = screenshots_dir
        os.makedirs(screenshots_dir, exist_ok=True)
        self.playwright_available = False
        self.browser = None
        self.context = None

    def _init_playwright(self):
        """Initialize Playwright browser"""
        if self.playwright_available:
            return True

        try:
            from playwright.sync_api import sync_playwright
            self.playwright = sync_playwright().start()
            self.browser = self.playwright.chromium.launch(headless=True)
            self.context = self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                ignore_https_errors=True
            )
            self.playwright_available = True
            logger.info("Playwright initialized successfully")
            return True
        except ImportError:
            logger.warning("Playwright not available. Install with: pip install playwright && playwright install chromium")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize Playwright: {str(e)}")
            return False

    def capture_screenshot(
        self,
        url: str,
        filename: str,
        timeout: int = 10000
    ) -> Optional[str]:
        """
        Capture screenshot of a URL

        Args:
            url: URL to capture
            filename: Filename to save screenshot as (without extension)
            timeout: Page load timeout in milliseconds

        Returns:
            Path to saved screenshot or None if failed
        """
        if not self._init_playwright():
            logger.warning(f"Cannot capture screenshot for {url} - Playwright not available")
            return None

        try:
            page = self.context.new_page()
            page.set_default_timeout(timeout)

            logger.info(f"Capturing screenshot of {url}")

            # Navigate to URL
            page.goto(url, wait_until='networkidle', timeout=timeout)

            # Wait a bit for any dynamic content
            page.wait_for_timeout(2000)

            # Take full page screenshot
            screenshot_path = os.path.join(self.screenshots_dir, f"{filename}.png")
            page.screenshot(path=screenshot_path, full_page=True)

            page.close()
            logger.info(f"Screenshot saved to {screenshot_path}")
            return screenshot_path

        except Exception as e:
            logger.error(f"Failed to capture screenshot for {url}: {str(e)}")
            return None

    def capture_screenshot_base64(
        self,
        url: str,
        timeout: int = 10000
    ) -> Optional[str]:
        """
        Capture screenshot and return as base64 string

        Args:
            url: URL to capture
            timeout: Page load timeout in milliseconds

        Returns:
            Base64 encoded screenshot or None if failed
        """
        if not self._init_playwright():
            return None

        try:
            page = self.context.new_page()
            page.set_default_timeout(timeout)

            logger.info(f"Capturing screenshot of {url}")
            page.goto(url, wait_until='networkidle', timeout=timeout)
            page.wait_for_timeout(2000)

            # Capture screenshot as bytes
            screenshot_bytes = page.screenshot(full_page=True)
            page.close()

            # Convert to base64
            screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
            return screenshot_base64

        except Exception as e:
            logger.error(f"Failed to capture screenshot for {url}: {str(e)}")
            return None

    def should_capture_screenshot(self, template_id: str, severity: str) -> bool:
        """
        Determine if a screenshot should be captured for this finding

        Args:
            template_id: Nuclei template ID
            severity: Vulnerability severity

        Returns:
            True if screenshot should be captured
        """
        # Capture screenshots for these types of findings
        screenshot_keywords = [
            'swagger',
            'api',
            'exposed',
            'panel',
            'dashboard',
            'login',
            'admin',
            'console',
            'debug',
            'phpinfo',
            'directory-listing',
            'config',
            'backup'
        ]

        template_lower = template_id.lower()
        for keyword in screenshot_keywords:
            if keyword in template_lower:
                return True

        # Also capture for high/critical severity
        if severity.lower() in ['high', 'critical']:
            return True

        return False

    def close(self):
        """Close browser and cleanup"""
        try:
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if hasattr(self, 'playwright') and self.playwright:
                self.playwright.stop()
            logger.info("Screenshot helper closed")
        except Exception as e:
            logger.error(f"Error closing screenshot helper: {str(e)}")

    def __del__(self):
        """Cleanup on deletion"""
        self.close()
