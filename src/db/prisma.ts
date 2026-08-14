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

export async function pingDatabase(client: DatabasePinger, timeoutMs = 2000): Promise<void> {
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

export async function disconnect(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}
