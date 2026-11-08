import type { Team, TeamSelection, TeamId } from "./types.js";
import type { MatchState } from "./match-state.js";
import type { MatchEvent } from "./match-types.js";

import { createRng } from "./rng.js";
import { validateTeamSelection } from "./validation.js";
import { getMatchMinute } from "./clock.js";
import { capActionDuration, getClockTransition } from "./match-clock.js";
import { moveBall } from "./pitch.js";
import { createMatchPlayerPositions, movePlayerTowards } from "./spatial.js";
import { applyTacticalMovement } from "./tactical-movement.js";

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
    ballPosition: { x: 52.5, y: 34 },
    playerPositions: createMatchPlayerPositions(
      homeTeam,
      awayTeam,
      homeSelection,
      awaySelection,
    ),
    events: [],
    rngState: rng.getState(),
    substitutionsUsed: {
      home: 0,
      away: 0,
    },
    substitutedOffPlayers: {
      home: [],
      away: [],
    },
    substitutionWindowsUsed: { home: 0, away: 0 },
    lastSubstitutionWindow: { home: null, away: null },
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

export function startSecondHalf(
  state: MatchState,
  kickoffTeamId: string,
): MatchState {
  if (state.phase !== "half-time" || state.elapsedSeconds !== 2700) {
    throw new Error("Second half can only start at half-time.");
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
    phase: "second-half",
    playerPositions: createMatchPlayerPositions(
      state.homeTeam,
      state.awayTeam,
      state.homeSelection,
      state.awaySelection,
      true,
    ),
    possessionTeamId: team.id,
    ballCarrierId: kickoffPlayer.id,
    events: [
      ...state.events,
      {
        id: state.events.length + 1,
        type: "kickoff",
        minute: 45,
        elapsedSeconds: 2700,
        teamId: team.id,
        playerId: kickoffPlayer.id,
        description: `${team.name} kick off the second half.`,
      },
    ],
  };
}

export function makeCarry(state: MatchState): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Carrying is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
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

  if (carrier.primaryPosition === "GK") {
    throw new Error("Goalkeepers cannot carry the ball in this action.");
  }

  const attackingRight = state.phase === "first-half" ? isHome : !isHome;
  const rng = createRng(state.rngState);

  const skillFactor =
    (carrier.attributes.dribbling + carrier.attributes.pace) / 200;

  const forwardDistance = 1.5 + skillFactor * 3 + rng.next() * 2;
  const lateralDistance = (rng.next() - 0.5) * 4;

  const ballPosition = moveBall(
    state.ballPosition,
    attackingRight,
    forwardDistance,
    lateralDistance,
  );

  const proposedDuration = 5 + Math.floor(rng.next() * 5);
  const duration = capActionDuration(
    state.elapsedSeconds,
    proposedDuration,
    state.phase,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const playerPositions = {
    ...state.playerPositions,
    [carrier.id]: ballPosition,
  };

  const nextEvent: MatchEvent = {
    id: state.events.length + 1,
    type: "carry",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: attackingTeam.id,
    playerId: carrier.id,
    description: `${carrier.name} carries the ball forward.`,
    outcome: "successful",
  };

  return applyTacticalMovement({
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    ballPosition,
    playerPositions,
    possessionTeamId: attackingTeam.id,
    ballCarrierId: carrier.id,
    rngState: rng.getState(),
    events: [...state.events, nextEvent],
  });
}

