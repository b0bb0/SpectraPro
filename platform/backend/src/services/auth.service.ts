/**
 * Authentication Service
 */

import { prisma } from '../utils/prisma';
import { hashPassword, comparePassword, generateToken, JWTPayload } from '../utils/auth';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}

export class AuthService {
  /**
   * Login user
   */
  async login(email: string, password: string, ipAddress?: string) {
    // Find user with tenant
    const user = await prisma.users.findUnique({
      where: { email },
      include: { tenants: true },
    });

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Check if user and tenant are active
    if (!user.isActive) {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive');
    }

    if (!user.tenants.isActive) {
      throw new AppError(403, 'TENANT_INACTIVE', 'Organization account is inactive');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });

    // Log audit
    await this.createAuditLog(user.id, user.tenantId, 'LOGIN', ipAddress);

    logger.info(`User logged in: ${user.email}`);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenant: {
          id: user.tenants.id,
          name: user.tenants.name,
          slug: user.tenants.slug,
        },
      },
    };
  }

  /**
   * Register new user and tenant
   */
  async register(data: RegisterData) {
    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(409, 'USER_EXISTS', 'User with this email already exists');
    }

    // Generate tenant slug
    const slug = this.generateSlug(data.tenantName);

    // Check if slug is available
    const existingTenant = await prisma.tenants.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      throw new AppError(409, 'TENANT_EXISTS', 'Organization name already taken');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create tenant and admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenants.create({
        data: {
          name: data.tenantName,
          slug,
          plan: 'free',
        },
      });

      // Create admin user
      const user = await tx.users.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: 'ADMIN',
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    // Generate JWT token
    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      role: result.user.role,
    });

    logger.info(`New user registered: ${data.email} (Tenant: ${data.tenantName})`);

    return {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
        },
      },
    };
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        tenants: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    return user;
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(payload: JWTPayload) {
    // Verify user still exists and is active
    const user = await prisma.users.findUnique({
      where: { id: payload.userId },
      include: { tenants: true },
    });

    if (!user || !user.isActive || !user.tenants.isActive) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }

    // Generate new token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    userId: string,
    tenantId: string,
    action: string,
    ipAddress?: string
  ) {
    try {
      await prisma.audit_logs.create({
        data: {
          action: action as any,
          resource: 'Auth',
          userId,
          tenantId,
          ipAddress,
        },
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }
}
