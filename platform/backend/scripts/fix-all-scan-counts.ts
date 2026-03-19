/**
 * Fix All Scan Counts to Match Actual Vulnerabilities
 * Updates all scan summary counts to reflect actual deduplicated vulnerabilities in database
 */

import { prisma } from '../src/utils/prisma';

async function fixAllScanCounts() {
  console.log('\n🔧 Fixing vulnerability counts for all scans...\n');

  // Get all completed scans
  const scans = await prisma.scans.findMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] }
    },
    select: { id: true, name: true },
  });

  console.log(`Found ${scans.length} scans to process\n`);

  let updated = 0;
  let skipped = 0;

  for (const scan of scans) {
    try {
      // Get actual vulnerabilities from database for this scan
      const actualVulnerabilities = await prisma.vulnerabilities.findMany({
        where: { scanId: scan.id },
        select: { severity: true },
      });

      // Count by severity
      const severityCounts = {
        critical: actualVulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high: actualVulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium: actualVulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        low: actualVulnerabilities.filter(v => v.severity === 'LOW').length,
        info: actualVulnerabilities.filter(v => v.severity === 'INFO').length,
      };

      const actualTotal = actualVulnerabilities.length;

      // Update scan with correct counts
      await prisma.scans.update({
        where: { id: scan.id },
        data: {
          vulnFound: actualTotal,
          criticalCount: severityCounts.critical,
          highCount: severityCounts.high,
          mediumCount: severityCounts.medium,
          lowCount: severityCounts.low,
          infoCount: severityCounts.info,
        },
      });

      console.log(`✓ ${scan.name || scan.id}`);
      console.log(`  Total: ${actualTotal} (${severityCounts.critical}C ${severityCounts.high}H ${severityCounts.medium}M ${severityCounts.low}L ${severityCounts.info}I)`);
      updated++;
    } catch (error: any) {
      console.error(`✗ Failed to fix scan ${scan.id}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`\n✅ Complete:`);
  console.log(`  Updated: ${updated} scans`);
  console.log(`  Skipped: ${skipped} scans`);
}

fixAllScanCounts()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
