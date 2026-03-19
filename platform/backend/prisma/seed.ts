/**
 * Database Seed Script
 * Populates the database with sample data for development and testing
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo tenant
  const tenant = await prisma.tenants.create({
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

  // Create demo users
  const adminPassword = await bcrypt.hash('admin123', 12);
  const analystPassword = await bcrypt.hash('analyst123', 12);
  const viewerPassword = await bcrypt.hash('viewer123', 12);

  const admin = await prisma.users.create({
    data: {
      id: randomUUID(),
      email: 'admin@demo.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });

  const analyst = await prisma.users.create({
    data: {
      id: randomUUID(),
      email: 'analyst@demo.com',
      passwordHash: analystPassword,
      firstName: 'Analyst',
      lastName: 'User',
      role: 'ANALYST',
      tenantId: tenant.id,
    },
  });

  const viewer = await prisma.users.create({
    data: {
      id: randomUUID(),
      email: 'viewer@demo.com',
      passwordHash: viewerPassword,
      firstName: 'Viewer',
      lastName: 'User',
      role: 'VIEWER',
      tenantId: tenant.id,
    },
  });

  console.log('✓ Created users:', admin.email, analyst.email, viewer.email);

  // Create demo assets
  const assets = await Promise.all([
    prisma.assets.create({
      data: {
        name: 'api.example.com',
        type: 'API',
        environment: 'PRODUCTION',
        criticality: 'CRITICAL',
        hostname: 'api.example.com',
        url: 'https://api.example.com',
        description: 'Main production API server',
        tags: ['production', 'api', 'backend'],
        owner: 'Backend Team',
        tenantId: tenant.id,
        createdById: admin.id,
      },
    }),
    prisma.assets.create({
      data: {
        name: 'app.example.com',
        type: 'APPLICATION',
        environment: 'PRODUCTION',
        criticality: 'HIGH',
        hostname: 'app.example.com',
        url: 'https://app.example.com',
        description: 'Main web application',
        tags: ['production', 'frontend', 'webapp'],
        owner: 'Frontend Team',
        tenantId: tenant.id,
        createdById: admin.id,
      },
    }),
    prisma.assets.create({
      data: {
        name: 'staging.example.com',
        type: 'APPLICATION',
        environment: 'STAGING',
        criticality: 'MEDIUM',
        hostname: 'staging.example.com',
        url: 'https://staging.example.com',
        description: 'Staging environment',
        tags: ['staging', 'testing'],
        owner: 'QA Team',
        tenantId: tenant.id,
        createdById: admin.id,
      },
    }),
    prisma.assets.create({
      data: {
        name: '192.168.1.100',
        type: 'NETWORK_DEVICE',
        environment: 'PRODUCTION',
        criticality: 'HIGH',
        ipAddress: '192.168.1.100',
        description: 'Network firewall',
        tags: ['network', 'firewall', 'infrastructure'],
        owner: 'Network Team',
        tenantId: tenant.id,
        createdById: admin.id,
      },
    }),
  ]);

  console.log('✓ Created', assets.length, 'assets');

  // Create demo scan
  const scan = await prisma.scans.create({
    data: {
      name: 'Daily Security Scan',
      type: 'NUCLEI',
      status: 'COMPLETED',
      targetCount: assets.length,
      severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
      vulnFound: 12,
      criticalCount: 2,
      highCount: 4,
      mediumCount: 5,
      lowCount: 1,
      infoCount: 0,
      startedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      completedAt: new Date(),
      duration: 1800,
      scannerVersion: 'v3.6.2',
      templateVersion: '9.7.0',
      tenantId: tenant.id,
      assetId: assets[0].id,
    },
  });

  console.log('✓ Created scan:', scan.name);

  // Create demo vulnerabilities
  const vulnerabilities = await Promise.all([
    prisma.vulnerabilities.create({
      data: {
        title: 'SQL Injection in Login Form',
        description: 'The login form is vulnerable to SQL injection attacks. An attacker can bypass authentication by injecting SQL commands.',
        severity: 'CRITICAL',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cveId: 'CVE-2024-1234',
        cweId: 'CWE-89',
        category: 'Injection',
        tags: ['sql-injection', 'authentication', 'critical'],
        status: 'OPEN',
        recommendation: 'Use parameterized queries or prepared statements',
        remediationSteps: '1. Update login handler to use prepared statements\n2. Add input validation\n3. Test with security scanner',
        detectionMethod: 'Nuclei',
        templateId: 'sql-injection-login',
        tenantId: tenant.id,
        assetId: assets[0].id,
        scanId: scan.id,
        createdById: admin.id,
      },
    }),
    prisma.vulnerabilities.create({
      data: {
        title: 'Cross-Site Scripting (XSS) in User Profile',
        description: 'User profile page does not properly sanitize user input, allowing stored XSS attacks.',
        severity: 'HIGH',
        cvssScore: 7.2,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
        cveId: 'CVE-2024-5678',
        cweId: 'CWE-79',
        category: 'XSS',
        tags: ['xss', 'stored-xss', 'user-input'],
        status: 'IN_PROGRESS',
        recommendation: 'Implement proper input sanitization and output encoding',
        remediationSteps: '1. Add XSS protection library\n2. Sanitize all user inputs\n3. Use Content Security Policy',
        detectionMethod: 'Nuclei',
        templateId: 'xss-user-profile',
        tenantId: tenant.id,
        assetId: assets[1].id,
        scanId: scan.id,
        createdById: admin.id,
      },
    }),
    prisma.vulnerabilities.create({
      data: {
        title: 'Weak SSL/TLS Configuration',
        description: 'Server supports weak TLS versions (TLS 1.0, TLS 1.1) and weak cipher suites.',
        severity: 'HIGH',
        cvssScore: 7.5,
        category: 'Misconfiguration',
        tags: ['ssl', 'tls', 'encryption'],
        status: 'OPEN',
        recommendation: 'Disable TLS 1.0 and 1.1, enable only strong cipher suites',
        detectionMethod: 'Nuclei',
        templateId: 'weak-tls-config',
        tenantId: tenant.id,
        assetId: assets[0].id,
        scanId: scan.id,
        createdById: admin.id,
      },
    }),
    prisma.vulnerabilities.create({
      data: {
        title: 'Directory Listing Enabled',
        description: 'Web server has directory listing enabled, exposing file structure.',
        severity: 'MEDIUM',
        cvssScore: 5.3,
        cweId: 'CWE-548',
        category: 'Misconfiguration',
        tags: ['directory-listing', 'information-disclosure'],
        status: 'MITIGATED',
        mitigatedAt: new Date(),
        recommendation: 'Disable directory listing in web server configuration',
        detectionMethod: 'Nuclei',
        templateId: 'directory-listing',
        tenantId: tenant.id,
        assetId: assets[2].id,
        scanId: scan.id,
        createdById: admin.id,
      },
    }),
  ]);

  console.log('✓ Created', vulnerabilities.length, 'vulnerabilities');

  // Create evidence for first vulnerability
  await prisma.evidence.create({
    data: {
      vulnerabilityId: vulnerabilities[0].id,
      type: 'http_response',
      description: 'HTTP response showing successful SQL injection',
      content: `POST /api/login HTTP/1.1
Host: api.example.com
Content-Type: application/json

{"username":"admin' OR '1'='1","password":"anything"}

HTTP/1.1 200 OK
{"success":true,"token":"eyJhbGciOiJIUzI1NiIs..."}`,
    },
  });

  console.log('✓ Created evidence');

  // Create audit logs
  await Promise.all([
    prisma.audit_logs.create({
      data: {
        action: 'LOGIN',
        resource: 'Auth',
        tenantId: tenant.id,
        userId: admin.id,
        ipAddress: '192.168.1.50',
      },
    }),
    prisma.audit_logs.create({
      data: {
        action: 'CREATE',
        resource: 'Asset',
        resourceId: assets[0].id,
        tenantId: tenant.id,
        userId: admin.id,
      },
    }),
  ]);

  console.log('✓ Created audit logs');

  // Update asset risk metrics
  for (const asset of assets) {
    const vulnCounts = await prisma.vulnerabilities.groupBy({
      by: ['severity'],
      where: {
        assetId: asset.id,
        status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      },
      _count: true,
    });

    const criticalCount = vulnCounts.find((v) => v.severity === 'CRITICAL')?._count || 0;
    const highCount = vulnCounts.find((v) => v.severity === 'HIGH')?._count || 0;
    const mediumCount = vulnCounts.find((v) => v.severity === 'MEDIUM')?._count || 0;
    const lowCount = vulnCounts.find((v) => v.severity === 'LOW')?._count || 0;

    const totalVulns = criticalCount + highCount + mediumCount + lowCount;
    const riskScore = Math.min(
      100,
      criticalCount * 10 + highCount * 5 + mediumCount * 2 + lowCount * 0.5
    );

    await prisma.assets.update({
      where: { id: asset.id },
      data: {
        vulnCount: totalVulns,
        criticalVulnCount: criticalCount,
        riskScore,
        lastScanAt: new Date(),
      },
    });
  }

  console.log('✓ Updated asset risk metrics');

  console.log('\n✅ Seeding completed successfully!\n');
  console.log('Demo accounts:');
  console.log('  Admin:    admin@demo.com / admin123');
  console.log('  Analyst:  analyst@demo.com / analyst123');
  console.log('  Viewer:   viewer@demo.com / viewer123');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
