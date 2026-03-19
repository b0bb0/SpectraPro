import dotenv from 'dotenv';
import { prisma } from '../src/utils/prisma';
import { AIAnalysisService } from '../src/services/ai-analysis.service';

dotenv.config();

const FALLBACK_INFO_TEXT =
  'This informational finding provides awareness of potential security considerations.';

type Args = {
  limit?: number;
  tenantId?: string;
  onlyFallback?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (token === '--tenant' && argv[i + 1]) {
      args.tenantId = argv[++i];
    } else if (token === '--only-fallback') {
      args.onlyFallback = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const where: any = {
    severity: 'INFO',
  };

  if (args.tenantId) {
    where.tenantId = args.tenantId;
  }

  if (args.onlyFallback) {
    where.aiAnalysis = FALLBACK_INFO_TEXT;
  }

  const vulnerabilities = await prisma.vulnerability.findMany({
    where,
    take: args.limit,
    select: {
      id: true,
      title: true,
      description: true,
      severity: true,
      cvssScore: true,
      cveId: true,
      category: true,
      tags: true,
    },
  });

  if (vulnerabilities.length === 0) {
    console.log('No INFO vulnerabilities found for re-analysis.');
    return;
  }

  console.log(`Re-analyzing ${vulnerabilities.length} INFO vulnerabilities...`);

  const aiService = new AIAnalysisService();
  await aiService.analyzeMultipleVulnerabilities(vulnerabilities);

  console.log('Re-analysis complete.');
}

main()
  .catch((error) => {
    console.error('Re-analysis failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
