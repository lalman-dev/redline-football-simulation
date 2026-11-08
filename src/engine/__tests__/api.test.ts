import { describe, expect, it } from "vitest";
import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "../../calibration/fixtures.js";
import { createMatchState, startMatch } from "../match.js";
import { simulateMatch } from "../match-runner.js";
import { executeNextAction, getDefensivePressureProbability } from "../simulation.js";
import { getMatchStatistics } from "../statistics.js";
import { restoreMatch, snapshotMatch } from "../snapshot.js";

function createInitial(seed = 7788) {
  const homeTeam = createCalibrationTeam("api-home");
  const awayTeam = createCalibrationTeam("api-away");
  return createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createCalibrationSelection(homeTeam),
    awaySelection: createCalibrationSelection(awayTeam),
    seed,
  });
}

describe("public match API", () => {
  it("restores a snapshot with the same deterministic continuation", () => {
    const started = startMatch(createInitial(), "api-home");
    const advanced = executeNextAction(started);
    const restored = restoreMatch(snapshotMatch(advanced));

    expect(executeNextAction(restored)).toEqual(executeNextAction(advanced));
  });

  it("derives team and player statistics from recorded events", () => {
    const result = simulateMatch(createInitial(), { kickoffTeamId: "api-home" });
    const stats = getMatchStatistics(result);
    const homeShots = result.events.filter(
      (event) => event.teamId === "api-home" && event.type === "shot",
    ).length;

    expect(stats.home.shots).toBe(homeShots);
    expect(Object.values(stats.players).reduce((sum, player) => sum + player.shots, 0))
      .toBe(result.events.filter((event) => event.type === "shot").length);
  });

  it("uses the defending team's pressing for pressure in both runners", () => {
    const state = startMatch(createInitial(), "api-home");
    const highPress = {
      ...state,
      awaySelection: {
        ...state.awaySelection,
        tactics: { ...state.awaySelection.tactics, pressing: 100 },
      },
    };

    expect(getDefensivePressureProbability(highPress)).toBe(0.36);
  });
});
