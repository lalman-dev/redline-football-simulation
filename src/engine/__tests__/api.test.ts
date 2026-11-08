import { describe, expect, it } from "vitest";
import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "../../calibration/fixtures.js";
import { createMatchState, startMatch } from "../match.js";
import { simulateMatch } from "../match-runner.js";
import {
  advanceMatch,
  createMatchController,
  startControllerSecondHalf,
} from "../match-controller.js";
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

  it("rejects snapshots with malformed match state", () => {
    const started = startMatch(createInitial(), "api-home");
    const snapshot = snapshotMatch(started);
    const malformed = [
      { ...snapshot, state: { ...snapshot.state, phase: "extra-time" } },
      { ...snapshot, state: { ...snapshot.state, ballPosition: { x: 106, y: 34 } } },
      { ...snapshot, state: { ...snapshot.state, homeSelection: { ...snapshot.state.homeSelection, startingXI: ["missing"] } } },
      { ...snapshot, state: { ...snapshot.state, events: [{ id: 1, type: "unknown", minute: 0, elapsedSeconds: 0, description: "bad" }] } },
      { ...snapshot, state: { ...snapshot.state, rngState: -1 } },
    ];
    for (const invalid of malformed) {
      expect(() => restoreMatch(invalid)).toThrow("Invalid or unsupported match snapshot.");
    }
  });

  it("matches an uninterrupted live run after a mid-match snapshot restore", () => {
    const initial = createInitial(9981);
    const middle = advanceMatch(createMatchController(initial, "api-home"), 30);
    const restored = {
      ...middle,
      match: restoreMatch(snapshotMatch(middle.match)),
    };

    const finish = (start: typeof middle) => {
      let controller = start;
      for (let guard = 0; guard < 100; guard += 1) {
        if (controller.match.phase === "full-time") return controller.match;
        if (controller.match.phase === "half-time") {
          controller = startControllerSecondHalf(controller);
        } else {
          controller = advanceMatch(controller, 100);
        }
      }
      throw new Error("Live simulation failed to reach full-time.");
    };

    expect(finish(restored)).toEqual(finish(middle));
  });

  it("derives team and player statistics from recorded events", () => {
    const result = simulateMatch(createInitial(), { kickoffTeamId: "api-home" });
    const stats = getMatchStatistics(result);
    const homeShots = result.events.filter(
      (event) => event.teamId === "api-home" && (event.type === "shot" || event.type === "penalty"),
    ).length;

    expect(stats.home.shots).toBe(homeShots);
    expect(Object.values(stats.players).reduce((sum, player) => sum + player.shots, 0))
      .toBe(result.events.filter((event) => event.type === "shot" || event.type === "penalty").length);
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
