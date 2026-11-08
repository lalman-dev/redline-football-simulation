import { describe, expect, it } from "vitest";
import { createCalibrationSelection, createCalibrationTeam } from "../../calibration/fixtures.js";
import { createMatchState } from "../match.js";
import { simulateMatch } from "../match-runner.js";

describe("shot distribution by position", () => {
  it("gives strikers a meaningful share without excluding midfielders", () => {
    const homeTeam = createCalibrationTeam("home");
    const awayTeam = createCalibrationTeam("away");
    const homeSelection = createCalibrationSelection(homeTeam);
    const awaySelection = createCalibrationSelection(awayTeam);
    let totalShots = 0;
    let strikerShots = 0;
    let midfielderShots = 0;

    for (let index = 0; index < 60; index += 1) {
      const result = simulateMatch(
        createMatchState({
          homeTeam,
          awayTeam,
          homeSelection,
          awaySelection,
          seed: 145_000 + index,
        }),
        { kickoffTeamId: index % 2 === 0 ? homeTeam.id : awayTeam.id },
      );

      for (const event of result.events) {
        if (event.type !== "shot" || !event.playerId) continue;
        totalShots += 1;
        const team = event.teamId === homeTeam.id ? homeTeam : awayTeam;
        const player = team.squad.find((candidate) => candidate.id === event.playerId);
        if (player?.primaryPosition === "ST") strikerShots += 1;
        if (player?.primaryPosition === "CM") midfielderShots += 1;
      }
    }

    expect(totalShots).toBeGreaterThan(0);
    expect(strikerShots / totalShots).toBeGreaterThan(0.25);
    expect(strikerShots).toBeGreaterThan(midfielderShots);
    expect(midfielderShots).toBeGreaterThan(0);
  }, 10_000);
});
