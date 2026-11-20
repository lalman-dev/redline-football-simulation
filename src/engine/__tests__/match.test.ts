import { describe, expect, it } from "vitest";
import { getMatchStatistics } from "../statistics.js";
import { restoreMatch, snapshotMatch } from "../snapshot.js";
import {
  createMatchState,
  makeCarry,
  makePass,
  makeTackle,
  makeShot,
  startMatch,
  startSecondHalf,
  substitutePlayer,
  getTackleSuccessProbability,
} from "../match.js";
import { executeNextAction } from "../simulation.js";
import { createRng } from "../rng.js";
import type { Player, Team, TeamSelection } from "../types.js";

const attributes = {
  passing: 70,
  shooting: 70,
  dribbling: 70,
  tackling: 70,
  positioning: 70,
  pace: 70,
  stamina: 70,
  strength: 70,
  goalkeeping: 70,
  finishing: 70,
  decisionMaking: 70,
};

function createPlayer(id: string, position: Player["primaryPosition"]): Player {
  return {
    id,
    name: `Player ${id}`,
    age: 25,
    primaryPosition: position,
    secondaryPositions: [],
    attributes,
  };
}

function createTeam(id: string): Team {
  const positions: Player["primaryPosition"][] = [
    "GK",
    "CB",
    "CB",
    "LB",
    "RB",
    "CM",
    "CM",
    "CM",
    "LW",
    "RW",
    "ST",
    "GK",
    "CB",
    "CM",
    "ST",
    "LB",
  ];

  return {
    id,
    name: `Team ${id}`,
    squad: positions.map((position, index) =>
      createPlayer(`${id}-player-${index + 1}`, position),
    ),
  };
}

function createSelection(team: Team): TeamSelection {
  return {
    teamId: team.id,
    startingXI: team.squad.slice(0, 11).map((player) => player.id),
    substitutes: team.squad.slice(11, 16).map((player) => player.id),
    formation: {
      defenders: 4,
      midfielders: 3,
      forwards: 3,
    },
    tactics: {
      mentality: 50,
      pressing: 50,
      tempo: 50,
      width: 50,
      defensiveLine: 50,
    },
  };
}

describe("createMatchState", () => {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  const homeSelection = createSelection(homeTeam);
  const awaySelection = createSelection(awayTeam);

  it("creates a match with the correct initial state", () => {
    const match = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection,
      awaySelection,
      seed: 12345,
    });

    expect(match.phase).toBe("first-half");
    expect(match.elapsedSeconds).toBe(0);
    expect(match.score).toEqual({ home: 0, away: 0 });
    expect(match.possessionTeamId).toBeNull();
    expect(match.ballCarrierId).toBeNull();
    expect(match.events).toHaveLength(0);
  });

  it("stores the initial random generator state", () => {
    const match = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection,
      awaySelection,
      seed: 12345,
    });

    expect(match.rngState).toBe(12345);
  });

  it("rejects a team playing against itself", () => {
    expect(() =>
      createMatchState({
        homeTeam,
        awayTeam: homeTeam,
        homeSelection,
        awaySelection: homeSelection,
        seed: 12345,
      }),
    ).toThrow("A team cannot play against itself.");
  });

  it("rejects an invalid lineup", () => {
    const invalidSelection: TeamSelection = {
      ...homeSelection,
      startingXI: homeSelection.startingXI.slice(0, 10),
    };

    expect(() =>
      createMatchState({
        homeTeam,
        awayTeam,
        homeSelection: invalidSelection,
        awaySelection,
        seed: 12345,
      }),
    ).toThrow("Invalid match setup");
  });
});
describe("startMatch", () => {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  const initialState = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    seed: 12345,
  });

  it("starts with the selected team's possession", () => {
    const match = startMatch(initialState, homeTeam.id);

    expect(match.possessionTeamId).toBe(homeTeam.id);
    expect(match.ballCarrierId).toBe("home-player-11");
    expect(match.events[0]?.playerId).toBe(match.ballCarrierId);
    expect(
      homeTeam.squad.find((player) => player.id === match.ballCarrierId)
        ?.primaryPosition,
    ).toBe("ST");
    expect(match.playerPositions[match.ballCarrierId!]).toEqual(
      match.ballPosition,
    );
    expect(match.ballPosition).toEqual({ x: 52.5, y: 34 });
    expect(
      awayTeam.squad.some((player) => player.id === match.ballCarrierId),
    ).toBe(false);
    expect(match.events).toHaveLength(1);
    expect(match.events[0]?.type).toBe("kickoff");

    const firstAction = executeNextAction(match);
    expect(firstAction.events[1]?.playerId).toBe(match.events[0]?.playerId);
  });

  it("prefers a wide player when a striker is absent, matching V1.0 order", () => {
    const noStrikerTeam: Team = {
      ...homeTeam,
      squad: homeTeam.squad.map((player) =>
        player.id === "home-player-11"
          ? { ...player, primaryPosition: "CB" as const }
          : player,
      ),
    };
    const noStrikerState = createMatchState({
      homeTeam: noStrikerTeam,
      awayTeam,
      homeSelection: createSelection(noStrikerTeam),
      awaySelection: createSelection(awayTeam),
      seed: 2468,
    });
    const started = startMatch(noStrikerState, noStrikerTeam.id);

    expect(started.ballCarrierId).toBe("home-player-9");
    expect(started.events[0]?.playerId).toBe("home-player-9");
    expect(started.playerPositions["home-player-9"]).toEqual(
      started.ballPosition,
    );
  });

  it("rejects a team outside the match", () => {
    expect(() => startMatch(initialState, "unknown-team")).toThrow(
      "Kickoff team must be one of the match teams.",
    );
  });

  it("rejects a second kickoff", () => {
    const started = startMatch(initialState, homeTeam.id);

    expect(() => startMatch(started, awayTeam.id)).toThrow(
      "Match has already started.",
    );
  });
});

