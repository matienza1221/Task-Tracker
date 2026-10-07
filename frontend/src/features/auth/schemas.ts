import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_HINT =
  'At least 12 characters, including at least three of: lowercase, uppercase, digits and symbols.';

const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'password1234',
    'passw0rd',
    'qwerty123456',
    '123456789012',
    'letmein12345',
    'administrator',
    'administrator1',
    'changeme1234',
    'welcome12345',
    'iloveyou1234',
    'monkey123456',
    'dragon123456',
    'football1234',
    'baseball1234',
    'sunshine1234',
    'princess1234',
    'trustno1',
    'abc123456789',
  ].map((value) => value.toLowerCase()),
);

/** Mirrors the server-side policy in backend/src/lib/password.ts. */
function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) {
    return 'Password must include at least three of: lowercase, uppercase, digits and symbols.';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
    return 'Password is too common.';
  }
  return null;
}

const newPasswordField = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

export const loginFormSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
