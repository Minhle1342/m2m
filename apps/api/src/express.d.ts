import type { AuthContext } from './context.js';

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
      requestId: string;
    }
  }
}

export {};
