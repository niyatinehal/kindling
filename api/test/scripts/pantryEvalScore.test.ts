import { describe, expect, it } from "@jest/globals";

import { asPercent, microScore, percentile } from "../../scripts/pantryEvalScore.js";

describe("microScore", () => {
  it("counts every key in every case once", () => {
    const score = microScore([
      { expected: ["atta", "potato"], predicted: ["atta", "potato"] },
      { expected: ["curd"], predicted: ["curd", "paneer"] },
      { expected: ["rice", "toor_dal"], predicted: ["rice"] },
    ]);

    expect(score).toEqual({
      truePositives: 4,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.8,
      recall: 0.8,
    });
  });

  it("ignores duplicates within one prediction", () => {
    expect(microScore([{ expected: ["egg"], predicted: ["egg", "egg"] }]).precision).toBe(1);
  });

  it("answers null rather than a misleading number when there is nothing to divide by", () => {
    expect(microScore([{ expected: [], predicted: [] }])).toMatchObject({
      precision: null,
      recall: null,
    });
  });

  // A junk case that names nothing should cost precision if the parser invents
  // something, and leave recall alone.
  it("charges a false positive on a case that expects nothing", () => {
    const score = microScore([
      { expected: ["rice"], predicted: ["rice"] },
      { expected: [], predicted: ["paneer"] },
    ]);

    expect(score.precision).toBe(0.5);
    expect(score.recall).toBe(1);
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
  });

  it("does not depend on input order", () => {
    expect(percentile([900, 100, 500], 50)).toBe(500);
  });

  it("answers null for no data", () => {
    expect(percentile([], 95)).toBeNull();
  });
});

describe("asPercent", () => {
  it("formats to one decimal place, or n/a", () => {
    expect(asPercent(0.9333)).toBe("93.3%");
    expect(asPercent(null)).toBe("n/a");
  });
});
