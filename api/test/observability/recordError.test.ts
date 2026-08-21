import { describe, expect, it, jest } from "@jest/globals";

import { recordError } from "../../src/observability/recordError.js";

function store() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    client: {
      errorEvent: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          rows.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
    },
  };
}

describe("recordError", () => {
  it("writes what went wrong, and where", async () => {
    const { rows, client } = store();

    await recordError(client, {
      error: new TypeError("plan generation failed"),
      requestId: "req-1",
      method: "POST",
      path: "/api/v1/plans",
      status: 500,
    });

    expect(rows[0]).toMatchObject({
      name: "TypeError",
      message: "plan generation failed",
      requestId: "req-1",
      method: "POST",
      path: "/api/v1/plans",
      status: 500,
    });
  });

  // The reason this table exists at all is that nobody sees console output.
  // Storing an unredacted message would trade invisible errors for a permanent
  // record of somebody's email address.
  it("redacts before storing", async () => {
    const { rows, client } = store();

    await recordError(client, {
      error: new Error("no user for meera@example.com"),
      status: 500,
    });

    expect(rows[0]?.["message"]).toBe("no user for [redacted:email]");
  });

  /*
    The contract that matters most. This runs inside the express error handler,
    after something has already gone wrong — if it can throw, it turns a
    handled 500 into an unhandled rejection, and the endpoint that was about to
    answer politely crashes instead. An error tracker that takes the process
    down is worse than none.
  */
  it("never throws, even when the database is the thing that is broken", async () => {
    const client = {
      errorEvent: {
        create: jest.fn(() => Promise.reject(new Error("connection refused"))),
      },
    };

    await expect(
      recordError(client, { error: new Error("anything"), status: 500 }),
    ).resolves.toBeUndefined();
  });

  it("survives being handed something that is not an Error", async () => {
    const { rows, client } = store();

    await recordError(client, { error: "just a string", status: 500 });

    expect(rows[0]).toMatchObject({ name: "UnknownError", message: "just a string" });
  });
});
