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

export interface SubstitutionRecord {
  readonly home: number;
  readonly away: number;
}

export interface SubstitutedOffPlayers {
  readonly home: readonly PlayerId[];
  readonly away: readonly PlayerId[];
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

  readonly ballPosition: PitchPosition;

  // Current coordinates for every active player on the pitch.
  readonly playerPositions: Readonly<Record<PlayerId, PitchPosition>>;

  readonly events: readonly MatchEvent[];

  // Stored so a saved match can continue deterministically.
  readonly rngState: number;

  readonly substitutionsUsed: SubstitutionRecord;
  readonly substitutedOffPlayers: SubstitutedOffPlayers;

  readonly substitutionWindowsUsed: SubstitutionRecord;
  readonly lastSubstitutionWindow: {
    readonly home: string | null;
    readonly away: string | null;
  };
}

export interface SubstitutionWindowRecord {
  readonly home: number;
  readonly away: number;
}

export interface LastSubstitutionWindow {
  readonly home: string | null;
  readonly away: string | null;
}
