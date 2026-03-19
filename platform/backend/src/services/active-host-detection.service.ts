/**
 * Active Host Detection Service
 * Tests subdomain connectivity and determines active status
 */

import { logger } from '../utils/logger';
import axios from 'axios';
import * as dns from 'dns/promises';

interface HostCheckResult {
  subdomain: string;
  isActive: boolean;
  protocol?: string;
  ipAddress?: string;
  statusCode?: number;
  responseTime?: number;
}

class ActiveHostDetectionService {
  private readonly timeout: number;
  private readonly maxConcurrent: number;

  constructor() {
    this.timeout = parseInt(process.env.EXPOSURE_CHECK_TIMEOUT || '5000'); // 5 seconds default
    this.maxConcurrent = parseInt(process.env.EXPOSURE_MAX_CONCURRENT_CHECKS || '10');
  }

  /**
   * Check if a subdomain is active (HTTP or HTTPS)
   */
  async checkSubdomain(subdomain: string): Promise<HostCheckResult> {
    logger.debug(`[ACTIVE CHECK] Checking ${subdomain}`);

    const result: HostCheckResult = {
      subdomain,
      isActive: false,
    };

    // Try HTTPS first (more common for modern sites)
    const httpsResult = await this.testHTTP(`https://${subdomain}`);
    if (httpsResult.active) {
      result.isActive = true;
      result.protocol = 'https';
      result.statusCode = httpsResult.statusCode;
      result.responseTime = httpsResult.responseTime;
    } else {
      // Try HTTP if HTTPS fails
      const httpResult = await this.testHTTP(`http://${subdomain}`);
      if (httpResult.active) {
        result.isActive = true;
        result.protocol = 'http';
        result.statusCode = httpResult.statusCode;
        result.responseTime = httpResult.responseTime;
      }
    }

    // Try DNS resolution to get IP address
    if (result.isActive) {
      try {
        const addresses = await dns.resolve4(subdomain);
        if (addresses && addresses.length > 0) {
          result.ipAddress = addresses[0];
        }
      } catch (error) {
        // DNS resolution failed, but subdomain is still active
        logger.debug(`[ACTIVE CHECK] DNS resolution failed for ${subdomain}`);
      }
    }

    logger.debug(`[ACTIVE CHECK] ${subdomain} - Active: ${result.isActive}, Protocol: ${result.protocol}`);

    return result;
  }

  /**
   * Test HTTP/HTTPS connectivity
   */
  private async testHTTP(url: string): Promise<{ active: boolean; statusCode?: number; responseTime?: number }> {
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // Accept all non-5xx responses
        headers: {
          'User-Agent': 'Mozilla/5.0 (Spectra Security Scanner)',
        },
      });

      const responseTime = Date.now() - startTime;

      return {
        active: true,
        statusCode: response.status,
        responseTime,
      };
    } catch (error: any) {
      if (error.response) {
        // Server responded with error status
        const responseTime = Date.now() - startTime;
        return {
          active: true,
          statusCode: error.response.status,
          responseTime,
        };
      }

      // Connection failed (timeout, DNS error, etc.)
      return {
        active: false,
      };
    }
  }

  /**
   * Check multiple subdomains in batches
   */
  async checkSubdomainsBatch(subdomains: string[]): Promise<HostCheckResult[]> {
    const results: HostCheckResult[] = [];

    logger.info(`[ACTIVE CHECK] Checking ${subdomains.length} subdomains in batches of ${this.maxConcurrent}`);

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < subdomains.length; i += this.maxConcurrent) {
      const batch = subdomains.slice(i, i + this.maxConcurrent);

      logger.debug(`[ACTIVE CHECK] Processing batch ${Math.floor(i / this.maxConcurrent) + 1}/${Math.ceil(subdomains.length / this.maxConcurrent)}`);

      const batchResults = await Promise.all(
        batch.map((subdomain) => this.checkSubdomain(subdomain))
      );

      results.push(...batchResults);

      // Small delay between batches
      if (i + this.maxConcurrent < subdomains.length) {
        await this.delay(100);
      }
    }

    const activeCount = results.filter((r) => r.isActive).length;
    logger.info(`[ACTIVE CHECK] Completed: ${activeCount}/${subdomains.length} active`);

    return results;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Resolve IP address for a subdomain
   */
  async resolveIP(subdomain: string): Promise<string | null> {
    try {
      const addresses = await dns.resolve4(subdomain);
      return addresses && addresses.length > 0 ? addresses[0] : null;
    } catch (error) {
      logger.debug(`[ACTIVE CHECK] DNS resolution failed for ${subdomain}`);
      return null;
    }
  }
}

export const activeHostDetectionService = new ActiveHostDetectionService();