export function makePass(state: MatchState, receiverId: string): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Passing is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
  }

  const isHome = state.possessionTeamId === state.homeTeam.id;
  const attackingRight = state.phase === "first-half" ? isHome : !isHome;

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
  const duration = capActionDuration(
    state.elapsedSeconds,
    proposedDuration,
    state.phase,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const interceptor = successful
    ? undefined
    : defenders.reduce((best, player) =>
        player.attributes.positioning > best.attributes.positioning
          ? player
          : best,
      );

  const forwardDistance = successful
    ? 4 + rng.next() * 10
    : -(2 + rng.next() * 4);

  const lateralDistance = (rng.next() - 0.5) * 12;

  const ballPosition = moveBall(
    state.ballPosition,
    attackingRight,
    forwardDistance,
    lateralDistance,
  );

  const receivingPlayerId = successful ? receiver.id : interceptor?.id;

  const playerPositions = receivingPlayerId
    ? {
        ...state.playerPositions,
        [receivingPlayerId]: ballPosition,
      }
    : state.playerPositions;

  const nextEvent: MatchEvent = {
    id: state.events.length + 1,
    type: "pass",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: team.id,
    playerId: passer.id,
    targetPlayerId: receiver.id,
    outcome: successful ? "successful" : "unsuccessful",
    ...(interceptor ? { interceptedByPlayerId: interceptor.id } : {}),
    description: successful
      ? `${passer.name} passes to ${receiver.name}.`
      : `${passer.name}'s pass is intercepted by ${interceptor?.name}.`,
  };

  return applyTacticalMovement({
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    ballPosition,
    playerPositions,
    possessionTeamId: successful ? team.id : opposition.id,
    ballCarrierId: successful ? receiver.id : (interceptor?.id ?? null),
    rngState: rng.getState(),
    events: [...state.events, nextEvent],
  });
}

