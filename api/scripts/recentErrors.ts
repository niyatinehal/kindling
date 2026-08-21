/**
 * Prints what has gone wrong lately.
 *
 * A script rather than an endpoint, deliberately. An HTTP route serving stack
 * traces needs an authorisation model this app does not have — there is no
 * "operator" role, only family roles — and inventing one to read a log would
 * add a new authenticated surface whose whole purpose is to expose internals.
 * Reading straight from the database needs no new surface and no new secret:
 * whoever can run this already has the connection string.
 *
 *   npm run errors            # the last 20
 *   npm run errors -- 100     # the last 100
 */
import "dotenv/config";

import { createPrismaClient, disconnect } from "../src/db/prisma.js";
import { describeFailure } from "../src/observability/describeFailure.js";

const DEFAULT_LIMIT = 20;

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined) {
    console.error("DATABASE_URL is not set. Point it at the database you want to read.");
    process.exitCode = 1;
    return;
  }

  const requested = Number(process.argv[2]);
  const take = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT;

  const prisma = createPrismaClient(connectionString);

  try {
    const events = await prisma.errorEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take,
    });

    if (events.length === 0) {
      console.log("Nothing recorded. Either it is all working, or nothing has run.");
      return;
    }

    for (const event of events) {
      const when = event.occurredAt.toISOString().replace("T", " ").slice(0, 19);
      const where = `${event.method ?? "?"} ${event.path ?? "?"}`;
      console.log(`\n${when}  ${event.status}  ${where}`);
      console.log(`  ${event.name}: ${event.message}`);
      if (event.requestId !== null) {
        console.log(`  request ${event.requestId}`);
      }
    }

    console.log(`\n${events.length} of the most recent failures.`);
  } catch (failure) {
    // The whole point of this script is not having to read a stack trace.
    console.error(describeFailure(failure));
    process.exitCode = 1;
  } finally {
    await disconnect(prisma);
  }
}

await main();
