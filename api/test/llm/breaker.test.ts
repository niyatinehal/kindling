import { describe, expect, it } from "@jest/globals";

import { createCircuitBreaker } from "../../src/llm/breaker.js";

/** A breaker on a clock the test moves by hand. */
function onClock() {
  let time = 0;
  const breaker = createCircuitBreaker({ now: () => time });
  return { breaker, advance: (ms: number) => (time += ms) };
}

describe("createCircuitBreaker", () => {
  it("stays closed below the threshold", () => {
    const { breaker } = onClock();
    for (let i = 0; i < 4; i++) breaker.recordFailure();

    expect(breaker.isOpen()).toBe(false);
  });

  it("opens on the fifth failure within a minute, and closes a minute later", () => {
    const { breaker, advance } = onClock();
    for (let i = 0; i < 5; i++) breaker.recordFailure();

    expect(breaker.isOpen()).toBe(true);
    advance(59_999);
    expect(breaker.isOpen()).toBe(true);
    advance(1);
    expect(breaker.isOpen()).toBe(false);
  });

  it("forgets failures older than the window", () => {
    const { breaker, advance } = onClock();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    advance(60_000);
    breaker.recordFailure();

    expect(breaker.isOpen()).toBe(false);
  });

  it("starts counting again after a success", () => {
    const { breaker } = onClock();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();

    expect(breaker.isOpen()).toBe(false);
  });
});
