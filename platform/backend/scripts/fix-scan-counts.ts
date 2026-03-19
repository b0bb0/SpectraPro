/**
 * Fix Scan Counts to Match Actual Vulnerabilities
 * Updates scan summary counts to reflect actual deduplicated vulnerabilities in database
 */

import { prisma } from '../src/utils/prisma';

async function fixScanCounts(scanId: string) {
  console.log(`\n🔧 Fixing counts for scan: ${scanId}`);

  // Get actual vulnerabilities from database
  const actualVulnerabilities = await prisma.vulnerabilities.findMany({
    where: { scanId },
    select: { severity: true },
  });

  console.log(`  Found ${actualVulnerabilities.length} actual vulnerabilities in database`);

  // Count by severity
  const severityCounts = {
    critical: actualVulnerabilities.filter(v => v.severity === 'CRITICAL').length,
    high: actualVulnerabilities.filter(v => v.severity === 'HIGH').length,
    medium: actualVulnerabilities.filter(v => v.severity === 'MEDIUM').length,
    low: actualVulnerabilities.filter(v => v.severity === 'LOW').length,
    info: actualVulnerabilities.filter(v => v.severity === 'INFO').length,
  };

  const actualTotal = actualVulnerabilities.length;

  console.log(`  Severity breakdown: ${severityCounts.critical}C ${severityCounts.high}H ${severityCounts.medium}M ${severityCounts.low}L ${severityCounts.info}I`);

  // Update scan with correct counts
  await prisma.scans.update({
    where: { id: scanId },
    data: {
      vulnFound: actualTotal,
      criticalCount: severityCounts.critical,
      highCount: severityCounts.high,
      mediumCount: severityCounts.medium,
      lowCount: severityCounts.low,
      infoCount: severityCounts.info,
    },
  });

  console.log(`\n✅ Scan counts updated successfully`);
}

// Get scan ID from command line or use default
const scanId = process.argv[2] || '9d0fcbf9-5c25-4872-ab94-eefb49055ac2';

fixScanCounts(scanId)
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