describe("startSecondHalf", () => {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  const initialState = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    seed: 12345,
  });

  const halfTimeState = {
    ...startMatch(initialState, homeTeam.id),
    phase: "half-time" as const,
    elapsedSeconds: 2700,
    score: { home: 1, away: 0 },
  };

  it("starts the second half and preserves match history", () => {
    const match = startSecondHalf(halfTimeState, awayTeam.id);

    expect(match.phase).toBe("second-half");
    expect(match.elapsedSeconds).toBe(2700);
    expect(match.score).toEqual({ home: 1, away: 0 });
    expect(match.possessionTeamId).toBe(awayTeam.id);
    expect(match.ballCarrierId).toBe("away-player-11");
    expect(match.events[1]?.playerId).toBe(match.ballCarrierId);
    expect(
      awayTeam.squad.find((player) => player.id === match.ballCarrierId)
        ?.primaryPosition,
    ).toBe("ST");
    expect(match.playerPositions[match.ballCarrierId!]).toEqual(
      match.ballPosition,
    );
    expect(match.ballPosition).toEqual({ x: 52.5, y: 34 });
    expect(
      homeTeam.squad.some((player) => player.id === match.ballCarrierId),
    ).toBe(false);
    expect(match.events).toHaveLength(2);
    expect(match.events[1]?.minute).toBe(45);
    expect(match.events[1]?.elapsedSeconds).toBe(2700);
    expect(match.events[1]?.description).toContain("second half");

    const firstAction = executeNextAction(match);
    expect(firstAction.events[2]?.playerId).toBe(match.events[1]?.playerId);
  });

  it("rejects a kickoff before half-time", () => {
    expect(() => startSecondHalf(initialState, awayTeam.id)).toThrow(
      "Second half can only start at half-time.",
    );
  });

  it("rejects a team outside the match", () => {
    expect(() => startSecondHalf(halfTimeState, "unknown-team")).toThrow(
      "Kickoff team must be one of the match teams.",
    );
  });
});

describe("makeCarry", () => {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  const initialState = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    seed: 12345,
  });

  function createStartedState(seed = 12345) {
    const match = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed,
    });

    return startMatch(match, homeTeam.id);
  }

  it("retains possession and keeps the same ball carrier", () => {
    const state = createStartedState();
    const nextState = makeCarry(state);

    expect(nextState.possessionTeamId).toBe(state.possessionTeamId);
    expect(nextState.ballCarrierId).toBe(state.ballCarrierId);
  });

  it("moves the ball forward in the attacking direction", () => {
    const state = createStartedState();
    const nextState = makeCarry(state);

    expect(nextState.ballPosition.x).toBeGreaterThan(state.ballPosition.x);
  });

  it("advances match time and records a carry event", () => {
    const state = createStartedState();
    const nextState = makeCarry(state);

    expect(nextState.elapsedSeconds).toBeGreaterThan(state.elapsedSeconds);
    expect(nextState.events.at(-1)?.type).toBe("carry");
  });

  it("produces deterministic results for identical seeds", () => {
    const first = makeCarry(createStartedState(12345));
    const second = makeCarry(createStartedState(12345));

    expect(first.ballPosition).toEqual(second.ballPosition);
    expect(first.events).toEqual(second.events);
    expect(first.rngState).toBe(second.rngState);
  });
});

