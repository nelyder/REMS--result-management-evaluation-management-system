import { badRequest } from '../utils/httpError.js';

const toDetails = (error, prefix) =>
  error.issues.map((i) => ({ path: i.path.join('.') || prefix, message: i.message }));

/**
 * Validates and replaces req.params / req.query / req.body with parsed values.
 * Body schemas are strict, so unknown fields (e.g. role, studentId) are rejected
 * rather than silently passed through — no mass assignment.
 */
export const validate =
  ({ params, query, body } = {}) =>
  (req, _res, next) => {
    for (const [key, schema] of [['params', params], ['query', query], ['body', body]]) {
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) return next(badRequest('Invalid request.', toDetails(result.error, key)));
      if (key === 'query') {
        // req.query is a getter in Express 5; define a property to stay compatible.
        Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
      } else {
        req[key] = result.data;
      }
    }
    next();
  };
