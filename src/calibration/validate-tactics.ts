import { createMatchState } from "../engine/match.js";
import { simulateMatch } from "../engine/match-runner.js";
import type { Formation, Tactics } from "../engine/types.js";
import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "./fixtures.js";

const MATCHES_PER_ORIENTATION = 25;
const BASE_SEED = 90_000;

const styles: readonly {
  readonly name: string;
  readonly formation: Formation;
  readonly tactics: Tactics;
}[] = [
  {
    name: "balanced-433",
    formation: { defenders: 4, midfielders: 3, forwards: 3 },
    tactics: { mentality: 50, pressing: 50, tempo: 50, width: 50, defensiveLine: 50 },
  },
  {
    name: "high-press-433",
    formation: { defenders: 4, midfielders: 3, forwards: 3 },
    tactics: { mentality: 65, pressing: 90, tempo: 75, width: 55, defensiveLine: 70 },
  },
  {
    name: "low-block-532",
    formation: { defenders: 5, midfielders: 3, forwards: 2 },
    tactics: { mentality: 35, pressing: 25, tempo: 40, width: 40, defensiveLine: 25 },
  },
  {
    name: "wide-352",
    formation: { defenders: 3, midfielders: 5, forwards: 2 },
    tactics: { mentality: 60, pressing: 55, tempo: 60, width: 90, defensiveLine: 50 },
  },
];

const totals = new Map(styles.map(({ name }) => [name, {
  played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
}]));
let seedIndex = 0;

function runOrientation(homeStyle: typeof styles[number], awayStyle: typeof styles[number]) {
  const homeTeam = createCalibrationTeam("home");
  const awayTeam = createCalibrationTeam("away");
  const homeSelection = {
    ...createCalibrationSelection(homeTeam),
    formation: homeStyle.formation,
    tactics: homeStyle.tactics,
  };
  const awaySelection = {
    ...createCalibrationSelection(awayTeam),
    formation: awayStyle.formation,
    tactics: awayStyle.tactics,
  };

  for (let match = 0; match < MATCHES_PER_ORIENTATION; match += 1) {
    const state = createMatchState({
      homeTeam,
      awayTeam,
      homeSelection,
      awaySelection,
      seed: BASE_SEED + seedIndex++,
    });
    const result = simulateMatch(state, {
      kickoffTeamId: match % 2 === 0 ? homeTeam.id : awayTeam.id,
    });
    const home = totals.get(homeStyle.name)!;
    const away = totals.get(awayStyle.name)!;
    home.played += 1;
    away.played += 1;
    home.goalsFor += result.score.home;
    home.goalsAgainst += result.score.away;
    away.goalsFor += result.score.away;
    away.goalsAgainst += result.score.home;
    if (result.score.home > result.score.away) {
      home.wins += 1; away.losses += 1; home.points += 3;
    } else if (result.score.home < result.score.away) {
      away.wins += 1; home.losses += 1; away.points += 3;
    } else {
      home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
    }
  }
}

for (let left = 0; left < styles.length; left += 1) {
  for (let right = left + 1; right < styles.length; right += 1) {
    runOrientation(styles[left]!, styles[right]!);
    runOrientation(styles[right]!, styles[left]!);
  }
}

console.log("Tactic comparison — synthetic equal-strength teams");
console.log(`Matches per orientation: ${MATCHES_PER_ORIENTATION}`);
console.log("Style             Pld   W   D   L   GF   GA   Pts/Match");
for (const style of styles) {
  const stat = totals.get(style.name)!;
  console.log(
    `${style.name.padEnd(18)}${String(stat.played).padStart(3)}${String(stat.wins).padStart(4)}${String(stat.draws).padStart(4)}${String(stat.losses).padStart(4)}${String(stat.goalsFor).padStart(5)}${String(stat.goalsAgainst).padStart(5)}${(stat.points / stat.played).toFixed(2).padStart(11)}`,
  );
}
