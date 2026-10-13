import type { Role } from '../models/user.model';

/** The authenticated caller, decoded from a verified JWT by `requireAuth`. */
export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // Express exposes this global namespace for request augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
