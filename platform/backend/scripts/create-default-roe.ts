/**
 * Create Default Rules of Engagement for Scans
 * This script creates a default ROE for all scans that don't have one
 */

import { prisma } from '../src/utils/prisma';
import { randomUUID } from 'crypto';

async function createDefaultROE() {
  console.log('🔍 Finding scans without Rules of Engagement...');

  // Get a default admin user for ROE creation
  const defaultAdmin = await prisma.users.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!defaultAdmin) {
    console.error('❌ No admin user found. Cannot create ROE.');
    return;
  }

  // Find all scans without ROE
  const scansWithoutROE = await prisma.scans.findMany({
    where: { roeId: null },
    include: {
      assets: true,
      users: true,
    },
  });

  console.log(`Found ${scansWithoutROE.length} scans without ROE\n`);

  if (scansWithoutROE.length === 0) {
    console.log('✓ All scans have ROE configured');
    return;
  }

  let created = 0;

  for (const scan of scansWithoutROE) {
    console.log(`Processing scan ${scan.id}...`);
    console.log(`  Target: ${scan.target || scan.assets?.url || 'Unknown'}`);
    console.log(`  User: ${scan.users?.email || 'Unknown'}`);

    // Extract domain/URL from target
    const target = scan.target || scan.assets?.url || '';
    let scopeDomains: string[] = [];
    let scopeUrls: string[] = [];

    try {
      const url = new URL(target);
      scopeDomains.push(url.hostname);
      scopeUrls.push(target);
    } catch {
      // If not a valid URL, treat as domain
      if (target) {
        scopeDomains.push(target);
      }
    }

    // Use scan's user or default admin
    const creatorId = scan.userId || defaultAdmin.id;

    // Create ROE
    const roeId = randomUUID();
    const roe = await prisma.rules_of_engagement.create({
      data: {
        id: roeId,
        name: `Default ROE for ${target || scan.assets?.name || 'Scan'}`,
        description: 'Auto-generated default Rules of Engagement for exploitation testing',
        status: 'ACTIVE',
        scopeDomains,
        scopeUrls,
        scopeIPs: [],
        excludedTargets: [],
        allowedMethods: ['BASELINE', 'VALIDATION', 'FULL_ASSESSMENT'],
        validationEnabled: true,
        validationRequiresApproval: false, // Allow immediate exploitation
        validationMaxAttempts: 10,
        validationTimeout: 300,
        maxRequestsPerSecond: 150,
        maxConcurrentScans: 3,
        allowedStartTime: '00:00',
        allowedEndTime: '23:59',
        allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        approvedById: creatorId,
        approvedAt: new Date(),
        createdById: creatorId,
        tenantId: scan.tenantId,
        updatedAt: new Date(),
      },
    });

    // Link ROE to scan
    await prisma.scans.update({
      where: { id: scan.id },
      data: { roeId: roe.id },
    });

    console.log(`  ✓ Created ROE ${roeId}`);
    console.log(`  ✓ Linked to scan\n`);
    created++;
  }

  console.log(`✓ Created default ROE for ${created} scans`);
}

createDefaultROE()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
