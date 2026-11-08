import type { MatchState, PitchPosition } from "./match-state.js";
import type { Player } from "./types.js";
import { PITCH_LENGTH, PITCH_WIDTH } from "./pitch.js";
import {
  createTeamPlayerPositions,
  getTeamAttacksRight,
  movePlayerTowards,
} from "./spatial.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type TacticalRole = "goalkeeper" | "defender" | "midfielder" | "forward";

function getRole(player: Player): TacticalRole {
  switch (player.primaryPosition) {
    case "GK":
      return "goalkeeper";
    case "CB":
    case "LB":
    case "RB":
      return "defender";
    case "DM":
    case "CM":
    case "AM":
      return "midfielder";
    case "LW":
    case "RW":
    case "ST":
      return "forward";
  }
}

interface TeamMovementContext {
  readonly teamId: string;
  readonly hasPossession: boolean;
  readonly attacksRight: boolean;
  readonly formationPositions: Record<string, PitchPosition>;
  readonly mentality: number;
  readonly pressing: number;
  readonly tempo: number;
  readonly width: number;
  readonly defensiveLine: number;
}

function getTeamMovementContext(
  state: MatchState,
  teamId: string,
): TeamMovementContext {
  const isHome = teamId === state.homeTeam.id;
  const team = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  return {
    teamId,
    hasPossession: state.possessionTeamId === teamId,
    attacksRight: getTeamAttacksRight(state, teamId),
    formationPositions: createTeamPlayerPositions(
      team,
      selection,
      getTeamAttacksRight(state, teamId),
    ),
    mentality: selection.tactics.mentality,
    pressing: selection.tactics.pressing,
    tempo: selection.tactics.tempo,
    width: selection.tactics.width,
    defensiveLine: selection.tactics.defensiveLine,
  };
}

function getTeamTarget(
  state: MatchState,
  context: TeamMovementContext,
  player: Player,
): PitchPosition {
  const anchor = context.formationPositions[player.id];

  if (!anchor) {
    return state.playerPositions[player.id] ?? state.ballPosition;
  }

  const role = getRole(player);
  const ball = state.ballPosition;

  if (role === "goalkeeper") {
    const ownGoalX = context.attacksRight ? 3 : PITCH_LENGTH - 3;

    return {
      x: clamp(ownGoalX + (ball.x - ownGoalX) * 0.06, 1, PITCH_LENGTH - 1),
      y: clamp(
        PITCH_WIDTH / 2 + (ball.y - PITCH_WIDTH / 2) * 0.18,
        12,
        PITCH_WIDTH - 12,
      ),
    };
  }

  const horizontalShift = clamp((ball.x - PITCH_LENGTH / 2) * 0.12, -7, 7);

  const verticalShift = clamp((ball.y - PITCH_WIDTH / 2) * 0.14, -5, 5);

  const direction = context.attacksRight ? 1 : -1;

  const mentalityShift = ((context.mentality - 50) / 50) * 5;

  const possessionShift = context.hasPossession
    ? direction * (4 + mentalityShift)
    : -direction * (context.pressing / 100) * 2;

  const defensiveLineShift = ((context.defensiveLine - 50) / 50) * 4;

  let roleDepth = 0;

  if (context.hasPossession) {
    switch (role) {
      case "defender":
        roleDepth = -1;
        break;
      case "midfielder":
        roleDepth = 1;
        break;
      case "forward":
        roleDepth = 3;
        break;
    }
  } else {
    switch (role) {
      case "defender":
        roleDepth = 1;
        break;
      case "midfielder":
        roleDepth = 0;
        break;
      case "forward":
        roleDepth = -1;
        break;
    }
  }

  let defensiveLineInfluence = 0;

  if (role === "defender") {
    defensiveLineInfluence = defensiveLineShift;
  } else if (role === "midfielder") {
    defensiveLineInfluence = defensiveLineShift * 0.35;
  }

  const widePlayer =
    player.primaryPosition === "LW" ||
    player.primaryPosition === "RW" ||
    player.primaryPosition === "LB" ||
    player.primaryPosition === "RB";

  const widthScale = 0.75 + context.width / 200;

  const anchorY = PITCH_WIDTH / 2 + (anchor.y - PITCH_WIDTH / 2) * widthScale;

  const playerVerticalShift = widePlayer
    ? verticalShift * 0.45
    : verticalShift * 0.75;

  return {
    x: clamp(
      anchor.x +
        horizontalShift +
        possessionShift +
        direction * roleDepth +
        direction * defensiveLineInfluence,
      2,
      PITCH_LENGTH - 2,
    ),
    y: clamp(anchorY + playerVerticalShift, 4, PITCH_WIDTH - 4),
  };
}

