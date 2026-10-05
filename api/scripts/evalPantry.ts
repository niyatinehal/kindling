/**
 * Measures the pantry parser against a hand-labelled golden set.
 *
 * Every case goes through the model path — the same prompt, schema, validation
 * and retry policy users get, minus consent and the cache — and through the
 * synonym table, so the model is always compared against the baseline it has
 * to beat. Prints micro precision and recall, p50 and p95 latency, and total
 * cost for each, and saves the run to eval/results/ named by prompt version.
 *
 *   npm run eval:pantry               # needs LLM_API_KEY; spends real money
 *   npm run eval:pantry -- --no-save  # print only
 *
 * Without LLM_API_KEY only the synonym table runs, which costs nothing.
 *
 * The expected keys in eval/pantry-golden.json are written by hand, never by
 * the model: a golden set the model wrote measures agreement with itself.
 */
import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import { createAnthropicLlmClient } from "../src/llm/anthropicClient.js";
import { costMicroUsd } from "../src/llm/pricing.js";
import { askModel } from "../src/meals/parsePantry.js";
import { PANTRY_PROMPT_VERSION, tidyPantryOutput } from "../src/meals/pantryPrompt.js";
import { ALL_INGREDIENTS } from "../src/meals/recipeLibrary.js";
import type { Ingredient } from "../src/meals/recipeLibrary.js";
import { parseWithSynonyms, SYNONYM_PARSER } from "../src/meals/synonyms.js";
import { asPercent, microScore, percentile } from "./pantryEvalScore.js";

const GOLDEN = new URL("../eval/pantry-golden.json", import.meta.url);
const RESULTS = new URL("../eval/results/", import.meta.url);

const goldenSet = z
  .strictObject({
    cases: z.array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string().trim().min(1).max(500),
        expected: z.array(z.enum(ALL_INGREDIENTS as unknown as [Ingredient, ...Ingredient[]])),
        tags: z.array(z.string()).default([]),
      }),
    ),
  })
  .refine((set) => new Set(set.cases.map((c) => c.id)).size === set.cases.length, {
    message: "case ids must be unique",
  });

type CaseResult = {
  id: string;
  expected: string[];
  predicted: string[];
  latencyMs: number;
  /** Set when the model path failed and so predicted nothing. */
  failure?: string;
};

type PathReport = {
  parser: string;
  precision: string;
  recall: string;
  p50Ms: number | null;
  p95Ms: number | null;
  costUsd: number | null;
  failures: number;
  cases: CaseResult[];
};

function report(parser: string, cases: CaseResult[], costMicro: number | null): PathReport {
  const score = microScore(cases);
  const latencies = cases.map((c) => c.latencyMs);
  return {
    parser,
    precision: asPercent(score.precision),
    recall: asPercent(score.recall),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    costUsd: costMicro === null ? null : costMicro / 1_000_000,
    failures: cases.filter((c) => c.failure !== undefined).length,
    cases,
  };
}

/** Lines naming what each case got wrong, so a bad score points somewhere. */
function misses(path: PathReport): string[] {
  return path.cases.flatMap((c) => {
    const missing = c.expected.filter((key) => !c.predicted.includes(key));
    const extra = c.predicted.filter((key) => !c.expected.includes(key));
    if (c.failure === undefined && missing.length === 0 && extra.length === 0) {
      return [];
    }
    const parts = [
      c.failure !== undefined ? `failed (${c.failure})` : "",
      missing.length > 0 ? `missed ${missing.join(", ")}` : "",
      extra.length > 0 ? `wrongly added ${extra.join(", ")}` : "",
    ].filter((part) => part !== "");
    return [`  ${c.id}: ${parts.join("; ")}`];
  });
}

async function main(): Promise<void> {
  const save = !process.argv.includes("--no-save");
  const parsedSet = goldenSet.safeParse(JSON.parse(await readFile(GOLDEN, "utf8")));
  if (!parsedSet.success) {
    console.error(`eval/pantry-golden.json is invalid: ${parsedSet.error.issues[0]?.message}`);
    process.exitCode = 1;
    return;
  }
  const cases = parsedSet.data.cases;

  const synonymCases = cases.map((c): CaseResult => {
    const started = performance.now();
    const { recognised } = parseWithSynonyms(c.text);
    return {
      id: c.id,
      expected: c.expected,
      predicted: recognised,
      latencyMs: Math.round(performance.now() - started),
    };
  });
  const paths: PathReport[] = [report(SYNONYM_PARSER, synonymCases, 0)];

  const apiKey = process.env["LLM_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    console.log("LLM_API_KEY is not set: running the synonym table only.\n");
  } else {
    const llm = createAnthropicLlmClient({ apiKey });
    let totalCost = 0;
    const modelCases: CaseResult[] = [];

    // One at a time, so each latency is a real request's and not a queue's.
    for (const c of cases) {
      let latencyMs = 0;
      const result = await askModel(c.text, llm, (attempt) => {
        latencyMs += attempt.latencyMs;
        if (attempt.ok) {
          totalCost += costMicroUsd(attempt.model, attempt.usage) ?? 0;
        }
      });
      modelCases.push({
        id: c.id,
        expected: c.expected,
        // A failure predicts nothing and is scored that way: a parser that
        // falls over has not found the ingredients.
        predicted: result.ok ? tidyPantryOutput(result.value).recognised : [],
        latencyMs,
        ...(!result.ok && { failure: result.reason }),
      });
    }
    paths.push(report(`${PANTRY_PROMPT_VERSION} (${llm.model})`, modelCases, totalCost));
  }

  console.log(`${cases.length} cases\n`);
  console.table(
    paths.map((p) => ({
      parser: p.parser,
      precision: p.precision,
      recall: p.recall,
      "p50 ms": p.p50Ms,
      "p95 ms": p.p95Ms,
      "cost USD": p.costUsd === null ? "n/a" : p.costUsd.toFixed(4),
      failures: p.failures,
    })),
  );
  for (const path of paths) {
    const lines = misses(path);
    if (lines.length > 0) {
      console.log(`\n${path.parser}:\n${lines.join("\n")}`);
    }
  }

  if (save) {
    const ranAt = new Date().toISOString();
    const file = new URL(`${PANTRY_PROMPT_VERSION}_${ranAt.replace(/[:.]/g, "-")}.json`, RESULTS);
    await mkdir(RESULTS, { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ promptVersion: PANTRY_PROMPT_VERSION, ranAt, cases: cases.length, paths }, null, 2)}\n`,
    );
    console.log(`\nSaved ${file.pathname}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
