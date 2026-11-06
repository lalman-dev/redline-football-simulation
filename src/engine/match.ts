import type { Team, TeamSelection } from "./types.js";
import type { MatchState } from "./match-state.js";
import type { MatchEvent } from "./match-types.js";

import { createRng } from "./rng.js";
import { validateTeamSelection } from "./validation.js";
import { getMatchMinute } from "./clock.js";
import { capActionDuration, getClockTransition } from "./match-clock.js";

export interface CreateMatchOptions {
  readonly homeTeam: Team;
  readonly awayTeam: Team;
  readonly homeSelection: TeamSelection;
  readonly awaySelection: TeamSelection;
  readonly seed: number;
}

export function createMatchState(options: CreateMatchOptions): MatchState {
  const { homeTeam, awayTeam, homeSelection, awaySelection, seed } = options;

  if (homeTeam.id === awayTeam.id) {
    throw new Error("A team cannot play against itself.");
  }

  const homeValidation = validateTeamSelection(homeTeam, homeSelection);
  const awayValidation = validateTeamSelection(awayTeam, awaySelection);

  const errors = [
    ...homeValidation.errors.map((error) => `Home team: ${error}`),
    ...awayValidation.errors.map((error) => `Away team: ${error}`),
  ];

  if (errors.length > 0) {
    throw new Error(`Invalid match setup:\n${errors.join("\n")}`);
  }

  const rng = createRng(seed);

  return {
    homeTeam,
    awayTeam,
    homeSelection,
    awaySelection,
    phase: "first-half",
    elapsedSeconds: 0,
    score: { home: 0, away: 0 },
    possessionTeamId: null,
    ballCarrierId: null,
    events: [],
    rngState: rng.getState(),
  };
}

export function startMatch(
  state: MatchState,
  kickoffTeamId: string,
): MatchState {
  if (state.phase !== "first-half" || state.events.length > 0) {
    throw new Error("Match has already started.");
  }

  const team =
    kickoffTeamId === state.homeTeam.id
      ? state.homeTeam
      : kickoffTeamId === state.awayTeam.id
        ? state.awayTeam
        : null;

  const selection =
    kickoffTeamId === state.homeTeam.id
      ? state.homeSelection
      : kickoffTeamId === state.awayTeam.id
        ? state.awaySelection
        : null;

  if (!team || !selection) {
    throw new Error("Kickoff team must be one of the match teams.");
  }

  const startingPlayers = selection.startingXI
    .map((id) => team.squad.find((player) => player.id === id))
    .filter((player) => player !== undefined);

  const kickoffPlayer =
    startingPlayers.find((player) => player.primaryPosition === "ST") ??
    startingPlayers.find((player) => player.primaryPosition !== "GK");

  if (!kickoffPlayer) {
    throw new Error("No eligible player found to take kickoff.");
  }

  return {
    ...state,
    possessionTeamId: team.id,
    ballCarrierId: kickoffPlayer.id,
    events: [
      ...state.events,
      {
        id: 1,
        type: "kickoff",
        minute: 0,
        elapsedSeconds: 0,
        teamId: team.id,
        playerId: kickoffPlayer.id,
        description: `${team.name} kick off.`,
      },
    ],
  };
}

