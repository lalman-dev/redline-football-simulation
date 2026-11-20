import { describe, expect, it } from "vitest";
import {
  advanceByMinutes,
  advanceToMinute,
  advanceUntilEventType,
  advanceUntilNextEvent,
  changeTeamTactics,
  createMatchController,
  getCurrentMatchState,
  getCurrentMatchStatistics,
  getMatchEventLog,
  makeSubstitution,
  pauseMatch,
} from "../match-controller.js";
import { createMatchState } from "../match.js";
import { simulateMatch } from "../match-runner.js";
import { getMatchStatistics } from "../statistics.js";
import { restoreMatch, snapshotMatch } from "../snapshot.js";
import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "../../calibration/fixtures.js";
import type { MatchEvent } from "../match-types.js";

function initial(seed = 5522) {
  const homeTeam = createCalibrationTeam("mgmt-home");
  const awayTeam = createCalibrationTeam("mgmt-away");
  return createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createCalibrationSelection(homeTeam),
    awaySelection: createCalibrationSelection(awayTeam),
    seed,
  });
}

describe("management advancement API", () => {
  it("advances through the requested elapsed match minute without skipping logged events", () => {
    const controller = advanceToMinute(
      createMatchController(initial(), "mgmt-home"),
      3,
    );
    expect(
      Math.floor(controller.match.elapsedSeconds / 60),
    ).toBeGreaterThanOrEqual(3);
    expect(controller.match.events.length).toBeGreaterThan(1);
    expect(
      controller.match.events.every(
        (event, index, events) =>
          event.id === index + 1 &&
          (index === 0 ||
            event.elapsedSeconds >= events[index - 1]!.elapsedSeconds),
      ),
    ).toBe(true);
  });

  it("advances by minutes from the current clock and exposes current state, events, and statistics", () => {
    const started = createMatchController(initial(), "mgmt-home");
    const later = advanceByMinutes(started, 2);
    expect(later.match.elapsedSeconds).toBeGreaterThanOrEqual(120);
    expect(getCurrentMatchState(later)).toBe(later.match);
    expect(getMatchEventLog(later)).toBe(later.match.events);
    expect(getCurrentMatchStatistics(later)).toEqual(
      getMatchStatistics(later.match),
    );
  });

  it("advances through the next event and to a requested event type", () => {
    const started = createMatchController(initial(), "mgmt-home");
    const next = advanceUntilNextEvent(started);
    expect(next.match.events.length).toBeGreaterThan(
      started.match.events.length,
    );
    const withPass = advanceUntilEventType(next, "pass", 1000);
    expect(
      withPass.match.events
        .slice(next.match.events.length)
        .some((event) => event.type === "pass"),
    ).toBe(true);
  });

  it("rejects invalid targets, limits, and advancement while paused", () => {
    const started = createMatchController(initial(), "mgmt-home");
    expect(() => advanceToMinute(started, -1)).toThrow(
      "Target minute must be a non-negative integer.",
    );
    expect(() => advanceByMinutes(started, 1.5)).toThrow(
      "Minutes must be a non-negative integer.",
    );
    expect(() => advanceUntilEventType(started, "goal", 0)).toThrow(
      "Maximum steps must be a positive integer.",
    );
    expect(() => advanceUntilNextEvent(pauseMatch(started))).toThrow(
      "Cannot advance a paused match.",
    );
  });

  it("replays deterministically after using the minute and event APIs", () => {
    const original = advanceToMinute(
      createMatchController(initial(9301), "mgmt-home"),
      7,
    );
    const saved = restoreMatch(snapshotMatch(original.match));
    const restored = { ...original, match: saved };
    const a = advanceUntilNextEvent(original);
    const b = advanceUntilNextEvent(restored);
    expect(a.match).toEqual(b.match);
    expect(advanceByMinutes(a, 1).match).toEqual(advanceByMinutes(b, 1).match);
  });
});

