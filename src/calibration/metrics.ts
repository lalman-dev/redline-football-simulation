import type { MatchState } from "../engine/match-state.js";

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
}

export interface CalibrationReport {
  readonly matchesPlayed: number;
  readonly matchesCompleted: number;
  readonly matchesFailed: number;
  readonly homeWins: number;
  readonly draws: number;
  readonly awayWins: number;
  readonly totalGoals: number;
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
  readonly goalDistribution: Readonly<Record<string, number>>;
  readonly commonScorelines: readonly { readonly scoreline: string; readonly matches: number }[];
}

export function collectMatchMetrics(state: MatchState): MatchMetrics {
  const shots = state.events.filter((event) => event.type === "shot");
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
    goalDistribution,
    commonScorelines: [...scorelines]
      .map(([scoreline, matches]) => ({ scoreline, matches }))
      .sort((a, b) => b.matches - a.matches || a.scoreline.localeCompare(b.scoreline))
      .slice(0, 10),
  };
}
