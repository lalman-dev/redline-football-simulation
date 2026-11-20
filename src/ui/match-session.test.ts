import { describe, expect, it } from "vitest";
import { advanceMatch, resumeMatch } from "../engine/match-controller.js";
import { getMatchStatistics } from "../engine/statistics.js";
import { buildMatchReport } from "./match-report.js";
import { createMatchSessionController, generateMatchSeed } from "./match-session.js";

describe("match session lifecycle", () => {
  it("generates fresh 32-bit seeds from the session seed owner", () => {
    const seeds = [generateMatchSeed(), generateMatchSeed(), generateMatchSeed()];
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff)).toBe(true);
    expect(new Set(seeds).size).toBe(3);
  });

  it("creates an independent controller and empty match for every new session", () => {
    const first = createMatchSessionController("Home", "Away", 101);
    const progressed = advanceMatch(resumeMatch(first), 5);
    expect(progressed.match.events.length).toBeGreaterThan(first.match.events.length);

    const second = createMatchSessionController("Home", "Away", 202);
    expect(second).not.toBe(first);
    expect(second.match).not.toBe(first.match);
    expect(second.match.rngState).toBe(202);
    expect(second.match.phase).toBe("first-half");
    expect(second.match.score).toEqual({ home: 0, away: 0 });
    expect(second.match.events).toHaveLength(1);
    expect(getMatchStatistics(second.match).home.goals).toBe(0);
    expect(getMatchStatistics(second.match).home.passes).toBe(0);

    const freshReport = buildMatchReport(second.match);
    expect(freshReport.timeline).toEqual(second.match.events);
    expect(freshReport.statistics.home.goals).toBe(0);
    expect(freshReport.timeline).not.toEqual(buildMatchReport(progressed.match).timeline);
  });

  it("keeps same-seed controllers deterministic while accepting distinct UI seeds", () => {
    const first = createMatchSessionController("Home", "Away", 333);
    const sameSeed = createMatchSessionController("Home", "Away", 333);
    const differentSeed = createMatchSessionController("Home", "Away", 334);
    expect(first.match).toEqual(sameSeed.match);
    expect(first.match.rngState).not.toBe(differentSeed.match.rngState);
  });
});
