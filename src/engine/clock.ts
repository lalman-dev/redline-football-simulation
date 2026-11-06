const HALF_DURATION_SECONDS = 45 * 60;

export function getMatchMinute(elapsedSeconds: number): number {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed seconds must be a non-negative integer.");
  }

  return Math.floor(elapsedSeconds / 60);
}

export function getHalfTimeSeconds(): number {
  return HALF_DURATION_SECONDS;
}

export function getFullTimeSeconds(): number {
  return HALF_DURATION_SECONDS * 2;
}
