import { describe, expect, it } from "vitest";
import { recordPhaseEvent } from "../phase-events.js";
import type { MatchState } from "../match-state.js";

function createState(phase: MatchState["phase"]): MatchState {
  return {
    homeTeam: {
      id: "home",
      name: "Home",
      squad: [],
    },
    awayTeam: {
      id: "away",
      name: "Away",
      squad: [],
    },
    homeSelection: {
      teamId: "home",
      startingXI: [],
      substitutes: [],
      formation: { defenders: 4, midfielders: 3, forwards: 3 },
      tactics: {
        mentality: 50,
        pressing: 50,
        tempo: 50,
        width: 50,
        defensiveLine: 50,
      },
    },
    awaySelection: {
      teamId: "away",
      startingXI: [],
      substitutes: [],
      formation: { defenders: 4, midfielders: 3, forwards: 3 },
      tactics: {
        mentality: 50,
        pressing: 50,
        tempo: 50,
        width: 50,
        defensiveLine: 50,
      },
    },
    phase,
    elapsedSeconds: phase === "half-time" ? 2700 : 5400,
    score: { home: 1, away: 0 },
    possessionTeamId: null,
    ballCarrierId: null,
    ballPosition: { x: 52.5, y: 34 },
    events: [],
    rngState: 12345,
    substitutionsUsed: {
      home: 0,
      away: 0,
    },
    substitutedOffPlayers: {
      home: [],
      away: [],
    },
    substitutionWindowsUsed: { home: 0, away: 0 },
    lastSubstitutionWindow: { home: null, away: null },
  };
}

describe("recordPhaseEvent", () => {
  it("records a half-time event", () => {
    const state = createState("half-time");
    const nextState = recordPhaseEvent(state, "half-time");

    expect(nextState.events).toHaveLength(1);
    expect(nextState.events[0]?.type).toBe("half-time");
    expect(nextState.events[0]?.minute).toBe(45);
    expect(nextState.events[0]?.elapsedSeconds).toBe(2700);
    expect(nextState.events[0]?.teamId).toBeUndefined();
    expect(nextState.events[0]?.playerId).toBeUndefined();
  });

  it("records a full-time event", () => {
    const state = createState("full-time");
    const nextState = recordPhaseEvent(state, "full-time");

    expect(nextState.events[0]?.type).toBe("full-time");
    expect(nextState.events[0]?.minute).toBe(90);
    expect(nextState.events[0]?.elapsedSeconds).toBe(5400);
  });

  it("rejects an event for the wrong phase", () => {
    expect(() =>
      recordPhaseEvent(createState("first-half"), "half-time"),
    ).toThrow("Cannot record half-time while match phase is first-half.");
  });

  it("prevents duplicate phase events", () => {
    const state = createState("half-time");
    const once = recordPhaseEvent(state, "half-time");

    expect(() => recordPhaseEvent(once, "half-time")).toThrow(
      "half-time event has already been recorded.",
    );
  });
});
