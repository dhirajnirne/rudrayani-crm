import type { UserRow } from "./user";

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. */
      user?: UserRow;
    }
  }
}

export {};
