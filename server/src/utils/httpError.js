export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required.') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new HttpError(409, 'CONFLICT', message, details);
export const unprocessable = (message, details) => new HttpError(422, 'UNPROCESSABLE', message, details);

/**
 * Converts a Supabase/PostgREST/Postgres error into an HttpError without leaking
 * internals. Only messages we raise ourselves in SQL (P0001 / 23514 from our
 * triggers) are passed through to the client.
 */
export function fromDbError(error, { conflictMessage = 'This record conflicts with an existing one.' } = {}) {
  const code = error?.code;
  switch (code) {
    case '23505':
      return conflict(conflictMessage);
    case '23503':
      return conflict('This record is referenced by, or refers to, other records.');
    case '23P01':
      return unprocessable('Values overlap with an existing record.');
    case '23514':
      return unprocessable(error.message?.startsWith('new row') ? 'A value is outside the allowed range.' : error.message);
    case '22P02':
    case '22003':
      return badRequest('Invalid value supplied.');
    case 'P0001':
      return unprocessable(error.message);
    case 'P0002':
    case 'PGRST116':
      return notFound();
    case '42501':
      return forbidden(error.message && error.message !== 'Not allowed' && !error.message.includes('row-level security')
        ? error.message
        : undefined);
    default: {
      const err = new HttpError(500, 'INTERNAL', 'An unexpected error occurred.');
      err.cause = error;
      return err;
    }
  }
}

/** Throws a mapped error if a Supabase response failed; otherwise returns it. */
export function check(response, options) {
  if (response.error) throw fromDbError(response.error, options);
  return response;
}
