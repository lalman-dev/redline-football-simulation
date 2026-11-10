# REDLINE FOOTBALL ENGINE

REDLINE FOOTBALL ENGINE is a football match simulation project I built using TypeScript, React and Vite.

The idea is to simulate a football match from kickoff to full-time, with player attributes, team formations, tactics, match events and manager decisions affecting how the game develops. I also built a match visualizer so I can follow the simulation and interact with it through manager controls.

The engine uses seeded randomness, which means the same initial conditions and seed can reproduce the same match. It is still a simulation prototype, not a complete implementation of the IFAB Laws of the Game.

## Requirements

- Node.js 22 or later
- npm

## Getting started

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

## Available commands

| Command                     | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `npm test`                  | Run the test suite                                 |
| `npm run build`             | Build the engine and production visualizer         |
| `npm run calibrate`         | Run 1,000 calibration matches                      |
| `npm run validate:strength` | Compare the effect of individual player attributes |
| `npm run validate:tactics`  | Compare four tactical styles                       |
| `npm run validate:shooting` | Check shot distribution across player positions    |
| `npm run validate`          | Run the strength, tactics and shooting experiments |

## Engine API

The public TypeScript entry point is `src/index.ts`. Running `npm run build:engine` compiles the engine into Node.js ES modules under `dist/`.

A basic example:

```ts
import {
  createMatchState,
  simulateMatch,
  getMatchStatistics,
  snapshotMatch,
  restoreMatch,
} from "./dist/index.js";

const initial = createMatchState({
  homeTeam,
  awayTeam,
  homeSelection,
  awaySelection,
  seed: 12345,
});

const result = simulateMatch(initial, {
  kickoffTeamId: homeTeam.id,
});

const stats = getMatchStatistics(result);

// Save and restore a match
const saved = snapshotMatch(result);
const restored = restoreMatch(JSON.parse(JSON.stringify(saved)));
```

### Match controller

I also implemented a controller API for managing a match while it is running.

It supports:

- Advancing the match by actions.
- Advancing to a requested minute with `advanceToMinute`.
- Advancing by a specified number of minutes with `advanceByMinutes`.
- Advancing to the next event with `advanceUntilNextEvent`.
- Advancing until a particular event type with `advanceUntilEventType`.
- Pausing and resuming.
- Changing tactics and formations.
- Making substitutions.

Minute advancement is action-based, so the final action can cross the requested time by a few seconds. This keeps actions atomic and avoids skipping events. Event-type advancement has a configurable action limit and throws an error if the requested event is not reached.

The live controller and `simulateMatch` use the same action executor and seeded RNG. This helps keep the live and headless simulation paths consistent.

The controller also exposes:

- `getCurrentMatchState`
- `getMatchEventLog`
- `getCurrentMatchStatistics`

## Match statistics and reports

I built the statistics system around the match event log rather than maintaining a separate set of counters for every action.

It currently calculates:

- Goals and score.
- Shots and shots on target.
- Saves.
- Passes and pass accuracy.
- Tackles and successful tackles.
- Fouls and disciplinary events.
- Substitutions.
- Player minutes.
- Assists.
- Possession percentages.

The full-time UI report also derives player ratings and Man of the Match from the recorded match events. These are prototype summaries, not an independently validated professional rating model. The timeline, statistics and report are rebuilt from the current match state.

Possession is reconstructed from the time between consecutive events and the inferred possessor after each event. The two teams' percentages add up to 100%, but this is an approximation based on the simulation's event model, not tracking-data-based possession.

Player minutes are calculated from event timestamps and adjusted for substitutions and dismissals. They are rounded to one decimal place.

For assists, I credit the last successful pass from the scoring team before the shot, provided the event sequence supports it. Direct shots and unsupported sequences are not credited.

At full-time, the engine also generates a match explanation using recorded information such as the score, shots, conversion, possession, saves, passing, tackles, cards, substitutions and tactical changes. It does not attempt to invent information that was not recorded during the match.

## Calibration and validation

I added a calibration harness to run multiple seeded matches and examine the overall behaviour of the simulation.

The calibration reports:

- Match outcomes.
- Average goals and shots.
- Shot conversion.
- Penalty and open-play scoring separately.
- Shot outcomes by player position.
- Shot outcomes by distance.
- Goalkeeper saves and goals conceded.
- Passing and tackling activity.
- Fouls and cards.

Penalty attempts are included in the shot count, so they are not excluded when calculating overall conversion.

I also added separate experiments to compare player attributes, tactical styles and shooting distribution.

These tests help identify changes in simulation behaviour and possible regressions. The teams and results are synthetic, so I do not treat the calibration output as proof that the engine matches real-world football statistics.

**Current limitation:** The latest 1,000-match calibration averages **5.49 goals and 4.135 penalties per match**. It records 3,187 penalty goals, 2,300 open-play goals and 7.6% open-play shot conversion. The broad prototype target of about 2.2–3.2 goals per match is not met. The spatial interception change reduced the previous centre-back interception concentration, but increased shots and goals in this calibration. No probability changes were made as part of finalisation. These figures are regression measurements from synthetic fixtures, not a real-world benchmark.

