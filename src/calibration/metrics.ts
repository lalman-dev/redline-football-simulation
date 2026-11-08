import type { MatchState } from "../engine/match-state.js";
import type { PlayerPosition } from "../engine/types.js";

export interface ShotCount {
  readonly shots: number;
  readonly goals: number;
  readonly saves: number;
  readonly misses: number;
}

export interface MatchMetrics {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly totalGoals: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
  readonly goals: number;
  readonly saves: number;
  readonly passes: number;
  readonly successfulPasses: number;
  readonly tackles: number;
  readonly successfulTackles: number;
  readonly fouls: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly penalties: number;
  readonly penaltyGoals: number;
  readonly penaltySaves: number;
  readonly penaltyMisses: number;
  readonly misses: number;
  readonly shotsByPosition: Readonly<Record<PlayerPosition, ShotCount>>;
  readonly shotsByDistance: Readonly<Record<string, ShotCount>>;
  readonly openPlayShotsByPosition: Readonly<Record<PlayerPosition, ShotCount>>;
  readonly openPlayShotsByDistance: Readonly<Record<string, ShotCount>>;
  readonly goalkeeperStats: Readonly<Record<string, { readonly faced: number; readonly saves: number; readonly goalsConceded: number }>>;
}

export interface CalibrationReport {
  readonly matchesPlayed: number;
  readonly matchesCompleted: number;
  readonly matchesFailed: number;
  readonly homeWins: number;
  readonly draws: number;
  readonly awayWins: number;
  readonly totalGoals: number;
  readonly totalGoalEvents: number;
  readonly goalEventMismatchMatches: number;
  readonly averageGoals: number;
  readonly totalShots: number;
  readonly averageShots: number;
  readonly shotsOnTarget: number;
  readonly totalSaves: number;
  readonly totalPasses: number;
  readonly successfulPasses: number;
  readonly totalTackles: number;
  readonly successfulTackles: number;
  readonly totalFouls: number;
  readonly totalYellowCards: number;
  readonly totalRedCards: number;
  readonly totalPenalties: number;
  readonly penaltyGoals: number;
  readonly penaltySaves: number;
  readonly penaltyMisses: number;
  readonly totalMisses: number;
  readonly shotsByPosition: Readonly<Record<PlayerPosition, ShotCount>>;
  readonly shotsByDistance: Readonly<Record<string, ShotCount>>;
  readonly openPlayShotsByPosition: Readonly<Record<PlayerPosition, ShotCount>>;
  readonly openPlayShotsByDistance: Readonly<Record<string, ShotCount>>;
  readonly goalkeeperStats: Readonly<Record<string, { readonly faced: number; readonly saves: number; readonly goalsConceded: number }>>;
  readonly goalDistribution: Readonly<Record<string, number>>;
  readonly commonScorelines: readonly { readonly scoreline: string; readonly matches: number }[];
}

