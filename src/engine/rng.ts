const UINT32_MAX = 0xffffffff;
const UINT32_RANGE = 0x1_0000_0000;
const MULBERRY_INCREMENT = 0x6d2b79f5;

export interface RandomGenerator {
  next(): number;
  getState(): number;
  setState(state: number): void;
}

function validateState(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError("RNG state must be an unsigned 32-bit integer.");
  }
}

export function createRng(seed: number): RandomGenerator {
  validateState(seed);

  let state = seed;

  return {
    next(): number {
      state = (state + MULBERRY_INCREMENT) >>> 0;

      let value = state;

      value = Math.imul(value ^ (value >>> 15), value | 1);

      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

      return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
    },

    getState(): number {
      return state;
    },

    setState(nextState: number): void {
      validateState(nextState);
      state = nextState;
    },
  };
}
