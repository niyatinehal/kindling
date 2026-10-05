import { afterAll, afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { PhotoInput, PhotoOutcome } from "../../src/meals/parsePhoto.js";
import { createBullPhotoQueue, startPhotoWorker } from "../../src/meals/photoQueue.js";

const redisUrl = process.env["TEST_REDIS_URL"] ?? "redis://127.0.0.1:63799";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
/**
 * A queue of this run's own. The real name is shared with any dev server
 * pointed at the same Redis, whose worker would otherwise take these jobs.
 */
const QUEUE = `pantry-photo-test-${randomUUID()}`;
/** The raw queue, for looking at what Redis actually holds for a job. */
const raw = new Queue<PhotoInput>(QUEUE, { connection });

const PHOTO: PhotoInput = {
  userId: "user-1",
  requestId: "req-1",
  mediaType: "image/jpeg",
  imageBase64: "IMAGE-BYTES-AS-BASE64",
};
const DONE: PhotoOutcome = {
  status: "done",
  recognised: ["egg"],
  unrecognised: [],
  parser: "llm-pantry-photo@1",
};

let closers: (() => Promise<void>)[] = [];

const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting");
};

beforeEach(async () => {
  await raw.obliterate({ force: true });
});

afterEach(async () => {
  for (const close of closers) await close();
  closers = [];
});

afterAll(async () => {
  await raw.obliterate({ force: true });
  await raw.close();
  await connection.quit();
});

describe("the BullMQ photo queue", () => {
  it("reports a job as queued until a worker takes it", async () => {
    const queue = createBullPhotoQueue(connection, QUEUE);
    closers.push(() => queue.close());

    const jobId = await queue.enqueue(PHOTO);

    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await queue.status(jobId, "user-1")).toEqual({ status: "queued" });
  });

  it("runs the job and gives the result to its owner only", async () => {
    const queue = createBullPhotoQueue(connection, QUEUE);
    const worker = startPhotoWorker(connection, () => Promise.resolve(DONE), QUEUE);
    closers.push(
      () => worker.close(),
      () => queue.close(),
    );

    const jobId = await queue.enqueue(PHOTO);
    await waitFor(async () => (await queue.status(jobId, "user-1"))?.status === "done");

    expect(await queue.status(jobId, "user-1")).toEqual(DONE);
    expect(await queue.status(jobId, "someone-else")).toBeNull();
    expect(await queue.status("00000000-0000-0000-0000-000000000000", "user-1")).toBeNull();
  });

  // The promise on the privacy page: the image is held only until it is read.
  it("removes the image from Redis before the photo is processed", async () => {
    let release: () => void = () => undefined;
    let seen: string | undefined;
    const queue = createBullPhotoQueue(connection, QUEUE);
    const worker = startPhotoWorker(
      connection,
      (input) => {
        seen = input.imageBase64;
        return new Promise<PhotoOutcome>((resolve) => {
          release = () => resolve(DONE);
        });
      },
      QUEUE,
    );
    closers.push(
      () => worker.close(),
      () => queue.close(),
    );

    const jobId = await queue.enqueue(PHOTO);
    await waitFor(() => Promise.resolve(seen !== undefined));

    // Mid-processing: the worker has the image in memory, Redis does not.
    expect(seen).toBe(PHOTO.imageBase64);
    const stored = await raw.getJob(jobId);
    expect(stored?.data.imageBase64).toBe("");
    expect(JSON.stringify(stored?.data)).not.toContain("IMAGE-BYTES");
    expect(await queue.status(jobId, "user-1")).toEqual({ status: "working" });

    release();
    await waitFor(async () => (await queue.status(jobId, "user-1"))?.status === "done");
  });

  it("reports a job whose processor threw as failed, without the error", async () => {
    const queue = createBullPhotoQueue(connection, QUEUE);
    const worker = startPhotoWorker(connection, () => Promise.reject(new Error("boom")), QUEUE);
    closers.push(
      () => worker.close(),
      () => queue.close(),
    );
    const original = console.error;
    console.error = () => undefined;
    closers.push(() => {
      console.error = original;
      return Promise.resolve();
    });

    const jobId = await queue.enqueue(PHOTO);
    await waitFor(async () => (await queue.status(jobId, "user-1"))?.status === "failed");

    expect(await queue.status(jobId, "user-1")).toEqual({ status: "failed", reason: "error" });
  });
});
