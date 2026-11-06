import type { TeamId, PlayerId } from "./types.js";

export type MatchPhase =
  | "first-half"
  | "half-time"
  | "second-half"
  | "full-time";

export type MatchEventType =
  | "kickoff"
  | "pass"
  | "tackle"
  | "shot"
  | "save"
  | "goal"
  | "half-time"
  | "full-time";

export interface MatchEvent {
  readonly id: number;
  readonly type: MatchEventType;
  readonly minute: number;
  readonly elapsedSeconds: number;
  readonly teamId?: TeamId;
  readonly playerId?: PlayerId;
  readonly description: string;
  readonly targetPlayerId?: PlayerId;
  readonly interceptedByPlayerId?: PlayerId;
  readonly outcome?:
    | "successful"
    | "unsuccessful"
    | "goal"
    | "saved"
    | "off-target";
}
