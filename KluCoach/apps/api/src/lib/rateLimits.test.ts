import { describe, expect, it } from "vitest";
import { rateLimits } from "./rateLimits.js";

describe("auth rate limit configuration", () => {
  it("raises ceilings under Vitest so isolation suites do not 429", () => {
    expect(rateLimits.login.max).toBe(10_000);
    expect(rateLimits.register.max).toBe(10_000);
    expect(rateLimits.inviteAccept.max).toBe(10_000);
  });
});
