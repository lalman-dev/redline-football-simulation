import { describe, expect, it } from "vitest";
import {
  chooseNextAction,
  executeNextAction,
  executeDefensiveAction,
  getShootingProbability,
} from "../simulation.js";
import type { MatchState } from "../match-state.js";
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
    substitutes: team.squad.slice(11).map((player) => player.id),
    formation: { defenders: 4, midfielders: 3, forwards: 3 },
    tactics: {
      mentality: 50,
      pressing: 50,
      tempo: 50,
      width: 50,
      defensiveLine: 50,
    },
  };
}

function createState(seed = 12345): MatchState {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  return {
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    phase: "first-half",
    elapsedSeconds: 0,
    score: { home: 0, away: 0 },
    possessionTeamId: homeTeam.id,
    ballCarrierId: "home-player-11",
    ballPosition: { x: 52.5, y: 34 },
    events: [],
    rngState: seed,
  };
}

describe("getShootingProbability", () => {
  it("gives a striker a higher shooting probability than a centre-back", () => {
    const strikerState = createState();

    const defenderState: MatchState = {
      ...strikerState,
      ballCarrierId: "home-player-2",
    };

    expect(getShootingProbability(strikerState)).toBeGreaterThan(
      getShootingProbability(defenderState),
    );
  });

  it("increases shooting probability with attacking mentality", () => {
    const state = createState();

    const attackingState: MatchState = {
      ...state,
      homeSelection: {
        ...state.homeSelection,
        tactics: {
          ...state.homeSelection.tactics,
          mentality: 90,
        },
      },
    };

    expect(getShootingProbability(attackingState)).toBeGreaterThan(
      getShootingProbability(state),
    );
  });

  it("keeps shooting probability within its configured limits", () => {
    expect(getShootingProbability(createState())).toBeGreaterThanOrEqual(0.001);
    expect(getShootingProbability(createState())).toBeLessThanOrEqual(0.08);
  });

  it("rejects a match without possession", () => {
    const state: MatchState = {
      ...createState(),
      possessionTeamId: null,
      ballCarrierId: null,
    };

    expect(() => getShootingProbability(state)).toThrow(
      "Cannot choose an action without possession.",
    );
  });
});

describe("chooseNextAction", () => {
  it("makes the same decision with the same seed", () => {
    const state = createState(12345);

    expect(chooseNextAction(state)).toBe(chooseNextAction(state));
  });

  it("can choose both passing and shooting across different seeds", () => {
    const actions = new Set(
      Array.from({ length: 1000 }, (_, index) =>
        chooseNextAction(createState(index + 1)),
      ),
    );

    expect(actions.has("pass")).toBe(true);
    expect(actions.has("shoot")).toBe(true);
  });
});

describe("executeNextAction", () => {
  it("produces identical actions and RNG states for identical seeds", () => {
    const first = executeNextAction(createState(12345));
    const second = executeNextAction(createState(12345));

    expect(first.events).toEqual(second.events);
    expect(first.rngState).toBe(second.rngState);
    expect(first.elapsedSeconds).toBe(second.elapsedSeconds);
  });

  it("advances the RNG state when executing an action", () => {
    const state = createState(12345);
    const nextState = executeNextAction(state);

    expect(nextState.rngState).not.toBe(state.rngState);
  });

  it("records either a pass or a shot", () => {
    const nextState = executeNextAction(createState());

    expect(["pass", "shot"]).toContain(nextState.events[0]?.type);
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
  });

  it("rejects a match without possession", () => {
    const state: MatchState = {
      ...createState(),
      possessionTeamId: null,
      ballCarrierId: null,
    };

    expect(() => executeNextAction(state)).toThrow(
      "Cannot choose an action without possession.",
    );
  });
});

describe("executeDefensiveAction", () => {
  it("selects an opposing player to attempt a tackle", () => {
    const nextState = executeDefensiveAction(createState());

    expect(nextState.events).toHaveLength(1);
    expect(nextState.events[0]?.type).toBe("tackle");
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
  });

  it("rejects a match without possession", () => {
    const state: MatchState = {
      ...createState(),
      possessionTeamId: null,
      ballCarrierId: null,
    };

    expect(() => executeDefensiveAction(state)).toThrow(
      "Cannot defend without an opposing team in possession.",
    );
  });
});
