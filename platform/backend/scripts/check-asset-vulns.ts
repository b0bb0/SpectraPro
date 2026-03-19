import { prisma } from '../src/utils/prisma';

async function checkAsset() {
  const scanId = '9d0fcbf9-5c25-4872-ab94-eefb49055ac2';

  const scan = await prisma.scans.findUnique({
    where: { id: scanId },
    select: { assetId: true }
  });

  if (!scan?.assetId) {
    console.log('No asset found for scan');
    return;
  }

  console.log('Asset ID:', scan.assetId);

  // Get all vulnerabilities for this asset
  const vulns = await prisma.vulnerabilities.findMany({
    where: { assetId: scan.assetId },
    select: {
      id: true,
      scanId: true,
      title: true,
      severity: true,
      status: true,
    }
  });

  console.log('\nTotal vulnerabilities for asset:', vulns.length);

  const forThisScan = vulns.filter(v => v.scanId === scanId);
  console.log('For this specific scan:', forThisScan.length);

  const groupedByScan = vulns.reduce((acc, v) => {
    const scan = v.scanId || 'null';
    acc[scan] = (acc[scan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nVulnerabilities by scan:');
  Object.entries(groupedByScan).forEach(([scanId, count]) => {
    console.log(`  ${scanId}: ${count}`);
  });
}

checkAsset()
  .finally(() => prisma.$disconnect());
