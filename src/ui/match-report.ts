import type { MatchState } from "../engine/match-state.js";
import type { MatchEvent } from "../engine/match-types.js";
import { getMatchStatistics } from "../engine/statistics.js";
import { ratePlayerPerformance, selectManOfTheMatch } from "./player-ratings.js";

const REGULATION_HALF_SECONDS = 45 * 60;

export function sortMatchTimeline(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || a.id - b.id);
}

/** Formats event time as match minutes, retaining first- and second-half stoppage. */
export function formatEventMinute(state: MatchState, event: MatchEvent): string {
  const elapsed = event.elapsedSeconds;
  const firstHalfEnd = REGULATION_HALF_SECONDS + state.firstHalfAddedTimeSeconds;
  const secondHalfEnd = firstHalfEnd + REGULATION_HALF_SECONDS;

  if (elapsed <= REGULATION_HALF_SECONDS) return `${Math.floor(elapsed / 60)}'`;
  if (elapsed <= firstHalfEnd) {
    if (event.type === "kickoff" && elapsed === firstHalfEnd) return "45'";
    return `45+${Math.max(1, Math.ceil((elapsed - REGULATION_HALF_SECONDS) / 60))}'`;
  }
  if (elapsed <= secondHalfEnd) {
    return `${45 + Math.max(1, Math.ceil((elapsed - firstHalfEnd) / 60))}'`;
  }
  return `90+${Math.max(1, Math.ceil((elapsed - secondHalfEnd) / 60))}'`;
}

/** Presentation data composed only from the final match state and recorded events. */
export function buildMatchReport(state: MatchState) {
  const ratings = ratePlayerPerformance(state);
  return {
    statistics: getMatchStatistics(state),
    ratings,
    manOfTheMatch: selectManOfTheMatch(ratings),
    timeline: sortMatchTimeline(state.events),
  };
}
