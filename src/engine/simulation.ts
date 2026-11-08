import type { MatchState } from "./match-state.js";
import type { Player } from "./types.js";
import { createRng } from "./rng.js";
import { makeCarry, makePass, makeShot, makeTackle } from "./match.js";
import { movePlayerTowards } from "./spatial.js";

export type SimulationAction = "pass" | "carry" | "tackle" | "shoot";

export function getDefensivePressureProbability(state: MatchState): number {
  if (!state.possessionTeamId) return 0;
  const defendingSelection = state.possessionTeamId === state.homeTeam.id
    ? state.awaySelection
    : state.homeSelection;
  return 0.16 + (defendingSelection.tactics.pressing / 100) * 0.2;
}

interface ActionDecision {
  readonly action: SimulationAction;
  readonly rngState: number;
}

interface CarrierContext {
  readonly player: Player;
  readonly mentality: number;
  readonly tempo: number;
  readonly width: number;
}

function getActiveCarrier(state: MatchState): CarrierContext {
  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("Cannot choose an action without possession.");
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const player = attackingTeam.squad.find(
    (candidate) => candidate.id === state.ballCarrierId,
  );

  if (!player || !selection.startingXI.includes(player.id)) {
    throw new Error("Ball carrier must be an active player.");
  }

  return {
    player,
    mentality: selection.tactics.mentality,
    tempo: selection.tactics.tempo,
    width: selection.tactics.width,
  };
}

function getDistanceToGoal(state: MatchState): number {
  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attackingRight = state.phase === "first-half" ? isHome : !isHome;

  return attackingRight ? 105 - state.ballPosition.x : state.ballPosition.x;
}

function getShotAngleFactor(state: MatchState): number {
  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attacksRight = state.phase === "first-half" ? isHome : !isHome;

  const goalX = attacksRight ? 105 : 0;
  const goalY = 34;
  const halfGoalWidth = 3.66;

  const dx = goalX - state.ballPosition.x;

  const upperY = goalY - halfGoalWidth - state.ballPosition.y;
  const lowerY = goalY + halfGoalWidth - state.ballPosition.y;

  const dot = dx * dx + upperY * lowerY;
  const cross = Math.abs(dx * (lowerY - upperY));

  const angle = Math.atan2(cross, dot);

  return Math.max(0.2, Math.min(1, angle / 0.65));
}

function getDefensivePressureFactor(state: MatchState): number {
  if (!state.possessionTeamId) return 1;
  const defendingTeam = state.possessionTeamId === state.homeTeam.id
    ? state.awayTeam
    : state.homeTeam;
  const defendingSelection = state.possessionTeamId === state.homeTeam.id
    ? state.awaySelection
    : state.homeSelection;
  const carrierPosition = state.playerPositions[state.ballCarrierId ?? ""] ?? state.ballPosition;
  const nearestDistance = defendingSelection.startingXI
    .map((id) => defendingTeam.squad.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined && player.primaryPosition !== "GK")
    .map((player) => state.playerPositions[player.id])
    .filter((position): position is NonNullable<typeof position> => position !== undefined)
    .reduce(
      (nearest, position) => Math.min(nearest, Math.hypot(position.x - carrierPosition.x, position.y - carrierPosition.y)),
      Number.POSITIVE_INFINITY,
    );

  return 0.7 + Math.min(1, nearestDistance / 10) * 0.3;
}

export function getShootingProbability(state: MatchState): number {
  const { player, mentality, tempo } = getActiveCarrier(state);

  if (player.primaryPosition === "GK") {
    return 0;
  }

  const distance = getDistanceToGoal(state);

  let baseProbability: number;

  if (distance <= 8) {
    baseProbability = 0.3;
  } else if (distance <= 16) {
    baseProbability = 0.16;
  } else if (distance <= 25) {
    baseProbability = 0.06;
  } else if (distance <= 35) {
    baseProbability = 0.015;
  } else {
    baseProbability = 0.0015;
  }

  const shootingQuality =
    (player.attributes.shooting + player.attributes.finishing) / 200;

  const decisionQuality = player.attributes.decisionMaking / 100;

  const qualityMultiplier = 0.8 + shootingQuality * 0.4;
  const decisionMultiplier = 0.85 + decisionQuality * 0.3;
  const mentalityMultiplier = 0.85 + (mentality / 100) * 0.3;
  const tempoMultiplier = 0.95 + (tempo / 100) * 0.1;

  const positionMultiplier: Record<Player["primaryPosition"], number> = {
    GK: 0,
    CB: 0.4,
    LB: 0.5,
    RB: 0.5,
    DM: 0.55,
    CM: 0.8,
    AM: 1.1,
    LW: 1.12,
    RW: 1.12,
    ST: 1.08,
  };

  const centralMidfieldLongShotBonus =
    player.primaryPosition === "CM" && distance > 20 && distance <= 35
      ? 0.12
      : 0;

  const angleFactor = getShotAngleFactor(state);

  const probability =
    baseProbability * 0.82 *
    qualityMultiplier *
    decisionMultiplier *
    mentalityMultiplier *
    tempoMultiplier *
    (positionMultiplier[player.primaryPosition] + centralMidfieldLongShotBonus) *
    angleFactor *
    getDefensivePressureFactor(state);

  return Math.max(0, Math.min(0.45, probability));
}

