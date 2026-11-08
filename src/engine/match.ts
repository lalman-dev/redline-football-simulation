import type { Player, Team, TeamSelection, TeamId } from "./types.js";
import type { MatchState } from "./match-state.js";
import type { MatchEvent } from "./match-types.js";

import { createRng } from "./rng.js";
import { validateTeamSelection } from "./validation.js";
import { getMatchMinute } from "./clock.js";
import { capActionDuration, getClockTransition } from "./match-clock.js";
import { moveBall } from "./pitch.js";
import { createMatchPlayerPositions, movePlayerTowards } from "./spatial.js";
import { applyTacticalMovement } from "./tactical-movement.js";

const KICKOFF_POSITION = { x: 52.5, y: 34 } as const;

function selectKickoffPlayer(team: Team, selection: TeamSelection) {
  const startingPlayers = selection.startingXI
    .map((id) => team.squad.find((player) => player.id === id))
    .filter((player) => player !== undefined);

  return (
    startingPlayers.find((player) => player.primaryPosition === "ST") ??
    startingPlayers.find((player) => player.secondaryPositions.includes("ST")) ??
    startingPlayers.find((player) => player.primaryPosition === "AM") ??
    startingPlayers.find((player) => player.primaryPosition === "LW" || player.primaryPosition === "RW") ??
    startingPlayers.find((player) => player.primaryPosition === "CM") ??
    startingPlayers.find((player) => player.primaryPosition === "DM") ??
    startingPlayers.find((player) => player.primaryPosition !== "GK")
  );
}

function getTacticalLoad(selection: TeamSelection): number {
  return Math.max(0, (selection.tactics.pressing - 50) / 50) * 0.55 +
    Math.max(0, (selection.tactics.tempo - 50) / 50) * 0.35;
}

function fatigueAdjusted(
  attribute: number,
  stamina: number,
  elapsedSeconds: number,
  tacticalLoad = 0,
) {
  const exposure = Math.min(1, elapsedSeconds / 5_400);
  const fatigue = exposure * (100 - stamina) / 100 * (1 + tacticalLoad);
  return attribute * (1 - Math.min(0.75, fatigue * 0.45));
}

export function getTackleSuccessProbability(
  tackler: Team["squad"][number],
  carrier: Team["squad"][number],
  elapsedSeconds: number,
  tacklerLoad = 0,
  carrierLoad = 0,
): number {
  return Math.max(
    0.15,
    Math.min(
      0.75,
      0.4 +
        (fatigueAdjusted(tackler.attributes.tackling, tackler.attributes.stamina, elapsedSeconds, tacklerLoad) - 50) * 0.005 +
        (tackler.attributes.strength - carrier.attributes.strength) * 0.002 -
        (fatigueAdjusted(carrier.attributes.dribbling, carrier.attributes.stamina, elapsedSeconds, carrierLoad) - 50) * 0.003,
    ),
  );
}