export function makeTackle(state: MatchState, tacklerId: string): MatchState {
  if (state.phase !== "first-half" && state.phase !== "second-half") {
    throw new Error("Tackling is only allowed during active play.");
  }

  if (!state.possessionTeamId || !state.ballCarrierId) {
    throw new Error("There is no player in possession.");
  }

  const isHomePossession = state.possessionTeamId === state.homeTeam.id;

  const defendingTeam = isHomePossession ? state.awayTeam : state.homeTeam;

  const defendingSelection = isHomePossession
    ? state.awaySelection
    : state.homeSelection;

  const attackingTeam = isHomePossession ? state.homeTeam : state.awayTeam;

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
  const duration = capActionDuration(
    state.elapsedSeconds,
    proposedDuration,
    state.phase,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const tacklerPosition = state.playerPositions[tackler.id];
  const carrierPosition =
    state.playerPositions[carrier.id] ?? state.ballPosition;

  const nextTacklerPosition = tacklerPosition
    ? movePlayerTowards(tacklerPosition, carrierPosition, 4.5)
    : undefined;

  const playerPositions = nextTacklerPosition
    ? {
        ...state.playerPositions,
        [tackler.id]: nextTacklerPosition,
      }
    : state.playerPositions;

  const ballPosition = successful
    ? (nextTacklerPosition ?? state.ballPosition)
    : state.ballPosition;

  const nextEvent: MatchEvent = {
    id: state.events.length + 1,
    type: "tackle",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: defendingTeam.id,
    playerId: tackler.id,
    targetPlayerId: carrier.id,
    outcome: successful ? "successful" : "unsuccessful",
    description: successful
      ? `${tackler.name} wins the ball from ${carrier.name}.`
      : `${tackler.name} fails to dispossess ${carrier.name}.`,
  };

  return applyTacticalMovement({
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    ballPosition,
    playerPositions,
    possessionTeamId: successful ? defendingTeam.id : attackingTeam.id,
    ballCarrierId: successful ? tackler.id : carrier.id,
    rngState: rng.getState(),
    events: [...state.events, nextEvent],
  });
}

function restartAfterGoal(
  state: MatchState,
  kickoffTeamId: TeamId,
  elapsedSeconds: number,
  phase: MatchState["phase"],
  rngState: number,
  events: readonly MatchEvent[],
): MatchState {
  const isHome = kickoffTeamId === state.homeTeam.id;

  const team = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const startingPlayers = selection.startingXI
    .map((id) => team.squad.find((player) => player.id === id))
    .filter((player) => player !== undefined);

  const kickoffPlayer =
    startingPlayers.find((player) => player.primaryPosition === "ST") ??
    startingPlayers.find((player) => player.primaryPosition !== "GK");

  if (!kickoffPlayer) {
    throw new Error("No eligible player found to take goal kickoff.");
  }

  const centrePosition = { x: 52.5, y: 34 };

  const playerPositions = {
    ...createMatchPlayerPositions(
      state.homeTeam,
      state.awayTeam,
      state.homeSelection,
      state.awaySelection,
      phase === "second-half",
    ),
    [kickoffPlayer.id]: centrePosition,
  };

  const kickoffEvent: MatchEvent = {
    id: state.events.length + events.length + 1,
    type: "kickoff",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: team.id,
    playerId: kickoffPlayer.id,
    description: `${team.name} kick off after conceding a goal.`,
  };

  return {
    ...state,
    phase,
    elapsedSeconds,
    possessionTeamId: team.id,
    ballCarrierId: kickoffPlayer.id,
    ballPosition: centrePosition,
    playerPositions,
    rngState,
    events: [...state.events, ...events, kickoffEvent],
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

  const attackingRight = state.phase === "first-half" ? isHome : !isHome;

  const distanceToGoal = attackingRight
    ? 105 - state.ballPosition.x
    : state.ballPosition.x;

  const rng = createRng(state.rngState);

  const distancePenalty = Math.max(0, distanceToGoal - 12) * 0.008;

  const accuracyProbability = Math.max(
    0.15,
    Math.min(
      0.8,
      0.32 +
        (shooter.attributes.shooting - 50) * 0.003 +
        (shooter.attributes.finishing - 50) * 0.002 -
        distancePenalty,
    ),
  );

  const onTarget = rng.next() < accuracyProbability;

  const distanceSaveBonus = Math.max(0, distanceToGoal - 12) * 0.006;

  const saveProbability = Math.max(
    0.2,
    Math.min(
      0.9,
      0.65 +
        (goalkeeper.attributes.goalkeeping - 50) * 0.005 -
        (shooter.attributes.shooting - 50) * 0.002 -
        (shooter.attributes.finishing - 50) * 0.002 +
        distanceSaveBonus,
    ),
  );

  const saved = onTarget && rng.next() < saveProbability;
  const goal = onTarget && !saved;

  const outcome = !onTarget ? "off-target" : saved ? "saved" : "goal";

  const proposedDuration = 3 + Math.floor(rng.next() * 5);
  const duration = capActionDuration(
    state.elapsedSeconds,
    proposedDuration,
    state.phase,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(elapsedSeconds);

  const nextEvents: MatchEvent[] = [
    {
      id: state.events.length + 1,
      type: "shot",
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
      type: "save",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: defendingTeam.id,
      playerId: goalkeeper.id,
      targetPlayerId: shooter.id,
      outcome: "successful",
      description: `${goalkeeper.name} makes a save.`,
    });
  }

  if (goal) {
    nextEvents.push({
      id: state.events.length + 2,
      type: "goal",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: shooter.id,
      outcome: "goal",
      description: `GOAL! ${shooter.name} scores for ${attackingTeam.name}.`,
    });
  }

  if (goal) {
    return restartAfterGoal(
      {
        ...state,
        score: {
          home: state.score.home + (isHome ? 1 : 0),
          away: state.score.away + (isHome ? 0 : 1),
        },
      },
      defendingTeam.id,
      elapsedSeconds,
      clock.phase,
      rng.getState(),
      nextEvents,
    );
  }

  const goalkeeperPosition =
    state.playerPositions[goalkeeper.id] ?? state.ballPosition;

  const playerPositions = {
    ...state.playerPositions,
    [goalkeeper.id]: goalkeeperPosition,
  };

  return applyTacticalMovement({
    ...state,
    elapsedSeconds,
    phase: clock.phase,
    score: {
      home: state.score.home + (goal && isHome ? 1 : 0),
      away: state.score.away + (goal && !isHome ? 1 : 0),
    },
    possessionTeamId: defendingTeam.id,
    ballCarrierId: goalkeeper.id,
    ballPosition: goalkeeperPosition,
    playerPositions,
    rngState: rng.getState(),
    events: [...state.events, ...nextEvents],
  });
}

export function substitutePlayer(
  state: MatchState,
  teamId: TeamId,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  substitutionWindowId = `substitution-${state.events.length}`,
): MatchState {
  const isHalfTime = state.phase === "half-time";
  const isActivePlay =
    state.phase === "first-half" || state.phase === "second-half";

  if (!isActivePlay && !isHalfTime) {
    throw new Error("Substitutions are only allowed during a match.");
  }

  const isHome = teamId === state.homeTeam.id;

  if (!isHome && teamId !== state.awayTeam.id) {
    throw new Error("Team must belong to this match.");
  }

  const side = isHome ? "home" : "away";
  const team = isHome ? state.homeTeam : state.awayTeam;
  const selection = isHome ? state.homeSelection : state.awaySelection;

  const substitutionsUsed = state.substitutionsUsed[side];
  const substitutedOff = state.substitutedOffPlayers[side];
  const windowsUsed = state.substitutionWindowsUsed[side];
  const lastWindow = state.lastSubstitutionWindow[side];

  if (substitutionsUsed >= 5) {
    throw new Error("Maximum of five substitutions reached.");
  }

  if (!selection.startingXI.includes(outgoingPlayerId)) {
    throw new Error("Outgoing player must be on the pitch.");
  }

  if (!selection.substitutes.includes(incomingPlayerId)) {
    throw new Error("Incoming player must be an eligible substitute.");
  }

  if (substitutedOff.includes(outgoingPlayerId)) {
    throw new Error("Outgoing player has already been substituted off.");
  }

  if (!isHalfTime && !substitutionWindowId.trim()) {
    throw new Error("A substitution window ID is required.");
  }

  const outgoingPlayer = team.squad.find(
    (player) => player.id === outgoingPlayerId,
  );

  const incomingPlayer = team.squad.find(
    (player) => player.id === incomingPlayerId,
  );

  if (!outgoingPlayer || !incomingPlayer) {
    throw new Error("Both players must belong to the selected team.");
  }

  const nextStartingXI = selection.startingXI.map((id) =>
    id === outgoingPlayerId ? incomingPlayerId : id,
  );

  const goalkeeperCount = nextStartingXI.filter((id) => {
    const player = team.squad.find((squadPlayer) => squadPlayer.id === id);
    return player?.primaryPosition === "GK";
  }).length;

  if (goalkeeperCount !== 1) {
    throw new Error(
      "A substitution must leave exactly one goalkeeper on the pitch.",
    );
  }

  const isNewWindow = !isHalfTime && substitutionWindowId !== lastWindow;

  if (isNewWindow && windowsUsed >= 3) {
    throw new Error("Maximum of three substitution opportunities reached.");
  }

  const nextSelection: TeamSelection = {
    ...selection,
    startingXI: nextStartingXI,
    substitutes: selection.substitutes.filter((id) => id !== incomingPlayerId),
  };

  const event: MatchEvent = {
    id: state.events.length + 1,
    type: "substitution",
    minute: getMatchMinute(state.elapsedSeconds),
    elapsedSeconds: state.elapsedSeconds,
    teamId,
    playerId: incomingPlayerId,
    targetPlayerId: outgoingPlayerId,
    description: `${incomingPlayer.name} replaces ${outgoingPlayer.name} for ${team.name}.`,
  };

  const { [outgoingPlayerId]: outgoingPosition, ...remainingPlayerPositions } =
    state.playerPositions;

  const incomingPosition =
    outgoingPosition ??
    createMatchPlayerPositions(
      state.homeTeam,
      state.awayTeam,
      isHome ? nextSelection : state.homeSelection,
      isHome ? state.awaySelection : nextSelection,
      state.phase === "second-half",
    )[incomingPlayerId];

  if (!incomingPosition) {
    throw new Error("Could not determine the incoming player's position.");
  }

  return {
    ...state,

    homeSelection: isHome ? nextSelection : state.homeSelection,
    awaySelection: isHome ? state.awaySelection : nextSelection,

    substitutionsUsed: {
      ...state.substitutionsUsed,
      [side]: substitutionsUsed + 1,
    },

    substitutedOffPlayers: {
      ...state.substitutedOffPlayers,
      [side]: [...substitutedOff, outgoingPlayerId],
    },

    substitutionWindowsUsed: {
      ...state.substitutionWindowsUsed,
      [side]: windowsUsed + (isNewWindow ? 1 : 0),
    },

    lastSubstitutionWindow: {
      ...state.lastSubstitutionWindow,
      [side]: isHalfTime ? lastWindow : substitutionWindowId,
    },

    ballCarrierId:
      state.ballCarrierId === outgoingPlayerId
        ? incomingPlayerId
        : state.ballCarrierId,

    playerPositions: {
      ...remainingPlayerPositions,
      ...(outgoingPosition ? { [incomingPlayerId]: outgoingPosition } : {}),
    },

    events: [...state.events, event],
  };
}