## Match lifecycle and session seeds

The UI session factory creates fresh teams, match state and controller for the initial match and each New Match action. It obtains one 32-bit seed from the browser crypto API and passes that seed into `createMatchState`. The engine itself remains deterministic: the same inputs and explicit seed reproduce the same match, and the RNG state is included in snapshots for continuation. Headless callers provide their own seed.

The controller starts the match and exposes pause/resume, advancement, substitutions and tactical changes. The UI advances the controller while playback is active. At full-time, statistics, the event timeline, player ratings and Man of the Match are derived from that match's recorded state and events.

## Demo checklist

Start the development server with `npm run dev`, then use this manual browser walkthrough:

1. Start the initial match and use New Match to create another session.
2. Start/resume playback, pause it, resume it, and advance by a minute or to the next event.
3. Change the home team's tactics or formation while paused.
4. Make a valid substitution and confirm it appears in the timeline.
5. Let the match reach full-time and inspect the score, statistics, timeline, player ratings and Man of the Match.
6. Start another match and confirm the score/events reset and the match progresses as a fresh session.

Automated tests cover the engine, controller, session factory and report derivation. They do not replace checking this browser flow and responsive layout manually.

## Project structure

```text
src/
├── engine/
│   ├── match.ts
│   ├── simulation.ts
│   ├── match-runner.ts
│   ├── match-controller.ts
│   ├── match-types.ts
│   ├── statistics.ts
│   ├── spatial.ts
│   └── tactical-movement.ts
│
├── calibration/
│   └── ...
│
├── ui/
│   └── ...
│
└── index.ts

README.md
DECISIONS.md
ASSIGNMENT_AUDIT.md
```

The main responsibilities are:

| File or folder         | Responsibility                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| `match.ts`             | Match setup, actions, scoring, substitutions and state transitions |
| `simulation.ts`        | Action selection, receiver selection and defensive pressure        |
| `match-runner.ts`      | Runs matches without the visualizer                                |
| `match-controller.ts`  | Live match controls and manager actions                            |
| `spatial.ts`           | Pitch positions and spatial calculations                           |
| `tactical-movement.ts` | Player movement based on formation and tactics                     |
| `calibration/`         | Test fixtures, match calibration and attribute experiments         |
| `ui/`                  | React match visualizer and manager controls                        |
| `index.ts`             | Public engine exports                                              |

## Implemented features

The current implementation includes:

- Starting lineup, formation and tactical validation.
- Seeded random match simulation.
- First-half, second-half and full-time transitions.
- Added time based on recorded match events.
- Passing, carrying, tackling and shooting.
- Saves, goals, penalties and substitutions.
- Kickoff selection and restart handling.
- Player attributes affecting match actions.
- Stamina-based performance adjustments over match time.
- Strength affecting tackle duels.
- Dribbling affecting carrying and defensive challenges.
- Tactical effects on action selection, player movement and defensive pressure.
- Fouls, yellow cards, direct red cards and second-yellow dismissals.
- Removal of sent-off players from the active lineup.
- Match termination if a team has fewer than seven players.
- Event-based match statistics and final explanations.
- Match snapshots and state restoration.
- Live manager controls and headless match simulation.

The shooting model considers player role, shooting ability, finishing, distance, angle and nearby defensive pressure. The engine also uses player roles when selecting shooting opportunities and passing options.

## Current limitations

There are still several areas I want to improve.

### Match rules

Added time currently uses fixed increments for goals, fouls, disciplinary sanctions and active-play substitutions. It does not model every reason a referee might add time.

Fouls are currently considered during tackle attempts. Card severity is probabilistic, and advantage and DOGSO assessment are not implemented.

Offside, corners, throw-ins, injuries and suspension carryover are also not implemented.

### Player fatigue

Stamina affects performance over match time, but the engine does not yet maintain a detailed per-player workload and energy record. Player minutes are available in match statistics, but there is no complete season-level fatigue or player-availability system.

### Spatial simulation

Passing and movement are simplified. The engine does not simulate continuous ball flight, a complete offside line or every detail of player positioning.

Possession is reconstructed from events, and the shot-to-defence transition follows the engine's simplified model.

### Tactical balance

Formations and tactics influence match behaviour, and I have added experiments to compare different tactical styles. However, the current synthetic tests are not enough to establish that the tactical system is fully balanced or that one approach is never dominant.

### Save and restore

Match snapshots preserve continuation state and seeded randomness. Restore validation checks the snapshot version and important match-state structures, including teams, selections, event ordering, clock values, score, positions, substitutions and RNG state.

There is currently no migration system for snapshots created by older engine versions.

## Final note

This is an ongoing project. My focus has been on building a working match engine, keeping the simulation deterministic, making player attributes and tactical decisions matter, and providing enough tests and calibration tools to understand how changes affect match outcomes.

There is still work to do on spatial accuracy, penalty frequency, match realism and the implementation of additional football rules.

I have documented the current implementation and outstanding requirements in `ASSIGNMENT_AUDIT.md`, with technical decisions recorded in `DECISIONS.md`.
