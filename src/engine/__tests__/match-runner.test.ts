import { describe, expect, it } from "vitest";
import { createMatchState } from "../match.js";
import { simulateMatch } from "../match-runner.js";
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
    startingXI: team.squad.map((player) => player.id),
    substitutes: [],
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

function createInitialState(seed: number) {
  const homeTeam = createTeam("home");
  const awayTeam = createTeam("away");

  return createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    seed,
  });
}

describe("simulateMatch", () => {
  it("completes a full match", () => {
    const result = simulateMatch(createInitialState(12345), {
      kickoffTeamId: "home",
    });

    expect(result.phase).toBe("full-time");
    expect(result.elapsedSeconds).toBe(5400);
    expect(result.events.some((event) => event.type === "half-time")).toBe(
      true,
    );
    expect(result.events.some((event) => event.type === "full-time")).toBe(
      true,
    );
  });

  it("records the second-half kickoff and goal restarts correctly", () => {
    const result = simulateMatch(createInitialState(12345), {
      kickoffTeamId: "home",
    });

    const kickoffs = result.events.filter((event) => event.type === "kickoff");

    // Initial kickoff belongs to the home team.
    expect(kickoffs[0]?.teamId).toBe("home");

    // Find the second-half kickoff independently of goal restarts.
    const secondHalfKickoff = kickoffs.find((event) =>
      event.description.includes("second half"),
    );

    expect(secondHalfKickoff).toBeDefined();
    expect(secondHalfKickoff?.teamId).toBe("away");
    expect(secondHalfKickoff?.minute).toBe(45);

    // Every goal must produce exactly one goal restart.
    const goals = result.events.filter((event) => event.type === "goal");

    const goalRestarts = kickoffs.filter((event) =>
      event.description.includes("after conceding a goal"),
    );

    expect(goalRestarts).toHaveLength(goals.length);

    // The team conceding each goal must take the restart.
    for (const goal of goals) {
      const restart = goalRestarts.find(
        (event) => event.elapsedSeconds === goal.elapsedSeconds,
      );

      expect(restart).toBeDefined();
      expect(restart?.teamId).toBe(goal.teamId === "home" ? "away" : "home");
    }
  });

  it("produces identical results with identical seeds", () => {
    const first = simulateMatch(createInitialState(12345), {
      kickoffTeamId: "home",
    });

    const second = simulateMatch(createInitialState(12345), {
      kickoffTeamId: "home",
    });

    expect(first.score).toEqual(second.score);
    expect(first.events).toEqual(second.events);
    expect(first.rngState).toBe(second.rngState);
  });

  it("rejects an action limit that is too small", () => {
    expect(() =>
      simulateMatch(createInitialState(12345), {
        kickoffTeamId: "home",
        maxActions: 1,
      }),
    ).toThrow("Maximum simulation actions exceeded.");
  });

  it("rejects an invalid maximum action count", () => {
    expect(() =>
      simulateMatch(createInitialState(12345), {
        kickoffTeamId: "home",
        maxActions: 0,
      }),
    ).toThrow("Maximum actions must be a positive integer.");
  });
});
