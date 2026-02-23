/**
 * Prisma Client Singleton
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Prisma client with logging
export const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

// Log warnings and errors
prisma.$on('warn', (e) => {
  logger.warn('Prisma warning:', e);
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

// Graceful shutdown
const cleanup = async () => {
  await prisma.$disconnect();
};

process.on('beforeExit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
