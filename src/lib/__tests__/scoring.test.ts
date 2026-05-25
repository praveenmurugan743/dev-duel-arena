import { describe, it, expect } from "vitest";
import { calculateScore } from "../scoring";

describe("calculateScore", () => {
  it("returns 0 for an incorrect answer regardless of time left", () => {
    expect(calculateScore(false, 15)).toBe(0);
    expect(calculateScore(false, 0)).toBe(0);
  });

  it("awards max points for a correct answer with full time left", () => {
    // 100 base + 15 * 10 = 250
    expect(calculateScore(true, 15)).toBe(250);
  });

  it("awards only base points for a correct answer with 0s left", () => {
    expect(calculateScore(true, 0)).toBe(100);
  });

  it("scales linearly with remaining time", () => {
    expect(calculateScore(true, 7.5)).toBe(175);
    expect(calculateScore(true, 10)).toBe(200);
  });

  it("clamps time left to the question window", () => {
    expect(calculateScore(true, 999)).toBe(250);
    expect(calculateScore(true, -5)).toBe(100);
  });
});
