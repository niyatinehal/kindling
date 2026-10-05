import { randomUUID } from "node:crypto";

import type { PhotoInput, PhotoOutcome } from "../../src/meals/parsePhoto.js";
import type { PhotoQueue, PhotoStatus } from "../../src/meals/photoQueue.js";

/**
 * The photo queue without Redis, for route tests: jobs run straight away on
 * the given processor, and `inputs` records what each job was given. The
 * BullMQ queue itself is tested against real Redis in photoQueue.test.ts.
 */
export function createMemoryPhotoQueue(process: (input: PhotoInput) => Promise<PhotoOutcome>) {
  const jobs = new Map<string, { userId: string; status: PhotoStatus; done: Promise<void> }>();
  const inputs: PhotoInput[] = [];

  const queue: PhotoQueue = {
    enqueue(input) {
      const jobId = randomUUID();
      inputs.push(input);
      const entry = {
        userId: input.userId,
        status: { status: "queued" } as PhotoStatus,
        done: Promise.resolve(),
      };
      entry.done = process(input).then(
        (outcome) => {
          entry.status = outcome;
        },
        () => {
          entry.status = { status: "failed", reason: "error" };
        },
      );
      jobs.set(jobId, entry);
      return Promise.resolve(jobId);
    },
    async status(jobId, userId) {
      const job = jobs.get(jobId);
      if (job === undefined || job.userId !== userId) return null;
      await job.done;
      return job.status;
    },
    close: () => Promise.resolve(),
  };

  return { queue, inputs };
}
