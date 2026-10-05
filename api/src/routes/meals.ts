import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import { parsePantry } from "../meals/parsePantry.js";
import { ALL_INGREDIENTS } from "../meals/recipeLibrary.js";
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

export function createMealRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

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
  router.post("/parse-pantry", authenticate, (req, res) => {
    if (req.user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = parsePantryBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    res.status(200).json(parsePantry({ text: parsed.data.text }));
  });

  return router;
}
