import { createCalibrationSelection, createCalibrationTeam } from "../calibration/fixtures.js";
import { createMatchState } from "../engine/match.js";
import { createMatchController, pauseMatch, type MatchController } from "../engine/match-controller.js";

let previousSeed: number | undefined;

/** Owns UI session seed generation. The engine remains deterministic for a supplied seed. */
export function generateMatchSeed(): number {
  const cryptoSource = globalThis.crypto;
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new Error("A secure browser random source is required to start a new match.");
  }

  const word = new Uint32Array(1);
  cryptoSource.getRandomValues(word);
  let seed = word[0]!;
  if (seed === previousSeed) seed = (seed + 1) >>> 0;
  previousSeed = seed;
  return seed;
}

/** Creates a clean match/controller. Supplying a seed is useful for replay and tests. */
export function createMatchSessionController(
  homeName: string,
  awayName: string,
  seed = generateMatchSeed(),
): MatchController {
  const homeTeam = { ...createCalibrationTeam("home"), name: homeName };
  const awayTeam = { ...createCalibrationTeam("away"), name: awayName };
  const initialState = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createCalibrationSelection(homeTeam),
    awaySelection: createCalibrationSelection(awayTeam),
    seed,
  });
  return pauseMatch(createMatchController(initialState, homeTeam.id));
}
