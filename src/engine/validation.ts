import type { Team, TeamSelection, Player } from "./types.js";

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isValidAttribute(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 100;
}

function validatePlayerAttributes(player: Player): string[] {
  const errors: string[] = [];

  for (const [attribute, value] of Object.entries(player.attributes)) {
    if (!isValidAttribute(value)) {
      errors.push(
        `Player "${player.name}" has an invalid ${attribute} value: ${value}. Expected 1–100.`,
      );
    }
  }

  return errors;
}

export function validateTeamSelection(
  team: Team,
  selection: TeamSelection,
): ValidationResult {
  const errors: string[] = [];

  const squadIds = team.squad.map((player) => player.id);

  if (new Set(squadIds).size !== squadIds.length) {
    errors.push("Team squad contains duplicate player IDs.");
  }

  // Confirm the selection belongs to this team.
  if (selection.teamId !== team.id) {
    errors.push("Team selection does not belong to this team.");
  }

  // Formation must contain ten outfield players.
  const formationTotal =
    selection.formation.defenders +
    selection.formation.midfielders +
    selection.formation.forwards;

  const formationValues = [
    selection.formation.defenders,
    selection.formation.midfielders,
    selection.formation.forwards,
  ];

  if (
    formationTotal !== 10 ||
    formationValues.some((value) => !Number.isInteger(value) || value < 1)
  ) {
    errors.push(
      "Formation must contain exactly 10 outfield players, with at least one defender, midfielder, and forward.",
    );
  }

  // Tactical settings must be between 1 and 100.
  for (const [tactic, value] of Object.entries(selection.tactics)) {
    if (!isValidAttribute(value)) {
      errors.push(`Invalid ${tactic} value: ${value}. Expected 1–100.`);
    }
  }

  // Check starting XI size and duplicates.
  if (selection.startingXI.length !== 11) {
    errors.push("Starting XI must contain exactly 11 players.");
  }

  if (new Set(selection.startingXI).size !== selection.startingXI.length) {
    errors.push("Starting XI contains duplicate player IDs.");
  }

  // Check substitute duplicates and overlap with starters.
  if (new Set(selection.substitutes).size !== selection.substitutes.length) {
    errors.push("Substitutes contain duplicate player IDs.");
  }

  const startingIds = new Set(selection.startingXI);

  for (const playerId of selection.substitutes) {
    if (startingIds.has(playerId)) {
      errors.push(
        `Player ${playerId} cannot be both a starter and a substitute.`,
      );
    }
  }

  // Every selected player must belong to the squad.
  const squadById = new Map(team.squad.map((player) => [player.id, player]));

  const selectedIds = [...selection.startingXI, ...selection.substitutes];

  for (const playerId of selectedIds) {
    if (!squadById.has(playerId)) {
      errors.push(`Player ${playerId} does not belong to team "${team.name}".`);
    }
  }

  // A starting XI must contain exactly one goalkeeper.
  const startingPlayers = selection.startingXI
    .map((playerId) => squadById.get(playerId))
    .filter((player): player is Player => player !== undefined);

  const goalkeepers = startingPlayers.filter(
    (player) => player.primaryPosition === "GK",
  );

  if (goalkeepers.length !== 1) {
    errors.push("Starting XI must contain exactly one goalkeeper.");
  }

  // Validate attributes for selected players.
  for (const playerId of selectedIds) {
    const player = squadById.get(playerId);

    if (player) {
      errors.push(...validatePlayerAttributes(player));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