describe("makePass", () => {
  function createStartedMatch(seed: number) {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed,
    });

    return startMatch(state, homeTeam.id);
  }

  function failedPassDestination(seed: number) {
    // Mirrors makePass: a failed pass aims at the receiver's position with
    // up to 6m of error on each axis and no run-on.
    const receiverPosition = createStartedMatch(seed).playerPositions[
      "home-player-10"
    ] ?? { x: 52.5, y: 34 };
    const rng = createRng(seed);
    rng.next(); // pass outcome
    rng.next(); // action duration
    return {
      x: Math.max(
        0,
        Math.min(105, receiverPosition.x + (rng.next() - 0.5) * 12),
      ),
      y: Math.max(
        0,
        Math.min(68, receiverPosition.y + (rng.next() - 0.5) * 12),
      ),
    };
  }

  function createInterceptionState(
    seed: number,
    defenderSetup: Readonly<
      Record<string, { x: number; y: number; positioning?: number }>
    >,
    unavailableIds: readonly string[] = [],
  ) {
    const started = createStartedMatch(seed);
    const awayTeam: Team = {
      ...started.awayTeam,
      squad: started.awayTeam.squad.map((player) => {
        const setup = defenderSetup[player.id];
        return setup?.positioning === undefined
          ? player
          : {
              ...player,
              attributes: {
                ...player.attributes,
                positioning: setup.positioning,
              },
            };
      }),
    };
    const awaySelection = {
      ...started.awaySelection,
      startingXI: started.awaySelection.startingXI.filter(
        (id) => !unavailableIds.includes(id),
      ),
    };
    const playerPositions = { ...started.playerPositions };
    for (const player of awayTeam.squad) {
      if (player.primaryPosition === "GK") continue;
      const setup = defenderSetup[player.id];
      if (unavailableIds.includes(player.id)) {
        delete playerPositions[player.id];
      } else {
        playerPositions[player.id] = setup ?? { x: 1, y: 1 };
      }
    }
    return {
      ...started,
      awayTeam,
      awaySelection,
      dismissedPlayerIds: [...started.dismissedPlayerIds, ...unavailableIds],
      playerPositions,
    };
  }

  it("selects the nearest eligible defender even when a farther defender has better positioning", () => {
    const seed = 4;
    const destination = failedPassDestination(seed);
    const state = createInterceptionState(seed, {
      "away-player-2": {
        x: destination.x + 10,
        y: destination.y,
        positioning: 100,
      },
      "away-player-3": {
        x: destination.x + 1,
        y: destination.y,
        positioning: 20,
      },
    });

    const result = makePass(state, "home-player-10");
    const repeated = makePass(state, "home-player-10");
    const pass = result.events.at(-1)!;

    expect(repeated).toEqual(result);
    expect(pass.type).toBe("pass");
    expect(pass.outcome).toBe("unsuccessful");
    expect(pass.interceptedByPlayerId).toBe("away-player-3");
    expect(result.ballCarrierId).toBe("away-player-3");
  });

  it("uses positioning as a secondary choice when defenders are equally close", () => {
    const seed = 4;
    const destination = failedPassDestination(seed);
    const state = createInterceptionState(seed, {
      "away-player-2": {
        x: destination.x + 3,
        y: destination.y,
        positioning: 95,
      },
      "away-player-3": {
        x: destination.x - 3,
        y: destination.y,
        positioning: 40,
      },
    });

    const result = makePass(state, "home-player-10");

    expect(result.events.at(-1)?.interceptedByPlayerId).toBe("away-player-2");
  });

  it("excludes dismissed, out-of-XI and goalkeeper candidates", () => {
    const seed = 4;
    const destination = failedPassDestination(seed);
    const state = createInterceptionState(
      seed,
      {
        "away-player-2": {
          x: destination.x,
          y: destination.y,
          positioning: 100,
        },
        "away-player-3": {
          x: destination.x + 2,
          y: destination.y,
          positioning: 70,
        },
        "away-player-4": {
          x: destination.x + 1,
          y: destination.y,
          positioning: 100,
        },
      },
      ["away-player-4"],
    );
    const stateWithKeeperNearby = {
      ...state,
      dismissedPlayerIds: [...state.dismissedPlayerIds, "away-player-2"],
      playerPositions: {
        ...state.playerPositions,
        "away-player-1": destination,
      },
    };

    const result = makePass(stateWithKeeperNearby, "home-player-10");

    expect(result.events.at(-1)?.interceptedByPlayerId).toBe("away-player-3");
    expect(stateWithKeeperNearby.dismissedPlayerIds).toContain("away-player-2");
    expect(stateWithKeeperNearby.awaySelection.startingXI).not.toContain(
      "away-player-4",
    );
    expect(result.events.at(-1)?.interceptedByPlayerId).not.toBe(
      "away-player-1",
    );
  });

  it("limits interceptor movement and keeps the ball at the reachable interception point", () => {
    const seed = 4;
    const destination = failedPassDestination(seed);
    const state = createInterceptionState(seed, {
      "away-player-2": {
        x: destination.x + 20,
        y: destination.y,
        positioning: 100,
      },
    });

    const result = makePass(state, "home-player-10");
    const interceptorId = result.events.at(-1)?.interceptedByPlayerId;
    const before = state.playerPositions[interceptorId!]!;
    const after = result.playerPositions[interceptorId!]!;

    expect(interceptorId).toBe("away-player-2");
    expect(
      Math.hypot(after.x - before.x, after.y - before.y),
    ).toBeLessThanOrEqual(4.5 + 1e-9);
    expect(after).toEqual(result.ballPosition);
    expect(
      Math.hypot(after.x - destination.x, after.y - destination.y),
    ).toBeGreaterThan(0);
  });

  it("records a pass and advances match time", () => {
    const state = createStartedMatch(12345);
    const nextState = makePass(state, "home-player-10");
    const passEvent = nextState.events[1];

    expect(passEvent?.type).toBe("pass");
    expect(passEvent?.playerId).toBe(state.ballCarrierId);
    expect(passEvent?.targetPlayerId).toBe("home-player-10");
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
    expect(nextState.elapsedSeconds).toBeLessThanOrEqual(4);
  });

  it("transfers possession according to the pass outcome", () => {
    const state = createStartedMatch(12345);
    const nextState = makePass(state, "home-player-10");
    const passEvent = nextState.events[1];

    if (passEvent?.outcome === "successful") {
      expect(nextState.possessionTeamId).toBe("home");
      expect(nextState.ballCarrierId).toBe("home-player-10");
    } else {
      expect(passEvent?.outcome).toBe("unsuccessful");
      expect(nextState.possessionTeamId).toBe("away");
      expect(nextState.ballCarrierId).not.toBeNull();
    }
  });

  it("produces the same result when repeated with the same seed", () => {
    const first = makePass(createStartedMatch(12345), "home-player-10");
    const second = makePass(createStartedMatch(12345), "home-player-10");

    expect(first).toEqual(second);
  });

  it("rejects a receiver from the opposition", () => {
    const state = createStartedMatch(12345);

    expect(() => makePass(state, "away-player-12")).toThrow(
      "Receiver must be an active player on the same team.",
    );
  });

  it("rejects passing to the same player", () => {
    const state = createStartedMatch(12345);

    expect(() => makePass(state, state.ballCarrierId!)).toThrow(
      "A player cannot pass to themselves.",
    );
  });

  it("moves the ball forward after a successful pass", () => {
    const state = createStartedMatch(12345);
    const nextState = makePass(state, "home-player-10");
    const passEvent = nextState.events[1];

    if (passEvent?.outcome === "successful") {
      expect(nextState.ballPosition.x).toBeGreaterThan(state.ballPosition.x);
    }
  });

  it("moves the ball within pitch boundaries", () => {
    const state = createStartedMatch(12345);
    const nextState = makePass(state, "home-player-10");

    expect(nextState.ballPosition.x).toBeGreaterThanOrEqual(0);
    expect(nextState.ballPosition.x).toBeLessThanOrEqual(105);
    expect(nextState.ballPosition.y).toBeGreaterThanOrEqual(0);
    expect(nextState.ballPosition.y).toBeLessThanOrEqual(68);
  });

  it("moves the ball in the opposite direction for the away team", () => {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed: 12345,
    });

    const startedState = startMatch(state, awayTeam.id);
    const nextState = makePass(startedState, "away-player-10");
    const passEvent = nextState.events[1];

    if (passEvent?.outcome === "successful") {
      expect(nextState.ballPosition.x).toBeLessThan(
        startedState.ballPosition.x,
      );
    }
  });

  it("reverses home attacking direction in the second half", () => {
    const firstHalfState = createStartedMatch(12345);

    const secondHalfState = {
      ...firstHalfState,
      phase: "second-half" as const,
      elapsedSeconds: 2700,
      ballPosition: { x: 52.5, y: 34 },
    };

    const nextState = makePass(secondHalfState, "home-player-10");
    const passEvent = nextState.events[1];

    if (passEvent?.outcome === "successful") {
      expect(nextState.ballPosition.x).toBeLessThan(
        secondHalfState.ballPosition.x,
      );
    }
  });
});

