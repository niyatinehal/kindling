import express from "express";
import type { Express } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { VerifiedToken } from "./auth/verifyToken.js";
import { healthRouter } from "./routes/health.js";
import { createReadyRouter } from "./routes/ready.js";
import { createAuthRouter } from "./routes/auth.js";

export type AppDeps = {
  checkDatabase: () => Promise<void>;
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
};

/**
 * Builds the configured Express app without binding a port, so tests can drive
 * it in-process with supertest. Binding happens in `server.ts`.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use(healthRouter);
  app.use(createReadyRouter(deps.checkDatabase));
  app.use("/api/v1/auth", createAuthRouter({ prisma: deps.prisma, verify: deps.verify }));

  return app;
}
