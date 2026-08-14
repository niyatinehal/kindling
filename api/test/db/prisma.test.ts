import { describe, expect, it, jest } from "@jest/globals";

import { pingDatabase } from "../../src/db/prisma.js";

describe("pingDatabase", () => {
  it("resolves when the query succeeds", async () => {
    const client = { $queryRaw: jest.fn(() => Promise.resolve([{ result: 1 }])) };

    await expect(pingDatabase(client)).resolves.toBeUndefined();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects when the query throws", async () => {
    const client = {
      $queryRaw: jest.fn(() => Promise.reject(new Error("connection refused"))),
    };

    await expect(pingDatabase(client)).rejects.toThrow(/connection refused/);
  });

  it("rejects when the query outlives the timeout", async () => {
    const client = {
      $queryRaw: jest.fn(() => new Promise<unknown>(() => {})),
    };

    await expect(pingDatabase(client, 20)).rejects.toThrow(/timed out/);
  });
});
