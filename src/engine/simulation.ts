import type { MatchState } from "./match-state.js";
import type { Player } from "./types.js";
import { createRng } from "./rng.js";
import { makePass, makeShot, makeTackle } from "./match.js";

export type SimulationAction = "pass" | "tackle" | "shoot";

interface ActionDecision {
  readonly action: SimulationAction;
  readonly rngState: number;
}

function getActiveCarrier(state: MatchState): {
  player: Player;
  mentality: number;
  tempo: number;
} {
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
  };
}

function getPositionModifier(position: Player["primaryPosition"]): number {
  switch (position) {
    case "ST":
      return 0.1;
    case "LW":
    case "RW":
      return 0.07;
    case "AM":
      return 0.06;
    case "CM":
      return 0.01;
    case "DM":
      return -0.02;
    case "CB":
    case "LB":
    case "RB":
      return -0.05;
    case "GK":
      return -0.2;
  }
}

export function getShootingProbability(state: MatchState): number {
  const { player, mentality, tempo } = getActiveCarrier(state);
  const attributes = player.attributes;

  const shootingQuality = (attributes.shooting + attributes.finishing) / 200;

  const decisionQuality = attributes.decisionMaking / 100;

  const mentalityModifier = (mentality - 50) * 0.0015;
  const tempoModifier = (tempo - 50) * 0.0005;

  const probability =
    0.03 +
    shootingQuality * 0.12 +
    decisionQuality * 0.04 +
    getPositionModifier(player.primaryPosition) +
    mentalityModifier +
    tempoModifier;

  return Math.max(0.02, Math.min(0.65, probability));
}

function decideNextAction(state: MatchState): ActionDecision {
  const rng = createRng(state.rngState);
  const shootingProbability = getShootingProbability(state);

  const action: SimulationAction =
    rng.next() < shootingProbability ? "shoot" : "pass";

  return {
    action,
    rngState: rng.getState(),
  };
}

export function chooseNextAction(state: MatchState): SimulationAction {
  return decideNextAction(state).action;
}

export function executeNextAction(state: MatchState): MatchState {
  const decision = decideNextAction(state);

  // Carry the random state forward so the selected action
  // continues the same deterministic random sequence.
  const actionState: MatchState = {
    ...state,
    rngState: decision.rngState,
  };

  if (decision.action === "shoot") {
    return makeShot(actionState);
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const receiver = selection.startingXI
    .map((id) => attackingTeam.squad.find((player) => player.id === id))
    .filter(
      (player): player is Player =>
        player !== undefined &&
        player.id !== state.ballCarrierId &&
        player.primaryPosition !== "GK",
    )
    .sort(
      (a, b) =>
        b.attributes.passing +
        b.attributes.positioning -
        (a.attributes.passing + a.attributes.positioning),
    )[0];

  if (!receiver) {
    throw new Error("No eligible teammate available to receive a pass.");
  }

  return makePass(actionState, receiver.id);
}

export function executeDefensiveAction(state: MatchState): MatchState {
  if (!state.possessionTeamId) {
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

  const tackler = defendingSelection.startingXI
    .map((id) => defendingTeam.squad.find((player) => player.id === id))
    .filter(
      (player): player is Player =>
        player !== undefined && player.primaryPosition !== "GK",
    )
    .sort(
      (a, b) =>
        b.attributes.tackling +
        b.attributes.positioning -
        (a.attributes.tackling + a.attributes.positioning),
    )[0];

  if (!tackler) {
    throw new Error("No eligible defender available to tackle.");
  }

  return makeTackle(state, tackler.id);
}
