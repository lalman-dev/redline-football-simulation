import type { MatchState } from "../engine/match-state.js";
import { getMatchStatistics, type PlayerMatchStatistics } from "../engine/statistics.js";
import type { Player, TeamId } from "../engine/types.js";

export interface PlayerRating {
  readonly player: Player;
  readonly teamId: TeamId;
  readonly stats: PlayerMatchStatistics;
  readonly rating: number | null;
  readonly reason: string;
  readonly dismissed: boolean;
}

export type PlayerRatingSort = "rating" | "minutes" | "position";

export function sortPlayerRatings(
  entries: readonly PlayerRating[],
  sortBy: PlayerRatingSort,
): PlayerRating[] {
  return [...entries].sort((a, b) => {
    if (sortBy === "rating") {
      const difference = (b.rating ?? -1) - (a.rating ?? -1);
      if (difference) return difference;
    } else if (sortBy === "minutes") {
      const difference = b.stats.minutesPlayed - a.stats.minutesPlayed;
      if (difference) return difference;
    } else {
      const difference = a.player.primaryPosition.localeCompare(b.player.primaryPosition);
      if (difference) return difference;
    }
    return a.player.name.localeCompare(b.player.name);
  });
}

const WEIGHTS = {
  GK: { save: 0.32, goal: 0.08, assist: 0.24, tackle: 0.08, pass: 0.06, card: 0.35, foul: 0.04 },
  DEF: { save: 0.05, goal: 0.42, assist: 0.3, tackle: 0.2, pass: 0.08, card: 0.45, foul: 0.06 },
  MID: { save: 0, goal: 0.4, assist: 0.35, tackle: 0.16, pass: 0.12, card: 0.4, foul: 0.05 },
  FWD: { save: 0, goal: 0.45, assist: 0.3, tackle: 0.06, pass: 0.05, card: 0.4, foul: 0.05 },
} as const;

function group(position: Player["primaryPosition"]): keyof typeof WEIGHTS {
  if (position === "GK") return "GK";
  if (["CB", "LB", "RB"].includes(position)) return "DEF";
  if (["DM", "CM", "AM"].includes(position)) return "MID";
  return "FWD";
}

/** Deterministic event-derived rating. Unused players have no rating; per-90 contributions
 * are gently damped below 30 minutes to avoid extreme ratings from brief cameos. */
export function ratePlayerPerformance(state: MatchState): PlayerRating[] {
  const stats = getMatchStatistics(state);
  const teams = [state.homeTeam, state.awayTeam];
  return teams.flatMap((team, teamIndex) => {
    const opposingGoals = teamIndex === 0 ? state.score.away : state.score.home;
    return team.squad.map((player) => {
      const playerStats = stats.players[player.id]!;
      const minutes = playerStats.minutesPlayed;
      const dismissed = state.dismissedPlayerIds.includes(player.id);
      if (minutes <= 0) return { player, teamId: team.id, stats: playerStats, rating: null, reason: "Did not play", dismissed };
      const weights = WEIGHTS[group(player.primaryPosition)];
      const scale = Math.min(1, minutes / 30);
      const points = playerStats.goals * weights.goal
        + playerStats.assists * weights.assist
        + playerStats.saves * weights.save
        + playerStats.successfulTackles * weights.tackle
        + Math.min(playerStats.successfulPasses, 40) / 10 * weights.pass
        + playerStats.shotsOnTarget * (group(player.primaryPosition) === "FWD" ? 0.08 : 0.03)
        - playerStats.yellowCards * weights.card
        - playerStats.redCards * (weights.card + 0.8)
        - playerStats.fouls * weights.foul
        - (group(player.primaryPosition) === "GK" ? opposingGoals * 0.35 : 0);
      const rating = Math.round(Math.max(1, Math.min(10, 6 + points * scale)) * 10) / 10;
      const details = [playerStats.goals ? `${playerStats.goals} goal${playerStats.goals > 1 ? "s" : ""}` : "", playerStats.assists ? `${playerStats.assists} assist${playerStats.assists > 1 ? "s" : ""}` : "", playerStats.saves ? `${playerStats.saves} save${playerStats.saves > 1 ? "s" : ""}` : "", playerStats.successfulTackles ? `${playerStats.successfulTackles} successful tackle${playerStats.successfulTackles > 1 ? "s" : ""}` : "", dismissed ? "sent off" : ""].filter(Boolean);
      return { player, teamId: team.id, stats: playerStats, rating, reason: details.join(", ") || "Match contributions and discipline", dismissed };
    });
  });
}

export function selectManOfTheMatch(ratings: readonly PlayerRating[]): PlayerRating | null {
  return ratings.filter((entry) => entry.rating !== null && entry.stats.minutesPlayed >= 15)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.player.id.localeCompare(b.player.id))[0] ?? null;
}
