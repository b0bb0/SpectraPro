/**
 * User Management Routes (Admin only)
 */

import { Router } from 'express';
import { requireAuth, enforceTenantIsolation, requireRole } from '../middleware/auth.middleware';
import { UserService } from '../services/user.service';
import { auditService } from '../services/audit.service';
import { logger } from '../utils/logger';
import { UserRole } from '@prisma/client';

const router = Router();
const userService = new UserService();

router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(requireRole('ADMIN'));

/**
 * GET /api/users
 * List all users in tenant
 */
router.get('/', async (req, res, next) => {
  try {
    const users = await userService.listUsers(req.tenantId!);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/stats
 * Get user statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await userService.getUserStats(req.tenantId!);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id, req.tenantId!);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users
 * Create new user
 */
router.post('/', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Email, password, first name, last name, and role are required',
        },
      });
    }

    // Validate role
    if (!['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ROLE',
          message: 'Invalid role specified',
        },
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters',
        },
      });
    }

    const user = await userService.createUser(req.tenantId!, {
      email,
      password,
      firstName,
      lastName,
      role: role as UserRole,
    });

    // Audit log
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await auditService.logCreate(
      'User',
      user.id,
      req.user!.userId,
      req.tenantId!,
      { email: user.email, role: user.role, firstName, lastName },
      ipAddress,
      userAgent
    );

    logger.info(`Admin ${req.user!.email} created user: ${user.email}`);

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    if (error.message === 'Email already in use') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: error.message,
        },
      });
    }
    next(error);
  }
});

/**
 * PUT /api/users/:id
 * Update user
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, role, isActive } = req.body;

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) {
      if (!['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ROLE',
            message: 'Invalid role specified',
          },
        });
      }
      updateData.role = role as UserRole;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await userService.updateUser(
      req.params.id,
      req.tenantId!,
      updateData
    );

    // Audit log
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await auditService.logUpdate(
      'User',
      user.id,
      req.user!.userId,
      req.tenantId!,
      { updatedFields: updateData, userEmail: user.email },
      ipAddress,
      userAgent
    );

    logger.info(`Admin ${req.user!.email} updated user: ${user.email}`);

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    if (error.message === 'Cannot modify the last active admin') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'LAST_ADMIN',
          message: error.message,
        },
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/users/:id
 * Delete (deactivate) user
 */
router.delete('/:id', async (req, res, next) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SELF',
          message: 'Cannot delete your own account',
        },
      });
    }

    await userService.deleteUser(req.params.id, req.tenantId!);

    // Audit log
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await auditService.logDelete(
      'User',
      req.params.id,
      req.user!.userId,
      req.tenantId!,
      { action: 'deactivated' },
      ipAddress,
      userAgent
    );

    logger.info(`Admin ${req.user!.email} deleted user: ${req.params.id}`);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    if (error.message === 'Cannot delete the last admin') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'LAST_ADMIN',
          message: error.message,
        },
      });
    }
    next(error);
  }
});

/**
 * POST /api/users/:id/change-password
 * Change user password
 */
router.post('/:id/change-password', async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters',
        },
      });
    }

    await userService.changePassword(req.params.id, req.tenantId!, password);

    logger.info(`Admin ${req.user!.email} changed password for user: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
