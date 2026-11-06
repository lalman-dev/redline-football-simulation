import type { MatchState } from "./match-state.js";
import { makePass, makeShot, makeTackle } from "./match.js";

export type SimulationAction = "pass" | "tackle" | "shoot";

export function chooseNextAction(state: MatchState): SimulationAction {
  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("Cannot choose an action without possession.");
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;

  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const carrier = attackingTeam.squad.find(
    (player) => player.id === state.ballCarrierId,
  );

  if (!carrier || !selection.startingXI.includes(carrier.id)) {
    throw new Error("Ball carrier must be an active player.");
  }

  const shootingScore =
    carrier.attributes.shooting + carrier.attributes.finishing;

  const decisionScore = carrier.attributes.decisionMaking;

  if (shootingScore >= 150 && decisionScore >= 60) {
    return "shoot";
  }

  return "pass";
}

export function executeNextAction(state: MatchState): MatchState {
  const action = chooseNextAction(state);

  if (action === "shoot") {
    return makeShot(state);
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;

  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const receiver = selection.startingXI
    .map((id) => attackingTeam.squad.find((player) => player.id === id))
    .find(
      (player) =>
        player !== undefined &&
        player.id !== state.ballCarrierId &&
        player.primaryPosition !== "GK",
    );

  if (!receiver) {
    throw new Error("No eligible teammate available to receive a pass.");
  }

  return makePass(state, receiver.id);
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
    .find((player) => player !== undefined && player.primaryPosition !== "GK");

  if (!tackler) {
    throw new Error("No eligible defender available to tackle.");
  }

  return makeTackle(state, tackler.id);
}
