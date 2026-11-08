import { createMatchState } from "../engine/match.js";
import { simulateMatch } from "../engine/match-runner.js";
import type { Player } from "../engine/types.js";
import {
  createCalibrationTeam,
  createCalibrationSelection,
} from "./fixtures.js";

const MATCH_COUNT = 50;
const BASE_SEED = 30000;

type Attribute = keyof Player["attributes"];

const ATTRIBUTES: Attribute[] = [
  "passing",
  "shooting",
  "finishing",
  "goalkeeping",
  "tackling",
  "dribbling",
  "pace",
  "stamina",
  "strength",
  "positioning",
  "decisionMaking",
];

interface AttributeStats {
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  successfulPasses: number;
  tackles: number;
  successfulTackles: number;
  carries: number;
  saves: number;
  failed: number;
}

function createStats(): AttributeStats {
  return {
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    successfulPasses: 0,
    tackles: 0,
    successfulTackles: 0,
    carries: 0,
    saves: 0,
    failed: 0,
  };
}

function runAttributeTest(attribute: Attribute, boostedSide: "home" | "away") {
  const overrides = { [attribute]: 80 };

  const homeTeam = createCalibrationTeam(
    "home",
    boostedSide === "home" ? overrides : {},
  );

  const awayTeam = createCalibrationTeam(
    "away",
    boostedSide === "away" ? overrides : {},
  );

  const homeSelection = createCalibrationSelection(homeTeam);
  const awaySelection = createCalibrationSelection(awayTeam);

  const boosted = createStats();
  const baseline = createStats();

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
        throw new Error("Match did not reach full-time.");
      }

      const boostedGoals =
        boostedSide === "home" ? result.score.home : result.score.away;

      const baselineGoals =
        boostedSide === "home" ? result.score.away : result.score.home;

      boosted.goals += boostedGoals;
      baseline.goals += baselineGoals;

      if (boostedGoals > baselineGoals) boosted.wins += 1;
      else if (boostedGoals < baselineGoals) boosted.losses += 1;
      else boosted.draws += 1;

      for (const event of result.events) {
        const isBoosted =
          event.teamId === (boostedSide === "home" ? homeTeam.id : awayTeam.id);

        const stats = isBoosted ? boosted : baseline;

        if (event.type === "shot") {
          stats.shots += 1;
          if (event.outcome !== "off-target") {
            stats.shotsOnTarget += 1;
          }
        }

        if (event.type === "pass") {
          stats.passes += 1;
          if (event.outcome === "successful") {
            stats.successfulPasses += 1;
          }
        }

        if (event.type === "tackle") {
          stats.tackles += 1;
          if (event.outcome === "successful") {
            stats.successfulTackles += 1;
          }
        }

        if (event.type === "carry") {
          stats.carries += 1;
        }

        if (event.type === "save") {
          stats.saves += 1;
        }
      }
    } catch (error) {
      boosted.failed += 1;
      baseline.failed += 1;

      const message = error instanceof Error ? error.message : String(error);
      console.error(`${attribute}, match ${index + 1}: ${message}`);
    }
  }

  return { boosted, baseline };
}

function rate(successes: number, attempts: number): string {
  return attempts > 0 ? `${((successes / attempts) * 100).toFixed(1)}%` : "N/A";
}

function average(value: number, matches: number): string {
  return matches > 0 ? (value / matches).toFixed(2) : "N/A";
}

console.log("\n==========================================");
console.log("       PLAYER ATTRIBUTE VALIDATION");
console.log("==========================================");
console.log(`Matches per orientation: ${MATCH_COUNT}`);
console.log("Baseline rating: 70 | Boosted rating: 80");
console.log("Only one attribute is changed per experiment.");

for (const attribute of ATTRIBUTES) {
  console.log(`\n========== ${attribute.toUpperCase()} ==========`);

  const homeTest = runAttributeTest(attribute, "home");
  const awayTest = runAttributeTest(attribute, "away");

  const boosted = {
    wins: homeTest.boosted.wins + awayTest.boosted.wins,
    draws: homeTest.boosted.draws + awayTest.boosted.draws,
    losses: homeTest.boosted.losses + awayTest.boosted.losses,
    goals: homeTest.boosted.goals + awayTest.boosted.goals,
    shots: homeTest.boosted.shots + awayTest.boosted.shots,
    shotsOnTarget:
      homeTest.boosted.shotsOnTarget + awayTest.boosted.shotsOnTarget,
    passes: homeTest.boosted.passes + awayTest.boosted.passes,
    successfulPasses:
      homeTest.boosted.successfulPasses + awayTest.boosted.successfulPasses,
    tackles: homeTest.boosted.tackles + awayTest.boosted.tackles,
    successfulTackles:
      homeTest.boosted.successfulTackles + awayTest.boosted.successfulTackles,
    carries: homeTest.boosted.carries + awayTest.boosted.carries,
    saves: homeTest.boosted.saves + awayTest.boosted.saves,
    failed: homeTest.boosted.failed + awayTest.boosted.failed,
  };

  const baseline = {
    goals: homeTest.baseline.goals + awayTest.baseline.goals,
    shots: homeTest.baseline.shots + awayTest.baseline.shots,
    shotsOnTarget:
      homeTest.baseline.shotsOnTarget + awayTest.baseline.shotsOnTarget,
    passes: homeTest.baseline.passes + awayTest.baseline.passes,
    successfulPasses:
      homeTest.baseline.successfulPasses + awayTest.baseline.successfulPasses,
    tackles: homeTest.baseline.tackles + awayTest.baseline.tackles,
    successfulTackles:
      homeTest.baseline.successfulTackles + awayTest.baseline.successfulTackles,
    carries: homeTest.baseline.carries + awayTest.baseline.carries,
    saves: homeTest.baseline.saves + awayTest.baseline.saves,
  };

  const matches = MATCH_COUNT * 2;

  console.log(
    `Boosted-team wins:       ${boosted.wins} (${rate(boosted.wins, matches)})`,
  );
  console.log(
    `Draws:                   ${boosted.draws} (${rate(boosted.draws, matches)})`,
  );
  console.log(
    `Baseline-team wins:      ${boosted.losses} (${rate(boosted.losses, matches)})`,
  );
  console.log(`Boosted goals/match:     ${average(boosted.goals, matches)}`);
  console.log(`Baseline goals/match:    ${average(baseline.goals, matches)}`);
  console.log(`Boosted shots/match:     ${average(boosted.shots, matches)}`);
  console.log(`Baseline shots/match:    ${average(baseline.shots, matches)}`);
  console.log(
    `Boosted shot accuracy:   ${rate(boosted.shotsOnTarget, boosted.shots)}`,
  );
  console.log(
    `Baseline shot accuracy:  ${rate(baseline.shotsOnTarget, baseline.shots)}`,
  );
  console.log(
    `Boosted pass accuracy:   ${rate(boosted.successfulPasses, boosted.passes)}`,
  );
  console.log(
    `Baseline pass accuracy:  ${rate(baseline.successfulPasses, baseline.passes)}`,
  );
  console.log(
    `Boosted tackle accuracy: ${rate(boosted.successfulTackles, boosted.tackles)}`,
  );
  console.log(
    `Baseline tackle accuracy:${rate(baseline.successfulTackles, baseline.tackles)}`,
  );
  console.log(`Boosted carries/match:   ${average(boosted.carries, matches)}`);
  console.log(`Boosted saves/match:     ${average(boosted.saves, matches)}`);
  console.log(`Failed matches:          ${boosted.failed}`);
}

console.log("\n==========================================\n");
