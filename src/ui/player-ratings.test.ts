import { describe, expect, it } from "vitest";
import { createCalibrationSelection, createCalibrationTeam } from "../calibration/fixtures.js";
import { createMatchState } from "../engine/match.js";
import type { MatchEvent } from "../engine/match-types.js";
import { ratePlayerPerformance, selectManOfTheMatch, sortPlayerRatings } from "./player-ratings.js";

function stateWith(events: readonly MatchEvent[] = [], elapsedSeconds = 1800) {
  const homeTeam = createCalibrationTeam("home");
  const awayTeam = createCalibrationTeam("away");
  const base = createMatchState({ homeTeam, awayTeam, homeSelection: createCalibrationSelection(homeTeam), awaySelection: createCalibrationSelection(awayTeam), seed: 42 });
  return { ...base, elapsedSeconds, events };
}

function event(id: number, type: MatchEvent["type"], playerId: string, teamId = "home", outcome?: MatchEvent["outcome"]): MatchEvent {
  return { id, type, playerId, teamId, minute: 20, elapsedSeconds: 1200, description: type, ...(outcome ? { outcome } : {}) };
}

describe("event-derived player ratings", () => {
  it("rates goalkeeper, defender, midfielder, and forward contributions deterministically", () => {
    const state = stateWith([
      event(1, "save", "home-player-1"),
      event(2, "tackle", "home-player-2", "home", "successful"),
      event(3, "pass", "home-player-6", "home", "successful"),
      event(4, "goal", "home-player-11"),
    ]);
    const ratings = ratePlayerPerformance(state);
    for (const id of ["home-player-1", "home-player-2", "home-player-6", "home-player-11"]) {
      expect(ratings.find((entry) => entry.player.id === id)?.rating).toBeGreaterThan(6);
    }
    expect(ratePlayerPerformance(state)).toEqual(ratings);
  });

  it("leaves unused substitutes ungraded and dampens brief appearances", () => {
    const state = stateWith([event(1, "goal", "home-player-11")], 120);
    const ratings = ratePlayerPerformance(state);
    expect(ratings.find((entry) => entry.player.id === "home-player-12")?.rating).toBeNull();
    expect(ratings.find((entry) => entry.player.id === "home-player-11")?.rating).toBe(6);
  });

  it("records dismissal deductions and omits negligible-time players from MotM", () => {
    const base = { ...stateWith([event(1, "red-card", "home-player-11")], 1800), dismissedPlayerIds: ["home-player-11"] };
    const rated = ratePlayerPerformance(base);
    const dismissed = rated.find((entry) => entry.player.id === "home-player-11")!;
    expect(dismissed.dismissed).toBe(true);
    expect(dismissed.rating).toBeLessThan(6);
    expect(selectManOfTheMatch(rated)?.player.id).not.toBe("home-player-12");
  });

  it("gives equal performances equal ratings and selects a stable MotM", () => {
    const state = stateWith();
    const rated = ratePlayerPerformance(state);
    expect(new Set(rated.filter((entry) => entry.rating !== null).map((entry) => entry.rating)).size).toBe(1);
    expect(selectManOfTheMatch(rated)?.player.id).toBe("away-player-1");
  });

  it("attributes a defender's recorded goals and successful tackles once", () => {
    const events = [
      event(1, "goal", "home-player-2"),
      event(2, "goal", "home-player-2"),
      ...Array.from({ length: 25 }, (_, index) => event(index + 3, "tackle", "home-player-2", "home", "successful")),
    ];
    const state = { ...stateWith(events), score: { home: 2, away: 0 } };
    const defender = ratePlayerPerformance(state).find((entry) => entry.player.id === "home-player-2")!;
    expect(defender.stats.goals).toBe(2);
    expect(defender.stats.tackles).toBe(25);
    expect(defender.stats.successfulTackles).toBe(25);
    expect(defender.stats.tackleSuccessPercentage).toBe(100);
    expect(defender.rating).toBe(10);
    expect(selectManOfTheMatch(ratePlayerPerformance(state))?.player.id).toBe("home-player-2");
  });

  it("sorts ratings, minutes, and positions without mutating source entries", () => {
    const ratings = ratePlayerPerformance(stateWith([
      event(1, "goal", "home-player-11"),
      event(2, "tackle", "home-player-2", "home", "successful"),
    ]));
    const original = ratings.map((entry) => entry.player.id);
    expect(sortPlayerRatings(ratings, "rating")[0]?.player.id).toBe("home-player-11");
    expect(sortPlayerRatings(ratings, "minutes")[0]?.stats.minutesPlayed).toBe(30);
    expect(sortPlayerRatings(ratings, "position").map((entry) => entry.player.primaryPosition)).toEqual(
      [...sortPlayerRatings(ratings, "position").map((entry) => entry.player.primaryPosition)].sort(),
    );
    expect(ratings.map((entry) => entry.player.id)).toEqual(original);
  });
});