describe("complete match statistics", () => {
  it("reports complementary possession percentages and accurate pass/tackle rates", () => {
    const result = simulateMatch(initial(), { kickoffTeamId: "mgmt-home" });
    const stats = getMatchStatistics(result);
    expect(
      stats.home.possessionPercentage + stats.away.possessionPercentage,
    ).toBe(100);
    expect(stats.home.passAccuracy).toBeGreaterThanOrEqual(0);
    expect(stats.home.tackleSuccessPercentage).toBeGreaterThanOrEqual(0);
    expect(stats.explanation).toMatch(/won|finished/);
  });

  it("allocates clock intervals to the possession recorded by event transitions", () => {
    const state = initial();
    const events: MatchEvent[] = [
      {
        id: 1,
        type: "kickoff",
        minute: 0,
        elapsedSeconds: 0,
        teamId: state.homeTeam.id,
        description: "Home kickoff",
      },
      {
        id: 2,
        type: "kickoff",
        minute: 0,
        elapsedSeconds: 30,
        teamId: state.awayTeam.id,
        description: "Away kickoff",
      },
    ];
    const stats = getMatchStatistics({ ...state, elapsedSeconds: 60, events });
    expect(stats.home.possessionPercentage).toBe(50);
    expect(stats.away.possessionPercentage).toBe(50);
  });

  it("logs tactical changes and includes them in the data-based explanation", () => {
    const state = initial();
    const started = createMatchController(state, state.homeTeam.id);
    const changed = changeTeamTactics(started, state.homeTeam.id, {
      ...started.match.homeSelection.tactics,
      pressing: 70,
    });
    expect(changed.match.events.at(-1)?.type).toBe("tactical-change");
    const stats = getMatchStatistics({ ...changed.match, phase: "full-time" });
    expect(stats.explanation).toContain("Tactical changes:");
    expect(stats.home.assists).toBe(0);
  });

  it("tracks minutes across substitutions and dismissals using event timestamps", () => {
    const initialState = initial();
    const home = initialState.homeTeam;
    const incoming = home.squad[15]!;
    let controller = advanceToMinute(
      createMatchController(initialState, home.id),
      5,
    );
    const subAt = controller.match.elapsedSeconds;
    controller = makeSubstitution(
      controller,
      home.id,
      home.squad[9]!.id,
      incoming.id,
      "window-a",
    );
    controller = advanceToMinute(controller, 11);
    const withSub = getMatchStatistics(controller.match);
    expect(withSub.players[home.squad[9]!.id]!.minutesPlayed).toBeLessThan(
      withSub.players[incoming.id]!.minutesPlayed,
    );
    expect(withSub.players[incoming.id]!.minutesPlayed).toBeCloseTo(
      (controller.match.elapsedSeconds - subAt) / 60,
      1,
    );

    const dismissedId = home.squad[8]!.id;
    const dismissedElapsed = controller.match.elapsedSeconds;
    const red: MatchEvent = {
      id: controller.match.events.length + 1,
      type: "red-card",
      minute: Math.floor(dismissedElapsed / 60),
      elapsedSeconds: dismissedElapsed,
      teamId: home.id,
      playerId: dismissedId,
      description: "Dismissed in statistical fixture.",
    };
    const redState = {
      ...controller.match,
      homeSelection: {
        ...controller.match.homeSelection,
        startingXI: controller.match.homeSelection.startingXI.filter(
          (id) => id !== dismissedId,
        ),
      },
      dismissedPlayerIds: [...controller.match.dismissedPlayerIds, dismissedId],
      playerPositions: Object.fromEntries(
        Object.entries(controller.match.playerPositions).filter(
          ([id]) => id !== dismissedId,
        ),
      ),
      events: [...controller.match.events, red],
    };
    controller = {
      ...controller,
      match: advanceToMinute({ ...controller, match: redState }, 12).match,
    };
    const withRed = getMatchStatistics(controller.match);
    expect(withRed.players[dismissedId]!.minutesPlayed).toBeCloseTo(
      dismissedElapsed / 60,
      1,
    );
    expect(withRed.players[dismissedId]!.minutesPlayed).toBeLessThan(
      withRed.players[home.squad[7]!.id]!.minutesPlayed,
    );
  });

  it("attributes an assist only to the last supported successful teammate pass", () => {
    const state = initial();
    const passer = state.homeTeam.squad[8]!;
    const scorer = state.homeTeam.squad[10]!;
    const events: MatchEvent[] = [
      {
        id: 1,
        type: "kickoff",
        minute: 0,
        elapsedSeconds: 0,
        teamId: state.homeTeam.id,
        playerId: scorer.id,
        description: "Kickoff",
      },
      {
        id: 2,
        type: "pass",
        minute: 4,
        elapsedSeconds: 240,
        teamId: state.homeTeam.id,
        playerId: passer.id,
        targetPlayerId: scorer.id,
        outcome: "successful",
        description: "Pass",
      },
      {
        id: 3,
        type: "shot",
        minute: 4,
        elapsedSeconds: 244,
        teamId: state.homeTeam.id,
        playerId: scorer.id,
        outcome: "goal",
        description: "Shot",
      },
      {
        id: 4,
        type: "goal",
        minute: 4,
        elapsedSeconds: 244,
        teamId: state.homeTeam.id,
        playerId: scorer.id,
        outcome: "goal",
        description: "Goal",
      },
    ];
    const stats = getMatchStatistics({
      ...state,
      phase: "full-time",
      elapsedSeconds: 244,
      events,
    });
    expect(stats.players[passer.id]!.assists).toBe(1);
    expect(stats.players[scorer.id]!.assists).toBe(0);
    expect(stats.home.assists).toBe(1);
    expect(stats.explanation).toContain("Shot conversion");
    expect(stats.explanation).toContain("Possession");
  });
});
