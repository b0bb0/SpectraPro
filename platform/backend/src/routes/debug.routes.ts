/**
 * Debug Routes - For development only
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Block all debug routes in production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }
  next();
});

/**
 * GET /api/debug/whoami
 * Get current user info
 */
router.get('/whoami', requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: {
      userId: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role,
      tenantId: req.user?.tenantId,
    },
  });
});

export default router;
