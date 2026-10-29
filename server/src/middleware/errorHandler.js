import { HttpError, fromDbError } from '../utils/httpError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;
  if (!(error instanceof HttpError)) {
    if (err?.type === 'entity.parse.failed') error = new HttpError(400, 'BAD_REQUEST', 'Malformed JSON body.');
    else if (err?.type === 'entity.too.large') error = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    else if (err?.code && typeof err.code === 'string') error = fromDbError(err); // raw Supabase/Postgres error
    else error = new HttpError(500, 'INTERNAL', 'An unexpected error occurred.');
  }

  if (error.status >= 500 && process.env.NODE_ENV !== 'test') {
    // Full details stay in server logs only.
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error.cause || err);
  }

  res.status(error.status).json({
    error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) },
  });
}
