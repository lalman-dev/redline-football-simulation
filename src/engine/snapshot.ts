import type { MatchState } from "./match-state.js";

const phases = new Set(["first-half", "half-time", "second-half", "full-time"]);
const eventTypes = new Set([
  "kickoff", "pass", "carry", "tackle", "shot", "save", "goal",
  "substitution", "tactical-change", "foul", "free-kick", "penalty", "yellow-card",
  "red-card", "abandonment", "half-time", "full-time",
]);
const positions = new Set(["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"]);
const attributeNames = ["passing", "shooting", "dribbling", "tackling", "positioning", "pace", "stamina", "strength", "goalkeeping", "finishing", "decisionMaking"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validTeam(team: unknown): boolean {
  if (!isRecord(team) || typeof team.id !== "string" || typeof team.name !== "string" || !Array.isArray(team.squad)) return false;
  const ids = new Set<string>();
  return team.squad.every((player) => {
    if (!isRecord(player) || typeof player.id !== "string" || typeof player.name !== "string" || !isRecord(player.attributes)) return false;
    const attributes = player.attributes;
    if (ids.has(player.id) || !Number.isInteger(player.age) || !positions.has(String(player.primaryPosition)) || !isStringArray(player.secondaryPositions) || player.secondaryPositions.some((p) => !positions.has(p))) return false;
    ids.add(player.id);
    return attributeNames.every((name) => typeof attributes[name] === "number" && Number.isFinite(attributes[name]) && (attributes[name] as number) >= 1 && (attributes[name] as number) <= 100);
  });
}

function validSelection(selection: unknown, team: Record<string, unknown>): boolean {
  if (!isRecord(selection) || selection.teamId !== team.id || !isStringArray(selection.startingXI) || !isStringArray(selection.substitutes) || !isRecord(selection.formation) || !isRecord(selection.tactics)) return false;
  const starters = selection.startingXI;
  const substitutes = selection.substitutes;
  if (starters.length < 7 || starters.length > 11 || new Set(starters).size !== starters.length || new Set(substitutes).size !== substitutes.length || starters.some((id) => substitutes.includes(id))) return false;
  const squad = team.squad as Array<Record<string, unknown>>;
  const squadIds = new Set(squad.map((p) => p.id));
  if ([...starters, ...substitutes].some((id) => !squadIds.has(id))) return false;
  if (starters.filter((id) => squad.find((p) => p.id === id)?.primaryPosition === "GK").length !== 1) return false;
  const form = selection.formation;
  const lines = [form.defenders, form.midfielders, form.forwards];
  if (lines.some((n) => !Number.isInteger(n) || (n as number) < 1) || lines.reduce<number>((sum, n) => sum + (n as number), 0) !== 10) return false;
  return Object.values(selection.tactics).length > 0 && Object.values(selection.tactics).every((n) => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 100);
}

function validState(value: unknown): value is MatchState {
  if (!isRecord(value) || !validTeam(value.homeTeam) || !validTeam(value.awayTeam)) return false;
  const state = value;
  const homeTeam = state.homeTeam as Record<string, unknown>;
  const awayTeam = state.awayTeam as Record<string, unknown>;
  if (homeTeam.id === awayTeam.id || !validSelection(state.homeSelection, homeTeam) || !validSelection(state.awaySelection, awayTeam)) return false;
  if (typeof state.phase !== "string" || !phases.has(state.phase) || !Number.isInteger(state.elapsedSeconds) || (state.elapsedSeconds as number) < 0 || !Number.isInteger(state.rngState) || (state.rngState as number) < 0 || (state.rngState as number) > 0xffffffff) return false;
  if (![state.firstHalfAddedTimeSeconds, state.secondHalfAddedTimeSeconds].every((n) => Number.isInteger(n) && (n as number) >= 0)) return false;
  if (!isRecord(state.score) || ![state.score.home, state.score.away].every((n) => Number.isInteger(n) && (n as number) >= 0)) return false;
  if (!isRecord(state.yellowCards) || !Object.values(state.yellowCards).every((n) => Number.isInteger(n) && (n as number) >= 0) || !isStringArray(state.dismissedPlayerIds)) return false;
  if (!(state.possessionTeamId === null || state.possessionTeamId === homeTeam.id || state.possessionTeamId === awayTeam.id) || !(state.ballCarrierId === null || typeof state.ballCarrierId === "string")) return false;
  const position = (p: unknown): boolean => isRecord(p) && typeof p.x === "number" && Number.isFinite(p.x) && p.x >= 0 && p.x <= 105 && typeof p.y === "number" && Number.isFinite(p.y) && p.y >= 0 && p.y <= 68;
  if (!position(state.ballPosition) || !isRecord(state.playerPositions) || !Object.values(state.playerPositions).every(position)) return false;
  if (!Array.isArray(state.events) || !state.events.every((e, i) => isRecord(e) && e.id === i + 1 && typeof e.type === "string" && eventTypes.has(e.type) && Number.isInteger(e.minute) && Number.isInteger(e.elapsedSeconds) && (e.elapsedSeconds as number) >= 0 && (e.elapsedSeconds as number) <= (state.elapsedSeconds as number) && typeof e.description === "string" && (e.shotDistanceMeters === undefined || (typeof e.shotDistanceMeters === "number" && Number.isFinite(e.shotDistanceMeters) && e.shotDistanceMeters >= 0 && e.shotDistanceMeters <= 105)) && (e.shotLocation === undefined || position(e.shotLocation)) && (i === 0 || (e.elapsedSeconds as number) >= ((state.events as Array<Record<string, unknown>>)[i - 1]!.elapsedSeconds as number)))) return false;
  if (!isRecord(state.substitutionsUsed) || !isRecord(state.substitutedOffPlayers) || !isRecord(state.substitutionWindowsUsed) || !isRecord(state.lastSubstitutionWindow)) return false;
  for (const side of ["home", "away"] as const) {
    if (!Number.isInteger(state.substitutionsUsed[side]) || !isStringArray(state.substitutedOffPlayers[side]) || !Number.isInteger(state.substitutionWindowsUsed[side]) || !(state.lastSubstitutionWindow[side] === null || typeof state.lastSubstitutionWindow[side] === "string")) return false;
  }
  if (state.possessionTeamId === null ? state.ballCarrierId !== null : state.ballCarrierId === null) return false;
  return true;
}

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
    !validState(snapshot.state)
  ) {
    throw new TypeError("Invalid or unsupported match snapshot.");
  }

  return JSON.parse(JSON.stringify(snapshot.state)) as MatchState;
}
 
