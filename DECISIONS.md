# Engineering Decisions

This document records the main technical decisions I made while building the Football Match Engine. I have included the reasoning behind each choice and how it fits into the overall project.

## D-001: TypeScript and Node.js

**Decision:** I chose TypeScript with Node.js as the foundation for the engine.

**Why:**

- TypeScript helps catch errors through static type checking.
- Node.js allows me to run matches without needing a browser.
- It makes it possible to run multiple headless simulations for testing and calibration.

## D-002: Native ES Modules

**Decision:** I used Node.js native ES modules with TypeScript's NodeNext module configuration.

**Why:**

- It follows the modern JavaScript module system.
- It produces output that works directly with Node.js.
- It avoids unnecessary module conversion or additional tooling.

## D-003: Strict Type Checking

**Decision:** I enabled TypeScript strict mode and `noUncheckedIndexedAccess`.

**Why:**

- I wanted the compiler to catch as many potential issues as possible.
- It forces me to handle values that might be missing.
- It makes the code easier to maintain as the engine grows.

## D-004: Separate Source and Build Output

**Decision:** I keep the original code in `src/` and generated JavaScript in `dist/`.

**Why:**

- It keeps development files separate from compiled output.
- It makes the project structure easier to navigate.
- It avoids mixing generated files with the source code.

## D-005: Incremental Development

**Decision:** I built the engine in smaller milestones instead of trying to implement every feature at once.

**Why:**

- I can test individual features before moving on.
- It makes bugs easier to isolate and fix.
- It helps me understand and review the impact of each change.

## D-006: Statistics Derived from Match Events

**Decision:** I decided to calculate public match and player statistics from the recorded event log.

**Why:**

- It gives me a consistent source for match statistics.
- I can trace reported figures back to the events that produced them.
- It reduces the risk of maintaining separate counters that become inconsistent.

There are limitations to this approach. Statistics can only cover events currently represented by the engine. For example, possession and player minutes are reconstructed from the available event information rather than measured using real tracking data.

## D-007: Deterministic Match Snapshots

**Decision:** I implemented versioned match snapshots that preserve the match state, including the random number generator state.

**Why:**

- I wanted to be able to save a match and continue it later.
- Preserving the RNG state helps ensure that a restored match continues deterministically.
- A versioned snapshot makes the saved format easier to identify and validate.

I also added validation when restoring snapshots so that malformed match data is not accepted simply because it is valid JSON.

Cross-version snapshot migration is not currently supported.

## D-008: Stoppage Time Based on Match Interruptions

**Decision:** I use deterministic time allowances for interruptions represented by match events, including goals, fouls, cards and active-play substitutions.

**Why:**

- These events interrupt normal play and should affect the match clock.
- Tracking them separately for each half keeps the timing predictable.
- It gives the simulation a basic stoppage-time mechanism without introducing additional randomness.

This is still a simplified model. It does not account for every possible reason a referee might add time under Law 7.

## D-009: Shared Defensive Pressure for Live and Headless Matches

**Decision:** I use the same defensive-pressure calculation in both live matches and headless simulations, based on the defending team's pressing setting.

**Why:**

- I wanted the visualizer and background simulations to follow the same match logic.
- Tactical settings should have consistent effects regardless of how a match is executed.
- It makes calibration results more representative of the actual simulation.

## D-010: Role-Based Formation Positioning

**Decision:** I use player roles to determine formation width and positioning instead of distributing players across the pitch based only on their array order.

**Why:**

- Array-based positioning could place a striker in a wide position.
- It could also place a winger too centrally.
- Using roles gives players more appropriate positions based on their responsibilities.

Fullbacks and wingers are assigned to wider lanes, while central players remain closer to the centre of the pitch.

This also gives the shooting and passing systems more useful positional information.

## D-011: Context-Aware Shooting and Passing Decisions

**Decision:** I kept the ball carrier as the player responsible for shooting, but improved the decision-making around shooting and passing opportunities.

**Why:**

- I wanted player roles and attributes to influence attacking behaviour.
- A striker should have more relevant shooting opportunities without forcing every attack to end with a striker taking the shot.
- Passing decisions should consider more than just selecting a random teammate.

The shooting model considers:

- Player position and attacking role.
- Distance from goal.
- Shooting angle.
- Nearby defensive pressure.
- Relevant player attributes.

Passing options are weighted using:

- Distance to the receiver.
- Forward progression.
- Passing and technical ability.
- Width and attacking role.

One limitation is that the engine does not have a completely independent off-ball attacking system. The ball carrier remains the shooter, so these decisions are still part of a simplified possession model.

## D-012: Spatially Informed Failed-Pass Interceptions

**Decision:** I select an interceptor from active, positioned outfield players by proximity to the failed pass destination. Positioning is a deterministic tie-breaker. The selected defender moves no more than 4.5 metres toward the destination, using the existing defensive movement helper.

**Why:** Selecting the globally highest-positioning player without considering location repeatedly assigned failed passes to the first centre-back in the calibration lineup. Proximity makes the turnover location and player more spatially relevant without adding random draws or changing pass success probability.

This remains an abstraction: it does not simulate a continuous ball trajectory or collision with a defender. The latest calibration shows that the change redistributes interceptions but does not improve scoring calibration; the goal and penalty rates remain known limitations.

## D-013: UI-Owned Session Seeds and Event-Derived Reports

**Decision:** The UI session factory owns fresh seed generation for browser matches. It creates a new match state and controller for each session. The engine continues to accept explicit seeds for deterministic replay and headless runs.

**Why:** This keeps seed ownership in one place while preserving deterministic engine behavior. Match statistics, timeline, player ratings and Man of the Match are derived from the active match state and its event log rather than maintained as separate simulation state.

The browser session uses the browser crypto API to obtain a seed. The report and ratings remain prototype analyses and are not validated against an external football rating standard.

---

## Closing note

These decisions reflect how I approached the project: keep the engine understandable, make the simulation reproducible, and build features that can be tested independently.

Some mechanics are intentionally simplified, and I expect to revisit them as the simulation becomes more detailed. I have prioritised having a working and testable foundation over trying to model every aspect of a real football match.
