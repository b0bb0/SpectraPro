/**
 * Authentication Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { logger } from '../utils/logger';

const router = Router();
const authService = new AuthService();

// Rate limiting for auth endpoints — prevent brute force attacks
// Login/register get a stricter limit; read-only auth endpoints (me, refresh) get a higher limit
const authMutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 login/register attempts per window
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const authReadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 req/min for /me and /refresh (called on every page navigation)
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  tenantName: z.string().min(1),
});

function isSecureRequest(req: any): boolean {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  return (
    process.env.FORCE_HTTPS === 'true' ||
    req.secure === true ||
    forwardedProto === 'https' ||
    origin?.startsWith('https://') === true ||
    referer?.startsWith('https://') === true
  );
}

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', authMutateLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    const result = await authService.login(body.email, body.password, req.ip);

    // Log successful login — use req.ip which respects trust proxy settings
    const userAgent = req.headers['user-agent'];

    await auditService.logLogin(
      result.user.id,
      result.user.tenant.id,
      req.ip,
      userAgent
    );

    // Set HTTP-only cookie
    // secure: false for HTTP (local/private network); set true behind HTTPS proxy
    const isHTTPS = isSecureRequest(req);
    const sameSite = isHTTPS ? 'none' : 'lax';
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isHTTPS,
      sameSite,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/register
 * Register new user and tenant
 */
router.post('/register', authMutateLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    const result = await authService.register(body as any);

    // Set HTTP-only cookie
    const isHTTPS = isSecureRequest(req);
    const sameSite = isHTTPS ? 'none' : 'lax';
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isHTTPS,
      sameSite,
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', requireAuth, async (req, res) => {
  // Log logout — use req.ip which respects trust proxy settings
  const userAgent = req.headers['user-agent'];

  await auditService.logLogout(
    req.user!.userId,
    req.tenantId!,
    req.ip,
    userAgent
  );

  const isHTTPS = isSecureRequest(req);
  const sameSite = isHTTPS ? 'none' : 'lax';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isHTTPS,
    sameSite,
  });
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authReadLimiter, requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user!.userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh authentication token
 */
router.post('/refresh', authReadLimiter, requireAuth, async (req, res, next) => {
  try {
    const result = await authService.refreshToken(req.user!);

    const isHTTPS = isSecureRequest(req);
    const sameSite = isHTTPS ? 'none' : 'lax';
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: isHTTPS,
      sameSite,
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
