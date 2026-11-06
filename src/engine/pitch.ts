import type { PitchPosition } from "./match-state.js";

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export const PITCH_CENTER: PitchPosition = {
  x: PITCH_LENGTH / 2,
  y: PITCH_WIDTH / 2,
};

export function isValidPitchPosition(position: PitchPosition): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= PITCH_LENGTH &&
    position.y >= 0 &&
    position.y <= PITCH_WIDTH
  );
}

export function getDistance(from: PitchPosition, to: PitchPosition): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function getOpponentGoalX(attackingRight: boolean): number {
  return attackingRight ? PITCH_LENGTH : 0;
}

export function getDistanceToOpponentGoal(
  position: PitchPosition,
  attackingRight: boolean,
): number {
  return Math.abs(getOpponentGoalX(attackingRight) - position.x);
}

export function clampPitchPosition(position: PitchPosition): PitchPosition {
  return {
    x: Math.max(0, Math.min(PITCH_LENGTH, position.x)),
    y: Math.max(0, Math.min(PITCH_WIDTH, position.y)),
  };
}

// Moves the ball along the pitch while respecting its boundaries.
export function moveBall(
  current: PitchPosition,
  attackingRight: boolean,
  forwardDistance: number,
  lateralDistance: number,
): PitchPosition {
  return clampPitchPosition({
    x: current.x + (attackingRight ? forwardDistance : -forwardDistance),
    y: current.y + lateralDistance,
  });
}
