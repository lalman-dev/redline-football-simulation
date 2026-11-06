import type { Team, TeamSelection, TeamId, PlayerId } from "./types.js";
import type { MatchEvent, MatchPhase } from "./match-types.js";

export interface MatchScore {
  readonly home: number;
  readonly away: number;
}
export interface PitchPosition {
  // Lengthwise position in metres: 0 to 105.
  readonly x: number;

  // Widthwise position in metres: 0 to 68.
  readonly y: number;
}

export interface MatchState {
  readonly homeTeam: Team;
  readonly awayTeam: Team;

  readonly homeSelection: TeamSelection;
  readonly awaySelection: TeamSelection;

  readonly phase: MatchPhase;
  readonly elapsedSeconds: number;
  readonly score: MatchScore;

  readonly possessionTeamId: TeamId | null;
  readonly ballCarrierId: PlayerId | null;

  // Current ball location on the pitch.
  readonly ballPosition: PitchPosition;

  readonly events: readonly MatchEvent[];

  // Stored so a saved match can continue deterministically.
  readonly rngState: number;
}
