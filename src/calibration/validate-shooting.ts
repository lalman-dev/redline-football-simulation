import { createMatchState } from "../engine/match.js";
import { simulateMatch } from "../engine/match-runner.js";
import type { PlayerPosition } from "../engine/types.js";
import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "./fixtures.js";

const MATCH_COUNT = 300;
const BASE_SEED = 120_000;
const positions: readonly PlayerPosition[] = [
  "ST", "LW", "RW", "AM", "CM", "DM", "CB", "LB", "RB",
];
const totals = new Map(positions.map((position) => [position, {
  shots: 0, onTarget: 0, goals: 0,
}]));

for (let index = 0; index < MATCH_COUNT; index += 1) {
  const homeTeam = createCalibrationTeam("home");
  const awayTeam = createCalibrationTeam("away");
  const state = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createCalibrationSelection(homeTeam),
    awaySelection: createCalibrationSelection(awayTeam),
    seed: BASE_SEED + index,
  });
  const result = simulateMatch(state, {
    kickoffTeamId: index % 2 === 0 ? homeTeam.id : awayTeam.id,
  });

  for (const event of result.events) {
    if (event.type !== "shot" || !event.playerId) continue;
    const team = event.teamId === homeTeam.id ? homeTeam : awayTeam;
    const player = team.squad.find((candidate) => candidate.id === event.playerId);
    if (!player) continue;
    const row = totals.get(player.primaryPosition);
    if (!row) continue;
    row.shots += 1;
    if (event.outcome !== "off-target") row.onTarget += 1;
    if (event.outcome === "goal") row.goals += 1;
  }
}

const totalShots = [...totals.values()].reduce((sum, row) => sum + row.shots, 0);
console.log(`Shots by primary position across ${MATCH_COUNT} synthetic matches`);
console.log(`Total shots: ${totalShots}`);
console.log("Position   Shots   Share   On target   Goals");
for (const position of positions) {
  const row = totals.get(position)!;
  const share = totalShots ? (row.shots / totalShots) * 100 : 0;
  console.log(
    `${position.padEnd(8)}${String(row.shots).padStart(7)}${`${share.toFixed(1)}%`.padStart(8)}${String(row.onTarget).padStart(12)}${String(row.goals).padStart(8)}`,
  );
}
