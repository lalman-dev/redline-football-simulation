import type { MatchState } from "./match-state.js";
import type { MatchEvent } from "./match-types.js";
import { getMatchMinute } from "./clock.js";

export function recordPhaseEvent(
  state: MatchState,
  type: "half-time" | "full-time",
): MatchState {
  const expectedPhase = type === "half-time" ? "half-time" : "full-time";

  if (state.phase !== expectedPhase) {
    throw new Error(
      `Cannot record ${type} while match phase is ${state.phase}.`,
    );
  }

  if (state.events.some((event) => event.type === type)) {
    throw new Error(`${type} event has already been recorded.`);
  }

  const event: MatchEvent = {
    id: state.events.length + 1,
    type,
    minute: getMatchMinute(state.elapsedSeconds),
    elapsedSeconds: state.elapsedSeconds,
    description:
      type === "half-time" ? "Half-time whistle." : "Full-time whistle.",
  };

  return {
    ...state,
    events: [...state.events, event],
  };
}
