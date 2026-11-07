import type { PitchPosition, MatchState } from "./match-state.js";
import type { Player, Team, TeamSelection } from "./types.js";
import { PITCH_LENGTH, PITCH_WIDTH } from "./pitch.js";

export type PlayerPositionMap = Readonly<Record<string, PitchPosition>>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function spreadAcrossWidth(count: number): number[] {
  if (count <= 1) return [PITCH_WIDTH / 2];

  const margin = 8;
  return Array.from(
    { length: count },
    (_, index) => margin + (index * (PITCH_WIDTH - margin * 2)) / (count - 1),
  );
}

function rolePriority(
  player: Player,
  line: "defenders" | "midfielders" | "forwards",
): number {
  const priorities = {
    defenders: ["CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST", "GK"],
    midfielders: ["DM", "CM", "AM", "LB", "RB", "LW", "RW", "CB", "ST", "GK"],
    forwards: ["ST", "LW", "RW", "AM", "CM", "DM", "LB", "RB", "CB", "GK"],
  };

  const index = priorities[line].indexOf(player.primaryPosition);
  return index === -1 ? 99 : index;
}

function selectLine(
  players: readonly Player[],
  count: number,
  line: "defenders" | "midfielders" | "forwards",
): Player[] {
  return [...players]
    .sort((a, b) => rolePriority(a, line) - rolePriority(b, line))
    .slice(0, count);
}

/**
 * Generates deterministic starting positions for the selected XI.
 * Coordinates use metres on a 105 x 68 pitch.
 */
export function createTeamPlayerPositions(
  team: Team,
  selection: TeamSelection,
  attackingRight: boolean,
): Record<string, PitchPosition> {
  const players = selection.startingXI.map((id) => {
    const player = team.squad.find((candidate) => candidate.id === id);
    if (!player) {
      throw new Error(`Selected player ${id} was not found in ${team.name}.`);
    }
    return player;
  });

  if (players.length !== 11) {
    throw new Error("A team must have exactly eleven selected players.");
  }

  const goalkeepers = players.filter(
    (player) => player.primaryPosition === "GK",
  );

  if (goalkeepers.length !== 1) {
    throw new Error("A team must have exactly one goalkeeper.");
  }

  const goalkeeper = goalkeepers[0]!;
  const outfield = players.filter((player) => player.id !== goalkeeper.id);

  const {
    defenders: defenderCount,
    midfielders: midfielderCount,
    forwards: forwardCount,
  } = selection.formation;

  if (
    defenderCount + midfielderCount + forwardCount !== 10 ||
    defenderCount < 1 ||
    midfielderCount < 1 ||
    forwardCount < 1
  ) {
    throw new Error("Formation must contain exactly ten outfield players.");
  }

  // Assign players to formation lines by positional suitability.
  const defenders = selectLine(outfield, defenderCount, "defenders");
  const defenderIds = new Set(defenders.map((player) => player.id));

  const remainingAfterDefence = outfield.filter(
    (player) => !defenderIds.has(player.id),
  );

  const forwards = selectLine(remainingAfterDefence, forwardCount, "forwards");
  const forwardIds = new Set(forwards.map((player) => player.id));

  const remainingAfterAttack = remainingAfterDefence.filter(
    (player) => !forwardIds.has(player.id),
  );

  const midfielders = selectLine(
    remainingAfterAttack,
    midfielderCount,
    "midfielders",
  );

  const ownGoalX = attackingRight ? 3 : PITCH_LENGTH - 3;

  const lineDepth = {
    defenders: 24 - (defenderCount - 4) * 1.5,
    midfielders: 43 + (midfielderCount - 3) * 1.5,
    forwards: 66 + (forwardCount - 3) * 1.5,
  };

  const positions: Record<string, PitchPosition> = {
    [goalkeeper.id]: {
      x: ownGoalX,
      y: PITCH_WIDTH / 2,
    },
  };

  const placeLine = (line: readonly Player[], depth: number) => {
    const lanes = spreadAcrossWidth(line.length);
    const x = attackingRight ? depth : PITCH_LENGTH - depth;

    line.forEach((player, index) => {
      positions[player.id] = {
        x: clamp(x, 0, PITCH_LENGTH),
        y: lanes[index] ?? PITCH_WIDTH / 2,
      };
    });
  };

  placeLine(defenders, lineDepth.defenders);
  placeLine(midfielders, lineDepth.midfielders);
  placeLine(forwards, lineDepth.forwards);

  return positions;
}

/** Generates the positions of both teams for the current half. */
export function createMatchPlayerPositions(
  homeTeam: Team,
  awayTeam: Team,
  homeSelection: TeamSelection,
  awaySelection: TeamSelection,
  secondHalf = false,
): Record<string, PitchPosition> {
  return {
    ...createTeamPlayerPositions(homeTeam, homeSelection, !secondHalf),
    ...createTeamPlayerPositions(awayTeam, awaySelection, secondHalf),
  };
}

/** Returns the attacking direction for a team in the current match phase. */
export function getTeamAttacksRight(
  state: Pick<MatchState, "phase" | "homeTeam">,
  teamId: string,
): boolean {
  const homeAttacksRight = state.phase !== "second-half";
  return teamId === state.homeTeam.id ? homeAttacksRight : !homeAttacksRight;
}
