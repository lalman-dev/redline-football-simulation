import { describe, expect, it } from "vitest";
import { validateTeamSelection } from "../validation.js";
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
    attributes: { ...attributes },
  };
}

const squad: Player[] = [
  createPlayer("p1", "GK"),
  createPlayer("p2", "CB"),
  createPlayer("p3", "CB"),
  createPlayer("p4", "LB"),
  createPlayer("p5", "RB"),
  createPlayer("p6", "DM"),
  createPlayer("p7", "CM"),
  createPlayer("p8", "CM"),
  createPlayer("p9", "LW"),
  createPlayer("p10", "RW"),
  createPlayer("p11", "ST"),
  createPlayer("p12", "ST"),
  createPlayer("p13", "CM"),
  createPlayer("p14", "CB"),
  createPlayer("p15", "LB"),
  createPlayer("p16", "GK"),
];

const team: Team = {
  id: "team-1",
  name: "Test FC",
  squad,
};

const validSelection: TeamSelection = {
  teamId: "team-1",
  startingXI: [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
    "p8",
    "p9",
    "p10",
    "p11",
  ],
  substitutes: ["p12", "p13", "p14", "p15", "p16"],
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

describe("validateTeamSelection", () => {
  it("accepts a valid team selection", () => {
    const result = validateTeamSelection(team, validSelection);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a starting XI with fewer than 11 players", () => {
    const selection = {
      ...validSelection,
      startingXI: validSelection.startingXI.slice(0, 10),
    };

    const result = validateTeamSelection(team, selection);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Starting XI must contain exactly 11 players.",
    );
  });

  it("rejects duplicate starters", () => {
    const selection = {
      ...validSelection,
      startingXI: [...validSelection.startingXI.slice(0, 10), "p10"],
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Starting XI contains duplicate player IDs.",
    );
  });

  it("rejects a selection with no goalkeeper", () => {
    const selection = {
      ...validSelection,
      startingXI: [
        "p2",
        "p3",
        "p4",
        "p5",
        "p6",
        "p7",
        "p8",
        "p9",
        "p10",
        "p11",
        "p12",
      ],
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Starting XI must contain exactly one goalkeeper.",
    );
  });

  it("rejects a player selected as both starter and substitute", () => {
    const selection = {
      ...validSelection,
      substitutes: ["p2", "p12"],
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Player p2 cannot be both a starter and a substitute.",
    );
  });

  it("rejects an invalid formation", () => {
    const selection = {
      ...validSelection,
      formation: {
        defenders: 3.5,
        midfielders: 3.5,
        forwards: 3,
      },
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Formation must contain exactly 10 outfield players, with at least one defender, midfielder, and forward.",
    );
  });

  it("rejects invalid tactical values", () => {
    const selection = {
      ...validSelection,
      tactics: {
        ...validSelection.tactics,
        pressing: 101,
      },
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Invalid pressing value: 101. Expected 1–100.",
    );
  });

  // Additional edge-case tests

  it("rejects a player who is not in the squad", () => {
    const selection = {
      ...validSelection,
      startingXI: [...validSelection.startingXI.slice(0, 10), "unknown-player"],
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      'Player unknown-player does not belong to team "Test FC".',
    );
  });

  it("rejects a selection belonging to another team", () => {
    const selection = {
      ...validSelection,
      teamId: "another-team",
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Team selection does not belong to this team.",
    );
  });

  it("rejects duplicate substitute IDs", () => {
    const selection = {
      ...validSelection,
      substitutes: ["p12", "p12"],
    };

    const result = validateTeamSelection(team, selection);

    expect(result.errors).toContain(
      "Substitutes contain duplicate player IDs.",
    );
  });

  it("rejects invalid player attributes", () => {
    const invalidPlayer: Player = {
      ...squad[1]!,
      attributes: {
        ...squad[1]!.attributes,
        passing: 101,
      },
    };

    const modifiedTeam: Team = {
      ...team,
      squad: [squad[0]!, invalidPlayer, ...squad.slice(2)],
    };

    const result = validateTeamSelection(modifiedTeam, validSelection);

    expect(result.errors).toContain(
      'Player "Player p2" has an invalid passing value: 101. Expected 1–100.',
    );
  });

  it("rejects duplicate IDs inside the squad", () => {
    const modifiedTeam: Team = {
      ...team,
      squad: [...squad, squad[0]!],
    };

    const result = validateTeamSelection(modifiedTeam, validSelection);

    expect(result.errors).toContain(
      "Team squad contains duplicate player IDs.",
    );
  });
});
