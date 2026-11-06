# Interview project: build a football (soccer) match engine for a management game

Version 1.0 · November 2026

Thank you for taking the time. This document describes the take-home project, what we will look at and how we will score it. Please read all of it before you start.

**The short version.** You build your own football match engine. It simulates a full 11vs11 90-minute plus injury time match between two teams/squads and returns a result, a detailed event log and statistics. You also give it an API that a management game could use, a visualizer, and evidence that its numbers look like real football. We judge it on the five things that matter most for a management game:

1. **Does it follow the rules of football (IFAB Laws of the Game 2026/27)?**
2. **Do its statistics match real football?** (distributions, not just averages)
3. **Can it actually be plugged into a game?** (an API that is complete enough to build a game on)
4. **Does it look like football visually?**
5. **Do a manager's decisions, player attributes, and tactics matter?** (squad, formation, tactics, substitutions, fatigue, injuries, no dead options, no dominant tactic)

## The game and what we look for

Imagine a football management game (e.g. Football Manager 27). The match engine decides what happens in a match. Players never control individual footballers: they choose squads, formations and tactics, then watch or skip the match and live with the result. Over a long career a player sees thousands of matches, so small biases, rare crashes and options that do nothing are all very visible.

What we want to see in you:

- How you turn an open-ended modelling problem into a first version that works.
- How you use data to check a model instead of trusting intuition.
- How you design an interface that somebody else will build on.
- Taste and Judgment: whether the result plays and looks like football.

## What a management game needs from the engine

**Before the match**

- Take two teams/squads (each player with attributes), a formation, tactics and a random seed, and refuse illegal lineups.

**During the match**

- Run to a given minute or the next key event, pause and resume.
- Let the manager substitute and change tactics or formation while the match runs.
- Play at any speed: watch live, fast-forward or skip to the result.

**After the match**

- Return the result, a full event log, team and player statistics.
- Hand back what the game needs to carry on: fatigue and minutes played, injuries, cards and suspensions.
- Make results explainable: a manager should be able to see why they won or lost.

**Across a season**

- Simulate thousands of other matches in the background (headless), quickly.
- Replay any match exactly from its inputs and seed; saving and loading a game must not change results.
- Cope with many leagues and thousands of clubs, with squads that keep changing.
- Never crash or hang on matchday.

## Ground rules

- **Time:** about 10 hours within 3 days.
- **Scope:** we know this project cannot be fully completed in the time you have. The priorities you set and the abstractions you choose are exactly what we are trying to assess. Try to get a working first version that you can improve, rather than a half-finished ambitious design.
- **Focus:** spend your time building and tuning the engine. We do not need reports, lists or write-ups, only a short README that tells us how to build, run and use it.
- **Tools:** any language; it must run on Windows, Linux, Mac OS with a simple build process. AI assistants and all other tools are allowed, but work on your own without sharing code with anyone else.
- **Open source projects:** you may build on existing open-source football match engines, libraries and code. The licences must allow redistribution. We judge the final result and your own contribution, so be ready to explain the reused parts too.
- **Laws of the game:** the official [IFAB Laws of the Game 2026/27](https://www.theifab.com/laws-of-the-game-documents/?language=all&year=2026%2F27) are the reference for the rules.

## Deliverables

1. **Engine** that simulates a match between two squads.
2. **Library API** for a management game.
3. **Visualizer** that shows a match. Realistic visualization matters.
4. **A short README:** how to build, run and use the engine and its API.

We will get back to you once we have reviewed your submission.


---

## Development Setup

### Requirements

- Node.js 22 or later
- npm

### Installation

Clone the repository and install dependencies:

```bash
npm ci
```

### Build

Compile the TypeScript source:

```bash
npm run build
```

The generated JavaScript files are placed in `dist/`.

### Project Structure

```text
src/       TypeScript source code
dist/      Generated JavaScript (not committed)
```

The match engine implementation and additional usage instructions
will be documented as development progresses.
