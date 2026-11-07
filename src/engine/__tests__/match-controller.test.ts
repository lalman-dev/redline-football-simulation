import { describe, expect, it } from "vitest";
import {
  createCalibrationTeam,
  createCalibrationSelection,
} from "../../calibration/fixtures.js";
import { createMatchState } from "../match.js";
import {
  createMatchController,
  advanceMatch,
  pauseMatch,
  resumeMatch,
  changeTeamTactics,
  changeTeamFormation,
  makeSubstitution,
} from "../match-controller.js";

function createInitialState() {
  const homeTeam = createCalibrationTeam("home");
  const awayTeam = createCalibrationTeam("away");

  return createMatchState({
    homeTeam,
    awayTeam,
    homeSelection: createCalibrationSelection(homeTeam),
    awaySelection: createCalibrationSelection(awayTeam),
    seed: 12345,
  });
}

function createStartedController() {
  return createMatchController(createInitialState(), "home");
}

function createControllerWithSubstitutes() {
  const homeBase = createCalibrationTeam("home");
  const awayTeam = createCalibrationTeam("away");

  const substitute = {
    ...homeBase.squad[10]!,
    id: "home-substitute",
    name: "Home Substitute",
  };

  const homeTeam = {
    ...homeBase,
    squad: [...homeBase.squad, substitute],
  };

  const homeSelection = {
    ...createCalibrationSelection(homeTeam),
    startingXI: homeBase.squad.map((player) => player.id),
    substitutes: [substitute.id],
  };

  const initialState = createMatchState({
    homeTeam,
    awayTeam,
    homeSelection,
    awaySelection: createCalibrationSelection(awayTeam),
    seed: 12345,
  });

  return createMatchController(initialState, "home");
}

