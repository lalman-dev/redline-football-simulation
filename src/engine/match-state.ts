import type { Team, TeamSelection, TeamId, PlayerId } from "./types.js";
import type { MatchEvent, MatchPhase } from "./match-types.js";

export interface MatchScore {
  readonly home: number;
  readonly away: number;
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

  readonly events: readonly MatchEvent[];

  // Stored so a saved match can continue deterministically.
  readonly rngState: number;
}
