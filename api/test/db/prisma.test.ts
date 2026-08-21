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

  /*
    The failure this exists for, caught on the deployed service: the first
    request after Render spins the instance back up has to open a Postgres
    connection through the pooler — TLS handshake and all — and that does not
    finish inside the two-second budget. /readyz answered 503 while the
    database was perfectly healthy, which is a lie that pages somebody at
    three in the morning and turns a cold start into "the database is down".

    One retry separates the two cases. A connection that was merely slow to
    open is established by the time the second attempt runs; a database that
    is genuinely gone fails twice.
  */
  it("tries again when the first attempt times out", async () => {
    let attempt = 0;
    const client = {
      $queryRaw: jest.fn(() => {
        attempt += 1;
        // First call never settles, standing in for a connection still being
        // opened. The second answers, as it would once that connection is up.
        return attempt === 1 ? new Promise<unknown>(() => {}) : Promise.resolve([{ result: 1 }]);
      }),
    };

    await expect(pingDatabase(client, 20)).resolves.toBeUndefined();
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // A retry must not turn a real outage into a pass, only into a slower fail.
  it("still rejects when every attempt fails", async () => {
    const client = {
      $queryRaw: jest.fn(() => Promise.reject(new Error("connection refused"))),
    };

    await expect(pingDatabase(client, 20)).rejects.toThrow(/connection refused/);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
