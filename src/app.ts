import express from "express";
import type { Express } from "express";

import { healthRouter } from "./routes/health.js";
import { createReadyRouter } from "./routes/ready.js";

export type AppDeps = {
  checkDatabase: () => Promise<void>;
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

  return app;
}
