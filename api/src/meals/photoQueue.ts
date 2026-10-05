import { randomUUID } from "node:crypto";

import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";

import { redact } from "../observability/redact.js";
import type { PhotoInput, PhotoOutcome } from "./parsePhoto.js";

const QUEUE_NAME = "pantry-photo";
/** How long a finished job's result stays readable. The result is only ingredient keys. */
const RESULT_TTL_SECONDS = 10 * 60;
/**
 * A job nobody has picked up after this long is deleted, image and all, so a
 * stopped worker cannot leave photos sitting in Redis indefinitely.
 */
const STALE_WAITING_MS = 5 * 60 * 1000;

export type PhotoStatus =
  | { status: "queued" }
  | { status: "working" }
  | PhotoOutcome
  | { status: "failed"; reason: "error" };

/** The job queue as the routes see it, so tests can stand in an in-memory one. */
export type PhotoQueue = {
  /** Queues a photo and answers its job id, which is unguessable. */
  enqueue(input: PhotoInput): Promise<string>;
  /** Null for an unknown job, an expired one, or one that belongs to someone else. */
  status(jobId: string, userId: string): Promise<PhotoStatus | null>;
  close(): Promise<void>;
};

type StoredJob = PhotoInput;

export function createBullPhotoQueue(connection: Redis): PhotoQueue {
  const queue = new Queue<StoredJob, PhotoOutcome>(QUEUE_NAME, { connection });

  return {
    async enqueue(input) {
      // The sweep rides on the write, like the cache's: cheap, and it bounds
      // how long an unread image can exist even if no worker is running.
      await queue.clean(STALE_WAITING_MS, 100, "wait");

      const jobId = randomUUID();
      await queue.add("read", input, {
        jobId,
        attempts: 1,
        removeOnComplete: { age: RESULT_TTL_SECONDS },
        removeOnFail: { age: RESULT_TTL_SECONDS },
      });
      return jobId;
    },

    async status(jobId, userId) {
      const job = await queue.getJob(jobId);
      // Someone else's job is indistinguishable from no job at all.
      if (job === undefined || job.data.userId !== userId) {
        return null;
      }

      const state = await job.getState();
      if (state === "completed") {
        return job.returnvalue;
      }
      if (state === "failed") {
        return { status: "failed", reason: "error" };
      }
      return state === "active" ? { status: "working" } : { status: "queued" };
    },

    close() {
      return queue.close();
    },
  };
}

/**
 * Runs photo jobs. The image is removed from the job's stored data before
 * anything else happens — before the model is called, before anything can
 * fail — so it exists in Redis only between upload and pickup, and from then
 * on only in this process's memory.
 */
export function startPhotoWorker(
  connection: Redis,
  process: (input: PhotoInput) => Promise<PhotoOutcome>,
): { close(): Promise<void> } {
  const worker = new Worker<StoredJob, PhotoOutcome>(
    QUEUE_NAME,
    async (job: Job<StoredJob, PhotoOutcome>) => {
      const { imageBase64, ...rest } = job.data;
      await job.updateData({ ...rest, imageBase64: "" });
      return process({ ...rest, imageBase64 });
    },
    { connection, concurrency: 2 },
  );

  // A failed job is answered to the client as `{ status: "failed" }`. The
  // error itself goes to the log, and carries no image or text.
  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "photo_job_failed",
        requestId: job?.data.requestId ?? null,
        message: redact(error.message),
      }),
    );
  });

  return { close: () => worker.close() };
}
