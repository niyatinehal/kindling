import { randomUUID } from "node:crypto";

import express, { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import { createCircuitBreaker } from "../llm/breaker.js";
import type { CircuitBreaker } from "../llm/breaker.js";
import type { LlmClient } from "../llm/client.js";
import { isGuardedAccount, parsePantry } from "../meals/parsePantry.js";
import { createPrismaPantryStore } from "../meals/pantryStore.js";
import { explainDishes } from "../meals/explainDishes.js";
import { IMAGE_MEDIA_TYPES, sniffImageType } from "../meals/imageType.js";
import type { PhotoQueue } from "../meals/photoQueue.js";
import { ALL_INGREDIENTS, RECIPES } from "../meals/recipeLibrary.js";
import { suggestMeals } from "../meals/suggestMeals.js";
import type { Ingredient } from "../meals/recipeLibrary.js";

/**
 * Ingredients arrive as keys from a known vocabulary, not as prose.
 *
 * FR-MEAL-1 allows "free text or selectable list"; this is the selectable list,
 * and it is the honest half to build without a model — free text needs synonym
 * resolution ("atta" vs "wheat flour") that either an LLM or a curated synonym
 * table has to provide. The vocabulary is derived from the recipe library, so the
 * two cannot drift.
 */
const suggestBody = z.strictObject({
  ingredients: z.array(z.enum(ALL_INGREDIENTS as unknown as [Ingredient, ...Ingredient[]])).max(40),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable().default(null),
});

/**
 * Free text, the other half of FR-MEAL-1. Trimmed before the length check, so
 * a box of spaces is empty rather than one character long.
 */
const parsePantryBody = z.strictObject({
  text: z.string().trim().min(1).max(500),
});

const pantryConsentBody = z.strictObject({ enabled: z.boolean() });

const RECIPE_KEYS = RECIPES.map((recipe) => recipe.key) as [string, ...string[]];

/** The dishes /suggest returned, and the pantry they were suggested from. */
const explainBody = z.strictObject({
  recipe_keys: z.array(z.enum(RECIPE_KEYS)).min(1).max(5),
  on_hand: z.array(z.enum(ALL_INGREDIENTS as unknown as [Ingredient, ...Ingredient[]])).max(40),
});

export function createMealRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
  llm: LlmClient;
  /** One per process, shared by every request. Defaults to the standard thresholds. */
  breaker?: CircuitBreaker;
  /** The photo job queue. Absent when no Redis is configured, which turns photo input off. */
  photoQueue?: PhotoQueue;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });
  const pantry = {
    llm: deps.llm,
    store: createPrismaPantryStore(deps.prisma),
    breaker: deps.breaker ?? createCircuitBreaker(),
  };

  /** The vocabulary the intake screen offers. Served so the client never hardcodes it. */
  router.get("/ingredients", authenticate, (_req, res) => {
    res.status(200).json({ ingredients: ALL_INGREDIENTS });
  });

  router.post("/suggest", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = suggestBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    // Diet and conditions come from the stored profile rather than the request:
    // they are facts about the person, and letting a client override them would
    // mean a caution could be silently switched off. Suggestions still work
    // without a profile — an unconstrained pantry match is a reasonable answer,
    // unlike a workout plan, which genuinely cannot be built without one.
    deps.prisma.profile
      .findUnique({ where: { userId: user.id } })
      .then((profile) => {
        const draft = suggestMeals({
          onHand: parsed.data.ingredients,
          dietary: profile?.dietary ?? [],
          conditions: profile?.conditions ?? [],
          ...(parsed.data.slot !== null && { slot: parsed.data.slot }),
        });

        res.status(200).json({
          generator: draft.generator,
          suggestions: draft.suggestions.map((suggestion) => ({
            recipe_key: suggestion.recipeKey,
            slot: suggestion.slot,
            uses_on_hand: suggestion.usesOnHand,
            missing: suggestion.missing,
            // Labelled as an estimate on every surface that shows it, per §16.2.
            approx_kcal: suggestion.approxKcal,
            protein_g: suggestion.proteinG,
            minutes: suggestion.minutes,
            cautions: suggestion.cautions,
            // No suggested meal is protein-free: a dish either clears its
            // slot's target or names what to serve with it.
            meets_protein: suggestion.meetsProtein,
            pair_with: suggestion.pairWith,
            protein_target_g: suggestion.proteinTargetG,
          })),
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  /**
   * Reads free text into ingredient keys. It answers with keys for the client
   * to show as chips, never with suggestions: the confirmed list then goes to
   * `/suggest` unchanged, so the suggestion path stays deterministic.
   */
  router.post("/parse-pantry", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = parsePantryBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    // Consent is read from the stored profile on every call, like diet is for
    // /suggest: a client cannot claim consent it never gave, and withdrawing
    // it takes effect on the very next parse.
    deps.prisma.profile
      .findUnique({
        where: { userId: user.id },
        select: { aiPantryConsent: true, birthYear: true },
      })
      .then((profile) =>
        parsePantry(
          {
            text: parsed.data.text,
            userId: user.id,
            consented: profile?.aiPantryConsent ?? false,
            role: user.role,
            birthYear: profile?.birthYear ?? null,
            // Always set by the requestId middleware; the fallback only keeps
            // the daily count correct if this router is ever mounted without it.
            requestId: req.requestId ?? randomUUID(),
          },
          pantry,
        ),
      )
      .then((result) => {
        res.status(200).json(result);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  /**
   * A short "why this dish" sentence for each suggestion, under the same
   * consent as pantry parsing. A separate call from /suggest, which stays
   * deterministic and unchanged: the client asks for these after the dishes
   * are on screen, and shows each dish without one when none comes back.
   */
  router.post("/explain", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = explainBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    deps.prisma.profile
      .findUnique({
        where: { userId: user.id },
        select: { aiPantryConsent: true, birthYear: true },
      })
      .then((profile) =>
        explainDishes(
          {
            recipeKeys: parsed.data.recipe_keys,
            onHand: parsed.data.on_hand,
            userId: user.id,
            consented: profile?.aiPantryConsent ?? false,
            role: user.role,
            birthYear: profile?.birthYear ?? null,
            requestId: req.requestId ?? randomUUID(),
          },
          pantry,
        ),
      )
      .then((result) => {
        res.status(200).json(result);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  /**
   * The photo arrives as the raw request body, typed by its Content-Type, so
   * the 100 KB JSON limit the rest of the API runs under does not apply to it
   * and nothing has to be base64-encoded twice. Parsed only after the caller
   * is authenticated, so an anonymous request cannot make the server read
   * five megabytes. A body over the limit is a 413 envelope, not the generic 500.
   */
  const readPhoto = express.raw({ type: [...IMAGE_MEDIA_TYPES], limit: "5mb" });
  const photoBody: RequestHandler = (req, res, next) => {
    readPhoto(req, res, (error?: unknown) => {
      if (error === undefined || error === null) {
        next();
        return;
      }
      const tooLarge = (error as { type?: unknown }).type === "entity.too.large";
      sendError(
        res,
        tooLarge ? 413 : 400,
        "VALIDATION_FAILED",
        tooLarge ? "The photo must be 5 MB or smaller." : "The photo could not be read.",
      );
    });
  };

  /**
   * Queues a photo of a fridge, groceries or a receipt to be read into
   * ingredient keys, and answers a job id to poll. Only for a caller who has
   * turned smarter reading on and is not a child or a minor, checked here and
   * again when the job runs.
   */
  router.post("/parse-photo", authenticate, photoBody, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }
    const queue = deps.photoQueue;
    if (queue === undefined || !deps.llm.enabled) {
      sendError(res, 403, "AI_UNAVAILABLE", "Reading photos is not available.");
      return;
    }

    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      sendError(
        res,
        400,
        "VALIDATION_FAILED",
        "Send the photo as the request body, as a JPEG, PNG, WebP or GIF.",
      );
      return;
    }
    // The declared type is the client's claim; the first bytes are the truth.
    const mediaType = sniffImageType(body);
    if (mediaType === null || mediaType !== req.header("content-type")?.split(";")[0]?.trim()) {
      sendError(res, 400, "VALIDATION_FAILED", "The file is not the kind of image it says it is.");
      return;
    }

    deps.prisma.profile
      .findUnique({
        where: { userId: user.id },
        select: { aiPantryConsent: true, birthYear: true },
      })
      .then(async (profile) => {
        const caller = { role: user.role, birthYear: profile?.birthYear ?? null };
        if (isGuardedAccount(caller)) {
          sendError(res, 403, "FORBIDDEN_ROLE", "This account cannot use photo reading.");
          return;
        }
        if (profile?.aiPantryConsent !== true) {
          sendError(res, 403, "AI_CONSENT_REQUIRED", "Turn on smarter reading first.");
          return;
        }

        const jobId = await queue.enqueue({
          userId: user.id,
          requestId: req.requestId ?? randomUUID(),
          mediaType,
          imageBase64: body.toString("base64"),
        });
        res.status(202).json({ job_id: jobId, status: "queued" });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Where a photo job has got to. Another person's job answers exactly like a missing one. */
  router.get("/parse-photo/:jobId", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }
    const queue = deps.photoQueue;
    const raw: unknown = req.params["jobId"];
    const jobId = typeof raw === "string" ? raw : "";
    if (queue === undefined || !JOB_ID.test(jobId)) {
      sendError(res, 404, "NOT_FOUND", "No such photo job.");
      return;
    }

    queue
      .status(jobId, user.id)
      .then((status) => {
        if (status === null) {
          sendError(res, 404, "NOT_FOUND", "No such photo job.");
          return;
        }
        res.status(200).json(status);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  /**
   * The AI pantry toggle's state. `available` says whether the toggle should be
   * offered at all: not while the kill switch is off, not before a profile
   * exists to hold the flag, and never to a child or a minor.
   */
  router.get("/pantry-consent", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    deps.prisma.profile
      .findUnique({
        where: { userId: user.id },
        select: { aiPantryConsent: true, birthYear: true },
      })
      .then((profile) => {
        const available =
          deps.llm.enabled &&
          profile !== null &&
          !isGuardedAccount({ role: user.role, birthYear: profile.birthYear });
        res.status(200).json({
          enabled: profile?.aiPantryConsent ?? false,
          available,
          // Photo reading needs the job queue as well as the model.
          photo: available && deps.photoQueue !== undefined,
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  /**
   * Gives or withdraws consent. Withdrawing is always allowed; giving it is
   * refused for a child or a minor, since the parse would ignore it anyway and a
   * stored "yes" from a minor is not a consent anyone should rely on.
   */
  router.put("/pantry-consent", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = pantryConsentBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }
    const enabled = parsed.data.enabled;

    deps.prisma.profile
      .findUnique({
        where: { userId: user.id },
        select: { aiPantryConsent: true, birthYear: true },
      })
      .then(async (profile) => {
        if (profile === null) {
          sendError(res, 403, "PROFILE_REQUIRED", "Complete your profile first.");
          return;
        }
        const guarded = isGuardedAccount({ role: user.role, birthYear: profile.birthYear });
        if (enabled && guarded) {
          sendError(res, 403, "FORBIDDEN_ROLE", "This account cannot turn on AI pantry reading.");
          return;
        }

        // Re-giving consent keeps the original time; the timestamp records
        // when it was given, not when the toggle was last touched.
        if (profile.aiPantryConsent !== enabled) {
          await deps.prisma.profile.update({
            where: { userId: user.id },
            data: { aiPantryConsent: enabled, aiPantryConsentAt: enabled ? new Date() : null },
          });
        }

        res.status(200).json({
          enabled,
          available: deps.llm.enabled && !guarded,
          photo: deps.llm.enabled && !guarded && deps.photoQueue !== undefined,
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  return router;
}
