/**
 * Utility script to sync existing exposure scan results to asset hierarchy
 * Usage: tsx src/scripts/sync-exposure-to-assets.ts [tenantId] [userId]
 */

import { exposureOrchestrationService } from '../services/exposure-orchestration.service';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

async function main() {
  try {
    // Get tenant ID from args or use the first tenant
    let tenantId = process.argv[2];
    let userId = process.argv[3] || 'system';

    if (!tenantId) {
      const tenant = await prisma.tenants.findFirst();
      if (!tenant) {
        console.error('No tenants found in database');
        process.exit(1);
      }
      tenantId = tenant.id;
      console.log(`Using first tenant: ${tenant.name} (${tenantId})`);
    }

    if (userId === 'system') {
      const user = await prisma.users.findFirst({
        where: { tenantId },
      });
      if (user) {
        userId = user.id;
        console.log(`Using first user: ${user.email} (${userId})`);
      }
    }

    console.log(`\nSyncing exposure scans to assets...`);
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`User ID: ${userId}\n`);

    const results = await exposureOrchestrationService.syncExposureScansToAssets(
      tenantId,
      userId
    );

    console.log('\n✓ Sync completed successfully!');
    console.log(`  Scans processed: ${results.scansProcessed}`);
    console.log(`  Assets created: ${results.assetsCreated}`);
    console.log(`  Assets updated: ${results.assetsUpdated}`);

    if (results.errors.length > 0) {
      console.log(`\n⚠ Errors encountered:`);
      results.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Sync failed:', error.message);
    logger.error('[SYNC SCRIPT] Error:', error);
    process.exit(1);
  }
}

main();
