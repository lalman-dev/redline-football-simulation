import { describe, expect, it } from "vitest";
import {
  createMatchState,
  makeCarry,
  makePass,
  makeTackle,
  makeShot,
  startMatch,
  startSecondHalf,
} from "../match.js";
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
    expect(match.events).toHaveLength(1);
    expect(match.events[0]?.type).toBe("kickoff");
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
    expect(match.events).toHaveLength(2);
    expect(match.events[1]?.minute).toBe(45);
    expect(match.events[1]?.elapsedSeconds).toBe(2700);
    expect(match.events[1]?.description).toContain("second half");
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

  it("records a pass and advances match time", () => {
    const state = createStartedMatch(12345);
    const nextState = makePass(state, "home-player-10");
    const passEvent = nextState.events[1];

    expect(passEvent?.type).toBe("pass");
    expect(passEvent?.playerId).toBe("home-player-11");
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

    expect(() => makePass(state, "home-player-11")).toThrow(
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

  it("records a tackle and advances match time", () => {
    const state = createStartedMatch(12345);
    const nextState = makeTackle(state, "away-player-2");
    const tackleEvent = nextState.events[1];

    expect(tackleEvent?.type).toBe("tackle");
    expect(tackleEvent?.playerId).toBe("away-player-2");
    expect(tackleEvent?.targetPlayerId).toBe("home-player-11");
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
      expect(nextState.ballCarrierId).toBe("home-player-11");
    }
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

    expect(result.score.home).toBe(1);
    expect(result.score.away).toBe(0);
    expect(result.events.some((event) => event.type === "goal")).toBe(true);
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

    const nextState = makePass(nearHalfTime, "home-player-6");

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
