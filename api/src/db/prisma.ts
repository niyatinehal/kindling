import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";

/**
 * The narrow slice of PrismaClient that pingDatabase needs. Declaring it
 * separately keeps the readiness check unit-testable with a plain stub instead
 * of an ESM module mock.
 */
export type DatabasePinger = {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
};

/**
 * Prisma 7 connects through a driver adapter rather than reading a URL from the
 * schema, so the pooled connection string is supplied here. Migrations use
 * DIRECT_URL via prisma.config.ts instead.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function pingOnce(client: DatabasePinger, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`database ping timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([client.$queryRaw`SELECT 1`, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Whether the database can answer, with one retry.
 *
 * The retry is not defensive padding — it fixes a specific lie observed on the
 * deployed service. Render spins a free instance down after fifteen minutes,
 * and the first request afterwards has to open a Postgres connection through
 * Supabase's pooler, TLS handshake included. That does not finish inside two
 * seconds, so /readyz answered 503 with `"database": "down"` while the
 * database was entirely healthy — I reached it directly from another machine
 * in the same moment.
 *
 * A second attempt distinguishes the two cases at no cost to either. By the
 * time it runs, a connection that was merely slow to open has finished
 * opening; a database that is actually gone fails again and the endpoint still
 * reports not-ready, just a beat later.
 *
 * Raising the timeout instead would have been the wrong fix: it slows the
 * detection of every real outage in order to accommodate one predictable
 * moment in the lifecycle.
 */
export async function pingDatabase(
  client: DatabasePinger,
  timeoutMs = 2000,
  attempts = 2,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await pingOnce(client, timeoutMs);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function disconnect(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}
