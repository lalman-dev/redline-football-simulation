# REDLINE FOOTBALL ENGINE

A TypeScript football match engine with a seeded simulation, a React/Vite match visualizer, manager controls, and a calibration harness. The engine is intentionally a simulation prototype; it is not a complete implementation of the IFAB Laws of the Game.

## Requirements and commands

- Node.js 22 or later
- npm

```bash
npm ci
npm run dev                 # start the visualizer
npm test                    # run the test suite
npm run build               # compile the engine and production visualizer
npm run calibrate           # simulate 1,000 calibration matches
npm run validate:strength   # compare individual attribute boosts
npm run validate:tactics    # compare four tactical styles head-to-head
```

## Engine API

The TypeScript public entry point is `src/index.ts`; `npm run build:engine` emits Node.js ES modules under `dist/`.

```ts
import {
  createMatchState,
  simulateMatch,
  getMatchStatistics,
  snapshotMatch,
  restoreMatch,
} from "./dist/index.js";

const initial = createMatchState({
  homeTeam, awayTeam, homeSelection, awaySelection, seed: 12345,
});
const result = simulateMatch(initial, { kickoffTeamId: homeTeam.id });
const stats = getMatchStatistics(result);

const saved = snapshotMatch(result);
const restored = restoreMatch(JSON.parse(JSON.stringify(saved)));
```

The controller API (`createMatchController`, `advanceMatch`, `pauseMatch`, `resumeMatch`, `changeTeamTactics`, `changeTeamFormation`, and `makeSubstitution`) supports live matches. `simulateMatch` runs headlessly. Match snapshots include the event log, match state, and RNG state for deterministic continuation. Statistics are derived from recorded events; no possession or playing-time estimates are fabricated.

## Architecture

- `src/engine/match.ts`: match setup, actions, scoring, substitutions and state transitions.
- `src/engine/simulation.ts`: action selection, receiver selection and defensive pressure.
- `src/engine/match-runner.ts`: headless match loop.
- `src/engine/match-controller.ts`: live manager controls.
- `src/engine/spatial.ts` and `tactical-movement.ts`: pitch positions and movement.
- `src/calibration/`: seeded fixtures, aggregate metrics and attribute experiments.
- `src/ui/`: React visualizer, which renders engine state and dispatches controller actions.

## Implemented behavior

- Validated starting lineups, formations and tactical ranges.
- Seeded random actions and reproducible match runs.
- First-half, second-half and full-time transitions with deterministic time allowance for goals, fouls/cards and active-play substitutions.
- Passes, carries, tackles, shots, saves, goals and substitutions.
- CM-first kickoff choice (then DM, AM and another outfield player); kickoff taker, ball carrier and centre position are aligned.
- Player attributes affect relevant actions. Stamina reduces performance over match time; strength affects tackle duels; dribbling affects carrying and defensive challenges.
- Tactics affect action selection, movement and defensive pressure. Live and headless modes use the same pressure probability.
- Fouls during tackle attempts award a free kick; yellow cards, direct red cards and second-yellow dismissals are recorded. Sent-off players leave the active XI, and play ends if a dismissal leaves fewer than seven players.
- Event-derived team and player statistics, plus serializable match snapshot and restore.

## Simplified rules and limitations

- Added time currently uses fixed increments for goals, fouls, disciplinary sanctions and active-play substitutions. It does not model every cause or a referee-announced minimum.
- Fouls are only considered during tackle attempts, and card severity is probabilistic. The model does not yet implement advantage, DOGSO assessment, offside, penalties, corners, throw-ins, goal kicks, injuries or suspension carry-over.
- Fatigue is a performance adjustment based on match time and stamina, not a per-player workload record; player minutes and season carry-over are not available.
- The event simulation abstracts continuous play. Passing and movement are simplified; it does not implement a full spatial ball-flight, offside-line or advantage model.
- Calibration uses synthetic teams. It does not compare against a sourced real-world match dataset, and current reports are not evidence of full statistical realism.
- Formation and tactics affect the simulation. A small tactic-versus-tactic experiment is available, but its results are not strong evidence that no tactic is dominant.
- Snapshot restore validates the basic envelope and assumes snapshots are trusted data from this engine version.

The engine should therefore be treated as an extensible prototype, not an IFAB-compliant referee or a production season simulator.