function decideNextAction(state: MatchState): ActionDecision {
  const rng = createRng(state.rngState);
  const { player, mentality, tempo } = getActiveCarrier(state);

  const shootingProbability = getShootingProbability(state);

  const baseCarryProbability =
    player.primaryPosition === "GK"
      ? 0
      : 0.15 + (player.attributes.dribbling - 50) * 0.003;

  const tacticalCarryAdjustment =
    (tempo - 50) * 0.001 + (mentality - 50) * 0.0005;

  const carryProbability =
    player.primaryPosition === "GK"
      ? 0
      : Math.max(
          0.05,
          Math.min(0.55, baseCarryProbability + tacticalCarryAdjustment),
        );

  const roll = rng.next();
  let action: SimulationAction;
  if (roll < shootingProbability) {
    action = "shoot";
  } else if (roll < shootingProbability + carryProbability) {
    action = "carry";
  } else {
    action = "pass";
  }

  return {
    action,
    rngState: rng.getState(),
  };
}

export function chooseNextAction(state: MatchState): SimulationAction {
  return decideNextAction(state).action;
}

function getReceiverScore(
  player: Player,
  width: number,
  position: { readonly x: number; readonly y: number },
  carrierPosition: { readonly x: number; readonly y: number },
  attacksRight: boolean,
): number {
  const technicalScore =
    player.attributes.passing + player.attributes.positioning;

  const isWide =
    player.primaryPosition === "LW" ||
    player.primaryPosition === "RW" ||
    player.primaryPosition === "LB" ||
    player.primaryPosition === "RB";

  const isCentral =
    player.primaryPosition === "CM" ||
    player.primaryPosition === "DM" ||
    player.primaryPosition === "AM";

  const widthPreference = (width - 50) / 50;

  const widthBonus = isWide
    ? widthPreference * 12
    : isCentral
      ? -widthPreference * 8
      : 0;

  const distance = Math.hypot(
    position.x - carrierPosition.x,
    position.y - carrierPosition.y,
  );
  const forwardDistance = (position.x - carrierPosition.x) *
    (attacksRight ? 1 : -1);
  const distanceToGoal = attacksRight ? 105 - position.x : position.x;
  const attackingZone = Math.max(0, Math.min(1, (55 - distanceToGoal) / 35));
  const roleBonus = player.primaryPosition === "ST"
    ? 1 + attackingZone * 2
    : player.primaryPosition === "LW" || player.primaryPosition === "RW"
      ? 2 + attackingZone * 4
      : player.primaryPosition === "AM"
        ? 2 + attackingZone * 4
        : player.primaryPosition === "CM"
          ? 1
          : player.primaryPosition === "DM"
            ? -1
            : -3;

  // Prefer nearby options, with a contextual reward for advanced attacking roles.
  return -distance * 1.5 + technicalScore * 0.25 + widthBonus * 0.25 +
    forwardDistance * 0.25 + roleBonus;
}

export function executeNextAction(state: MatchState): MatchState {
  const decision = decideNextAction(state);

  const actionState: MatchState = {
    ...state,
    rngState: decision.rngState,
  };

  if (decision.action === "shoot") {
    return makeShot(actionState);
  }

  if (decision.action === "carry") {
    return makeCarry(actionState);
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;
  const carrierPosition = state.playerPositions[state.ballCarrierId ?? ""] ?? state.ballPosition;
  const attacksRight = state.phase === "first-half" ? isHome : !isHome;

  const receiver = selection.startingXI
    .map((id) => attackingTeam.squad.find((player) => player.id === id))
    .filter(
      (player): player is Player =>
        player !== undefined &&
        player.id !== state.ballCarrierId &&
        player.primaryPosition !== "GK" &&
        state.playerPositions[player.id] !== undefined,
    )
    .sort(
      (a, b) =>
        getReceiverScore(
          b,
          selection.tactics.width,
          state.playerPositions[b.id]!,
          carrierPosition,
          attacksRight,
        ) -
        getReceiverScore(
          a,
          selection.tactics.width,
          state.playerPositions[a.id]!,
          carrierPosition,
          attacksRight,
        ),
    )[0];

  if (!receiver) {
    throw new Error("No eligible teammate available to receive a pass.");
  }

  return makePass(actionState, receiver.id);
}

export function executeDefensiveAction(state: MatchState): MatchState {
  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("Cannot defend without an opposing team in possession.");
  }

  const defendingTeam =
    state.possessionTeamId === state.homeTeam.id
      ? state.awayTeam
      : state.homeTeam;

  const defendingSelection =
    state.possessionTeamId === state.homeTeam.id
      ? state.awaySelection
      : state.homeSelection;

  const carrierPosition =
    state.playerPositions[state.ballCarrierId] ?? state.ballPosition;

  const nearestDefender = defendingSelection.startingXI
    .map((id) => defendingTeam.squad.find((player) => player.id === id))
    .filter(
      (player): player is Player =>
        player !== undefined && player.primaryPosition !== "GK",
    )
    .map((player) => {
      const position = state.playerPositions[player.id];

      return {
        player,
        distance: position
          ? Math.hypot(
              position.x - carrierPosition.x,
              position.y - carrierPosition.y,
            )
          : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearestDefender) {
    throw new Error("No eligible defender available.");
  }

  // Close down first. Do not attempt a tackle from unrealistic distance.
  if (nearestDefender.distance > 5) {
    const current = state.playerPositions[nearestDefender.player.id];

    if (!current) return state;

    const nextPosition = movePlayerTowards(current, carrierPosition, 4.5);

    return {
      ...state,
      playerPositions: {
        ...state.playerPositions,
        [nearestDefender.player.id]: nextPosition,
      },
    };
  }

  return makeTackle(state, nearestDefender.player.id);
}
