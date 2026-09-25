import helmet from 'helmet';
import { env } from '../config/env';

/**
 * Security headers for an API that only returns JSON.
 * The SPA is served by Vite/nginx, which sets its own CSP; here we can be strict.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'base-uri': ["'none'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  hsts: env.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
});
