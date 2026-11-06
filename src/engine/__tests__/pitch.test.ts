import { describe, expect, it } from "vitest";
import {
  PITCH_LENGTH,
  PITCH_WIDTH,
  PITCH_CENTER,
  isValidPitchPosition,
  getDistance,
  getOpponentGoalX,
  getDistanceToOpponentGoal,
  clampPitchPosition,
} from "../pitch.js";

describe("pitch utilities", () => {
  it("uses standard pitch dimensions", () => {
    expect(PITCH_LENGTH).toBe(105);
    expect(PITCH_WIDTH).toBe(68);
    expect(PITCH_CENTER).toEqual({ x: 52.5, y: 34 });
  });

  it("accepts valid pitch coordinates", () => {
    expect(isValidPitchPosition({ x: 0, y: 0 })).toBe(true);
    expect(isValidPitchPosition({ x: 105, y: 68 })).toBe(true);
    expect(isValidPitchPosition(PITCH_CENTER)).toBe(true);
  });

  it("rejects coordinates outside the pitch", () => {
    expect(isValidPitchPosition({ x: -1, y: 34 })).toBe(false);
    expect(isValidPitchPosition({ x: 106, y: 34 })).toBe(false);
    expect(isValidPitchPosition({ x: 52.5, y: 69 })).toBe(false);
    expect(isValidPitchPosition({ x: 52.5, y: -1 })).toBe(false);
  });

  it("calculates distance between two positions", () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("identifies the opponent goal based on attack direction", () => {
    expect(getOpponentGoalX(true)).toBe(105);
    expect(getOpponentGoalX(false)).toBe(0);
  });

  it("calculates distance to the opponent goal", () => {
    expect(getDistanceToOpponentGoal({ x: 80, y: 34 }, true)).toBe(25);

    expect(getDistanceToOpponentGoal({ x: 80, y: 34 }, false)).toBe(80);
  });

  it("clamps positions to pitch boundaries", () => {
    expect(clampPitchPosition({ x: 120, y: -5 })).toEqual({
      x: 105,
      y: 0,
    });
  });
});
