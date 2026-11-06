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
