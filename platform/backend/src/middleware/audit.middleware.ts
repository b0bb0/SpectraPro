/**
 * Audit Logging Middleware
 * Automatically logs API requests for audit trail
 */

import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { AuditAction } from '@prisma/client';

/**
 * Helper to extract IP address from request
 */
function getClientIp(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    undefined
  );
}

/**
 * Helper to map HTTP methods to audit actions
 */
function mapMethodToAction(method: string): AuditAction | null {
  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    case 'GET':
      return 'VIEW';
    default:
      return null;
  }
}

/**
 * Helper to extract resource name from path
 */
function extractResource(path: string): string {
  // Remove /api/ prefix and extract resource name
  const match = path.match(/^\/api\/([^\/]+)/);
  if (match) {
    const resource = match[1];
    // Capitalize first letter
    return resource.charAt(0).toUpperCase() + resource.slice(1);
  }
  return 'Unknown';
}

/**
 * Helper to extract resource ID from path
 */
function extractResourceId(path: string): string | undefined {
  // Match UUID pattern in path (e.g., /api/users/:id)
  const match = path.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : undefined;
}

/**
 * Middleware to log API requests
 * Should be applied after authentication middleware
 */
export function auditLog(options: {
  resource?: string;
  action?: AuditAction;
  skipPaths?: string[];
} = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip if no user or tenant (unauthenticated request)
    if (!req.user || !req.tenantId) {
      return next();
    }

    // Skip certain paths
    if (options.skipPaths && options.skipPaths.some((path) => req.path.includes(path))) {
      return next();
    }

    // Skip health checks and metrics
    if (req.path.includes('/health') || req.path.includes('/metrics')) {
      return next();
    }

    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody: any;
    let statusCode: number;

    // Intercept res.send
    res.send = function (body: any) {
      responseBody = body;
      statusCode = res.statusCode;
      return originalSend.call(this, body);
    };

    // Intercept res.json
    res.json = function (body: any) {
      responseBody = body;
      statusCode = res.statusCode;
      return originalJson.call(this, body);
    };

    // Wait for response to finish
    res.on('finish', async () => {
      try {
        // Only log successful operations (2xx status codes)
        if (statusCode >= 200 && statusCode < 300) {
          const action = options.action || mapMethodToAction(req.method);
          if (!action) {
            return; // Skip if we can't determine action
          }

          // Skip GET requests to list endpoints (too noisy)
          if (action === 'VIEW' && !extractResourceId(req.path)) {
            return;
          }

          const resource = options.resource || extractResource(req.path);
          const resourceId = extractResourceId(req.path);
          const ipAddress = getClientIp(req);
          const userAgent = req.headers['user-agent'];

          // Build details object
          const details: any = {
            method: req.method,
            path: req.path,
            query: req.query,
          };

          // Add request body for creates/updates (sanitize sensitive fields)
          if (action === 'CREATE' || action === 'UPDATE') {
            const sanitizedBody = { ...req.body };
            delete sanitizedBody.password;
            delete sanitizedBody.passwordHash;
            details.body = sanitizedBody;
          }

          // Log the action
          await auditService.log({
            action,
            resource,
            resourceId,
            details,
            ipAddress,
            userAgent,
            userId: req.user.userId,
            tenantId: req.tenantId,
          });
        }
      } catch (error) {
        // Don't block request if audit logging fails
        console.error('Audit logging error:', error);
      }
    });

    next();
  };
}

/**
 * Specific audit middleware for sensitive operations
 */
export function auditSensitiveOperation(resource: string, action: AuditAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // This will be used to explicitly audit specific sensitive operations
    req.auditData = {
      resource,
      action,
    };
    next();
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auditData?: {
        resource: string;
        action: AuditAction;
        details?: any;
      };
    }
  }
}