describe("makeTackle", () => {
  function createStartedMatch(seed: number) {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed,
    });

    return startMatch(state, homeTeam.id);
  }

  function createPenaltyAreaMatch(seed: number) {
    const started = createStartedMatch(seed);
    const carrierId = "home-player-11";
    const spot = { x: 95, y: 34 };
    return {
      ...started,
      ballPosition: spot,
      playerPositions: { ...started.playerPositions, [carrierId]: spot },
    };
  }

  function createCarrierOnlyInPenaltyAreaMatch(seed: number) {
    const started = createStartedMatch(seed);
    const carrierId = "home-player-11";
    return {
      ...started,
      playerPositions: {
        ...started.playerPositions,
        [carrierId]: { x: 95, y: 34 },
      },
    };
  }

  it("records a tackle and advances match time", () => {
    const state = createStartedMatch(12345);
    const nextState = makeTackle(state, "away-player-2");
    const tackleEvent = nextState.events[1];

    expect(tackleEvent?.type).toBe("tackle");
    expect(tackleEvent?.playerId).toBe("away-player-2");
    expect(tackleEvent?.targetPlayerId).toBe(state.ballCarrierId);
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
    expect(nextState.elapsedSeconds).toBeLessThanOrEqual(4);
  });

  it("transfers possession when the tackle succeeds", () => {
    const state = createStartedMatch(12345);
    const nextState = makeTackle(state, "away-player-2");
    const tackleEvent = nextState.events[1];

    if (tackleEvent?.outcome === "successful") {
      expect(nextState.possessionTeamId).toBe("away");
      expect(nextState.ballCarrierId).toBe("away-player-2");
    } else {
      expect(nextState.possessionTeamId).toBe("home");
      expect(nextState.ballCarrierId).toBe(state.ballCarrierId);
    }
  });

  it("awards a free kick to the fouled team", () => {
    let result: ReturnType<typeof makeTackle> | undefined;
    for (let seed = 1; seed <= 500 && !result; seed += 1) {
      const candidate = makeTackle(createStartedMatch(seed), "away-player-2");
      if (candidate.events.some((event) => event.type === "foul"))
        result = candidate;
    }

    expect(result).toBeDefined();
    expect(result?.possessionTeamId).toBe("home");
    expect(
      result?.events.some(
        (event) => event.type === "free-kick" && event.teamId === "home",
      ),
    ).toBe(true);
  });

  it("resolves penalty goals, saves and misses with correct restarts and statistics", () => {
    const results: Record<string, ReturnType<typeof makeTackle>> = {};
    for (
      let seed = 1;
      seed <= 2000 && Object.keys(results).length < 3;
      seed += 1
    ) {
      const candidate = makeTackle(
        createPenaltyAreaMatch(seed),
        "away-player-2",
      );
      const attempt = candidate.events.find(
        (event) => event.type === "penalty",
      );
      if (attempt?.outcome) results[attempt.outcome] = candidate;
    }

    expect(Object.keys(results).sort()).toEqual([
      "goal",
      "off-target",
      "saved",
    ]);
    const scored = results.goal!;
    const saved = results.saved!;
    const missed = results["off-target"]!;
    for (const result of [scored, saved, missed]) {
      const attempts = result.events.filter(
        (event) => event.type === "penalty",
      );
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.teamId).toBe("home");
      expect(attempts[0]?.playerId).toBe("home-player-11");
      expect(attempts[0]?.targetPlayerId).toBe("away-player-1");
      expect(
        result.events.filter((event) => event.type === "foul"),
      ).toHaveLength(1);
      expect(getMatchStatistics(result).home.shots).toBe(1);
      expect(restoreMatch(snapshotMatch(result))).toEqual(result);
    }

    expect(scored.score).toEqual({ home: 1, away: 0 });
    expect(scored.events.filter((event) => event.type === "goal")).toHaveLength(
      1,
    );
    expect(scored.events.at(-1)?.type).toBe("kickoff");
    expect(scored.events.at(-1)?.teamId).toBe("away");
    expect(scored.possessionTeamId).toBe("away");
    expect(getMatchStatistics(scored).home.goals).toBe(1);
    expect(getMatchStatistics(scored).home.shotsOnTarget).toBe(1);

    expect(saved.score).toEqual({ home: 0, away: 0 });
    expect(saved.events.filter((event) => event.type === "save")).toHaveLength(
      1,
    );
    expect(saved.possessionTeamId).toBe("away");
    expect(saved.ballCarrierId).toBe("away-player-1");
    expect(getMatchStatistics(saved).away.saves).toBe(1);
    expect(getMatchStatistics(saved).home.shotsOnTarget).toBe(1);

    expect(missed.score).toEqual({ home: 0, away: 0 });
    expect(missed.events.filter((event) => event.type === "save")).toHaveLength(
      0,
    );
    expect(missed.possessionTeamId).toBe("away");
    expect(missed.ballCarrierId).toBe("away-player-1");
    expect(getMatchStatistics(missed).away.saves).toBe(0);
    expect(getMatchStatistics(missed).home.shotsOnTarget).toBe(0);
  });

  it("does not award a penalty from a drifting carrier coordinate when the ball is outside the area", () => {
    let result: ReturnType<typeof makeTackle> | undefined;
    for (let seed = 1; seed <= 500 && !result; seed += 1) {
      const candidate = makeTackle(
        createCarrierOnlyInPenaltyAreaMatch(seed),
        "away-player-2",
      );
      if (candidate.events.some((event) => event.type === "foul"))
        result = candidate;
    }

    expect(result).toBeDefined();
    expect(result?.events.some((event) => event.type === "penalty")).toBe(
      false,
    );
    expect(
      result?.events.some(
        (event) => event.type === "free-kick" && event.teamId === "home",
      ),
    ).toBe(true);
  });

  it("sends off a player for a second yellow and removes them from the active XI", () => {
    let result: ReturnType<typeof makeTackle> | undefined;
    for (let seed = 1; seed <= 3000 && !result; seed += 1) {
      const started = createStartedMatch(seed);
      const candidate = makeTackle(
        {
          ...started,
          yellowCards: { "away-player-2": 1 },
        },
        "away-player-2",
      );
      if (candidate.dismissedPlayerIds.includes("away-player-2"))
        result = candidate;
    }

    expect(result).toBeDefined();
    expect(result?.awaySelection.startingXI).not.toContain("away-player-2");
    expect(result?.playerPositions["away-player-2"]).toBeUndefined();
    expect(result?.events.some((event) => event.type === "yellow-card")).toBe(
      true,
    );
    expect(result?.events.some((event) => event.type === "red-card")).toBe(
      true,
    );
    expect(result?.awaySelection.startingXI).toHaveLength(10);
  });

  it("ends the match when a dismissal leaves a team below seven players", () => {
    let result: ReturnType<typeof makeTackle> | undefined;
    for (let seed = 1; seed <= 3000 && !result; seed += 1) {
      const started = createStartedMatch(seed);
      const activeIds = started.awaySelection.startingXI.slice(0, 7);
      const activeSet = new Set(activeIds);
      const playerPositions = Object.fromEntries(
        Object.entries(started.playerPositions).filter(
          ([id]) => !id.startsWith("away-") || activeSet.has(id),
        ),
      );
      const reduced = {
        ...started,
        awaySelection: { ...started.awaySelection, startingXI: activeIds },
        playerPositions,
        yellowCards: { "away-player-2": 1 },
      };
      const candidate = makeTackle(reduced, "away-player-2");
      if (candidate.events.some((event) => event.type === "abandonment"))
        result = candidate;
    }

    expect(result?.phase).toBe("full-time");
    expect(result?.awaySelection.startingXI).toHaveLength(6);
    expect(result?.possessionTeamId).toBeNull();
  });

  it("applies a direct red card for a severe foul", () => {
    const homeBase = createTeam("home");
    const awayBase = createTeam("away");
    const homeTeam = {
      ...homeBase,
      squad: homeBase.squad.map((player) =>
        player.id === "home-player-6"
          ? { ...player, attributes: { ...player.attributes, dribbling: 100 } }
          : player,
      ),
    };
    const awayTeam = {
      ...awayBase,
      squad: awayBase.squad.map((player) =>
        player.id === "away-player-2"
          ? {
              ...player,
              attributes: {
                ...player.attributes,
                tackling: 1,
                decisionMaking: 1,
              },
            }
          : player,
      ),
    };
    const homeSelection = createSelection(homeTeam);
    const awaySelection = createSelection(awayTeam);
    let result: ReturnType<typeof makeTackle> | undefined;

    for (let seed = 1; seed <= 5000 && !result; seed += 1) {
      const initial = createMatchState({
        homeTeam,
        awayTeam,
        homeSelection,
        awaySelection,
        seed,
      });
      const candidate = makeTackle(
        startMatch(initial, "home"),
        "away-player-2",
      );
      if (
        candidate.events.some((event) => event.type === "red-card") &&
        !candidate.events.some((event) => event.type === "yellow-card")
      )
        result = candidate;
    }

    expect(result).toBeDefined();
    expect(result?.dismissedPlayerIds).toContain("away-player-2");
    expect(result?.awaySelection.startingXI).toHaveLength(10);
  });

  it("produces deterministic results with the same seed", () => {
    const first = makeTackle(createStartedMatch(12345), "away-player-2");
    const second = makeTackle(createStartedMatch(12345), "away-player-2");

    expect(first).toEqual(second);
  });

  it("rejects a goalkeeper attempting an outfield tackle", () => {
    const state = createStartedMatch(12345);

    expect(() => makeTackle(state, "away-player-12")).toThrow(
      "Tackler must be an active outfield player.",
    );
  });

  it("rejects a player from the team in possession", () => {
    const state = createStartedMatch(12345);

    expect(() => makeTackle(state, "home-player-2")).toThrow(
      "Tackler must be an active outfield player.",
    );
  });
});

