import { Router } from "express";
import type { Request, Response } from "express";

export const healthRouter = Router();

/**
 * Liveness probe. Deliberately cheap: no database or partner calls, and no
 * configuration echoed back — a health endpoint must never leak secrets.
 */
healthRouter.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round(process.uptime()),
  });
});
