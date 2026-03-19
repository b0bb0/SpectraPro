import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkVulnerabilities() {
  try {
    // Get the most recent scan
    const recentScan = await prisma.scan.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        vulnerabilities: true,
        _count: {
          select: {
            vulnerabilities: true,
          },
        },
      },
    });

    if (!recentScan) {
      console.log('No scans found');
      return;
    }

    console.log('\n=== Recent Scan ===');
    console.log(`Scan ID: ${recentScan.id}`);
    console.log(`Name: ${recentScan.name}`);
    console.log(`Status: ${recentScan.status}`);
    console.log(`Vulns Found (count field): ${recentScan.vulnFound}`);
    console.log(`Vulns in array: ${recentScan.vulnerabilities?.length || 0}`);
    console.log(`Vulns count from _count: ${recentScan._count.vulnerabilities}`);

    // Check if there are vulnerabilities with this scanId
    const vulnsWithScanId = await prisma.vulnerability.findMany({
      where: { scanId: recentScan.id },
      select: {
        id: true,
        title: true,
        severity: true,
        scanId: true,
      },
    });

    console.log(`\nDirect query for vulns with scanId: ${vulnsWithScanId.length}`);

    if (vulnsWithScanId.length > 0) {
      console.log('\nFirst few vulnerabilities:');
      vulnsWithScanId.slice(0, 3).forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.title} (${v.severity}) - scanId: ${v.scanId}`);
      });
    }

    // Check all vulnerabilities without tenant filter
    const allVulns = await prisma.vulnerability.findMany({
      where: { scanId: recentScan.id },
    });
    console.log(`\nAll vulnerabilities with scanId (no filters): ${allVulns.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVulnerabilities();
