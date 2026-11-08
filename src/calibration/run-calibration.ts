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
      kickoffTeamId: index % 2 === 0 ? homeTeam.id : awayTeam.id,
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
console.log(`Goal events recorded:    ${report.totalGoalEvents} (${report.goalEventMismatchMatches} score/event mismatches)`);
console.log(`Average goals per match: ${report.averageGoals.toFixed(2)}`);
console.log(`Total shots:             ${report.totalShots}`);
console.log(`Average shots per match: ${report.averageShots.toFixed(2)}`);
console.log(`Overall shot conversion: ${report.totalShots ? `${(report.totalGoals / report.totalShots * 100).toFixed(1)}%` : "0.0%"}`);
console.log(`Penalty attempts:         ${report.totalPenalties}`);
console.log(`Penalty outcomes:         ${report.penaltyGoals} goals, ${report.penaltySaves} saves, ${report.penaltyMisses} misses`);
const openPlayShots = report.totalShots - report.totalPenalties;
const openPlayGoals = report.totalGoals - report.penaltyGoals;
console.log(`Open-play shots:          ${openPlayShots}`);
console.log(`Open-play goals:          ${openPlayGoals}`);
console.log(`Open-play conversion:     ${openPlayShots ? `${(openPlayGoals / openPlayShots * 100).toFixed(1)}%` : "0.0%"}`);
console.log(`Shots on target:         ${report.shotsOnTarget}`);
console.log(`Total saves:             ${report.totalSaves}`);
console.log(`Off-target misses:       ${report.totalMisses}`);
console.log("Shots and goals by player position (includes penalties):");
for (const [position, counts] of Object.entries(report.shotsByPosition)) {
  const conversion = counts.shots ? `${(counts.goals / counts.shots * 100).toFixed(1)}%` : "0.0%";
  console.log(`  ${position.padEnd(3)} ${String(counts.shots).padStart(6)} shots  ${String(counts.goals).padStart(5)} goals  ${String(counts.saves).padStart(5)} saves  ${String(counts.misses).padStart(5)} misses  conv ${conversion}`);
}
console.log("Open-play shots and goals by player position:");
for (const [position, counts] of Object.entries(report.openPlayShotsByPosition)) {
  const conversion = counts.shots ? `${(counts.goals / counts.shots * 100).toFixed(1)}%` : "0.0%";
  console.log(`  ${position.padEnd(3)} ${String(counts.shots).padStart(6)} shots  ${String(counts.goals).padStart(5)} goals  conv ${conversion}`);
}
console.log("Shots and goals by distance (includes penalty spot attempts):");
for (const [band, counts] of Object.entries(report.shotsByDistance)) {
  const conversion = counts.shots ? `${(counts.goals / counts.shots * 100).toFixed(1)}%` : "0.0%";
  console.log(`  ${band.padEnd(8)} ${String(counts.shots).padStart(6)} shots  ${String(counts.goals).padStart(5)} goals  conversion ${conversion}`);
}
console.log("Open-play shots and goals by distance:");
for (const [band, counts] of Object.entries(report.openPlayShotsByDistance)) {
  const conversion = counts.shots ? `${(counts.goals / counts.shots * 100).toFixed(1)}%` : "0.0%";
  console.log(`  ${band.padEnd(8)} ${String(counts.shots).padStart(6)} shots  ${String(counts.goals).padStart(5)} goals  conversion ${conversion}`);
}
console.log("Goalkeeper shot outcomes:");
for (const [goalkeeperId, keeper] of Object.entries(report.goalkeeperStats)) {
  const saveRate = keeper.faced ? `${(keeper.saves / keeper.faced * 100).toFixed(1)}%` : "0.0%";
  console.log(`  ${goalkeeperId}: faced ${keeper.faced}, saves ${keeper.saves} (${saveRate}), goals conceded ${keeper.goalsConceded}`);
}
console.log("Total goals per match distribution:");
for (const [bucket, count] of Object.entries(report.goalDistribution)) {
  console.log(`  ${bucket.padStart(2)} goals:            ${count}`);
}
console.log("Most common scorelines:");
for (const { scoreline, matches } of report.commonScorelines) {
  console.log(`  ${scoreline}: ${matches}`);
}

console.log("\n--- Match activity ---");
console.log(`Total passes:            ${report.totalPasses}`);
console.log(`Successful passes:       ${report.successfulPasses}`);
console.log(`Total tackles:           ${report.totalTackles}`);
console.log(`Successful tackles:      ${report.successfulTackles}`);
console.log(`Fouls:                   ${report.totalFouls}`);
console.log(`Yellow cards:            ${report.totalYellowCards}`);
console.log(`Red cards:               ${report.totalRedCards}`);

console.log("\n==================================\n");
