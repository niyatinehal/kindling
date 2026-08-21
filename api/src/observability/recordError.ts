import { redact } from "./redact.js";

/**
 * The narrow slice of PrismaClient this needs, declared separately so the unit
 * tests can hand it a plain object instead of mocking an ES module — the same
 * approach `DatabasePinger` takes in src/db/prisma.ts.
 */
/** Exactly the columns this writes — nothing wider, so PrismaClient satisfies it. */
type ErrorEventData = {
  name: string;
  message: string;
  stack: string | null;
  status: number;
  requestId: string | null;
  method: string | null;
  path: string | null;
};

export type ErrorEventStore = {
  errorEvent: {
    create: (args: { data: ErrorEventData }) => Promise<unknown>;
  };
};

export type RecordedError = {
  error: unknown;
  status: number;
  requestId?: string | undefined;
  method?: string | undefined;
  path?: string | undefined;
};

/**
 * Writes one failure down so somebody can find it later.
 *
 * This exists because there was no way to see a production error at all: two
 * dozen console.error calls going to a platform log nobody reads, no
 * aggregation and no alerting, on an application holding medical conditions.
 * The first report of any bug was going to come from a user.
 *
 * Two properties are load-bearing and both are asserted in the tests.
 *
 * It never throws. This runs inside the express error handler, after something
 * has already gone wrong; a rejection here turns a handled 500 into an
 * unhandled one and takes down the request that was about to answer politely.
 * An error tracker that crashes the process is worse than no error tracker.
 *
 * And it redacts. These rows are kept indefinitely and carry no user id, so
 * there is nothing for the deletion flow to erase — a promise that only holds
 * while the free text stays clean.
 */
export async function recordError(store: ErrorEventStore, event: RecordedError): Promise<void> {
  const error = event.error;
  const isError = error instanceof Error;

  try {
    await store.errorEvent.create({
      data: {
        // A thrown string or object has no name. Calling it UnknownError is
        // more useful than an empty column when grouping by name later.
        name: isError ? error.name : "UnknownError",
        message: redact(isError ? error.message : error),
        stack: isError ? redact(error.stack) : null,
        status: event.status,
        requestId: event.requestId ?? null,
        method: event.method ?? null,
        path: event.path ?? null,
      },
    });
  } catch (failure) {
    // Deliberately the one place in this file that logs rather than stores:
    // if the store is what is broken, storing the fact would fail the same
    // way. This line is the last resort, and it goes to the platform log.
    console.error("could not record error event", {
      reason: redact(failure instanceof Error ? failure.message : failure),
    });
  }
}
