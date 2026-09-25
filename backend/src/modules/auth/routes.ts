import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authLimiter, passwordResetLimiter, registerLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/logout', requireAuth, controller.logout);
router.get('/me', requireAuth, controller.me);
router.post(
  '/password/change',
  requireAuth,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);
router.post(
  '/password/forgot',
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
router.post(
  '/password/reset',
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);
router.post('/register', registerLimiter, validate({ body: registerSchema }), controller.register);

export default router;
