import { forbidden, unauthorized } from '../utils/httpError.js';

/** Allows the request only if the authenticated user's (database) role is listed. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
