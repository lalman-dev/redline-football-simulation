import type { MatchPhase } from "./match-types.js";

export const HALF_DURATION_SECONDS = 45 * 60;
export const FULL_TIME_SECONDS = HALF_DURATION_SECONDS * 2;

export interface ClockTransition {
  readonly phase: MatchPhase;
  readonly elapsedSeconds: number;
}

export function getClockTransition(
  elapsedSeconds: number,
  firstHalfAddedTimeSeconds = 0,
  secondHalfAddedTimeSeconds = 0,
): ClockTransition {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed time must be a non-negative integer.");
  }

  if (
    !Number.isInteger(firstHalfAddedTimeSeconds) || firstHalfAddedTimeSeconds < 0 ||
    !Number.isInteger(secondHalfAddedTimeSeconds) || secondHalfAddedTimeSeconds < 0
  ) {
    throw new RangeError("Added time must be non-negative whole seconds.");
  }

  const halfTimeSeconds = HALF_DURATION_SECONDS + firstHalfAddedTimeSeconds;
  const fullTimeSeconds = FULL_TIME_SECONDS + firstHalfAddedTimeSeconds + secondHalfAddedTimeSeconds;

  if (elapsedSeconds < halfTimeSeconds) {
    return {
      phase: "first-half",
      elapsedSeconds,
    };
  }

  if (elapsedSeconds === halfTimeSeconds) {
    return {
      phase: "half-time",
      elapsedSeconds,
    };
  }

  if (elapsedSeconds < fullTimeSeconds) {
    return {
      phase: "second-half",
      elapsedSeconds,
    };
  }

  return {
    phase: "full-time",
    elapsedSeconds: fullTimeSeconds,
  };
}

export function getRemainingPhaseSeconds(
  elapsedSeconds: number,
  phase?: MatchPhase,
  firstHalfAddedTimeSeconds = 0,
  secondHalfAddedTimeSeconds = 0,
): number {
  // Validate elapsed time.
  const transition = getClockTransition(
    elapsedSeconds,
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
  );
  const halfTimeSeconds = HALF_DURATION_SECONDS + firstHalfAddedTimeSeconds;
  const fullTimeSeconds = FULL_TIME_SECONDS + firstHalfAddedTimeSeconds + secondHalfAddedTimeSeconds;

  if (phase === "second-half") {
    return Math.max(0, fullTimeSeconds - elapsedSeconds);
  }

  if (phase === "first-half") {
    return Math.max(0, halfTimeSeconds - elapsedSeconds);
  }

  if (transition.phase === "first-half") {
    return halfTimeSeconds - elapsedSeconds;
  }

  if (transition.phase === "second-half") {
    return fullTimeSeconds - elapsedSeconds;
  }

  return 0;
}

export function capActionDuration(
  elapsedSeconds: number,
  proposedDuration: number,
  phase?: MatchPhase,
  firstHalfAddedTimeSeconds = 0,
  secondHalfAddedTimeSeconds = 0,
): number {
  if (!Number.isInteger(proposedDuration) || proposedDuration < 1) {
    throw new RangeError("Action duration must be a positive integer.");
  }

  const remaining = getRemainingPhaseSeconds(
    elapsedSeconds,
    phase,
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
  );

  if (remaining === 0) {
    return 0;
  }

  return Math.min(proposedDuration, remaining);
}
