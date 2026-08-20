import { createRateLimiter } from "../rateLimit";

/**
 * `now` is passed explicitly rather than faked globally. These windows are
 * measured in minutes, and a test that has to advance a global clock to prove
 * expiry is harder to read than one that simply says what time it is.
 */
describe("createRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const take = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(take("a", 0).allowed).toBe(true);
    expect(take("a", 1_000).allowed).toBe(true);
    expect(take("a", 2_000).allowed).toBe(true);
  });

  it("refuses the request after the limit", () => {
    const take = createRateLimiter({ limit: 3, windowMs: 60_000 });
    for (const at of [0, 1_000, 2_000]) take("a", at);

    expect(take("a", 3_000).allowed).toBe(false);
  });

  // Without this the caller cannot send a `Retry-After`, and a client that
  // does not know when to come back simply retries immediately — which is the
  // traffic the limiter exists to stop.
  it("says how long until the next attempt is allowed", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000 });
    take("a", 0);

    expect(take("a", 15_000).retryAfterSeconds).toBe(45);
  });

  it("allows again once the window has passed", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000 });
    take("a", 0);

    expect(take("a", 60_001).allowed).toBe(true);
  });

  // A limiter keyed by contact must not let one person's attempts lock out
  // everybody else's.
  it("counts each key separately", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000 });
    take("a", 0);

    expect(take("b", 0).allowed).toBe(true);
  });

  // The window slides rather than resetting on a fixed boundary: three
  // attempts at the end of one fixed window plus three at the start of the
  // next would be six in a moment, which is the classic way a naive counter
  // is bypassed.
  it("slides, so a burst across a boundary is still counted", () => {
    const take = createRateLimiter({ limit: 2, windowMs: 60_000 });
    take("a", 59_000);
    take("a", 59_500);

    expect(take("a", 60_500).allowed).toBe(false);
  });
});
