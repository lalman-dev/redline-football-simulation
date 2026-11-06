import type { MatchPhase } from "./match-types.js";

export const HALF_DURATION_SECONDS = 45 * 60;
export const FULL_TIME_SECONDS = HALF_DURATION_SECONDS * 2;

export interface ClockTransition {
  readonly phase: MatchPhase;
  readonly elapsedSeconds: number;
}

export function getClockTransition(elapsedSeconds: number): ClockTransition {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed time must be a non-negative integer.");
  }

  if (elapsedSeconds < HALF_DURATION_SECONDS) {
    return {
      phase: "first-half",
      elapsedSeconds,
    };
  }

  if (elapsedSeconds === HALF_DURATION_SECONDS) {
    return {
      phase: "half-time",
      elapsedSeconds,
    };
  }

  if (elapsedSeconds < FULL_TIME_SECONDS) {
    return {
      phase: "second-half",
      elapsedSeconds,
    };
  }

  return {
    phase: "full-time",
    elapsedSeconds: FULL_TIME_SECONDS,
  };
}

export function getRemainingPhaseSeconds(
  elapsedSeconds: number,
  phase?: MatchPhase,
): number {
  // Validate elapsed time.
  getClockTransition(elapsedSeconds);

  if (phase === "second-half") {
    return Math.max(0, FULL_TIME_SECONDS - elapsedSeconds);
  }

  if (phase === "first-half") {
    return Math.max(0, HALF_DURATION_SECONDS - elapsedSeconds);
  }

  const transition = getClockTransition(elapsedSeconds);

  if (transition.phase === "first-half") {
    return HALF_DURATION_SECONDS - elapsedSeconds;
  }

  if (transition.phase === "second-half") {
    return FULL_TIME_SECONDS - elapsedSeconds;
  }

  return 0;
}

export function capActionDuration(
  elapsedSeconds: number,
  proposedDuration: number,
  phase?: MatchPhase,
): number {
  if (!Number.isInteger(proposedDuration) || proposedDuration < 1) {
    throw new RangeError("Action duration must be a positive integer.");
  }

  const remaining = getRemainingPhaseSeconds(elapsedSeconds, phase);

  if (remaining === 0) {
    return 0;
  }

  return Math.min(proposedDuration, remaining);
}
