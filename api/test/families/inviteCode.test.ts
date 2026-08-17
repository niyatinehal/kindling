import { describe, expect, it } from "@jest/globals";

import { generateInviteCode } from "../../src/families/inviteCode.js";
import { defaultVisibilityFor } from "../../src/families/visibilityDefaults.js";

describe("generateInviteCode", () => {
  it("is 10 characters of the confusable-free alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateInviteCode()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    }
  });

  // I, L, O and U are excluded deliberately: this code gets read aloud across a
  // kitchen table and typed by someone who is 63.
  it("never emits the glyphs people misread", () => {
    const codes = Array.from({ length: 300 }, () => generateInviteCode()).join("");

    for (const banned of ["I", "L", "O", "U"]) {
      expect(codes).not.toContain(banned);
    }
  });

  // Not a randomness proof — a smoke alarm. `Math.random`-style collisions or a
  // constant would show up here immediately.
  it("does not repeat across a large batch", () => {
    const codes = Array.from({ length: 2000 }, () => generateInviteCode());

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("defaultVisibilityFor", () => {
  it("covers every data category exactly once", () => {
    const rows = defaultVisibilityFor("adult");

    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.dataCategory)).size).toBe(7);
  });

  // PRD §12: "not full surveillance by default". Everything genuinely sensitive
  // starts hidden and is the member's to share.
  it("starts everything sensitive hidden, and adherence visible", () => {
    const rows = defaultVisibilityFor("adult");
    const byCategory = new Map(rows.map((r) => [r.dataCategory, r]));

    expect(byCategory.get("adherence_summary")?.visibility).toBe("visible");
    for (const sensitive of ["weight", "medical_conditions", "meal_detail", "workout_detail"]) {
      expect(byCategory.get(sensitive as "weight")?.visibility).toBe("hidden");
    }
  });

  // FR-FAM-3: a child or elderly member cannot switch off the one signal that
  // would reveal they have stopped engaging.
  it("floor-locks adherence for child and elderly only", () => {
    const locked = (role: "admin" | "adult" | "child" | "elderly") =>
      defaultVisibilityFor(role).find((r) => r.dataCategory === "adherence_summary")
        ?.isLockedBySafetyFloor;

    expect(locked("child")).toBe(true);
    expect(locked("elderly")).toBe(true);
    expect(locked("adult")).toBe(false);
    expect(locked("admin")).toBe(false);
  });

  it("never floor-locks a sensitive category for anyone", () => {
    for (const role of ["admin", "adult", "child", "elderly"] as const) {
      for (const row of defaultVisibilityFor(role)) {
        if (row.dataCategory !== "adherence_summary") {
          expect(row.isLockedBySafetyFloor).toBe(false);
        }
      }
    }
  });
});
