import type { MatchState } from "./match-state.js";
import type { Formation, Tactics, TeamId } from "./types.js";

import {
  startMatch,
  startSecondHalf,
  substitutePlayer as applySubstitution,
} from "./match.js";

import {
  executeNextAction,
  executeDefensiveAction,
  getDefensivePressureProbability,
} from "./simulation.js";

import { recordPhaseEvent } from "./phase-events.js";
import { createRng } from "./rng.js";
import { createTeamPlayerPositions, getTeamAttacksRight } from "./spatial.js";
import { getMatchMinute } from "./clock.js";
import type { MatchEventType } from "./match-types.js";
import { getMatchStatistics, type MatchStatistics } from "./statistics.js";

export interface MatchController {
  readonly match: MatchState;
  readonly kickoffTeamId: TeamId;
  readonly isPaused: boolean;
}

export function createMatchController(
  initialState: MatchState,
  kickoffTeamId: TeamId,
): MatchController {
  if (initialState.phase !== "first-half" || initialState.events.length !== 0) {
    throw new Error("Controller requires an unstarted match.");
  }

  return {
    match: startMatch(initialState, kickoffTeamId),
    kickoffTeamId,
    isPaused: false,
  };
}

export function pauseMatch(controller: MatchController): MatchController {
  return { ...controller, isPaused: true };
}

export function resumeMatch(controller: MatchController): MatchController {
  if (controller.match.phase === "full-time") {
    throw new Error("A completed match cannot be resumed.");
  }

  return { ...controller, isPaused: false };
}

export function startControllerSecondHalf(
  controller: MatchController,
): MatchController {
  if (controller.match.phase !== "half-time") {
    throw new Error("Second half can only start at half-time.");
  }

  if (controller.isPaused) {
    throw new Error("Resume the controller before starting the second half.");
  }

  const secondHalfKickoffTeamId =
    controller.kickoffTeamId === controller.match.homeTeam.id
      ? controller.match.awayTeam.id
      : controller.match.homeTeam.id;

  const withHalfTimeEvent = recordPhaseEvent(controller.match, "half-time");

  return {
    ...controller,
    match: startSecondHalf(withHalfTimeEvent, secondHalfKickoffTeamId),
  };
}

export function advanceMatch(
  controller: MatchController,
  actionCount = 1,
): MatchController {
  if (controller.isPaused) {
    throw new Error("Cannot advance a paused match.");
  }

  if (!Number.isInteger(actionCount) || actionCount < 1) {
    throw new RangeError("Action count must be a positive integer.");
  }

  if (
    controller.match.phase !== "first-half" &&
    controller.match.phase !== "second-half"
  ) {
    throw new Error("Match is not currently in active play.");
  }

  let match = controller.match;

  for (let index = 0; index < actionCount; index += 1) {
    const phaseBeforeAction = match.phase;
    const possessionBeforeAction = match.possessionTeamId;

    match = executeNextAction(match);

    if (match.phase !== phaseBeforeAction) {
      if (match.phase === "full-time") {
        match = recordPhaseEvent(match, "full-time");
      }

      break;
    }

    if (match.possessionTeamId !== possessionBeforeAction) {
      continue;
    }

    const rng = createRng(match.rngState);

    const shouldApplyPressure =
      rng.next() < getDefensivePressureProbability(match);

    match = {
      ...match,
      rngState: rng.getState(),
    };

    if (shouldApplyPressure) {
      match = executeDefensiveAction(match);

      if (match.phase !== phaseBeforeAction) {
        if (match.phase === "full-time") {
          match = recordPhaseEvent(match, "full-time");
        }

        break;
      }
    }
  }

  return { ...controller, match };
}

function assertCanAdvance(controller: MatchController): void {
  if (controller.isPaused) throw new Error("Cannot advance a paused match.");
  if (controller.match.phase === "full-time") throw new Error("Match is already complete.");
}

function advanceOneClockStep(controller: MatchController): MatchController {
  if (controller.match.phase === "half-time") return startControllerSecondHalf(controller);
  return advanceMatch(controller, 1);
}

/** Advances until the requested elapsed match minute is reached or exceeded.
 * Actions are atomic, so the final action can finish a few seconds into that minute.
 */
export function advanceToMinute(
  controller: MatchController,
  targetMinute: number,
  maxSteps = 5000,
): MatchController {
  assertCanAdvance(controller);
  if (!Number.isInteger(targetMinute) || targetMinute < 0) {
    throw new RangeError("Target minute must be a non-negative integer.");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError("Maximum steps must be a positive integer.");
  }
  if (targetMinute < getMatchMinute(controller.match.elapsedSeconds)) {
    throw new RangeError("Target minute cannot be earlier than the current match minute.");
  }
  let next = controller;
  let steps = 0;
  while (next.match.phase !== "full-time" && getMatchMinute(next.match.elapsedSeconds) < targetMinute) {
    if (steps++ >= maxSteps) throw new Error("Maximum advancement steps exceeded before reaching the target minute.");
    next = advanceOneClockStep(next);
  }
  return next;
}

/** Advances a number of elapsed match minutes from the current match clock. */
export function advanceByMinutes(
  controller: MatchController,
  minutes: number,
  maxSteps = 5000,
): MatchController {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError("Minutes must be a non-negative integer.");
  }
  const target = getMatchMinute(controller.match.elapsedSeconds) + minutes;
  return advanceToMinute(controller, target, maxSteps);
}

/** Advances one action, including automatic half-time transition, until an event is logged. */
export function advanceUntilNextEvent(controller: MatchController): MatchController {
  assertCanAdvance(controller);
  if (controller.match.phase === "half-time") return startControllerSecondHalf(controller);
  return advanceMatch(controller, 1);
}

