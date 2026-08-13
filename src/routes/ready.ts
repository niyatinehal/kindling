import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Readiness, as distinct from liveness: this reports whether the process can
 * serve traffic right now. The check is injected so the route is testable
 * without a database and without mocking an ES module.
 */
export function createReadyRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();

  router.get("/readyz", (_req: Request, res: Response) => {
    checkDatabase().then(
      () => {
        res.status(200).json({ status: "ready", checks: { database: "up" } });
      },
      (error: unknown) => {
        // The reason goes to the log, never to the response — the message can
        // contain a connection string, and this endpoint is often public.
        console.error("readiness check failed", error);
        res.status(503).json({ status: "not_ready", checks: { database: "down" } });
      },
    );
  });

  return router;
}
