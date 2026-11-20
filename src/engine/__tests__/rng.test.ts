import { describe, expect, it } from "vitest";
import { createRng } from "../rng.js";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createRng(12345);
    const second = createRng(12345);

    const firstSequence = Array.from({ length: 5 }, () => first.next());

    const secondSequence = Array.from({ length: 5 }, () => second.next());

    expect(firstSequence).toEqual(secondSequence);
  });

  it("produces different streams from different seeds", () => {
    const first = createRng(12345);
    const second = createRng(12346);
    expect(Array.from({ length: 10 }, () => first.next())).not.toEqual(
      Array.from({ length: 10 }, () => second.next()),
    );
  });

  it("produces values between 0 and 1", () => {
    const rng = createRng(42);

    for (let i = 0; i < 1000; i++) {
      const value = rng.next();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("restores the sequence from a saved state", () => {
    const rng = createRng(123);

    rng.next();
    rng.next();

    const savedState = rng.getState();
    const expectedNextValue = rng.next();

    rng.setState(savedState);

    expect(rng.next()).toBe(expectedNextValue);
  });

  it("rejects invalid seeds", () => {
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(0x1_0000_0000)).toThrow(RangeError);
  });

  it("rejects invalid restored states", () => {
    const rng = createRng(123);

    expect(() => rng.setState(-1)).toThrow(RangeError);
    expect(() => rng.setState(1.5)).toThrow(RangeError);
  });
});
