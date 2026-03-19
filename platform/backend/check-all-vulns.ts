import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAll() {
  try {
    // Get total count of vulnerabilities
    const totalVulns = await prisma.vulnerability.count();
    console.log(`Total vulnerabilities in database: ${totalVulns}`);

    // Get total count of scans
    const totalScans = await prisma.scan.count();
    console.log(`Total scans in database: ${totalScans}`);

    // Get recent scans
    const recentScans = await prisma.scan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        vulnFound: true,
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
        infoCount: true,
        createdAt: true,
      },
    });

    console.log('\n=== Recent Scans ===');
    recentScans.forEach((scan, i) => {
      console.log(`\n${i + 1}. ${scan.name}`);
      console.log(`   ID: ${scan.id}`);
      console.log(`   Status: ${scan.status}`);
      console.log(`   Vulns: ${scan.vulnFound} (C:${scan.criticalCount} H:${scan.highCount} M:${scan.mediumCount} L:${scan.lowCount} I:${scan.infoCount})`);
      console.log(`   Created: ${scan.createdAt}`);
    });

    // Check if there are vulnerabilities with NULL scanId
    const vulnsWithoutScan = await prisma.vulnerability.count({
      where: { scanId: null },
    });
    console.log(`\nVulnerabilities without scanId: ${vulnsWithoutScan}`);

    // Check if there are vulnerabilities created recently
    const recentVulns = await prisma.vulnerability.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        severity: true,
        scanId: true,
        createdAt: true,
      },
    });

    if (recentVulns.length > 0) {
      console.log('\n=== Recent Vulnerabilities ===');
      recentVulns.forEach((v, i) => {
        console.log(`${i + 1}. ${v.title} (${v.severity}) - scanId: ${v.scanId || 'NULL'} - ${v.createdAt}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAll();
