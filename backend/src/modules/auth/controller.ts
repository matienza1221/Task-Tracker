import type { Request, Response } from 'express';
import { asyncHandler, notFound, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies';
import { env } from '../../config/env';
import { validatedBody } from '../../middleware/validate';
import { auditContextFromRequest } from '../audit/service';
import * as authService from './service';
import type { ChangePasswordInput, ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from './schemas';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = validatedBody<LoginInput>(req);
  const context = auditContextFromRequest(req);
  const { user, tokens } = await authService.login({ email: body.email, password: body.password, context });
  setAuthCookies(res, tokens);
  sendSuccess(res, { user: authService.toUserDto(user) }, { message: 'Signed in successfully.' });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.session || !req.user) throw unauthenticated();
  await authService.logout(req.session, req.user?.email ?? null, auditContextFromRequest(req));
  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Signed out successfully.' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  sendSuccess(res, { user: authService.toUserDto(req.user) });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.session) throw unauthenticated();
  const body = validatedBody<ChangePasswordInput>(req);
  await authService.changePassword({
    user: req.user,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    currentSessionId: req.session.id,
    context: auditContextFromRequest(req),
  });
  sendSuccess(res, null, { message: 'Password changed successfully. Other sessions have been signed out.' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = validatedBody<ForgotPasswordInput>(req);
  await authService.requestPasswordReset(body.email, auditContextFromRequest(req));
  // Uniform response regardless of whether the account exists.
  sendSuccess(res, null, { message: 'If an account exists for that email, a password reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = validatedBody<ResetPasswordInput>(req);
  await authService.resetPassword({ token: body.token, newPassword: body.newPassword, context: auditContextFromRequest(req) });
  sendSuccess(res, null, { message: 'Password has been reset. You can now sign in.' });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  if (!env.ENABLE_PUBLIC_REGISTRATION) {
    // Hide the feature entirely when disabled.
    throw notFound();
  }
  const body = validatedBody<RegisterInput>(req);
  const context = auditContextFromRequest(req);
  const { user, tokens } = await authService.registerUser({ ...body, context });
  setAuthCookies(res, tokens);
  sendSuccess(res, { user: authService.toUserDto(user) }, { status: 201, message: 'Account created successfully.' });
});