describe("player physical attributes", () => {
  const carrier = createPlayer("carrier", "ST");
  const balancedTackler = createPlayer("balanced", "CB");

  it("uses strength in tackle duels", () => {
    const stronger = {
      ...balancedTackler,
      attributes: { ...attributes, strength: 90 },
    };
    expect(
      getTackleSuccessProbability(stronger, carrier, 1800),
    ).toBeGreaterThan(
      getTackleSuccessProbability(balancedTackler, carrier, 1800),
    );
  });

  it("reduces performance late for low-stamina players", () => {
    const tired = {
      ...balancedTackler,
      attributes: { ...attributes, stamina: 20 },
    };
    expect(getTackleSuccessProbability(tired, carrier, 5400)).toBeLessThan(
      getTackleSuccessProbability(tired, carrier, 0),
    );
  });
});

describe("makeShot", () => {
  function createStartedMatch(seed: number) {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed,
    });

    return startMatch(state, homeTeam.id);
  }

  function createShotScenario(
    seed: number,
    distance: number,
    shooterId = "home-player-11",
    shooterAttributes: Partial<Player["attributes"]> = {},
    goalkeeperAttributes: Partial<Player["attributes"]> = {},
    lateralOffset = 0,
  ) {
    const started = createStartedMatch(seed);
    const homeTeam: Team = {
      ...started.homeTeam,
      squad: started.homeTeam.squad.map((player) =>
        player.id === shooterId
          ? {
              ...player,
              attributes: { ...player.attributes, ...shooterAttributes },
            }
          : player,
      ),
    };
    const awayTeam: Team = {
      ...started.awayTeam,
      squad: started.awayTeam.squad.map((player) =>
        player.id === "away-player-1"
          ? {
              ...player,
              attributes: { ...player.attributes, ...goalkeeperAttributes },
            }
          : player,
      ),
    };
    const ballPosition = { x: 105 - distance, y: 34 + lateralOffset };
    return {
      ...started,
      homeTeam,
      awayTeam,
      ballCarrierId: shooterId,
      ballPosition,
      playerPositions: {
        ...started.playerPositions,
        [shooterId]: ballPosition,
      },
    };
  }

  function sampleGoals(
    distance: number,
    shooterAttributes: Partial<Player["attributes"]> = {},
    goalkeeperAttributes: Partial<Player["attributes"]> = {},
    lateralOffset = 0,
    shooterId = "home-player-11",
  ) {
    let goals = 0;
    const sampleCount = 500;
    for (let seed = 1; seed <= sampleCount; seed += 1) {
      const result = makeShot(
        createShotScenario(
          seed,
          distance,
          shooterId,
          shooterAttributes,
          goalkeeperAttributes,
          lateralOffset,
        ),
      );
      goals += result.events.filter((event) => event.type === "goal").length;
    }
    return goals;
  }

  it("restarts after a goal using the submitted V1.0 kickoff preference", () => {
    let scored: ReturnType<typeof makeShot> | undefined;
    for (let seed = 1; seed <= 1000 && !scored; seed += 1) {
      const attempt = makeShot(createShotScenario(seed, 5));
      if (attempt.score.home === 1) scored = attempt;
    }
    expect(scored).toBeDefined();
    const restart = scored!.events.at(-1)!;
    expect(restart.type).toBe("kickoff");
    expect(restart.teamId).toBe("away");
    expect(restart.playerId).toBe("away-player-11");
    expect(scored!.possessionTeamId).toBe("away");
    expect(scored!.ballCarrierId).toBe(restart.playerId);
    expect(scored!.ballPosition).toEqual({ x: 52.5, y: 34 });
    expect(scored!.playerPositions[restart.playerId!]).toEqual(
      scored!.ballPosition,
    );
    expect(
      scored!.awayTeam.squad.find((player) => player.id === restart.playerId)
        ?.primaryPosition,
    ).toBe("ST");

    const firstAction = executeNextAction(scored!);
    expect(
      firstAction.events.find((event) => event.id > restart.id)?.playerId,
    ).toBe(restart.playerId);
  });

  function findShotOutcome(expected: "goal" | "saved" | "off-target") {
    for (let seed = 1; seed <= 1000; seed++) {
      const result = makeShot(createStartedMatch(seed));
      const shot = result.events.find((event) => event.type === "shot");

      if (shot?.outcome === expected) {
        return result;
      }
    }

    throw new Error(`Could not find a ${expected} outcome.`);
  }

  it("records a goal and updates the score", () => {
    const result = findShotOutcome("goal");
    const shot = result.events.find((event) => event.type === "shot");

    expect(result.score.home).toBe(1);
    expect(result.score.away).toBe(0);
    expect(result.events.some((event) => event.type === "goal")).toBe(true);
    expect(result.events.filter((event) => event.type === "goal")).toHaveLength(
      1,
    );
    expect(shot?.playerId).toBe("home-player-11");
    expect(
      result.homeTeam.squad.find((player) => player.id === shot?.playerId)
        ?.primaryPosition,
    ).toBe("ST");
  });

  it("records a goalkeeper save", () => {
    const result = findShotOutcome("saved");

    expect(result.events.some((event) => event.type === "save")).toBe(true);
    expect(result.score.home).toBe(0);
  });

  it("records an off-target shot", () => {
    const result = findShotOutcome("off-target");

    expect(
      result.events.some(
        (event) => event.type === "shot" && event.outcome === "off-target",
      ),
    ).toBe(true);

    expect(result.score.home).toBe(0);
  });

  it("produces deterministic results with the same seed", () => {
    const first = makeShot(createStartedMatch(12345));
    const second = makeShot(createStartedMatch(12345));

    expect(first).toEqual(second);
  });

  it("gives close central shots better conversion than long-range and acute-angle shots", () => {
    const closeCentralGoals = sampleGoals(8);
    const longRangeGoals = sampleGoals(35);
    const acuteAngleGoals = sampleGoals(12, {}, {}, 25);

    expect(closeCentralGoals).toBeGreaterThan(longRangeGoals);
    expect(closeCentralGoals).toBeGreaterThan(acuteAngleGoals);
  });

  it("responds to shooter and goalkeeper attributes without eliminating non-striker goals", () => {
    const highShootingGoals = sampleGoals(12, { shooting: 95, finishing: 95 });
    const lowShootingGoals = sampleGoals(12, { shooting: 20, finishing: 20 });
    const weakGoalkeeperGoals = sampleGoals(
      12,
      {},
      { goalkeeping: 20, positioning: 20 },
    );
    const strongGoalkeeperGoals = sampleGoals(
      12,
      {},
      { goalkeeping: 95, positioning: 95 },
    );

    expect(highShootingGoals).toBeGreaterThan(lowShootingGoals);
    expect(weakGoalkeeperGoals).toBeGreaterThan(strongGoalkeeperGoals);
    expect(sampleGoals(12, {}, {}, 0, "home-player-2")).toBeGreaterThan(0);
    expect(sampleGoals(12, {}, {}, 0, "home-player-6")).toBeGreaterThan(0);
  });

  it("records at most one goal per shot and keeps score aligned with goal events", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const result = makeShot(createShotScenario(seed, 10));
      const shots = result.events.filter((event) => event.type === "shot");
      const goals = result.events.filter((event) => event.type === "goal");
      expect(shots).toHaveLength(1);
      expect(goals.length).toBeLessThanOrEqual(1);
      expect(result.score.home).toBe(goals.length);
      expect(result.score.away).toBe(0);
    }
  });
});

