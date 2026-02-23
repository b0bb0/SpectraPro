/**
 * Reprocess Scan Results
 * This script reprocesses scan JSONL files and stores vulnerabilities in the database
 */

import { prisma } from '../src/utils/prisma';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface NucleiResult {
  'template-id': string;
  info?: {
    name?: string;
    description?: string;
    severity?: string;
    tags?: string[];
    classification?: {
      'cvss-score'?: number;
      'cve-id'?: string[];
    };
  };
  'matcher-name'?: string;
  matched_at?: string;
  host?: string;
  response?: string;
  'curl-command'?: string;
}

function mapSeverity(severity: string): string {
  const severityMap: Record<string, string> = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    info: 'INFO',
  };
  return severityMap[severity.toLowerCase()] || 'INFO';
}

function estimateCvssScore(severity: string): number {
  const scoreMap: Record<string, number> = {
    CRITICAL: 9.0,
    HIGH: 7.0,
    MEDIUM: 5.0,
    LOW: 3.0,
    INFO: 0.0,
  };
  return scoreMap[severity] || 0.0;
}

async function reprocessScan(scanId: string) {
  console.log(`\n🔄 Reprocessing scan: ${scanId}`);

  // Get scan details
  const scan = await prisma.scans.findUnique({
    where: { id: scanId },
    include: {
      assets: true,
    },
  });

  if (!scan) {
    console.error(`❌ Scan ${scanId} not found`);
    return;
  }

  console.log(`  Asset: ${scan.assets?.url || scan.target || 'Unknown'}`);
  console.log(`  Tenant: ${scan.tenantId}`);

  // Get user for vulnerability creation
  const user = await prisma.users.findFirst({
    where: { tenantId: scan.tenantId, role: 'ADMIN', isActive: true },
    select: { id: true },
  });

  if (!user) {
    console.error(`❌ No admin user found for tenant ${scan.tenantId}`);
    return;
  }

  const userId = user.id;
  const assetId = scan.assetId;
  const tenantId = scan.tenantId;

  if (!assetId) {
    console.error(`❌ Scan ${scanId} has no asset ID`);
    return;
  }

  // Read JSONL files
  const dataDir = '/Users/groot/spectra/data/scans';
  const phases = ['baseline', 'passive', 'discovery', 'targeted'];
  const allResults: NucleiResult[] = [];

  for (const phase of phases) {
    const filePath = path.join(dataDir, `${scanId}-${phase}.jsonl`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      console.log(`  Found ${lines.length} results in ${phase} phase`);

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          allResults.push(result);
        } catch (error) {
          console.warn(`  ⚠️  Failed to parse line in ${phase}: ${error}`);
        }
      }
    }
  }

  console.log(`\n  Total results: ${allResults.length}`);

  // Delete existing vulnerabilities for this scan to avoid duplicates
  const deleted = await prisma.vulnerabilities.deleteMany({
    where: { scanId },
  });
  console.log(`  Deleted ${deleted.count} existing vulnerabilities`);

  // Count by severity
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  let stored = 0;
  let skipped = 0;

  // Store each vulnerability
  for (const result of allResults) {
    try {
      // Map Nuclei severity to our severity levels
      const severity = mapSeverity(result.info?.severity || 'info');
      const sev = severity.toLowerCase() as keyof typeof severityCounts;
      if (sev in severityCounts) severityCounts[sev]++;

      // Calculate CVSS score
      const cvssScore = result.info?.classification?.['cvss-score'] || estimateCvssScore(severity);

      // Get CVE IDs
      const cveIds = result.info?.classification?.['cve-id'] || [];
      const cveId = cveIds.length > 0 ? cveIds[0] : result.info?.name;

      // Check if vulnerability already exists for this asset
      const existing = await prisma.vulnerabilities.findFirst({
        where: {
          assetId,
          cveId: cveId || result.info?.name,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
      });

      if (existing) {
        // Update existing vulnerability
        await prisma.vulnerabilities.update({
          where: { id: existing.id },
          data: {
            lastSeen: new Date(),
            scanId,
            targetUrl: result.matched_at || result.host,
            rawResponse: result.response || null,
            curlCommand: result['curl-command'] || null,
            updatedAt: new Date(),
          },
        });
        stored++;
      } else {
        // Create new vulnerability
        await prisma.vulnerabilities.create({
          data: {
            id: randomUUID(),
            tenantId,
            assetId,
            scanId,
            title: result.info?.name || 'Unknown vulnerability',
            description: result.info?.description || `Detected by template: ${result['template-id']}`,
            severity,
            cvssScore,
            cveId: cveId || result.info?.name,
            status: 'OPEN',
            firstSeen: new Date(),
            lastSeen: new Date(),
            tags: result.info?.tags || [],
            detectionMethod: 'Nuclei',
            templateId: result['template-id'],
            matcher: result['matcher-name'] || '',
            targetUrl: result.matched_at || result.host,
            rawResponse: result.response || null,
            curlCommand: result['curl-command'] || null,
            createdById: userId,
            updatedAt: new Date(),
          },
        });
        stored++;
      }
    } catch (error: any) {
      console.error(`  ❌ Failed to store vulnerability: ${error.message}`);
      skipped++;
    }
  }

  // Update scan with final counts
  await prisma.scans.update({
    where: { id: scanId },
    data: {
      vulnFound: allResults.length,
      criticalCount: severityCounts.critical,
      highCount: severityCounts.high,
      mediumCount: severityCounts.medium,
      lowCount: severityCounts.low,
      infoCount: severityCounts.info,
    },
  });

  console.log(`\n✅ Reprocessing complete:`);
  console.log(`  Stored: ${stored} vulnerabilities`);
  console.log(`  Skipped: ${skipped} vulnerabilities`);
  console.log(`  Severity breakdown: ${severityCounts.critical}C ${severityCounts.high}H ${severityCounts.medium}M ${severityCounts.low}L ${severityCounts.info}I`);
}

// Get scan ID from command line
const scanId = process.argv[2];

if (!scanId) {
  console.error('Usage: npx tsx scripts/reprocess-scan-results.ts <scan-id>');
  process.exit(1);
}

reprocessScan(scanId)
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
