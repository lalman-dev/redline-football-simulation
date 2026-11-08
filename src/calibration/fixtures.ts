import type { Player, Team, TeamSelection } from "../engine/types.js";

const DEFAULT_ATTRIBUTES = {
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

function createPlayer(
  id: string,
  position: Player["primaryPosition"],
  attributeOverrides: Partial<Player["attributes"]> = {},
): Player {
  return {
    id,
    name: `Player ${id}`,
    age: 25,
    primaryPosition: position,
    secondaryPositions: [],
    attributes: {
      ...DEFAULT_ATTRIBUTES,
      ...attributeOverrides,
    },
  };
}

export function createCalibrationTeam(
  id: string,
  attributeOverrides: Partial<Player["attributes"]> = {},
): Team {
  const positions: Player["primaryPosition"][] = [
    // Starting XI
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

    // Seven substitutes
    "GK",
    "CB",
    "LB",
    "RB",
    "CM",
    "AM",
    "ST",
  ];

  return {
    id,
    name: `Team ${id}`,
    squad: positions.map((position, index) =>
      createPlayer(`${id}-player-${index + 1}`, position, attributeOverrides),
    ),
  };
}

export function createCalibrationSelection(team: Team): TeamSelection {
  return {
    teamId: team.id,
    startingXI: team.squad.slice(0, 11).map((player) => player.id),
    substitutes: team.squad.slice(11).map((player) => player.id),

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
