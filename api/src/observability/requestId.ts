import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Long enough for a UUID or a platform trace id, short enough to be a column. */
const MAX_LENGTH = 64;
const PLAUSIBLE = /^[A-Za-z0-9._-]+$/;

/**
 * Gives every request a handle that can be quoted back.
 *
 * The error table deliberately holds no user id, which leaves a gap: somebody
 * says "it broke", and there is no way to find their failure among everyone
 * else's. This closes it without reopening the privacy question — the id is
 * echoed in the response, so the person reporting the problem can read it off
 * and it matches a row exactly, while the row still says nothing about who
 * they are.
 *
 * An id supplied by the caller is kept, because Vercel and Render both set one
 * and a trace that restarts at our door is only half a trace. But it is
 * validated first: this value ends up in a database column and a log line, and
 * an unbounded caller-controlled string in either is a way to write whatever
 * you like into both.
 */
export function requestId(): RequestHandler {
  return function assignRequestId(req, res, next): void {
    const supplied = req.header("x-request-id");
    const usable =
      supplied !== undefined && supplied.length <= MAX_LENGTH && PLAUSIBLE.test(supplied);

    const id = usable ? supplied : randomUUID();

    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  };
}
