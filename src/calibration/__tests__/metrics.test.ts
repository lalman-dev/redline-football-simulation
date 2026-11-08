import { describe, expect, it } from "vitest";
import { createCalibrationSelection, createCalibrationTeam } from "../fixtures.js";
import { createMatchState, startMatch } from "../../engine/match.js";
import { createCalibrationReport, collectMatchMetrics } from "../metrics.js";

describe("calibration shot diagnostics", () => {
  it("counts penalties as shots and reports outcomes by position, distance, and goalkeeper", () => {
    const homeTeam = createCalibrationTeam("metric-home");
    const awayTeam = createCalibrationTeam("metric-away");
    const initial = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createCalibrationSelection(homeTeam),
      awaySelection: createCalibrationSelection(awayTeam),
      seed: 123,
    });
    const started = startMatch(initial, homeTeam.id);
    const atMinute = (id: number) => ({ id, minute: 1, elapsedSeconds: 60 });
    const state = {
      ...started,
      phase: "full-time" as const,
      elapsedSeconds: 5400,
      score: { home: 1, away: 0 },
      events: [
        ...started.events,
        { ...atMinute(2), type: "shot" as const, teamId: homeTeam.id, playerId: "metric-home-player-11", targetPlayerId: "metric-away-player-1", outcome: "goal" as const, shotDistanceMeters: 8, shotLocation: { x: 97, y: 34 }, description: "Close shot goal." },
        { ...atMinute(3), type: "goal" as const, teamId: homeTeam.id, playerId: "metric-home-player-11", outcome: "goal" as const, description: "Goal." },
        { ...atMinute(4), type: "penalty" as const, teamId: homeTeam.id, playerId: "metric-home-player-9", targetPlayerId: "metric-away-player-1", outcome: "off-target" as const, shotDistanceMeters: 11, shotLocation: { x: 94, y: 34 }, description: "Penalty missed." },
        { ...atMinute(5), type: "shot" as const, teamId: homeTeam.id, playerId: "metric-home-player-10", targetPlayerId: "metric-away-player-1", outcome: "saved" as const, shotDistanceMeters: 30, shotLocation: { x: 75, y: 34 }, description: "Long shot saved." },
        { ...atMinute(6), type: "save" as const, teamId: awayTeam.id, playerId: "metric-away-player-1", targetPlayerId: "metric-home-player-10", outcome: "successful" as const, description: "Save." },
      ],
    };

    const metrics = collectMatchMetrics(state);
    const report = createCalibrationReport([state]);
    expect(metrics.shots).toBe(3);
    expect(metrics.goals).toBe(state.score.home + state.score.away);
    expect(metrics.penalties).toBe(1);
    expect(metrics.penaltyGoals).toBe(0);
    expect(metrics.penaltyMisses).toBe(1);
    expect(metrics.shotsByPosition.ST).toEqual({ shots: 1, goals: 1, saves: 0, misses: 0 });
    expect(metrics.shotsByPosition.LW).toEqual({ shots: 1, goals: 0, saves: 0, misses: 1 });
    expect(metrics.shotsByDistance["0–12m"]).toEqual({ shots: 2, goals: 1, saves: 0, misses: 1 });
    expect(metrics.shotsByDistance["25m+"]).toEqual({ shots: 1, goals: 0, saves: 1, misses: 0 });
    expect(metrics.goalkeeperStats["metric-away-player-1"]).toEqual({ faced: 2, saves: 1, goalsConceded: 1 });
    expect(report.totalShots).toBe(3);
    expect(report.totalGoalEvents).toBe(1);
    expect(report.goalEventMismatchMatches).toBe(0);
    expect(report.totalPenalties).toBe(1);
    expect(report.openPlayShotsByPosition.ST.shots).toBe(1);
    expect(report.openPlayShotsByPosition.LW.shots).toBe(0);
  });
});
