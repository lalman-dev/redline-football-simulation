import { describe, expect, it } from "vitest";
import {
  createCalibrationTeam,
  createCalibrationSelection,
} from "../../calibration/fixtures.js";
import {
  createMatchPlayerPositions,
  createTeamPlayerPositions,
} from "../spatial.js";
import { PITCH_LENGTH, PITCH_WIDTH } from "../pitch.js";

describe("player spatial positions", () => {
  const home = createCalibrationTeam("home");
  const away = createCalibrationTeam("away");
  const homeSelection = createCalibrationSelection(home);
  const awaySelection = createCalibrationSelection(away);

  it("assigns valid positions to all 22 starting players", () => {
    const positions = createMatchPlayerPositions(
      home,
      away,
      homeSelection,
      awaySelection,
    );

    expect(Object.keys(positions)).toHaveLength(22);

    for (const position of Object.values(positions)) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(PITCH_LENGTH);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(PITCH_WIDTH);
    }
  });

  it("places teams facing opposite directions in the first half", () => {
    const positions = createMatchPlayerPositions(
      home,
      away,
      homeSelection,
      awaySelection,
    );

    const homeKeeper = home.squad.find((p) => p.primaryPosition === "GK")!;
    const awayKeeper = away.squad.find((p) => p.primaryPosition === "GK")!;

    expect(positions[homeKeeper.id]!.x).toBeLessThan(PITCH_LENGTH / 2);
    expect(positions[awayKeeper.id]!.x).toBeGreaterThan(PITCH_LENGTH / 2);
  });

  it("reverses the teams' ends in the second half", () => {
    const positions = createMatchPlayerPositions(
      home,
      away,
      homeSelection,
      awaySelection,
      true,
    );

    const homeKeeper = home.squad.find((p) => p.primaryPosition === "GK")!;
    const awayKeeper = away.squad.find((p) => p.primaryPosition === "GK")!;

    expect(positions[homeKeeper.id]!.x).toBeGreaterThan(PITCH_LENGTH / 2);
    expect(positions[awayKeeper.id]!.x).toBeLessThan(PITCH_LENGTH / 2);
  });

  it("uses the selected formation to distribute players across lines", () => {
    const original = createTeamPlayerPositions(home, homeSelection, true);

    const changedSelection = {
      ...homeSelection,
      formation: { defenders: 3, midfielders: 4, forwards: 3 },
    };

    const changed = createTeamPlayerPositions(home, changedSelection, true);

    const originalXPositions = new Set(
      Object.values(original).map((position) => position.x),
    );
    const changedXPositions = new Set(
      Object.values(changed).map((position) => position.x),
    );

    expect([...changedXPositions]).not.toEqual([...originalXPositions]);
  });

  it("rejects a formation that does not contain ten outfield players", () => {
    expect(() =>
      createTeamPlayerPositions(
        home,
        {
          ...homeSelection,
          formation: { defenders: 4, midfielders: 4, forwards: 3 },
        },
        true,
      ),
    ).toThrow("Formation must contain exactly ten outfield players.");
  });
});
