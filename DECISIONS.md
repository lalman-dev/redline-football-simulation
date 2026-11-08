# Engineering Decisions

This document records the major technical decisions made while
building the Football Match Engine.

## D-001: TypeScript and Node.js

**Decision:** Use TypeScript with Node.js as the initial development
platform.

**Reason:**

- TypeScript provides static type checking.
- Node.js allows the engine to run without a browser.
- The engine can support headless simulations.

## D-002: Native ES Modules

**Decision:** Use Node.js native ES modules with TypeScript
NodeNext module configuration.

**Reason:**

- Aligns with modern JavaScript module standards.
- Supports a Node.js-compatible build.
- Avoids unnecessary module conversion.

## D-003: Strict Type Checking

**Decision:** Enable TypeScript strict mode and
noUncheckedIndexedAccess.

**Reason:**

- Helps detect potential programming errors.
- Requires explicit handling of potentially missing values.
- Makes the engine more predictable and maintainable.

## D-004: Separate Source and Build Output

**Decision:** Keep source code in src/ and compiled JavaScript
in dist/.

**Reason:**

- Keeps development files separate from generated output.
- Makes the project structure easier to understand.
- Prevents generated files from being committed.

## D-005: Incremental Development

**Decision:** Build the engine in small, independently
understandable milestones.

**Reason:**

- Each feature can be tested before moving forward.
- Changes remain easier to review and debug.
- Engineering decisions remain explainable.

## D-006: Event-derived public statistics

**Decision:** Derive team and player statistics from the recorded event log.

**Reason:** This keeps the API's figures auditable and prevents estimates from
being presented as measured possession or player minutes. Statistics only cover
events the engine currently models.

## D-007: Serializable deterministic snapshots

**Decision:** Snapshot the complete match state as JSON-compatible data,
including the RNG state, and version the snapshot envelope.

**Reason:** Consumers can save and continue a match without reproducing hidden
random-generator state. Restoring from untrusted input is outside the current
API contract beyond basic envelope validation.

## D-008: Stoppage allowance from modeled interruptions

**Decision:** Add deterministic allowances for goals, fouls/cards and
active-play substitutions, tracked separately per half.

**Reason:** These are explicit interruption sources represented by match
events. This is a limited allowance model, not a complete referee estimate of
all lost time under Law 7.

## D-009: Shared live and headless defensive pressure

**Decision:** Use one pressure probability based on the defending team's
pressing setting in both execution modes.

**Reason:** Headless calibration and live viewing should apply the same
managerial setting under the same match state.
