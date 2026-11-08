import type { MatchState } from "./match-state.js";
import type { PlayerId, TeamId } from "./types.js";

export interface TeamMatchStatistics {
  readonly goals: number;
  readonly assists: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
  readonly passes: number;
  readonly successfulPasses: number;
  readonly tackles: number;
  readonly successfulTackles: number;
  readonly carries: number;
  readonly saves: number;
  readonly substitutions: number;
  readonly fouls: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly freeKicks: number;
  readonly possessionPercentage: number;
  readonly passAccuracy: number;
  readonly tackleSuccessPercentage: number;
}

export interface PlayerMatchStatistics extends TeamMatchStatistics {
  readonly playerId: PlayerId;
  readonly assists: number;
  readonly minutesPlayed: number;
}

export interface MatchStatistics {
  readonly home: TeamMatchStatistics;
  readonly away: TeamMatchStatistics;
  readonly players: Readonly<Record<PlayerId, PlayerMatchStatistics>>;
  readonly explanation: string;
}

const EMPTY_STATS: TeamMatchStatistics = {
  goals: 0,
  assists: 0,
  shots: 0,
  shotsOnTarget: 0,
  passes: 0,
  successfulPasses: 0,
  tackles: 0,
  successfulTackles: 0,
  carries: 0,
  saves: 0,
  substitutions: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  freeKicks: 0,
  possessionPercentage: 0,
  passAccuracy: 0,
  tackleSuccessPercentage: 0,
};

function calculateMinutes(state: MatchState): Record<PlayerId, number> {
  const minutes: Record<PlayerId, number> = {};
  const players = [...state.homeTeam.squad, ...state.awayTeam.squad];
  for (const player of players) minutes[player.id] = 0;
  const initialHome = new Set(state.homeSelection.startingXI);
  const initialAway = new Set(state.awaySelection.startingXI);
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index]!;
    if (event.type === "substitution" && event.playerId && event.targetPlayerId) {
      const initial = initialHome.has(event.playerId) || initialHome.has(event.targetPlayerId)
        ? initialHome
        : initialAway;
      initial.delete(event.playerId);
      initial.add(event.targetPlayerId);
    } else if (event.type === "red-card" && event.playerId) {
      const team = state.homeTeam.squad.some((player) => player.id === event.playerId)
        ? initialHome
        : initialAway;
      team.add(event.playerId);
    }
  }
  const active = new Set<PlayerId>([
    ...initialHome,
    ...initialAway,
  ]);
  let previousTime = 0;
  for (const event of state.events) {
    const at = Math.max(previousTime, Math.min(state.elapsedSeconds, event.elapsedSeconds));
    const seconds = at - previousTime;
    for (const id of active) minutes[id] = (minutes[id] ?? 0) + seconds;
    previousTime = at;
    if (event.type === "substitution" && event.playerId && event.targetPlayerId) {
      active.delete(event.targetPlayerId);
      active.add(event.playerId);
    } else if (event.type === "red-card" && event.playerId) {
      active.delete(event.playerId);
    }
  }
  for (const id of active) {
    minutes[id] = (minutes[id] ?? 0) + Math.max(0, state.elapsedSeconds - previousTime);
  }
  for (const id of Object.keys(minutes)) minutes[id] = Math.round(minutes[id]! / 6) / 10;
  return minutes;
}

function getPossessionSeconds(state: MatchState): Record<TeamId, number> {
  const homeId = state.homeTeam.id;
  const awayId = state.awayTeam.id;
  const playerTeam = new Map<PlayerId, TeamId>();
  for (const player of state.homeTeam.squad) playerTeam.set(player.id, homeId);
  for (const player of state.awayTeam.squad) playerTeam.set(player.id, awayId);
  const totals: Record<TeamId, number> = { [homeId]: 0, [awayId]: 0 };
  let possession: TeamId | null = null;
  let previousTime = 0;
  for (const event of state.events) {
    const at = Math.max(previousTime, Math.min(state.elapsedSeconds, event.elapsedSeconds));
    if (possession && totals[possession] !== undefined) totals[possession] = totals[possession]! + at - previousTime;
    previousTime = at;
    switch (event.type) {
      case "kickoff":
      case "carry":
        possession = event.teamId ?? possession;
        break;
      case "pass":
        possession = event.outcome === "successful"
          ? event.teamId ?? possession
          : (event.interceptedByPlayerId ? playerTeam.get(event.interceptedByPlayerId) ?? null : null);
        break;
      case "tackle":
        if (event.outcome === "successful") possession = event.teamId ?? possession;
        break;
      case "free-kick":
        possession = event.teamId ?? possession;
        break;
      case "shot":
        possession = event.teamId ? (event.teamId === homeId ? awayId : homeId) : possession;
        break;
      case "penalty":
        possession = event.teamId ? (event.teamId === homeId ? awayId : homeId) : possession;
        break;
      case "red-card":
      case "yellow-card":
      case "foul":
      case "save":
      case "goal":
      case "substitution":
      case "tactical-change":
      case "half-time":
      case "full-time":
      case "abandonment":
        break;
    }
  }
  if (possession && totals[possession] !== undefined) {
    totals[possession] = totals[possession]! + Math.max(0, state.elapsedSeconds - previousTime);
  }
  return totals;
}

