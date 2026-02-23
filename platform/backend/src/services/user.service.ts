/**
 * User Management Service
 */

import { prisma } from '../utils/prisma';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

export class UserService {
  /**
   * List all users in tenant
   */
  async listUsers(tenantId: string) {
    const users = await prisma.users.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string, tenantId: string) {
    const user = await prisma.users.findFirst({
      where: {
        id: userId,
        tenantId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Create new user
   */
  async createUser(
    tenantId: string,
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: UserRole;
    }
  ) {
    // Check if email already exists
    const existing = await prisma.users.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new Error('Email already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await prisma.users.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        tenantId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    logger.info(`User created: ${user.email} (${user.role})`);

    return user;
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    tenantId: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: UserRole;
      isActive?: boolean;
    }
  ) {
    // Verify user belongs to tenant
    const existing = await prisma.users.findFirst({
      where: { id: userId, tenantId },
    });

    if (!existing) {
      throw new Error('User not found');
    }

    // Don't allow deactivating the last admin
    if (data.isActive === false || (data.role && data.role !== 'ADMIN')) {
      const adminCount = await prisma.users.count({
        where: {
          tenantId,
          role: 'ADMIN',
          isActive: true,
          id: { not: userId },
        },
      });

      if (adminCount === 0 && existing.role === 'ADMIN') {
        throw new Error('Cannot modify the last active admin');
      }
    }

    const user = await prisma.users.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    logger.info(`User updated: ${user.email}`);

    return user;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string, tenantId: string) {
    // Verify user belongs to tenant
    const existing = await prisma.users.findFirst({
      where: { id: userId, tenantId },
    });

    if (!existing) {
      throw new Error('User not found');
    }

    // Don't allow deleting the last admin
    if (existing.role === 'ADMIN') {
      const adminCount = await prisma.users.count({
        where: {
          tenantId,
          role: 'ADMIN',
          id: { not: userId },
        },
      });

      if (adminCount === 0) {
        throw new Error('Cannot delete the last admin');
      }
    }

    // Instead of deleting, we'll deactivate
    await prisma.users.update({
      where: { id: userId },
      data: { isActive: false },
    });

    logger.info(`User deactivated: ${existing.email}`);

    return { success: true };
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    tenantId: string,
    newPassword: string
  ) {
    // Verify user belongs to tenant
    const existing = await prisma.users.findFirst({
      where: { id: userId, tenantId },
    });

    if (!existing) {
      throw new Error('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.users.update({
      where: { id: userId },
      data: { passwordHash },
    });

    logger.info(`Password changed for user: ${existing.email}`);

    return { success: true };
  }

  /**
   * Get user statistics
   */
  async getUserStats(tenantId: string) {
    const [total, active, byRole] = await Promise.all([
      prisma.users.count({
        where: { tenantId },
      }),
      prisma.users.count({
        where: { tenantId, isActive: true },
      }),
      prisma.users.groupBy({
        by: ['role'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    const roleBreakdown = byRole.reduce((acc, item) => {
      acc[item.role] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      active,
      inactive: total - active,
      byRole: roleBreakdown,
    };
  }
}
