import type { MatchState } from "./match-state.js";
import type { PlayerId, TeamId } from "./types.js";

export interface TeamMatchStatistics {
  readonly goals: number;
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
}

export interface PlayerMatchStatistics extends TeamMatchStatistics {
  readonly playerId: PlayerId;
}

export interface MatchStatistics {
  readonly home: TeamMatchStatistics;
  readonly away: TeamMatchStatistics;
  readonly players: Readonly<Record<PlayerId, PlayerMatchStatistics>>;
}

const EMPTY_STATS: TeamMatchStatistics = {
  goals: 0,
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
};

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
        ...EMPTY_STATS,
      };
      playerStats[event.playerId] = increment(current, event.type, event.outcome) as PlayerMatchStatistics;
    }
  }

  return {
    home: teamStats[state.homeTeam.id]!,
    away: teamStats[state.awayTeam.id]!,
    players: playerStats,
  };
}