export function makePass(state: MatchState, receiverId: string): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Passing is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;

  const team = isHome ? state.homeTeam : state.awayTeam;
  const opposition = isHome ? state.awayTeam : state.homeTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;
  const oppositionSelection = isHome
    ? state.awaySelection
    : state.homeSelection;

  const passer = team.squad.find((player) => player.id === state.ballCarrierId);

  const receiver = team.squad.find((player) => player.id === receiverId);

  const activePlayerIds = new Set(selection.startingXI);

  if (!passer || !receiver || !activePlayerIds.has(receiverId)) {
    throw new Error("Receiver must be an active player on the same team.");
  }

  if (receiver.id === passer.id) {
    throw new Error("A player cannot pass to themselves.");
  }

  const defenders = oppositionSelection.startingXI
    .map((id) => opposition.squad.find((player) => player.id === id))
    .filter(
      (player): player is (typeof opposition.squad)[number] =>
        player !== undefined && player.primaryPosition !== "GK",
    );

  if (defenders.length === 0) {
    throw new Error("Opposition has no active outfield players.");
  }

  const averageDefending =
    defenders.reduce(
      (total, player) =>
        total +
        (player.attributes.positioning + player.attributes.tackling) / 2,
      0,
    ) / defenders.length;

  // Initial probability model; calibration will follow.
  const probability = Math.max(
    0.45,
    Math.min(
      0.92,
      0.72 +
        (passer.attributes.passing - 50) * 0.003 +
        (receiver.attributes.positioning - 50) * 0.001 -
        (averageDefending - 50) * 0.002,
    ),
  );

  const rng = createRng(state.rngState);
  const successful = rng.next() < probability;

  const proposedDuration = 2 + Math.floor(rng.next() * 4);
  const duration = capActionDuration(state.elapsedSeconds, proposedDuration);
  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);
  const interceptor = successful
    ? undefined
    : defenders.reduce((best, player) =>
        player.attributes.positioning > best.attributes.positioning
          ? player
          : best,
      );

  const nextEvent = {
    id: state.events.length + 1,
    type: "pass" as const,
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: team.id,
    playerId: passer.id,
    targetPlayerId: receiver.id,
    outcome: successful ? ("successful" as const) : ("unsuccessful" as const),
    ...(interceptor ? { interceptedByPlayerId: interceptor.id } : {}),
    description: successful
      ? `${passer.name} passes to ${receiver.name}.`
      : `${passer.name}'s pass is intercepted by ${interceptor?.name}.`,
  };

  return {
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    possessionTeamId: successful ? team.id : opposition.id,
    ballCarrierId: successful ? receiver.id : (interceptor?.id ?? null),
    rngState: rng.getState(),
    events: [...state.events, nextEvent],
  };
}

export function makeTackle(state: MatchState, tacklerId: string): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Tackling is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
  }

  const defendingTeam =
    state.possessionTeamId === state.homeTeam.id
      ? state.awayTeam
      : state.homeTeam;

  const defendingSelection =
    state.possessionTeamId === state.homeTeam.id
      ? state.awaySelection
      : state.homeSelection;

  const attackingTeam =
    state.possessionTeamId === state.homeTeam.id
      ? state.homeTeam
      : state.awayTeam;

  const carrier = attackingTeam.squad.find(
    (player) => player.id === state.ballCarrierId,
  );

  const tackler = defendingTeam.squad.find((player) => player.id === tacklerId);

  if (!carrier) {
    throw new Error("Ball carrier could not be found.");
  }

  if (
    !tackler ||
    !defendingSelection.startingXI.includes(tacklerId) ||
    tackler.primaryPosition === "GK"
  ) {
    throw new Error("Tackler must be an active outfield player.");
  }

  const probability = Math.max(
    0.15,
    Math.min(
      0.75,
      0.4 +
        (tackler.attributes.tackling - 50) * 0.005 -
        (carrier.attributes.dribbling - 50) * 0.003,
    ),
  );

  const rng = createRng(state.rngState);
  const successful = rng.next() < probability;

  const proposedDuration = 2 + Math.floor(rng.next() * 4);
  const duration = capActionDuration(state.elapsedSeconds, proposedDuration);
  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const nextEvent = {
    id: state.events.length + 1,
    type: "tackle" as const,
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: defendingTeam.id,
    playerId: tackler.id,
    targetPlayerId: carrier.id,
    outcome: successful ? ("successful" as const) : ("unsuccessful" as const),
    description: successful
      ? `${tackler.name} wins the ball from ${carrier.name}.`
      : `${tackler.name} fails to dispossess ${carrier.name}.`,
  };

  return {
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    possessionTeamId: successful ? defendingTeam.id : attackingTeam.id,
    ballCarrierId: successful ? tackler.id : carrier.id,
    rngState: rng.getState(),
    events: [...state.events, nextEvent],
  };
}

