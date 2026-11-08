import type { MatchState } from "./match-state.js";

export interface MatchSnapshot {
  readonly version: 1;
  readonly state: MatchState;
}

/** Creates a portable snapshot containing match state and the current RNG state. */
export function snapshotMatch(state: MatchState): MatchSnapshot {
  return { version: 1, state: JSON.parse(JSON.stringify(state)) as MatchState };
}

/** Restores a snapshot produced by snapshotMatch, rejecting unknown formats. */
export function restoreMatch(snapshot: MatchSnapshot): MatchState {
  if (
    snapshot?.version !== 1 ||
    !snapshot.state ||
    !Number.isInteger(snapshot.state.rngState) ||
    !Array.isArray(snapshot.state.events) ||
    !Number.isInteger(snapshot.state.elapsedSeconds)
  ) {
    throw new TypeError("Invalid or unsupported match snapshot.");
  }

  return JSON.parse(JSON.stringify(snapshot.state)) as MatchState;
}
 
