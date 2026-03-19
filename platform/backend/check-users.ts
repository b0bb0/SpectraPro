import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    console.log(`Total tenants: ${tenants.length}\n`);

    for (const tenant of tenants) {
      console.log(`=== Tenant: ${tenant.name} (${tenant.slug}) ===`);
      console.log(`ID: ${tenant.id}`);

      // Get users for this tenant
      const users = await prisma.user.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      });

      console.log(`Users: ${users.length}`);
      users.forEach((user, i) => {
        console.log(`  ${i + 1}. ${user.firstName} ${user.lastName} (${user.email}) - ${user.role} - ${user.isActive ? 'Active' : 'Inactive'}`);
      });

      // Get recent scan for this tenant
      const recentScan = await prisma.scan.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          vulnFound: true,
          createdAt: true,
        },
      });

      if (recentScan) {
        console.log(`  Recent scan: ${recentScan.name} - ${recentScan.vulnFound} vulns`);
      }

      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
