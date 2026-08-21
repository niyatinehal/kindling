import { describe, expect, it } from "@jest/globals";

import { describeFailure } from "../../src/observability/describeFailure.js";

/**
 * This tool exists because reading a stack trace to find out what broke is a
 * bad way to find out what broke. It answering with a stack trace of its own
 * was not ironic so much as useless — the actual problem was one command away
 * and the output said nothing about it.
 */
describe("describeFailure", () => {
  it("says what to run when the table has not been created yet", () => {
    const missing = Object.assign(new Error("does not exist"), { code: "P2021" });

    expect(describeFailure(missing)).toContain("prisma migrate deploy");
  });

  // Pointing the tool at the wrong database is the other easy mistake, and it
  // looks nothing like a missing table.
  it("says which database it could not reach", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "P1001" });

    expect(describeFailure(refused)).toContain("DATABASE_URL");
  });

  // Anything unrecognised must still say something, and must not swallow the
  // detail that would let somebody work it out.
  it("passes through a reason it does not recognise", () => {
    expect(describeFailure(new Error("something else entirely"))).toContain(
      "something else entirely",
    );
  });
});