describe("Match controller", () => {
  describe("Match creation", () => {
    it("starts the match with the selected kickoff team", () => {
      const controller = createStartedController();

      expect(controller.match.possessionTeamId).toBe("home");
      expect(controller.match.events[0]?.type).toBe("kickoff");
      expect(controller.isPaused).toBe(false);
    });

    it("rejects an already-started match", () => {
      const controller = createStartedController();

      expect(() => createMatchController(controller.match, "home")).toThrow(
        "Controller requires an unstarted match.",
      );
    });
  });

  describe("Match advancement", () => {
    it("advances the match by one action", () => {
      const controller = createStartedController();
      const next = advanceMatch(controller);

      expect(next.match.elapsedSeconds).toBeGreaterThan(0);
      expect(next.match.events.length).toBeGreaterThan(
        controller.match.events.length,
      );
    });

    it("advances multiple actions", () => {
      const controller = createStartedController();
      const next = advanceMatch(controller, 5);

      expect(next.match.elapsedSeconds).toBeGreaterThan(
        controller.match.elapsedSeconds,
      );
    });

    it("rejects invalid action counts", () => {
      const controller = createStartedController();

      expect(() => advanceMatch(controller, 0)).toThrow(
        "Action count must be a positive integer.",
      );

      expect(() => advanceMatch(controller, -1)).toThrow(
        "Action count must be a positive integer.",
      );
    });

    it("rejects non-integer action counts", () => {
      const controller = createStartedController();

      expect(() => advanceMatch(controller, 1.5)).toThrow(
        "Action count must be a positive integer.",
      );
    });
  });

  describe("Pause and resume", () => {
    it("pauses the match", () => {
      const controller = createStartedController();
      const paused = pauseMatch(controller);

      expect(paused.isPaused).toBe(true);
    });

    it("resumes a paused match", () => {
      const controller = createStartedController();
      const paused = pauseMatch(controller);
      const resumed = resumeMatch(paused);

      expect(resumed.isPaused).toBe(false);
    });

    it("rejects advancement while paused", () => {
      const paused = pauseMatch(createStartedController());

      expect(() => advanceMatch(paused)).toThrow(
        "Cannot advance a paused match.",
      );
    });

    it("preserves match state when pausing and resuming", () => {
      const controller = createStartedController();
      const paused = pauseMatch(controller);
      const resumed = resumeMatch(paused);

      expect(resumed.match).toEqual(controller.match);
    });
  });

  describe("Tactical changes", () => {
    it("changes home team tactics", () => {
      const controller = createStartedController();

      const next = changeTeamTactics(controller, "home", {
        mentality: 80,
        pressing: 70,
        tempo: 65,
        width: 60,
        defensiveLine: 75,
      });

      expect(next.match.homeSelection.tactics.mentality).toBe(80);
      expect(next.match.awaySelection.tactics.mentality).toBe(50);
    });

    it("changes away team tactics", () => {
      const controller = createStartedController();

      const next = changeTeamTactics(controller, "away", {
        mentality: 30,
        pressing: 40,
        tempo: 45,
        width: 55,
        defensiveLine: 35,
      });

      expect(next.match.awaySelection.tactics.mentality).toBe(30);
      expect(next.match.homeSelection.tactics.mentality).toBe(50);
    });

    it("allows tactical changes while paused", () => {
      const paused = pauseMatch(createStartedController());

      const next = changeTeamTactics(paused, "home", {
        mentality: 80,
        pressing: 70,
        tempo: 65,
        width: 60,
        defensiveLine: 75,
      });

      expect(next.isPaused).toBe(true);
      expect(next.match.homeSelection.tactics.mentality).toBe(80);
    });

    it("rejects tactical values outside 1 to 100", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamTactics(controller, "home", {
          mentality: 101,
          pressing: 50,
          tempo: 50,
          width: 50,
          defensiveLine: 50,
        }),
      ).toThrow("Tactical values must be integers from 1 to 100.");
    });

    it("rejects non-integer tactical values", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamTactics(controller, "home", {
          mentality: 50.5,
          pressing: 50,
          tempo: 50,
          width: 50,
          defensiveLine: 50,
        }),
      ).toThrow("Tactical values must be integers from 1 to 100.");
    });

    it("rejects an unknown team for tactical changes", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamTactics(controller, "unknown", {
          mentality: 50,
          pressing: 50,
          tempo: 50,
          width: 50,
          defensiveLine: 50,
        }),
      ).toThrow("Team must belong to this match.");
    });
  });

  describe("Formation changes", () => {
    it("changes the home team's formation", () => {
      const controller = createStartedController();

      const next = changeTeamFormation(controller, "home", {
        defenders: 3,
        midfielders: 4,
        forwards: 3,
      });

      expect(next.match.homeSelection.formation).toEqual({
        defenders: 3,
        midfielders: 4,
        forwards: 3,
      });

      expect(next.match.awaySelection.formation).toEqual({
        defenders: 4,
        midfielders: 3,
        forwards: 3,
      });
    });

    it("changes the away team's formation", () => {
      const controller = createStartedController();

      const next = changeTeamFormation(controller, "away", {
        defenders: 5,
        midfielders: 3,
        forwards: 2,
      });

      expect(next.match.awaySelection.formation).toEqual({
        defenders: 5,
        midfielders: 3,
        forwards: 2,
      });
    });

    it("rejects a formation that does not contain ten outfield players", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamFormation(controller, "home", {
          defenders: 4,
          midfielders: 4,
          forwards: 3,
        }),
      ).toThrow("Formation must contain exactly ten outfield players.");
    });

    it("rejects a formation with zero defenders", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamFormation(controller, "home", {
          defenders: 0,
          midfielders: 5,
          forwards: 5,
        }),
      ).toThrow("Formation must contain exactly ten outfield players.");
    });

    it("rejects a formation with a negative position count", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamFormation(controller, "home", {
          defenders: 4,
          midfielders: -1,
          forwards: 7,
        }),
      ).toThrow("Formation must contain exactly ten outfield players.");
    });

    it("rejects an unknown team for formation changes", () => {
      const controller = createStartedController();

      expect(() =>
        changeTeamFormation(controller, "unknown", {
          defenders: 4,
          midfielders: 3,
          forwards: 3,
        }),
      ).toThrow("Team must belong to this match.");
    });
  });

  describe("Substitutions", () => {
    it("makes a substitution through the manager controller", () => {
      const controller = createControllerWithSubstitutes();

      const next = makeSubstitution(
        controller,
        "home",
        "home-player-11",
        "home-substitute",
        "manager-window-1",
      );

      expect(next.match.homeSelection.startingXI).toContain("home-substitute");

      expect(next.match.homeSelection.startingXI).not.toContain(
        "home-player-11",
      );

      expect(next.match.substitutionsUsed.home).toBe(1);
      expect(next.match.events.at(-1)?.type).toBe("substitution");
    });

    it("allows a substitution while the controller is paused", () => {
      const paused = pauseMatch(createControllerWithSubstitutes());

      const next = makeSubstitution(
        paused,
        "home",
        "home-player-11",
        "home-substitute",
        "manager-window-1",
      );

      expect(next.isPaused).toBe(true);
      expect(next.match.homeSelection.startingXI).toContain("home-substitute");
    });

    it("rejects a substitution for a player who is not in the starting XI", () => {
      const controller = createControllerWithSubstitutes();

      expect(() =>
        makeSubstitution(
          controller,
          "home",
          "unknown-player",
          "home-substitute",
          "manager-window-1",
        ),
      ).toThrow();
    });

    it("rejects a substitution for an unknown team", () => {
      const controller = createControllerWithSubstitutes();

      expect(() =>
        makeSubstitution(
          controller,
          "unknown",
          "home-player-11",
          "home-substitute",
          "manager-window-1",
        ),
      ).toThrow("Team must belong to this match.");
    });
  });
});
