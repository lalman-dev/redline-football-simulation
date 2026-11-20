import { describe, expect, it } from "vitest";
import { createCalibrationSelection, createCalibrationTeam } from "../calibration/fixtures.js";
import { createMatchState } from "../engine/match.js";
import type { MatchEvent } from "../engine/match-types.js";
import { buildMatchReport, formatEventMinute } from "./match-report.js";

describe("post-match report data", () => {
  it("orders the timeline chronologically and derives displayed counts from events", () => {
    const homeTeam = createCalibrationTeam("home");
    const awayTeam = createCalibrationTeam("away");
    const base = createMatchState({ homeTeam, awayTeam, homeSelection: createCalibrationSelection(homeTeam), awaySelection: createCalibrationSelection(awayTeam), seed: 7 });
    const event = (id: number, type: MatchEvent["type"], elapsedSeconds: number): MatchEvent => ({ id, type, elapsedSeconds, minute: Math.floor(elapsedSeconds / 60), description: type, teamId: homeTeam.id, playerId: "home-player-11", ...(type === "shot" ? { outcome: "off-target" as const } : {}) });
    const state = { ...base, phase: "full-time" as const, elapsedSeconds: 300, events: [event(2, "goal", 240), event(1, "shot", 120)] };
    const report = buildMatchReport(state);
    expect(report.timeline.map(({ id }) => id)).toEqual([1, 2]);
    expect(report.statistics.home.goals).toBe(1);
    expect(report.statistics.home.shots).toBe(1);
    expect(report.statistics.home.shotsOnTarget).toBe(0);
    expect(report.ratings.find(({ player }) => player.id === "home-player-11")?.stats.goals).toBe(1);
  });

  it("formats regulation and stoppage time for both halves", () => {
    const homeTeam = createCalibrationTeam("home");
    const awayTeam = createCalibrationTeam("away");
    const base = createMatchState({ homeTeam, awayTeam, homeSelection: createCalibrationSelection(homeTeam), awaySelection: createCalibrationSelection(awayTeam), seed: 7 });
    const withAddedTime = { ...base, firstHalfAddedTimeSeconds: 90, secondHalfAddedTimeSeconds: 120 };
    const at = (elapsedSeconds: number, type: MatchEvent["type"] = "pass"): MatchEvent => ({ id: elapsedSeconds, type, elapsedSeconds, minute: Math.floor(elapsedSeconds / 60), description: type });
    expect(formatEventMinute(withAddedTime, at(44 * 60))).toBe("44'");
    expect(formatEventMinute(withAddedTime, at(2700 + 65))).toBe("45+2'");
    expect(formatEventMinute(withAddedTime, at(2790, "kickoff"))).toBe("45'");
    expect(formatEventMinute(withAddedTime, at(2790 + 60))).toBe("46'");
    expect(formatEventMinute(withAddedTime, at(2790 + 2700 + 61))).toBe("90+2'");
  });
});
