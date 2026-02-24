/**
 * Screenshot Capture Service
 * Uses Playwright for headless browser screenshots
 */

import { chromium, Browser, Page } from 'playwright';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface ScreenshotResult {
  subdomain: string;
  success: boolean;
  screenshotUrl?: string;
  error?: string;
}

class ScreenshotCaptureService {
  private readonly timeout: number;
  private readonly screenshotsDir: string;
  private readonly maxConcurrent: number;
  private browser: Browser | null = null;

  constructor() {
    this.timeout = parseInt(process.env.EXPOSURE_SCREENSHOT_TIMEOUT || '10000'); // 10 seconds
    this.screenshotsDir = process.env.EXPOSURE_SCREENSHOTS_DIR || path.join(process.cwd(), '..', 'frontend', 'public', 'screenshots', 'exposure');
    this.maxConcurrent = parseInt(process.env.EXPOSURE_MAX_CONCURRENT_SCREENSHOTS || '3');

    // Ensure screenshots directory exists
    this.ensureDirectoryExists(this.screenshotsDir);
  }

  /**
   * Initialize Playwright browser
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      logger.info('[SCREENSHOT] Initializing Playwright browser');
      // Use system Chromium in Docker (Alpine), fall back to Playwright's bundled browser locally
      const systemChromium = process.env.CHROMIUM_PATH || '/usr/lib/chromium/chromium-headless-shell';
      const useSystem = fs.existsSync(systemChromium);
      if (useSystem) {
        logger.info(`[SCREENSHOT] Using system Chromium: ${systemChromium}`);
      }

      this.browser = await chromium.launch({
        headless: true,
        ...(useSystem && { executablePath: systemChromium }),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      logger.info('[SCREENSHOT] Closing Playwright browser');
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Capture screenshot of a subdomain
   */
  async captureScreenshot(
    subdomain: string,
    protocol: string,
    scanId: string
  ): Promise<ScreenshotResult> {
    const url = `${protocol}://${subdomain}`;
    logger.info(`[SCREENSHOT] Capturing ${url}`);

    try {
      await this.initBrowser();

      if (!this.browser) {
        throw new Error('Browser initialization failed');
      }

      // Create scan-specific directory
      const scanDir = path.join(this.screenshotsDir, scanId);
      this.ensureDirectoryExists(scanDir);

      // Sanitize subdomain for filename
      const sanitizedSubdomain = subdomain.replace(/[^a-z0-9.-]/gi, '_');
      const filename = `${sanitizedSubdomain}.png`;
      const filepath = path.join(scanDir, filename);

      // Create new page
      const page: Page = await this.browser.newPage({
        viewport: {
          width: 1280,
          height: 720,
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      // Set timeout
      page.setDefaultTimeout(this.timeout);

      try {
        // Navigate to URL
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.timeout,
        });

        // Wait a bit for dynamic content to load
        await page.waitForTimeout(1000);

        // Capture screenshot
        await page.screenshot({
          path: filepath,
          fullPage: false, // Only viewport
        });

        logger.info(`[SCREENSHOT] Successfully captured ${url}`);

        // Generate URL path
        const screenshotUrl = `/screenshots/exposure/${scanId}/${filename}`;

        await page.close();

        return {
          subdomain,
          success: true,
          screenshotUrl,
        };
      } catch (error: any) {
        logger.error(`[SCREENSHOT] Failed to capture ${url}:`, error.message);
        await page.close();

        return {
          subdomain,
          success: false,
          error: error.message,
        };
      }
    } catch (error: any) {
      logger.error(`[SCREENSHOT] Browser error for ${url}:`, error.message);
      return {
        subdomain,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Capture screenshots for multiple subdomains in batches
   */
  async captureScreenshotsBatch(
    subdomains: Array<{ subdomain: string; protocol: string }>,
    scanId: string
  ): Promise<ScreenshotResult[]> {
    const results: ScreenshotResult[] = [];

    logger.info(`[SCREENSHOT] Capturing ${subdomains.length} screenshots in batches of ${this.maxConcurrent}`);

    try {
      // Initialize browser once for all screenshots
      await this.initBrowser();

      // Process in batches
      for (let i = 0; i < subdomains.length; i += this.maxConcurrent) {
        const batch = subdomains.slice(i, i + this.maxConcurrent);

        logger.debug(`[SCREENSHOT] Processing batch ${Math.floor(i / this.maxConcurrent) + 1}/${Math.ceil(subdomains.length / this.maxConcurrent)}`);

        const batchResults = await Promise.all(
          batch.map((item) =>
            this.captureScreenshot(item.subdomain, item.protocol, scanId)
          )
        );

        results.push(...batchResults);

        // Small delay between batches
        if (i + this.maxConcurrent < subdomains.length) {
          await this.delay(500);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      logger.info(`[SCREENSHOT] Completed: ${successCount}/${subdomains.length} successful`);
    } finally {
      // Clean up browser
      await this.closeBrowser();
    }

    return results;
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug(`[SCREENSHOT] Created directory: ${dirPath}`);
    }
  }

  /**
   * Delete screenshot file
   */
  async deleteScreenshot(screenshotUrl: string): Promise<boolean> {
    try {
      // Convert URL path to filesystem path
      const relativePath = screenshotUrl.replace('/screenshots/exposure/', '');
      const filepath = path.join(this.screenshotsDir, relativePath);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        logger.info(`[SCREENSHOT] Deleted ${filepath}`);
        return true;
      }

      return false;
    } catch (error: any) {
      logger.error(`[SCREENSHOT] Failed to delete ${screenshotUrl}:`, error.message);
      return false;
    }
  }

  /**
   * Clean up old screenshots (older than 30 days)
   */
  async cleanupOldScreenshots(): Promise<number> {
    let deletedCount = 0;

    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const scanDirs = fs.readdirSync(this.screenshotsDir);

      for (const scanDir of scanDirs) {
        const scanDirPath = path.join(this.screenshotsDir, scanDir);

        if (!fs.statSync(scanDirPath).isDirectory()) {
          continue;
        }

        const files = fs.readdirSync(scanDirPath);

        for (const file of files) {
          const filePath = path.join(scanDirPath, file);
          const stats = fs.statSync(filePath);

          if (stats.mtimeMs < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }

        // Remove empty scan directories
        const remainingFiles = fs.readdirSync(scanDirPath);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(scanDirPath);
        }
      }

      logger.info(`[SCREENSHOT] Cleaned up ${deletedCount} old screenshots`);
    } catch (error: any) {
      logger.error('[SCREENSHOT] Cleanup error:', error.message);
    }

    return deletedCount;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const screenshotCaptureService = new ScreenshotCaptureService();