function getMovementSpeed(
  context: TeamMovementContext,
  player: Player,
): number {
  const role = getRole(player);

  if (role === "goalkeeper") {
    return 0.7;
  }

  const baseSpeed = context.hasPossession ? 1.5 : 1.8;

  const pressingBonus = context.hasPossession
    ? 0
    : (context.pressing / 100) * 0.8;

  const paceBonus = (player.attributes.pace / 100) * 0.5;

  const tempoMultiplier = 0.9 + context.tempo / 500;

  return (baseSpeed + pressingBonus + paceBonus) * tempoMultiplier;
}

export function applyTacticalMovement(state: MatchState): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    return state;
  }

  if (!state.possessionTeamId) {
    return state;
  }

  const homeContext = getTeamMovementContext(state, state.homeTeam.id);
  const awayContext = getTeamMovementContext(state, state.awayTeam.id);

  const contexts = [homeContext, awayContext];

  const nextPositions: Record<string, PitchPosition> = {
    ...state.playerPositions,
  };

  for (const context of contexts) {
    const isHome = context.teamId === state.homeTeam.id;
    const team = isHome ? state.homeTeam : state.awayTeam;
    const selection = isHome ? state.homeSelection : state.awaySelection;
    const carrierPosition = state.playerPositions[state.ballCarrierId ?? ""] ?? state.ballPosition;
    const supportPlayerId = context.hasPossession
      ? selection.startingXI
          .map((id) => team.squad.find((candidate) => candidate.id === id))
          .filter(
            (candidate): candidate is Player =>
              candidate !== undefined &&
              candidate.id !== state.ballCarrierId &&
              candidate.primaryPosition !== "GK" &&
              state.playerPositions[candidate.id] !== undefined,
          )
          .sort((a, b) => {
            const aPosition = state.playerPositions[a.id]!;
            const bPosition = state.playerPositions[b.id]!;
            return (
              Math.hypot(aPosition.x - carrierPosition.x, aPosition.y - carrierPosition.y) -
              Math.hypot(bPosition.x - carrierPosition.x, bPosition.y - carrierPosition.y)
            );
          })[0]?.id
      : undefined;

    for (const playerId of selection.startingXI) {
      const player = team.squad.find((candidate) => candidate.id === playerId);

      const current = state.playerPositions[playerId];

      if (!player || !current) {
        continue;
      }

      if (playerId === state.ballCarrierId) {
        nextPositions[playerId] = state.ballPosition;
        continue;
      }

      const role = getRole(player);
      let target = getTeamTarget(state, context, player);

      if (playerId === supportPlayerId) {
        const direction = context.attacksRight ? 1 : -1;
        target = {
          x: clamp(carrierPosition.x + direction * 5, 2, PITCH_LENGTH - 2),
          y: carrierPosition.y,
        };
      }

      if (!context.hasPossession && role !== "goalkeeper") {
        const isDefender =
          role === "defender" || player.primaryPosition === "DM";

        if (isDefender) {
          const defendingPlayers = selection.startingXI
            .map((id) => team.squad.find((candidate) => candidate.id === id))
            .filter(
              (candidate): candidate is Player =>
                candidate !== undefined && candidate.primaryPosition !== "GK",
            );

          const closestDefender = defendingPlayers
            .map((candidate) => ({
              id: candidate.id,
              position: state.playerPositions[candidate.id],
            }))
            .filter(
              (
                candidate,
              ): candidate is {
                id: string;
                position: PitchPosition;
              } => candidate.position !== undefined,
            )
            .sort(
              (a, b) =>
                Math.hypot(
                  a.position.x - carrierPosition.x,
                  a.position.y - carrierPosition.y,
                ) -
                Math.hypot(
                  b.position.x - carrierPosition.x,
                  b.position.y - carrierPosition.y,
                ),
            )[0];

          if (closestDefender?.id === player.id) {
            target = carrierPosition;
          }
        }
      }

      nextPositions[playerId] = movePlayerTowards(
        current,
        target,
        getMovementSpeed(context, player),
      );
    }
  }

  return {
    ...state,
    playerPositions: nextPositions,
  };
}
