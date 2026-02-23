/**
 * Spectra Platform - Main Server Entry Point
 */

// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createServer } from 'http';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { prisma } from './utils/prisma';
import { websocketService } from './services/websocket.service';
import { schedulerService } from './services/scheduler.service';

// Routes
import authRoutes from './routes/auth.routes';
import assetRoutes from './routes/asset.routes';
import vulnerabilityRoutes from './routes/vulnerability.routes';
import scanRoutes from './routes/scan.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportRoutes from './routes/report.routes';
import userRoutes from './routes/user.routes';
import auditRoutes from './routes/audit.routes';
import graphRoutes from './routes/graph.routes';
import consoleRoutes from './routes/console.routes';
import executiveRoutes from './routes/executive.routes';
import exposureRoutes from './routes/exposure.routes';
import templateRoutes from './routes/template.routes';
import scheduledScansRoutes from './routes/scheduled-scans.routes';
import integrationsRoutes from './routes/integrations.routes';
// Offensive Security Routes
import reconRoutes from './routes/recon.routes';
import exploitationRoutes from './routes/exploitation.routes';
import discoveryScanRoutes from './routes/discovery-scan.routes';
import impactRoutes from './routes/impact.routes';
import attackChainRoutes from './routes/attack-chain.routes';
import killSwitchRoutes from './routes/kill-switch.routes';
import debugRoutes from './routes/debug.routes';
import sourceScannerRoutes from './routes/source-scanner.routes';

const app = express();
const PORT = process.env.PORT || 5001;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "http:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false,
}));

// CORS
const allowedOrigins: string[] = [
  process.env.FRONTEND_URL,
  // Localhost origins (always allowed — needed for local MacBook deployment)
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
].filter(Boolean) as string[];

// Also allow any private-network origin (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const PRIVATE_NET_RE = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server) with no Origin header.
    if (!origin) return callback(null, true);
    // Allow localhost on any port
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow private network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (PRIVATE_NET_RE.test(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/vulnerabilities', vulnerabilityRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/console', consoleRoutes);
app.use('/api/executive', executiveRoutes);
app.use('/api/exposure', exposureRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/scheduled-scans', scheduledScansRoutes);
app.use('/api/integrations', integrationsRoutes);
// Offensive Security API routes
app.use('/api/recon', reconRoutes);
app.use('/api/exploitation', exploitationRoutes);
app.use('/api/discovery-scan', discoveryScanRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/attack-chains', attackChainRoutes);
app.use('/api/kill-switch', killSwitchRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/source-scanner', sourceScannerRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// SERVER START
// ============================================================================

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✓ Database connected');

    // Recover scans left in RUNNING state after previous process interruption
    const recovered = await prisma.scans.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        currentPhase: 'Scan interrupted',
        orchestrationPhase: 'FAILED',
        errorMessage: 'Scan interrupted by server restart',
        completedAt: new Date(),
      },
    });
    if (recovered.count > 0) {
      logger.warn(`Recovered ${recovered.count} orphaned running scans`);
    }

    // Create HTTP server (needed for WebSocket)
    const server = createServer(app);

    // Initialize WebSocket server
    websocketService.initialize(server);

    // Start scheduler service
    await schedulerService.start();
    logger.info('✓ Scheduler service started');

    // Start server
    const HOST = process.env.HOST || '0.0.0.0';
    server.listen(PORT, HOST, () => {
      logger.info(`✓ Server running on ${HOST}:${PORT}`);
      logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`✓ API: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      logger.info(`✓ WebSocket: ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await schedulerService.stop();
  websocketService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await schedulerService.stop();
  websocketService.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();

export default app;
