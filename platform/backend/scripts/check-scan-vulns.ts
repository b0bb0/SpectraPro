import { prisma } from '../src/utils/prisma';

async function checkScan() {
  const scanId = '9d0fcbf9-5c25-4872-ab94-eefb49055ac2';

  const scan = await prisma.scans.findUnique({
    where: { id: scanId },
    include: {
      _count: {
        select: { vulnerabilities: true }
      }
    }
  });

  console.log('Scan details:');
  console.log('  ID:', scan?.id);
  console.log('  vulnFound:', scan?.vulnFound);
  console.log('  infoCount:', scan?.infoCount);
  console.log('  Vulnerabilities in DB:', scan?._count.vulnerabilities);
}

checkScan()
  .finally(() => prisma.$disconnect());
