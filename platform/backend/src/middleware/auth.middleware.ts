/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/auth';
import { prisma } from '../utils/prisma';

// Extend Express Request to include user and tenant
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      tenantId?: string;
    }
  }
}

/**
 * Require authentication
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from header or cookie
    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.token;

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Verify token
    const payload = verifyToken(token);

    // Verify user exists and is active
    const user = await prisma.users.findUnique({
      where: { id: payload.userId },
      include: { tenants: true },
    });

    if (!user || !user.isActive || !user.tenants.isActive) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or inactive account',
        },
      });
      return;
    }

    // Attach user info to request
    req.user = payload;
    req.tenantId = payload.tenantId;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
}

/**
 * Require specific role
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Tenant isolation - ensures all queries are scoped to tenant
 */
export function enforceTenantIsolation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenantId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Tenant context missing',
      },
    });
    return;
  }

  next();
}