function findAssists(state: MatchState): Record<PlayerId, number> {
  const result: Record<PlayerId, number> = {};
  for (let index = 0; index < state.events.length; index += 1) {
    const event = state.events[index]!;
    if (event.type !== "goal" || !event.playerId || !event.teamId) continue;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = state.events[cursor]!;
      if (previous.type === "kickoff" || previous.type === "goal" || previous.type === "free-kick" || previous.type === "penalty") break;
      if (previous.type === "shot") {
        if (previous.teamId === event.teamId && previous.playerId === event.playerId && previous.elapsedSeconds === event.elapsedSeconds) continue;
        break;
      }
      if (previous.type === "pass") {
        if (previous.teamId !== event.teamId || previous.outcome !== "successful") break;
        if (previous.playerId && previous.playerId !== event.playerId) {
          result[previous.playerId] = (result[previous.playerId] ?? 0) + 1;
        }
        break;
      }
      if (previous.type === "carry" && previous.teamId !== event.teamId) break;
      if (previous.type === "tackle" && previous.outcome === "successful") break;
    }
  }
  return result;
}

function ratio(successes: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((successes / attempts) * 1000) / 10;
}

function explain(state: MatchState, home: TeamMatchStatistics, away: TeamMatchStatistics): string {
  if (state.phase !== "full-time") return "Match explanation is available after full-time.";
  const winner = state.score.home === state.score.away
    ? null
    : state.score.home > state.score.away ? state.homeTeam.name : state.awayTeam.name;
  const lines = [winner ? `${winner} won ${state.score.home}–${state.score.away}.` : `The match finished ${state.score.home}–${state.score.away}.`];
  const homeShotsOnTarget = home.shotsOnTarget;
  const awayShotsOnTarget = away.shotsOnTarget;
  lines.push(`Shots on target: ${state.homeTeam.name} ${homeShotsOnTarget}, ${state.awayTeam.name} ${awayShotsOnTarget}.`);
  const homeConversion = ratio(home.goals, home.shots);
  const awayConversion = ratio(away.goals, away.shots);
  if (home.shots || away.shots) lines.push(`Shot conversion: ${state.homeTeam.name} ${homeConversion}%, ${state.awayTeam.name} ${awayConversion}%.`);
  lines.push(`Possession: ${state.homeTeam.name} ${home.possessionPercentage}%, ${state.awayTeam.name} ${away.possessionPercentage}%.`);
  if (home.saves !== away.saves) lines.push(`Goalkeeping: ${home.saves > away.saves ? state.homeTeam.name : state.awayTeam.name} recorded more saves.`);
  if (home.successfulPasses !== away.successfulPasses) lines.push(`Passing: ${home.successfulPasses} successful passes for ${state.homeTeam.name}, ${away.successfulPasses} for ${state.awayTeam.name}.`);
  if (home.successfulTackles !== away.successfulTackles) lines.push(`Defending: ${home.successfulTackles} successful tackles for ${state.homeTeam.name}, ${away.successfulTackles} for ${state.awayTeam.name}.`);
  if (home.redCards || away.redCards) lines.push(`Dismissals: ${state.homeTeam.name} ${home.redCards}, ${state.awayTeam.name} ${away.redCards}.`);
  if (home.substitutions || away.substitutions) lines.push(`Substitutions: ${state.homeTeam.name} ${home.substitutions}, ${state.awayTeam.name} ${away.substitutions}.`);
  const tacticalChanges = state.events.filter((event) => event.type === "tactical-change");
  if (tacticalChanges.length) lines.push(`Tactical changes: ${tacticalChanges.map((event) => event.description).join(" ")}`);
  return lines.join(" ");
}

