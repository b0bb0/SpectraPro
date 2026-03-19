/**
 * Fix stuck scan - Update status to FAILED
 * Usage: tsx src/scripts/fix-stuck-scan.ts <scanId>
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

async function main() {
  const scanId = process.argv[2] || 'ded6b85b-4a72-4a22-8a28-1b80bc2ad9ff';

  try {
    console.log(`\nFixing stuck scan: ${scanId}...`);

    const scan = await prisma.scans.findUnique({
      where: { id: scanId },
      select: { id: true, name: true, status: true, progress: true },
    });

    if (!scan) {
      console.error('Scan not found');
      process.exit(1);
    }

    console.log(`Current status: ${scan.status} at ${scan.progress}%`);

    const updated = await prisma.scans.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: 'Scan manually terminated - was stuck during execution',
        orchestrationPhase: 'FAILED',
        currentPhase: 'Scan terminated',
      },
    });

    console.log(`✓ Scan updated to ${updated.status}`);
    console.log(`  Completed at: ${updated.completedAt}`);

    process.exit(0);
  } catch (error: any) {
    console.error('✗ Failed to fix scan:', error.message);
    logger.error('[FIX SCAN] Error:', error);
    process.exit(1);
  }
}

main();
