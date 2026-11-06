import { describe, expect, it } from "vitest";
import {
  chooseNextAction,
  executeNextAction,
  executeDefensiveAction,
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

function createState(): MatchState {
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
    events: [],
    rngState: 12345,
  };
}

describe("chooseNextAction", () => {
  it("chooses a shot for a capable attacker", () => {
    const state = createState();

    const updatedTeam: Team = {
      ...state.homeTeam,
      squad: state.homeTeam.squad.map((player) =>
        player.id === state.ballCarrierId
          ? {
              ...player,
              attributes: {
                ...player.attributes,
                shooting: 85,
                finishing: 85,
              },
            }
          : player,
      ),
    };

    const updatedState: MatchState = {
      ...state,
      homeTeam: updatedTeam,
    };

    expect(chooseNextAction(updatedState)).toBe("shoot");
  });

  it("chooses a pass when shooting ability is low", () => {
    const state = createState();

    const player = state.homeTeam.squad.find(
      (item) => item.id === state.ballCarrierId,
    )!;

    const updatedTeam: Team = {
      ...state.homeTeam,
      squad: state.homeTeam.squad.map((item) =>
        item.id === player.id
          ? {
              ...item,
              attributes: {
                ...item.attributes,
                shooting: 30,
                finishing: 30,
              },
            }
          : item,
      ),
    };

    const updatedState: MatchState = {
      ...state,
      homeTeam: updatedTeam,
    };

    expect(chooseNextAction(updatedState)).toBe("pass");
  });

  it("rejects a match without possession", () => {
    const state: MatchState = {
      ...createState(),
      possessionTeamId: null,
      ballCarrierId: null,
    };

    expect(() => chooseNextAction(state)).toThrow(
      "Cannot choose an action without possession.",
    );
  });
});

describe("executeNextAction", () => {
  it("executes a pass when the carrier should pass", () => {
    const state = createState();

    const nextState = executeNextAction(state);

    expect(nextState.events).toHaveLength(1);
    expect(nextState.events[0]?.type).toBe("pass");
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
  });

  it("executes a shot when the carrier is a capable attacker", () => {
    const state = createState();

    const updatedTeam: Team = {
      ...state.homeTeam,
      squad: state.homeTeam.squad.map((player) =>
        player.id === state.ballCarrierId
          ? {
              ...player,
              attributes: {
                ...player.attributes,
                shooting: 85,
                finishing: 85,
              },
            }
          : player,
      ),
    };

    const updatedState: MatchState = {
      ...state,
      homeTeam: updatedTeam,
    };

    const nextState = executeNextAction(updatedState);

    expect(nextState.events.some((event) => event.type === "shot")).toBe(true);
    expect(nextState.elapsedSeconds).toBeGreaterThan(0);
  });
});

describe("executeDefensiveAction", () => {
  it("selects an opposing player to attempt a tackle", () => {
    const state = createState();

    const nextState = executeDefensiveAction(state);

    expect(nextState.events).toHaveLength(1);
    expect(nextState.events[0]?.type).toBe("tackle");
    expect(nextState.events[0]?.teamId).toBe("away");
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