describe("match clock boundaries", () => {
  it("ends the first half when a pass reaches 45 minutes", () => {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed: 12345,
    });

    const startedState = startMatch(state, homeTeam.id);

    const nearHalfTime = {
      ...startedState,
      elapsedSeconds: 2698,
    };

    const nextState = makePass(nearHalfTime, "home-player-10");

    expect(nextState.elapsedSeconds).toBe(2700);
    expect(nextState.phase).toBe("half-time");
  });

  it("ends the first half when a tackle reaches 45 minutes", () => {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed: 12345,
    });

    const startedState = startMatch(state, homeTeam.id);

    const nearHalfTime = {
      ...startedState,
      elapsedSeconds: 2698,
    };

    const nextState = makeTackle(nearHalfTime, "away-player-2");

    expect(nextState.elapsedSeconds).toBe(2700);
    expect(nextState.phase).toBe("half-time");
  });

  it("ends the match when a shot reaches 90 minutes", () => {
    const homeTeam = createTeam("home");
    const awayTeam = createTeam("away");

    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed: 12345,
    });

    const startedState = startMatch(state, homeTeam.id);

    const nearFullTime = {
      ...startedState,
      phase: "second-half" as const,
      elapsedSeconds: 5398,
    };

    const nextState = makeShot(nearFullTime);

    expect(nextState.elapsedSeconds).toBe(5400);
    expect(nextState.phase).toBe("full-time");
  });
});
describe("substitutePlayer", () => {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  function createStartedState() {
    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection: createSelection(homeTeam),
      awaySelection: createSelection(awayTeam),
      seed: 12345,
    });

    return startMatch(state, homeTeam.id);
  }

  it("replaces an active player with an eligible substitute", () => {
    const state = createStartedState();

    const nextState = substitutePlayer(
      state,
      homeTeam.id,
      "home-player-10",
      "home-player-16",
    );

    expect(nextState.homeSelection.startingXI).toContain("home-player-16");
    expect(nextState.homeSelection.startingXI).not.toContain("home-player-10");
    expect(nextState.homeSelection.substitutes).not.toContain("home-player-16");
  });

  it("records the substitution in the event log", () => {
    const state = createStartedState();

    const nextState = substitutePlayer(
      state,
      homeTeam.id,
      "home-player-10",
      "home-player-16",
    );

    const event = nextState.events.at(-1);

    expect(event?.type).toBe("substitution");
    expect(event?.playerId).toBe("home-player-16");
    expect(event?.targetPlayerId).toBe("home-player-10");
  });

  it("increments the correct team's substitution count", () => {
    const state = createStartedState();

    const nextState = substitutePlayer(
      state,
      homeTeam.id,
      "home-player-10",
      "home-player-16",
    );

    expect(nextState.substitutionsUsed.home).toBe(1);
    expect(nextState.substitutionsUsed.away).toBe(0);
    expect(nextState.firstHalfAddedTimeSeconds).toBe(30);
  });

  it("rejects a player who is not on the pitch", () => {
    const state = createStartedState();

    expect(() =>
      substitutePlayer(state, homeTeam.id, "home-player-16", "home-player-15"),
    ).toThrow("Outgoing player must be on the pitch.");
  });

  it("rejects an incoming player who is not a substitute", () => {
    const state = createStartedState();

    expect(() =>
      substitutePlayer(state, homeTeam.id, "home-player-10", "home-player-9"),
    ).toThrow("Incoming player must be an eligible substitute.");
  });

  it("rejects a team outside the match", () => {
    const state = createStartedState();

    expect(() =>
      substitutePlayer(
        state,
        "unknown-team",
        "home-player-10",
        "home-player-16",
      ),
    ).toThrow("Team must belong to this match.");
  });

  it("rejects substitutions after full-time", () => {
    const state = {
      ...createStartedState(),
      phase: "full-time" as const,
    };

    expect(() =>
      substitutePlayer(state, homeTeam.id, "home-player-10", "home-player-16"),
    ).toThrow("Substitutions are only allowed during a match.");
  });

  it("updates the ball carrier if that player is substituted", () => {
    const state = createStartedState();

    const nextState = substitutePlayer(
      state,
      homeTeam.id,
      state.ballCarrierId!,
      "home-player-16",
    );

    expect(nextState.ballCarrierId).toBe("home-player-16");
  });

  it("allows substitutions at half-time without using an opportunity", () => {
    const state = {
      ...createStartedState(),
      phase: "half-time" as const,
      elapsedSeconds: 2700,
    };

    const nextState = substitutePlayer(
      state,
      homeTeam.id,
      "home-player-10",
      "home-player-16",
    );

    expect(nextState.substitutionsUsed.home).toBe(1);
    expect(nextState.substitutionWindowsUsed.home).toBe(0);
    expect(nextState.firstHalfAddedTimeSeconds).toBe(0);
    expect(nextState.secondHalfAddedTimeSeconds).toBe(0);
  });

  it("counts multiple substitutions in the same window as one opportunity", () => {
    const state = createStartedState();

    const first = substitutePlayer(
      state,
      homeTeam.id,
      "home-player-10",
      "home-player-16",
      "window-1",
    );

    const second = substitutePlayer(
      first,
      homeTeam.id,
      "home-player-9",
      "home-player-15",
      "window-1",
    );

    expect(second.substitutionsUsed.home).toBe(2);
    expect(second.substitutionWindowsUsed.home).toBe(1);
  });

  it("rejects a fourth substitution opportunity", () => {
    let state = createStartedState();

    const substitutions = [
      ["home-player-10", "home-player-16"],
      ["home-player-9", "home-player-15"],
      ["home-player-8", "home-player-14"],
    ] as const;

    substitutions.forEach(([outgoing, incoming], index) => {
      state = substitutePlayer(
        state,
        homeTeam.id,
        outgoing,
        incoming,
        `window-${index + 1}`,
      );
    });

    expect(() =>
      substitutePlayer(
        state,
        homeTeam.id,
        "home-player-7",
        "home-player-13",
        "window-4",
      ),
    ).toThrow("Maximum of three substitution opportunities reached.");
  });

  it("rejects a sixth substitution", () => {
    const state = {
      ...createStartedState(),
      substitutionsUsed: {
        home: 5,
        away: 0,
      },
    };

    expect(() =>
      substitutePlayer(
        state,
        homeTeam.id,
        "home-player-5",
        "home-player-16",
        "window-3",
      ),
    ).toThrow("Maximum of five substitutions reached.");
  });

  it("rejects a substitution that leaves no goalkeeper on the pitch", () => {
    const state = createStartedState();

    expect(() =>
      substitutePlayer(
        state,
        homeTeam.id,
        "home-player-1",
        "home-player-16",
        "window-1",
      ),
    ).toThrow("A substitution must leave exactly one goalkeeper on the pitch.");
  });
});
