import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Check if admin user exists
  const existingAdmin = await prisma.users.findUnique({
    where: { email: 'admin@demo.com' },
  });

  if (existingAdmin) {
    console.log('✓ Admin user already exists');
    return;
  }

  // Check if tenant exists
  let tenant = await prisma.tenants.findFirst({
    where: { slug: 'demo-org' },
  });

  if (!tenant) {
    // Create demo tenant
    tenant = await prisma.tenants.create({
      data: {
        id: randomUUID(),
        name: 'Demo Organization',
        slug: 'demo-org',
        plan: 'enterprise',
        isActive: true,
        updatedAt: new Date(),
      },
    });
    console.log('✓ Created tenant:', tenant.name);
  } else {
    console.log('✓ Using existing tenant:', tenant.name);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  
  const admin = await prisma.users.create({
    data: {
      id: randomUUID(),
      email: 'admin@demo.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: tenant.id,
      updatedAt: new Date(),
    },
  });

  console.log('✓ Created admin user:', admin.email);
  console.log('  Password: admin123');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
