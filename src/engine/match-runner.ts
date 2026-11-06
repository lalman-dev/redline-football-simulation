import type { MatchState } from "./match-state.js";
import { startMatch, startSecondHalf } from "./match.js";
import { executeNextAction, executeDefensiveAction } from "./simulation.js";
import { recordPhaseEvent } from "./phase-events.js";
import { createRng } from "./rng.js";

export const DEFAULT_MAX_ACTIONS = 5000;

// A defensive challenge is attempted on roughly 1 in 4
// attacking actions that retain possession.
const DEFENSIVE_PRESSURE_PROBABILITY = 0.25;

export interface SimulateMatchOptions {
  readonly kickoffTeamId: string;
  readonly maxActions?: number;
}

export function simulateMatch(
  initialState: MatchState,
  options: SimulateMatchOptions,
): MatchState {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;

  if (!Number.isInteger(maxActions) || maxActions < 1) {
    throw new RangeError("Maximum actions must be a positive integer.");
  }

  if (initialState.phase !== "first-half" || initialState.events.length !== 0) {
    throw new Error("Simulation requires an unstarted match.");
  }

  let state = startMatch(initialState, options.kickoffTeamId);
  let actionsUsed = 0;

  const runHalf = (phase: "first-half" | "second-half"): void => {
    while (state.phase === phase) {
      if (actionsUsed >= maxActions) {
        throw new Error("Maximum simulation actions exceeded.");
      }

      const possessionBeforeAction = state.possessionTeamId;

      state = executeNextAction(state);
      actionsUsed += 1;

      if (state.phase !== phase) {
        break;
      }

      // Only consider defensive pressure when the attacking team
      // retains possession after its action.
      if (state.possessionTeamId !== possessionBeforeAction) {
        continue;
      }

      const pressureRng = createRng(state.rngState);
      const shouldApplyPressure =
        pressureRng.next() < DEFENSIVE_PRESSURE_PROBABILITY;

      state = {
        ...state,
        rngState: pressureRng.getState(),
      };

      if (!shouldApplyPressure) {
        continue;
      }

      if (actionsUsed >= maxActions) {
        throw new Error("Maximum simulation actions exceeded.");
      }

      state = executeDefensiveAction(state);
      actionsUsed += 1;
    }
  };

  runHalf("first-half");

  if (state.phase !== "half-time") {
    throw new Error("First half ended unexpectedly.");
  }

  state = recordPhaseEvent(state, "half-time");

  const secondHalfKickoffTeamId =
    options.kickoffTeamId === state.homeTeam.id
      ? state.awayTeam.id
      : state.homeTeam.id;

  state = startSecondHalf(state, secondHalfKickoffTeamId);

  runHalf("second-half");

  if (state.phase !== "full-time") {
    throw new Error("Second half ended unexpectedly.");
  }

  return recordPhaseEvent(state, "full-time");
}
