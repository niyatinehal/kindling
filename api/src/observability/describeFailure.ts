/**
 * Turns a database failure into something worth reading.
 *
 * The operator scripts exist because nobody should have to read a stack trace
 * to find out what broke. One of them answering a missing table with forty
 * lines of Prisma internals — when the fix was one command — undid the point
 * of having it.
 *
 * Only the two mistakes that are actually easy to make are named. Everything
 * else passes its reason straight through rather than being flattened into a
 * friendly sentence that hides the detail somebody needs.
 */
export function describeFailure(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  if (code === "P2021") {
    return [
      "That database has no error_events table yet.",
      "",
      "  DATABASE_URL=<the database> npx prisma migrate deploy",
      "",
      "Every database needs it separately — local, test and production are",
      "migrated by hand in this project, deliberately.",
    ].join("\n");
  }

  if (code === "P1001") {
    return [
      "Could not reach the database named by DATABASE_URL.",
      "",
      "If that is the local stack, it may not be running. If it is production,",
      "check the connection string is the pooled one.",
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  // `code` came off an unknown object, so it is only worth printing when it is
  // something that prints — otherwise this would report "[object Object]",
  // which is the kind of output this whole file exists to prevent.
  return typeof code === "string" ? code : "unknown failure";
}