function increment(
  source: TeamMatchStatistics,
  eventType: string,
  outcome: string | undefined,
): TeamMatchStatistics {
  switch (eventType) {
    case "goal": return { ...source, goals: source.goals + 1 };
    case "shot": return {
      ...source,
      shots: source.shots + 1,
      shotsOnTarget: source.shotsOnTarget + (outcome === "off-target" ? 0 : 1),
    };
    case "penalty": return {
      ...source,
      shots: source.shots + 1,
      shotsOnTarget: source.shotsOnTarget + (outcome === "off-target" ? 0 : 1),
    };
    case "pass": return {
      ...source,
      passes: source.passes + 1,
      successfulPasses: source.successfulPasses + (outcome === "successful" ? 1 : 0),
    };
    case "tackle": return {
      ...source,
      tackles: source.tackles + 1,
      successfulTackles: source.successfulTackles + (outcome === "successful" ? 1 : 0),
    };
    case "carry": return { ...source, carries: source.carries + 1 };
    case "save": return { ...source, saves: source.saves + 1 };
    case "substitution": return { ...source, substitutions: source.substitutions + 1 };
    case "foul": return { ...source, fouls: source.fouls + 1 };
    case "yellow-card": return { ...source, yellowCards: source.yellowCards + 1 };
    case "red-card": return { ...source, redCards: source.redCards + 1 };
    case "free-kick": return { ...source, freeKicks: source.freeKicks + 1 };
    default: return source;
  }
}

/** Derives statistics from the event log; no values are estimated. */
export function getMatchStatistics(state: MatchState): MatchStatistics {
  const teamStats: Record<TeamId, TeamMatchStatistics> = {
    [state.homeTeam.id]: EMPTY_STATS,
    [state.awayTeam.id]: EMPTY_STATS,
  };
  const playerStats: Record<PlayerId, PlayerMatchStatistics> = {};
  const assists = findAssists(state);
  const minutes = calculateMinutes(state);

  for (const event of state.events) {
    if (event.teamId && teamStats[event.teamId]) {
      teamStats[event.teamId] = increment(
        teamStats[event.teamId]!,
        event.type,
        event.outcome,
      );
    }
    if (event.playerId) {
      const current = playerStats[event.playerId] ?? {
        playerId: event.playerId,
        minutesPlayed: 0,
        ...EMPTY_STATS,
      };
      playerStats[event.playerId] = increment(current, event.type, event.outcome) as PlayerMatchStatistics;
    }
  }

  for (const player of [...state.homeTeam.squad, ...state.awayTeam.squad]) {
    const current = playerStats[player.id] ?? {
      playerId: player.id,
      minutesPlayed: 0,
      ...EMPTY_STATS,
    };
    playerStats[player.id] = {
      ...current,
      assists: assists[player.id] ?? 0,
      minutesPlayed: minutes[player.id] ?? 0,
      passAccuracy: ratio(current.successfulPasses, current.passes),
      tackleSuccessPercentage: ratio(current.successfulTackles, current.tackles),
    };
  }

  const possession = getPossessionSeconds(state);
  const totalPossession = possession[state.homeTeam.id]! + possession[state.awayTeam.id]!;
  const homePossession = totalPossession === 0 ? 50 : Math.round(possession[state.homeTeam.id]! / totalPossession * 1000) / 10;
  const awayPossession = totalPossession === 0 ? 50 : Math.round((100 - homePossession) * 10) / 10;
  teamStats[state.homeTeam.id] = { ...teamStats[state.homeTeam.id]!, possessionPercentage: homePossession, passAccuracy: ratio(teamStats[state.homeTeam.id]!.successfulPasses, teamStats[state.homeTeam.id]!.passes), tackleSuccessPercentage: ratio(teamStats[state.homeTeam.id]!.successfulTackles, teamStats[state.homeTeam.id]!.tackles) };
  teamStats[state.awayTeam.id] = { ...teamStats[state.awayTeam.id]!, possessionPercentage: awayPossession, passAccuracy: ratio(teamStats[state.awayTeam.id]!.successfulPasses, teamStats[state.awayTeam.id]!.passes), tackleSuccessPercentage: ratio(teamStats[state.awayTeam.id]!.successfulTackles, teamStats[state.awayTeam.id]!.tackles) };
  const homePlayerIds = new Set(state.homeTeam.squad.map((player) => player.id));
  teamStats[state.homeTeam.id] = { ...teamStats[state.homeTeam.id]!, assists: Object.entries(assists).reduce((sum, [id, count]) => sum + (homePlayerIds.has(id) ? count : 0), 0) };
  teamStats[state.awayTeam.id] = { ...teamStats[state.awayTeam.id]!, assists: Object.entries(assists).reduce((sum, [id, count]) => sum + (!homePlayerIds.has(id) ? count : 0), 0) };

  return {
    home: teamStats[state.homeTeam.id]!,
    away: teamStats[state.awayTeam.id]!,
    players: playerStats,
    explanation: explain(state, teamStats[state.homeTeam.id]!, teamStats[state.awayTeam.id]!),
  };
}
