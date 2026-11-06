import { createMatchState } from "../engine/match.js";
import { simulateMatch } from "../engine/match-runner.js";
import {
  createCalibrationTeam,
  createCalibrationSelection,
} from "./fixtures.js";
import { createCalibrationReport } from "./metrics.js";

const MATCH_COUNT = 1000;
const BASE_SEED = 10000;

const homeTeam = createCalibrationTeam("home");
const awayTeam = createCalibrationTeam("away");

const homeSelection = createCalibrationSelection(homeTeam);
const awaySelection = createCalibrationSelection(awayTeam);

const completedMatches = [];
let matchesFailed = 0;

for (let index = 0; index < MATCH_COUNT; index += 1) {
  try {
    const initialState = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection,
      awaySelection,
      seed: BASE_SEED + index,
    });

    const result = simulateMatch(initialState, {
      kickoffTeamId: homeTeam.id,
    });

    if (result.phase !== "full-time") {
      throw new Error(`Match ${index + 1} did not reach full-time.`);
    }

    completedMatches.push(result);
  } catch (error) {
    matchesFailed += 1;

    const message = error instanceof Error ? error.message : String(error);

    console.error(`Match ${index + 1} failed: ${message}`);
  }
}

const report = createCalibrationReport(completedMatches, matchesFailed);

const percentage = (value: number, total: number): string =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";

console.log("\n==================================");
console.log("      FOOTBALL CALIBRATION");
console.log("==================================");

console.log(`Matches requested:       ${MATCH_COUNT}`);
console.log(`Matches completed:       ${report.matchesCompleted}`);
console.log(`Matches failed:          ${report.matchesFailed}`);

console.log("\n--- Match outcomes ---");
console.log(
  `Home wins:               ${report.homeWins} (${percentage(report.homeWins, report.matchesPlayed)})`,
);
console.log(
  `Draws:                   ${report.draws} (${percentage(report.draws, report.matchesPlayed)})`,
);
console.log(
  `Away wins:               ${report.awayWins} (${percentage(report.awayWins, report.matchesPlayed)})`,
);

console.log("\n--- Goals and shooting ---");
console.log(`Total goals:             ${report.totalGoals}`);
console.log(`Average goals per match: ${report.averageGoals.toFixed(2)}`);
console.log(`Total shots:             ${report.totalShots}`);
console.log(`Average shots per match: ${report.averageShots.toFixed(2)}`);
console.log(`Shots on target:         ${report.shotsOnTarget}`);
console.log(`Total saves:             ${report.totalSaves}`);

console.log("\n--- Match activity ---");
console.log(`Total passes:            ${report.totalPasses}`);
console.log(`Successful passes:       ${report.successfulPasses}`);
console.log(`Total tackles:           ${report.totalTackles}`);
console.log(`Successful tackles:      ${report.successfulTackles}`);

console.log("\n==================================\n");
