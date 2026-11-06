import { describe, expect, it } from "vitest";
import { capActionDuration } from "../match-clock.js";
import {
  getClockTransition,
  getRemainingPhaseSeconds,
} from "../match-clock.js";

describe("getClockTransition", () => {
  it("returns first half before 45 minutes", () => {
    expect(getClockTransition(2699).phase).toBe("first-half");
  });

  it("returns half-time at 45 minutes", () => {
    expect(getClockTransition(2700)).toEqual({
      phase: "half-time",
      elapsedSeconds: 2700,
    });
  });

  it("returns second half after half-time", () => {
    expect(getClockTransition(2701).phase).toBe("second-half");
  });

  it("returns full-time at 90 minutes", () => {
    expect(getClockTransition(5400)).toEqual({
      phase: "full-time",
      elapsedSeconds: 5400,
    });
  });

  it("does not allow time beyond full-time", () => {
    expect(getClockTransition(6000)).toEqual({
      phase: "full-time",
      elapsedSeconds: 5400,
    });
  });

  it("rejects invalid elapsed time", () => {
    expect(() => getClockTransition(-1)).toThrow(RangeError);
    expect(() => getClockTransition(1.5)).toThrow(RangeError);
  });
});

describe("getRemainingPhaseSeconds", () => {
  it("returns remaining first-half time", () => {
    expect(getRemainingPhaseSeconds(2600)).toBe(100);
  });

  it("returns remaining second-half time", () => {
    expect(getRemainingPhaseSeconds(5300)).toBe(100);
  });

  it("returns zero at half-time and full-time", () => {
    expect(getRemainingPhaseSeconds(2700)).toBe(0);
    expect(getRemainingPhaseSeconds(5400)).toBe(0);
  });
});

describe("capActionDuration", () => {
  it("preserves duration when it fits inside the half", () => {
    expect(capActionDuration(100, 5)).toBe(5);
  });

  it("caps duration at half-time", () => {
    expect(capActionDuration(2698, 5)).toBe(2);
  });

  it("caps duration at full-time", () => {
    expect(capActionDuration(5398, 5)).toBe(2);
  });

  it("returns zero when the match has reached a boundary", () => {
    expect(capActionDuration(2700, 5)).toBe(0);
    expect(capActionDuration(5400, 5)).toBe(0);
  });

  it("rejects invalid durations", () => {
    expect(() => capActionDuration(100, 0)).toThrow(RangeError);
    expect(() => capActionDuration(100, 1.5)).toThrow(RangeError);
  });
});
