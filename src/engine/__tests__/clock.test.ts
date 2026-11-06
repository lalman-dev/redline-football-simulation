import { describe, expect, it } from "vitest";
import {
  getMatchMinute,
  getHalfTimeSeconds,
  getFullTimeSeconds,
} from "../clock.js";

describe("match clock", () => {
  it("converts elapsed seconds into minutes", () => {
    expect(getMatchMinute(0)).toBe(0);
    expect(getMatchMinute(60)).toBe(1);
    expect(getMatchMinute(90 * 60)).toBe(90);
  });

  it("returns the regulation half-time boundary", () => {
    expect(getHalfTimeSeconds()).toBe(2700);
  });

  it("returns the regulation full-time boundary", () => {
    expect(getFullTimeSeconds()).toBe(5400);
  });

  it("rejects negative or fractional elapsed seconds", () => {
    expect(() => getMatchMinute(-1)).toThrow(RangeError);
    expect(() => getMatchMinute(10.5)).toThrow(RangeError);
  });
});
