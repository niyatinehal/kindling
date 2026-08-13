import express from "express";
import type { Express } from "express";

import { healthRouter } from "./routes/health.js";

/**
 * Builds the configured Express app without binding a port, so tests can drive
 * it in-process with supertest. Binding happens in `server.ts`.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use(healthRouter);

  return app;
}