export function collectMatchMetrics(state: MatchState): MatchMetrics {
  const shots = state.events.filter((event) => event.type === "shot" || event.type === "penalty");
  const players = new Map([...state.homeTeam.squad, ...state.awayTeam.squad].map((player) => [player.id, player]));
  const positionStats = Object.fromEntries(([
    "GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST",
  ] as PlayerPosition[]).map((position) => [position, { shots: 0, goals: 0, saves: 0, misses: 0 }])) as Record<PlayerPosition, { shots: number; goals: number; saves: number; misses: number }>;
  const openPlayPositionStats = Object.fromEntries(([
    "GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST",
  ] as PlayerPosition[]).map((position) => [position, { shots: 0, goals: 0, saves: 0, misses: 0 }])) as Record<PlayerPosition, { shots: number; goals: number; saves: number; misses: number }>;
  const distanceStats: Record<string, { shots: number; goals: number; saves: number; misses: number }> = {
    "0–12m": { shots: 0, goals: 0, saves: 0, misses: 0 },
    "12–25m": { shots: 0, goals: 0, saves: 0, misses: 0 },
    "25m+": { shots: 0, goals: 0, saves: 0, misses: 0 },
    "unknown": { shots: 0, goals: 0, saves: 0, misses: 0 },
  };
  const openPlayDistanceStats: Record<string, { shots: number; goals: number; saves: number; misses: number }> = Object.fromEntries(Object.keys(distanceStats).map((band) => [band, { shots: 0, goals: 0, saves: 0, misses: 0 }]));
  const goalkeepers: Record<string, { faced: number; saves: number; goalsConceded: number }> = {};
  for (const event of shots) {
    const position = event.playerId ? players.get(event.playerId)?.primaryPosition : undefined;
    const band = event.shotDistanceMeters === undefined ? "unknown" : event.shotDistanceMeters <= 12 ? "0–12m" : event.shotDistanceMeters <= 25 ? "12–25m" : "25m+";
    const groups = [position ? positionStats[position] : undefined, distanceStats[band]];
    for (const group of groups) {
      if (!group) continue;
      group.shots += 1;
      if (event.outcome === "goal") group.goals += 1;
      if (event.outcome === "saved") group.saves += 1;
      if (event.outcome === "off-target") group.misses += 1;
    }
    if (event.type === "shot") {
      const openPlayGroups = [position ? openPlayPositionStats[position] : undefined, openPlayDistanceStats[band]];
      for (const group of openPlayGroups) {
        if (!group) continue;
        group.shots += 1;
        if (event.outcome === "goal") group.goals += 1;
        if (event.outcome === "saved") group.saves += 1;
        if (event.outcome === "off-target") group.misses += 1;
      }
    }
    const goalkeeperId = event.targetPlayerId;
    if (goalkeeperId && event.outcome !== "off-target") {
      const keeper = goalkeepers[goalkeeperId] ??= { faced: 0, saves: 0, goalsConceded: 0 };
      keeper.faced += 1;
      if (event.outcome === "saved") keeper.saves += 1;
      if (event.outcome === "goal") keeper.goalsConceded += 1;
    }
  }
  const passes = state.events.filter((event) => event.type === "pass");
  const tackles = state.events.filter((event) => event.type === "tackle");

  return {
    homeGoals: state.score.home,
    awayGoals: state.score.away,
    totalGoals: state.score.home + state.score.away,
    shots: shots.length,
    shotsOnTarget: shots.filter((event) => event.outcome !== "off-target")
      .length,
    goals: state.events.filter((event) => event.type === "goal").length,
    saves: state.events.filter((event) => event.type === "save").length,
    passes: passes.length,
    successfulPasses: passes.filter((event) => event.outcome === "successful")
      .length,
    tackles: tackles.length,
    successfulTackles: tackles.filter((event) => event.outcome === "successful")
      .length,
    fouls: state.events.filter((event) => event.type === "foul").length,
    yellowCards: state.events.filter((event) => event.type === "yellow-card").length,
    redCards: state.events.filter((event) => event.type === "red-card").length,
    penalties: state.events.filter((event) => event.type === "penalty").length,
    penaltyGoals: state.events.filter((event) => event.type === "penalty" && event.outcome === "goal").length,
    penaltySaves: state.events.filter((event) => event.type === "penalty" && event.outcome === "saved").length,
    penaltyMisses: state.events.filter((event) => event.type === "penalty" && event.outcome === "off-target").length,
    misses: shots.filter((event) => event.outcome === "off-target").length,
    shotsByPosition: positionStats,
    shotsByDistance: distanceStats,
    openPlayShotsByPosition: openPlayPositionStats,
    openPlayShotsByDistance: openPlayDistanceStats,
    goalkeeperStats: goalkeepers,
  };
}

