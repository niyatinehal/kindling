import express from "express";
import type { Express, NextFunction, Request, Response } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { VerifiedToken } from "./auth/verifyToken.js";
import type { PlanGenerator } from "./workouts/planGenerator.js";
import { sendError } from "./http/errors.js";
import { recordError } from "./observability/recordError.js";
import { redact } from "./observability/redact.js";
import { requestId } from "./observability/requestId.js";
import { healthRouter } from "./routes/health.js";
import { createReadyRouter } from "./routes/ready.js";
import { createAuthRouter } from "./routes/auth.js";
import { createProfileRouter } from "./routes/profiles.js";
import { createPlanRouter } from "./routes/plans.js";
import { createFamilyRouter, createInviteRouter } from "./routes/families.js";
import { createTrackingRouter } from "./routes/tracking.js";
import { createMealRouter } from "./routes/meals.js";

export type AppDeps = {
  checkDatabase: () => Promise<void>;
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
  planGenerator: PlanGenerator;
};

/**
 * Builds the configured Express app without binding a port, so tests can drive
 * it in-process with supertest. Binding happens in `server.ts`.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");

  // First, so every log line and every recorded failure below can be tied back
  // to one request — including the ones thrown before any route runs.
  app.use(requestId());

  app.use(express.json());

  app.use(healthRouter);
  app.use(createReadyRouter(deps.checkDatabase));
  app.use("/api/v1/auth", createAuthRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use("/api/v1/profiles", createProfileRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use("/api/v1/families", createFamilyRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use("/api/v1/invites", createInviteRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use("/api/v1/tracking", createTrackingRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use("/api/v1/meals", createMealRouter({ prisma: deps.prisma, verify: deps.verify }));
  app.use(
    "/api/v1/plans",
    createPlanRouter({
      prisma: deps.prisma,
      verify: deps.verify,
      planGenerator: deps.planGenerator,
    }),
  );

  // Mounted last on purpose: Express only recognizes a 4-argument function as
  // an error handler, and only routes to it when it is the final middleware
  // registered. Every route in this app dispatches failures with
  // `next(error)` (see src/routes/auth.ts and src/auth/middleware.ts) rather
  // than an async handler Express 5 would catch on its own — without this,
  // those `next(error)` calls fall through to Express's default finalhandler,
  // which puts `err.stack` in the response body whenever
  // `NODE_ENV !== "production"`. Nothing about the underlying error — its
  // message, its stack, a driver error, a connection string — may reach the
  // client; the real error is logged here and the client gets one generic
  // envelope.
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    // Structured, so the platform log can be searched by request id rather
    // than read. Redacted for the same reason the stored copy is: this line
    // may contain whatever the thrower interpolated into the message.
    console.error(
      JSON.stringify({
        level: "error",
        event: "unhandled_error",
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        message: redact(error instanceof Error ? error.message : error),
      }),
    );

    // Stored as well as logged, because the log is the thing nobody reads.
    // Deliberately not awaited: the caller is owed its 500 now, and
    // `recordError` is written never to reject, so nothing here can turn a
    // handled failure into an unhandled one.
    void recordError(deps.prisma, {
      error,
      status: 500,
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    });

    sendError(res, 500, "INTERNAL", "Something went wrong. Please try again.");
  });

  return app;
}