/** Advances action-by-action until the requested event type occurs. */
export function advanceUntilEventType(
  controller: MatchController,
  eventType: MatchEventType,
  maxSteps = 5000,
): MatchController {
  assertCanAdvance(controller);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError("Maximum steps must be a positive integer.");
  }
  const originalEventCount = controller.match.events.length;
  let next = controller;
  for (let step = 0; step < maxSteps; step += 1) {
    if (next.match.phase === "full-time") break;
    next = advanceOneClockStep(next);
    if (next.match.events.slice(originalEventCount).some((event) => event.type === eventType)) return next;
  }
  throw new Error(`Event ${eventType} was not reached within ${maxSteps} advancement steps.`);
}

export function getCurrentMatchState(controller: MatchController): MatchState {
  return controller.match;
}

export function getMatchEventLog(controller: MatchController): MatchState["events"] {
  return controller.match.events;
}

export function getCurrentMatchStatistics(controller: MatchController): MatchStatistics {
  return getMatchStatistics(controller.match);
}

export function changeTeamTactics(
  controller: MatchController,
  teamId: TeamId,
  tactics: Tactics,
): MatchController {
  const { match } = controller;

  if (
    match.phase !== "first-half" &&
    match.phase !== "half-time" &&
    match.phase !== "second-half"
  ) {
    throw new Error("Tactics can only be changed before full-time.");
  }

  const values = Object.values(tactics);

  if (
    values.some((value) => !Number.isInteger(value) || value < 1 || value > 100)
  ) {
    throw new RangeError("Tactical values must be integers from 1 to 100.");
  }

  if (teamId === match.homeTeam.id) {
    if (JSON.stringify(match.homeSelection.tactics) === JSON.stringify(tactics)) return controller;
    const updatedMatch = {
      ...match,
      homeSelection: { ...match.homeSelection, tactics: { ...tactics } },
      events: [...match.events, {
        id: match.events.length + 1,
        type: "tactical-change" as const,
        minute: getMatchMinute(match.elapsedSeconds),
        elapsedSeconds: match.elapsedSeconds,
        teamId,
        description: `${match.homeTeam.name} change tactics (mentality ${tactics.mentality}, pressing ${tactics.pressing}, tempo ${tactics.tempo}, width ${tactics.width}, defensive line ${tactics.defensiveLine}).`,
      }],
    };
    return {
      ...controller,
      match: updatedMatch,
    };
  }

  if (teamId === match.awayTeam.id) {
    if (JSON.stringify(match.awaySelection.tactics) === JSON.stringify(tactics)) return controller;
    return {
      ...controller,
      match: {
        ...match,
        awaySelection: {
          ...match.awaySelection,
          tactics: { ...tactics },
        },
        events: [...match.events, {
          id: match.events.length + 1,
          type: "tactical-change",
          minute: getMatchMinute(match.elapsedSeconds),
          elapsedSeconds: match.elapsedSeconds,
          teamId,
          description: `${match.awayTeam.name} change tactics (mentality ${tactics.mentality}, pressing ${tactics.pressing}, tempo ${tactics.tempo}, width ${tactics.width}, defensive line ${tactics.defensiveLine}).`,
        }],
      },
    };
  }

  throw new Error("Team must belong to this match.");
}

export function changeTeamFormation(
  controller: MatchController,
  teamId: TeamId,
  formation: Formation,
): MatchController {
  const { match } = controller;

  if (
    match.phase !== "first-half" &&
    match.phase !== "half-time" &&
    match.phase !== "second-half"
  ) {
    throw new Error("Formation can only be changed before full-time.");
  }

  const total =
    formation.defenders + formation.midfielders + formation.forwards;

  if (
    !Number.isInteger(formation.defenders) ||
    !Number.isInteger(formation.midfielders) ||
    !Number.isInteger(formation.forwards) ||
    formation.defenders < 1 ||
    formation.midfielders < 1 ||
    formation.forwards < 1 ||
    total !== 10
  ) {
    throw new RangeError(
      "Formation must contain exactly ten outfield players.",
    );
  }

  const isHome = teamId === match.homeTeam.id;
  const isAway = teamId === match.awayTeam.id;

  if (!isHome && !isAway) {
    throw new Error("Team must belong to this match.");
  }

  const team = isHome ? match.homeTeam : match.awayTeam;
  const currentSelection = isHome ? match.homeSelection : match.awaySelection;

  const nextSelection = {
    ...currentSelection,
    formation: { ...formation },
  };

  const nextPositions = createTeamPlayerPositions(
    team,
    nextSelection,
    getTeamAttacksRight(match, teamId),
  );

  return {
    ...controller,
    match: {
      ...match,
      homeSelection: isHome ? nextSelection : match.homeSelection,
      awaySelection: isAway ? nextSelection : match.awaySelection,
      playerPositions: {
        ...match.playerPositions,
        ...nextPositions,
      },
    },
  };
}

export function makeSubstitution(
  controller: MatchController,
  teamId: TeamId,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  substitutionWindowId?: string,
): MatchController {
  const match = applySubstitution(
    controller.match,
    teamId,
    outgoingPlayerId,
    incomingPlayerId,
    substitutionWindowId,
  );

  const isHome = teamId === match.homeTeam.id;
  const team = isHome ? match.homeTeam : match.awayTeam;
  const selection = isHome ? match.homeSelection : match.awaySelection;

  const nextPositions = createTeamPlayerPositions(
    team,
    selection,
    getTeamAttacksRight(match, teamId),
  );

  return {
    ...controller,
    match: {
      ...match,
      playerPositions: {
        ...match.playerPositions,
        ...nextPositions,
      },
    },
  };
}