export function makeShot(state: MatchState): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Shooting is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;

  const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
  const defendingTeam = isHome ? state.awayTeam : state.homeTeam;

  const attackingSelection = isHome ? state.homeSelection : state.awaySelection;

  const defendingSelection = isHome ? state.awaySelection : state.homeSelection;

  const shooter = attackingTeam.squad.find(
    (player) => player.id === state.ballCarrierId,
  );

  const goalkeeper = defendingSelection.startingXI
    .map((id) => defendingTeam.squad.find((player) => player.id === id))
    .find((player) => player?.primaryPosition === "GK");

  if (!shooter || !attackingSelection.startingXI.includes(shooter.id)) {
    throw new Error("Shooter must be an active player.");
  }

  if (!goalkeeper) {
    throw new Error("Opposition goalkeeper could not be found.");
  }

  const rng = createRng(state.rngState);

  // Estimate whether the shot is on target.
  const accuracyProbability = Math.max(
    0.35,
    Math.min(
      0.9,
      0.62 +
        (shooter.attributes.shooting - 50) * 0.003 +
        (shooter.attributes.finishing - 50) * 0.003,
    ),
  );

  const onTarget = rng.next() < accuracyProbability;

  // Estimate the goalkeeper's chance of saving an on-target shot.
  const saveProbability = Math.max(
    0.2,
    Math.min(
      0.8,
      0.5 +
        (goalkeeper.attributes.goalkeeping - 50) * 0.005 -
        (shooter.attributes.shooting - 50) * 0.002 -
        (shooter.attributes.finishing - 50) * 0.002,
    ),
  );

  const saved = onTarget && rng.next() < saveProbability;
  const goal = onTarget && !saved;

  const outcome = !onTarget ? "off-target" : saved ? "saved" : "goal";

  const proposedDuration = 3 + Math.floor(rng.next() * 5);
  const duration = capActionDuration(state.elapsedSeconds, proposedDuration);
  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const nextEvents: MatchEvent[] = [
    {
      id: state.events.length + 1,
      type: "shot" as const,
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: shooter.id,
      outcome,
      description: !onTarget
        ? `${shooter.name} shoots off target.`
        : saved
          ? `${shooter.name}'s shot is saved by ${goalkeeper.name}.`
          : `${shooter.name} scores!`,
    },
  ];

  if (saved) {
    nextEvents.push({
      id: state.events.length + 2,
      type: "save" as const,
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: defendingTeam.id,
      playerId: goalkeeper.id,
      targetPlayerId: shooter.id,
      outcome: "successful" as const,
      description: `${goalkeeper.name} makes a save.`,
    });
  }

  if (goal) {
    nextEvents.push({
      id: state.events.length + 2,
      type: "goal" as const,
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: shooter.id,
      outcome: "goal" as const,
      description: `GOAL! ${shooter.name} scores for ${attackingTeam.name}.`,
    });
  }

  return {
    ...state,
    elapsedSeconds,
    phase: clock.phase,
    score: {
      home: state.score.home + (goal && isHome ? 1 : 0),
      away: state.score.away + (goal && !isHome ? 1 : 0),
    },
    possessionTeamId: goal
      ? defendingTeam.id
      : saved
        ? defendingTeam.id
        : attackingTeam.id,
    ballCarrierId: goal
      ? (defendingSelection.startingXI.find((id) =>
          defendingTeam.squad.some(
            (player) => player.id === id && player.primaryPosition === "ST",
          ),
        ) ?? null)
      : saved
        ? goalkeeper.id
        : shooter.id,
    rngState: rng.getState(),
    events: [...state.events, ...nextEvents],
  };
}