export function getFoulProbability(
  tackler: Team["squad"][number],
  carrier: Team["squad"][number],
): number {
  return Math.max(
    0.03,
    Math.min(
      0.25,
      0.25 +
        (50 - tackler.attributes.tackling) * 0.002 +
        (50 - tackler.attributes.decisionMaking) * 0.001 +
        (carrier.attributes.dribbling - 50) * 0.001,
    ),
  );
}

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
    firstHalfAddedTimeSeconds: 0,
    secondHalfAddedTimeSeconds: 0,
    score: { home: 0, away: 0 },
    yellowCards: {},
    dismissedPlayerIds: [],
    possessionTeamId: null,
    ballCarrierId: null,
    ballPosition: KICKOFF_POSITION,
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

  const kickoffPlayer = selectKickoffPlayer(team, selection);

  if (!kickoffPlayer) {
    throw new Error("No eligible player found to take kickoff.");
  }

  const playerPositions = {
    ...state.playerPositions,
    [kickoffPlayer.id]: KICKOFF_POSITION,
  };

  return {
    ...state,
    possessionTeamId: team.id,
    ballCarrierId: kickoffPlayer.id,
    ballPosition: KICKOFF_POSITION,
    playerPositions,
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
  if (
    state.phase !== "half-time" ||
    state.elapsedSeconds !== 2700 + state.firstHalfAddedTimeSeconds
  ) {
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

  const kickoffPlayer = selectKickoffPlayer(team, selection);

  if (!kickoffPlayer) {
    throw new Error("No eligible player found to take kickoff.");
  }

  const playerPositions = {
    ...createMatchPlayerPositions(
      state.homeTeam,
      state.awayTeam,
      state.homeSelection,
      state.awaySelection,
      true,
    ),
    [kickoffPlayer.id]: KICKOFF_POSITION,
  };

  return {
    ...state,
    phase: "second-half",
    playerPositions,
    possessionTeamId: team.id,
    ballCarrierId: kickoffPlayer.id,
    ballPosition: KICKOFF_POSITION,
    events: [
      ...state.events,
      {
        id: state.events.length + 1,
        type: "kickoff",
        minute: getMatchMinute(state.elapsedSeconds),
        elapsedSeconds: state.elapsedSeconds,
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
  const tacticalLoad = getTacticalLoad(selection);

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
    (fatigueAdjusted(carrier.attributes.dribbling, carrier.attributes.stamina, state.elapsedSeconds, tacticalLoad) +
      fatigueAdjusted(carrier.attributes.pace, carrier.attributes.stamina, state.elapsedSeconds, tacticalLoad)) / 200;

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
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(
    elapsedSeconds,
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

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
        (isHome ? 0.015 : 0) +
        (fatigueAdjusted(passer.attributes.passing, passer.attributes.stamina, state.elapsedSeconds, getTacticalLoad(selection)) - 50) * 0.003 +
        (fatigueAdjusted(receiver.attributes.positioning, receiver.attributes.stamina, state.elapsedSeconds, getTacticalLoad(selection)) - 50) * 0.001 -
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
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const clock = getClockTransition(
    elapsedSeconds,
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

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
  const attackingSelection = isHomePossession
    ? state.homeSelection
    : state.awaySelection;

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

  const probability = getTackleSuccessProbability(
    tackler,
    carrier,
    state.elapsedSeconds,
    getTacticalLoad(defendingSelection),
    getTacticalLoad(attackingSelection),
  );

  const rng = createRng(state.rngState);
  const previousYellows = state.yellowCards[tackler.id] ?? 0;
  const foulProbability = getFoulProbability(tackler, carrier) *
    (previousYellows > 0 ? 0.2 : 1);
  const foul = rng.next() < foulProbability;
  const successful = !foul && rng.next() < probability;
  const disciplineRoll = foul ? rng.next() : 1;
  const directRed = foul && disciplineRoll < 0.002;
  const yellowProbability = Math.max(
    0.08,
    Math.min(
      0.45,
      0.33 +
        (55 - tackler.attributes.tackling) * 0.004 +
        (50 - tackler.attributes.decisionMaking) * 0.003,
    ),
  );
  const yellow = foul && !directRed && disciplineRoll < 0.002 + yellowProbability;
  const secondYellowRed = yellow && previousYellows > 0;
  const dismissed = directRed || secondYellowRed;

  const proposedDuration = 2 + Math.floor(rng.next() * 4);
  const duration = capActionDuration(
    state.elapsedSeconds,
    proposedDuration,
    state.phase,
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const stoppageAdded = foul ? 8 + (yellow || directRed ? 15 : 0) : 0;
  const firstHalfAddedTimeSeconds = state.firstHalfAddedTimeSeconds +
    (state.phase === "first-half" ? stoppageAdded : 0);
  const secondHalfAddedTimeSeconds = state.secondHalfAddedTimeSeconds +
    (state.phase === "second-half" ? stoppageAdded : 0);
  const clock = getClockTransition(
    elapsedSeconds,
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
  );

  const tacklerPosition = state.playerPositions[tackler.id];
  const carrierPosition =
    state.playerPositions[carrier.id] ?? state.ballPosition;
  const attacksRight = state.phase === "first-half" ? isHomePossession : !isHomePossession;
  // The ball location represents the incident location. Player formation
  // coordinates can drift from the ball after tactical movement and must not
  // create a penalty for a foul committed outside the area.
  const distanceToGoal = attacksRight ? 105 - state.ballPosition.x : state.ballPosition.x;
  const penaltyAwarded = foul && distanceToGoal <= 16.5 && Math.abs(state.ballPosition.y - 34) <= 20.16;

  const nextTacklerPosition = tacklerPosition
    ? movePlayerTowards(tacklerPosition, carrierPosition, 4.5)
    : undefined;

  let playerPositions = nextTacklerPosition
    ? { ...state.playerPositions, [tackler.id]: nextTacklerPosition }
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

  if (!foul) {
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

  const kicker = attackingSelection.startingXI
    .map((id) => attackingTeam.squad.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined)
    .filter((player) => player.id !== carrier.id && player.primaryPosition !== "GK")
    .sort((a, b) => {
      const aPosition = state.playerPositions[a.id] ?? carrierPosition;
      const bPosition = state.playerPositions[b.id] ?? carrierPosition;
      return Math.hypot(aPosition.x - carrierPosition.x, aPosition.y - carrierPosition.y) -
        Math.hypot(bPosition.x - carrierPosition.x, bPosition.y - carrierPosition.y);
    })[0] ?? carrier;

  const freeKickEvents: MatchEvent[] = [
    nextEvent,
    {
      id: state.events.length + 2,
      type: "foul",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: defendingTeam.id,
      playerId: tackler.id,
      targetPlayerId: carrier.id,
      description: `${tackler.name} fouls ${carrier.name}.`,
    },
  ];

  if (yellow) freeKickEvents.push({
    id: state.events.length + freeKickEvents.length + 1,
    type: "yellow-card",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: defendingTeam.id,
    playerId: tackler.id,
    description: previousYellows > 0
      ? `${tackler.name} is shown a second yellow card and sent off.`
      : `${tackler.name} is shown a yellow card.`,
  });

  if (directRed || secondYellowRed) freeKickEvents.push({
    id: state.events.length + freeKickEvents.length + 1,
    type: "red-card",
    minute: getMatchMinute(elapsedSeconds),
    elapsedSeconds,
    teamId: defendingTeam.id,
    playerId: tackler.id,
    description: `${tackler.name} is sent off.`,
  });

  let penaltyOutcome: "goal" | "saved" | "off-target" | undefined;
  let penaltyTaker: Player | undefined;
  let penaltyKeeper: Player | undefined;
  if (penaltyAwarded) {
    const eligibleTakers = attackingSelection.startingXI
      .map((id) => attackingTeam.squad.find((player) => player.id === id))
      .filter((player): player is Player => player !== undefined && player.primaryPosition !== "GK");
    penaltyTaker = eligibleTakers.sort((a, b) => {
      const score = (player: Player) => player.attributes.finishing * 0.55 + player.attributes.shooting * 0.3 + player.attributes.decisionMaking * 0.15 + (player.primaryPosition === "ST" ? 4 : player.primaryPosition === "AM" ? 2 : 0);
      return score(b) - score(a);
    })[0];
    penaltyKeeper = defendingSelection.startingXI
      .map((id) => defendingTeam.squad.find((player) => player.id === id))
      .find((player) => player?.primaryPosition === "GK");
    if (!penaltyTaker || !penaltyKeeper) throw new Error("Penalty taker or goalkeeper could not be found.");

    const goalProbability = Math.max(0.65, Math.min(0.84,
      0.75 + (penaltyTaker.attributes.finishing - 50) * 0.0015 + (penaltyTaker.attributes.shooting - 50) * 0.0005 - (penaltyKeeper.attributes.goalkeeping - 50) * 0.001,
    ));
    const saveProbability = Math.min(1 - goalProbability, Math.max(0.1, Math.min(0.25,
      0.18 + (penaltyKeeper.attributes.goalkeeping - 50) * 0.002 - (penaltyTaker.attributes.finishing - 50) * 0.0005,
    )));
    const penaltyRoll = rng.next();
    penaltyOutcome = penaltyRoll < goalProbability ? "goal" : penaltyRoll < goalProbability + saveProbability ? "saved" : "off-target";
    freeKickEvents.push({
      id: state.events.length + freeKickEvents.length + 1,
      type: "penalty",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: penaltyTaker.id,
      targetPlayerId: penaltyKeeper.id,
      shotDistanceMeters: 11,
      shotLocation: { x: attacksRight ? 94 : 11, y: 34 },
      outcome: penaltyOutcome,
      description: penaltyOutcome === "goal"
        ? `${penaltyTaker.name} scores the penalty.`
        : penaltyOutcome === "saved"
          ? `${penaltyKeeper.name} saves ${penaltyTaker.name}'s penalty.`
          : `${penaltyTaker.name} misses the penalty off target.`,
    });
    if (penaltyOutcome === "goal") freeKickEvents.push({
      id: state.events.length + freeKickEvents.length + 1,
      type: "goal",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: penaltyTaker.id,
      outcome: "goal",
      description: `GOAL! ${penaltyTaker.name} scores from the penalty spot for ${attackingTeam.name}.`,
    });
    if (penaltyOutcome === "saved") freeKickEvents.push({
      id: state.events.length + freeKickEvents.length + 1,
      type: "save",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: defendingTeam.id,
      playerId: penaltyKeeper.id,
      targetPlayerId: penaltyTaker.id,
      outcome: "successful",
      description: `${penaltyKeeper.name} saves the penalty.`,
    });
  } else {
    freeKickEvents.push({
      id: state.events.length + freeKickEvents.length + 1,
      type: "free-kick",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: kicker.id,
      description: `${attackingTeam.name} take a free kick.`,
    });
  }

  const nextYellowCards = yellow
    ? { ...state.yellowCards, [tackler.id]: previousYellows + 1 }
    : state.yellowCards;
  const nextDismissed = dismissed
    ? [...state.dismissedPlayerIds, tackler.id]
    : state.dismissedPlayerIds;
  const nextDefendingSelection = dismissed
    ? {
        ...defendingSelection,
        startingXI: defendingSelection.startingXI.filter((id) => id !== tackler.id),
      }
    : defendingSelection;
  if (dismissed) {
    const { [tackler.id]: _sentOffPosition, ...remainingPositions } = playerPositions;
    playerPositions = remainingPositions;
  }

  const nextState: MatchState = {
    ...state,
    phase: clock.phase,
    elapsedSeconds,
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
    homeSelection: isHomePossession ? state.homeSelection : nextDefendingSelection,
    awaySelection: isHomePossession ? nextDefendingSelection : state.awaySelection,
    yellowCards: nextYellowCards,
    dismissedPlayerIds: nextDismissed,
    score: penaltyOutcome === "goal" ? {
      home: state.score.home + (isHomePossession ? 1 : 0),
      away: state.score.away + (isHomePossession ? 0 : 1),
    } : state.score,
    ballPosition: penaltyOutcome ? (playerPositions[penaltyKeeper!.id] ?? carrierPosition) : carrierPosition,
    playerPositions: penaltyOutcome
      ? playerPositions
      : { ...playerPositions, [kicker.id]: carrierPosition },
    possessionTeamId: penaltyOutcome ? defendingTeam.id : attackingTeam.id,
    ballCarrierId: penaltyOutcome ? penaltyKeeper!.id : kicker.id,
    rngState: rng.getState(),
    events: [...state.events, ...freeKickEvents],
  };

  if (dismissed && nextDefendingSelection.startingXI.length < 7) {
    const abandonment: MatchEvent = {
      id: nextState.events.length + 1,
      type: "abandonment",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: defendingTeam.id,
      playerId: tackler.id,
      description: `${defendingTeam.name} cannot continue with fewer than seven players.`,
    };
    return {
      ...nextState,
      phase: "full-time",
      possessionTeamId: null,
      ballCarrierId: null,
      events: [...nextState.events, abandonment],
    };
  }

  if (penaltyOutcome === "goal") {
    return restartAfterGoal(nextState, defendingTeam.id, elapsedSeconds, clock.phase, rng.getState(), []);
  }

  return applyTacticalMovement(nextState);
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

  const kickoffPlayer = selectKickoffPlayer(team, selection);

  if (!kickoffPlayer) {
    throw new Error("No eligible player found to take goal kickoff.");
  }

  const centrePosition = KICKOFF_POSITION;

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
  const attackingLoad = getTacticalLoad(attackingSelection);
  const defendingLoad = getTacticalLoad(defendingSelection);

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

  const depthToGoal = attackingRight
    ? 105 - state.ballPosition.x
    : state.ballPosition.x;
  const lateralDistanceToGoal = Math.abs(state.ballPosition.y - 34);
  const distanceToGoal = Math.hypot(depthToGoal, lateralDistanceToGoal);

  const halfGoalAngle = Math.atan2(3.66, Math.max(1, depthToGoal));
  const offsetAngle = Math.atan2(lateralDistanceToGoal, Math.max(1, depthToGoal));
  const visibleGoalAngle = Math.max(0.05, 2 * halfGoalAngle - offsetAngle);
  const angleQuality = Math.max(0.35, Math.min(1, visibleGoalAngle / (2 * Math.atan2(3.66, 12))));
  const nearestDefenderDistance = defendingSelection.startingXI
    .map((id) => defendingTeam.squad.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined && player.primaryPosition !== "GK")
    .map((player) => state.playerPositions[player.id])
    .filter((position): position is NonNullable<typeof position> => position !== undefined)
    .reduce((nearest, position) => Math.min(nearest, Math.hypot(position.x - state.ballPosition.x, position.y - state.ballPosition.y)), Number.POSITIVE_INFINITY);
  const defensivePressure = Math.max(0, 1 - nearestDefenderDistance / 6);

  const rng = createRng(state.rngState);

  const distancePenalty = Math.max(0, distanceToGoal - 12) * 0.008;

  const accuracyProbability = Math.max(
    0.15,
    Math.min(
      0.8,
      0.32 +
        (isHome ? 0.015 : 0) +
        (fatigueAdjusted(shooter.attributes.shooting, shooter.attributes.stamina, state.elapsedSeconds, attackingLoad) - 50) * 0.003 +
        0.08 * (angleQuality - 1) -
        Math.min(0.07, defensivePressure * 0.07) -
        distancePenalty,
    ),
  );

  const onTarget = rng.next() < accuracyProbability;

  const distanceSaveBonus = Math.max(0, distanceToGoal - 12) * 0.006;
  const goalkeeperGoalLineX = attackingRight ? 102 : 3;
  const goalkeeperShotPosition = state.playerPositions[goalkeeper.id] ?? { x: goalkeeperGoalLineX, y: 34 };
  const goalkeeperAlignmentPenalty = Math.min(0.1,
    Math.abs(goalkeeperShotPosition.y - 34) * 0.004 + Math.abs(goalkeeperShotPosition.x - goalkeeperGoalLineX) * 0.01,
  );

  const saveProbability = Math.max(
    0.2,
    Math.min(
      0.9,
      0.73 +
        (defendingTeam.id === state.homeTeam.id ? 0.015 : 0) +
        (fatigueAdjusted(goalkeeper.attributes.goalkeeping, goalkeeper.attributes.stamina, state.elapsedSeconds, defendingLoad) - 50) * 0.005 -
        (fatigueAdjusted(goalkeeper.attributes.positioning, goalkeeper.attributes.stamina, state.elapsedSeconds, defendingLoad) - 50) * 0.002 -
        (fatigueAdjusted(shooter.attributes.finishing, shooter.attributes.stamina, state.elapsedSeconds, attackingLoad) - 50) * 0.002 +
        distanceSaveBonus - goalkeeperAlignmentPenalty,
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
    state.firstHalfAddedTimeSeconds,
    state.secondHalfAddedTimeSeconds,
  );

  const elapsedSeconds = state.elapsedSeconds + duration;
  const firstHalfAddedTimeSeconds =
    state.firstHalfAddedTimeSeconds + (goal && state.phase === "first-half" ? 30 : 0);
  const secondHalfAddedTimeSeconds =
    state.secondHalfAddedTimeSeconds + (goal && state.phase === "second-half" ? 30 : 0);
  const clock = getClockTransition(
    elapsedSeconds,
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
  );

  const nextEvents: MatchEvent[] = [
    {
      id: state.events.length + 1,
      type: "shot",
      minute: getMatchMinute(elapsedSeconds),
      elapsedSeconds,
      teamId: attackingTeam.id,
      playerId: shooter.id,
      targetPlayerId: goalkeeper.id,
      shotDistanceMeters: distanceToGoal,
      shotLocation: state.ballPosition,
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
        firstHalfAddedTimeSeconds,
        secondHalfAddedTimeSeconds,
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
    firstHalfAddedTimeSeconds,
    secondHalfAddedTimeSeconds,
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

    firstHalfAddedTimeSeconds:
      state.firstHalfAddedTimeSeconds +
      (isActivePlay && state.phase === "first-half" ? 30 : 0),
    secondHalfAddedTimeSeconds:
      state.secondHalfAddedTimeSeconds +
      (isActivePlay && state.phase === "second-half" ? 30 : 0),

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
