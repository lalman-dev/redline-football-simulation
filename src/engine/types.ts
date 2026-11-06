export type PlayerId = string;
export type TeamId = string;

//football positions.
export type PlayerPosition =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "DM"
  | "CM"
  | "AM"
  | "LW"
  | "RW"
  | "ST";

export interface PlayerAttributes {
  readonly passing: number;
  readonly shooting: number;
  readonly dribbling: number;
  readonly tackling: number;
  readonly positioning: number;
  readonly pace: number;
  readonly stamina: number;
  readonly strength: number;
  readonly goalkeeping: number;
  readonly finishing: number;
  readonly decisionMaking: number;
}

// A footballer's profile and playing positions.
export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly age: number;
  readonly primaryPosition: PlayerPosition;
  readonly secondaryPositions: readonly PlayerPosition[];
  readonly attributes: PlayerAttributes;
}

// A team's collection of players.
export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly squad: readonly Player[];
}

// Formation describes the ten outfield players.
// The goalkeeper is counted separately.
export interface Formation {
  readonly defenders: number;
  readonly midfielders: number;
  readonly forwards: number;
}

// Tactical settings use a scale from 1 to 100.
export interface Tactics {
  readonly mentality: number;
  readonly pressing: number;
  readonly tempo: number;
  readonly width: number;
  readonly defensiveLine: number;
}

// A team's selection for a particular match.
export interface TeamSelection {
  readonly teamId: TeamId;
  readonly startingXI: readonly PlayerId[];
  readonly substitutes: readonly PlayerId[];
  readonly formation: Formation;
  readonly tactics: Tactics;
}