export function createCalibrationReport(
  results: readonly MatchState[],
  matchesFailed = 0,
): CalibrationReport {
  const metrics = results.map(collectMatchMetrics);
  const matchesPlayed = results.length;
  const matchesCompleted = results.filter(
    (match) => match.phase === "full-time",
  ).length;

  const homeWins = results.filter(
    (match) => match.score.home > match.score.away,
  ).length;

  const awayWins = results.filter(
    (match) => match.score.away > match.score.home,
  ).length;

  const draws = matchesPlayed - homeWins - awayWins;

  const totalGoals = metrics.reduce((sum, match) => sum + match.totalGoals, 0);

  const goalDistribution: Record<string, number> = {
    "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5+": 0,
  };
  const scorelines = new Map<string, number>();
  for (const match of results) {
    const bucket = match.score.home + match.score.away;
    const key = bucket >= 5 ? "5+" : String(bucket);
    goalDistribution[key] = (goalDistribution[key] ?? 0) + 1;
    const scoreline = `${match.score.home}-${match.score.away}`;
    scorelines.set(scoreline, (scorelines.get(scoreline) ?? 0) + 1);
  }

  const totalShots = metrics.reduce((sum, match) => sum + match.shots, 0);

  const shotsOnTarget = metrics.reduce(
    (sum, match) => sum + match.shotsOnTarget,
    0,
  );

  return {
    matchesPlayed,
    matchesCompleted,
    matchesFailed,
    homeWins,
    draws,
    awayWins,
    totalGoals,
    totalGoalEvents: metrics.reduce((sum, match) => sum + match.goals, 0),
    goalEventMismatchMatches: metrics.filter((match) => match.goals !== match.totalGoals).length,
    averageGoals: matchesPlayed > 0 ? totalGoals / matchesPlayed : 0,
    totalShots,
    averageShots: matchesPlayed > 0 ? totalShots / matchesPlayed : 0,
    shotsOnTarget,
    totalSaves: metrics.reduce((sum, match) => sum + match.saves, 0),
    totalPasses: metrics.reduce((sum, match) => sum + match.passes, 0),
    successfulPasses: metrics.reduce(
      (sum, match) => sum + match.successfulPasses,
      0,
    ),
    totalTackles: metrics.reduce((sum, match) => sum + match.tackles, 0),
    successfulTackles: metrics.reduce(
      (sum, match) => sum + match.successfulTackles,
      0,
    ),
    totalFouls: metrics.reduce((sum, match) => sum + match.fouls, 0),
    totalYellowCards: metrics.reduce((sum, match) => sum + match.yellowCards, 0),
    totalRedCards: metrics.reduce((sum, match) => sum + match.redCards, 0),
    totalPenalties: metrics.reduce((sum, match) => sum + match.penalties, 0),
    penaltyGoals: metrics.reduce((sum, match) => sum + match.penaltyGoals, 0),
    penaltySaves: metrics.reduce((sum, match) => sum + match.penaltySaves, 0),
    penaltyMisses: metrics.reduce((sum, match) => sum + match.penaltyMisses, 0),
    totalMisses: metrics.reduce((sum, match) => sum + match.misses, 0),
    shotsByPosition: aggregateShotCounts(metrics.map((match) => match.shotsByPosition)),
    shotsByDistance: aggregateDistanceCounts(metrics.map((match) => match.shotsByDistance)),
    openPlayShotsByPosition: aggregateShotCounts(metrics.map((match) => match.openPlayShotsByPosition)),
    openPlayShotsByDistance: aggregateDistanceCounts(metrics.map((match) => match.openPlayShotsByDistance)),
    goalkeeperStats: aggregateGoalkeepers(metrics.map((match) => match.goalkeeperStats)),
    goalDistribution,
    commonScorelines: [...scorelines]
      .map(([scoreline, matches]) => ({ scoreline, matches }))
      .sort((a, b) => b.matches - a.matches || a.scoreline.localeCompare(b.scoreline))
      .slice(0, 10),
  };
}

function aggregateShotCounts(records: readonly Readonly<Record<PlayerPosition, ShotCount>>[]): Record<PlayerPosition, ShotCount> {
  const result = {} as Record<PlayerPosition, { shots: number; goals: number; saves: number; misses: number }>;
  for (const position of ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"] as PlayerPosition[]) result[position] = { shots: 0, goals: 0, saves: 0, misses: 0 };
  for (const record of records) for (const position of Object.keys(result) as PlayerPosition[]) {
    for (const key of ["shots", "goals", "saves", "misses"] as const) result[position][key] += record[position][key];
  }
  return result;
}

function aggregateDistanceCounts(records: readonly Readonly<Record<string, ShotCount>>[]): Record<string, ShotCount> {
  const result: Record<string, { shots: number; goals: number; saves: number; misses: number }> = {};
  for (const record of records) for (const [band, counts] of Object.entries(record)) {
    const aggregate = result[band] ??= { shots: 0, goals: 0, saves: 0, misses: 0 };
    for (const key of ["shots", "goals", "saves", "misses"] as const) aggregate[key] += counts[key];
  }
  return result;
}

function aggregateGoalkeepers(records: readonly Readonly<Record<string, { readonly faced: number; readonly saves: number; readonly goalsConceded: number }>>[]): Record<string, { faced: number; saves: number; goalsConceded: number }> {
  const result: Record<string, { faced: number; saves: number; goalsConceded: number }> = {};
  for (const record of records) for (const [id, counts] of Object.entries(record)) {
    const aggregate = result[id] ??= { faced: 0, saves: 0, goalsConceded: 0 };
    aggregate.faced += counts.faced;
    aggregate.saves += counts.saves;
    aggregate.goalsConceded += counts.goalsConceded;
  }
  return result;
}
