import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

import {
  createCalibrationSelection,
  createCalibrationTeam,
} from "../calibration/fixtures.js";

import { createMatchState } from "../engine/match.js";

import {
  advanceMatch,
  createMatchController,
  pauseMatch,
  resumeMatch,
  startControllerSecondHalf,
  changeTeamTactics,
  changeTeamFormation,
  makeSubstitution,
} from "../engine/match-controller.js";

import type { MatchController } from "../engine/match-controller.js";

import type { MatchEvent } from "../engine/match-types.js";

import type { Formation, Player, Tactics } from "../engine/types.js";

function createInitialController(): MatchController {
  const homeTeam = createCalibrationTeam("home");

  const awayTeam = createCalibrationTeam("away");

  const initialState = createMatchState({
    homeTeam,

    awayTeam,

    homeSelection: createCalibrationSelection(homeTeam),

    awaySelection: createCalibrationSelection(awayTeam),

    seed: 20261107,
  });

  // A new match waits for the manager to press Play.
  return pauseMatch(createMatchController(initialState, homeTeam.id));
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getPhaseLabel(phase: MatchController["match"]["phase"]): string {
  return {
    "first-half": "FIRST HALF",

    "half-time": "HALF TIME",

    "second-half": "SECOND HALF",

    "full-time": "FULL TIME",
  }[phase];
}

function getPlayer(
  players: readonly Player[],

  playerId: string | undefined,
): Player | undefined {
  return players.find((player) => player.id === playerId);
}

function TopBar() {
  return (
    <header className="flex min-h-[76px] items-center justify-between border-b border-white/[0.07]">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#b5f36a] text-xl font-extrabold text-[#152010]">
          T
        </div>

        <div>
          <h1 className="text-sm font-extrabold tracking-[0.2em] text-white">
            TOUCHLINE
          </h1>

          <p className="mt-1 text-[9px] tracking-[0.16em] text-[#89938a]">
            FOOTBALL MANAGEMENT ENGINE
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-[#aab5a7]">
          <span className="size-2 rounded-full bg-[#b5f36a] shadow-[0_0_12px_#b5f36a80]" />
          SIMULATION ENGINE
        </div>

        <span className="hidden font-mono text-[10px] text-[#89938a] sm:block">
          ENGINE V0.1
        </span>
      </div>
    </header>
  );
}

function SectionHeading({
  eyebrow,

  title,

  trailing,
}: {
  eyebrow: string;

  title: string;

  trailing?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div>
        <p className="font-mono text-[9px] tracking-[0.16em] text-[#b5f36a]">
          {eyebrow}
        </p>

        <h2 className="mt-1 text-base font-bold text-white">{title}</h2>
      </div>

      {trailing}
    </div>
  );
}

function Scoreboard({ controller }: { controller: MatchController }) {
  const { match } = controller;

  return (
    <section className="grid grid-cols-[1fr_auto_1fr] items-center rounded-xl border border-white/[0.07] bg-[#191f19] px-4 py-6 sm:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#b5f36a] text-sm font-extrabold text-[#152010] sm:size-12">
          H
        </div>

        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-widest text-[#89938a]">
            HOME
          </p>

          <h2 className="mt-1 truncate text-xs font-bold text-white sm:text-base">
            {match.homeTeam.name}
          </h2>
        </div>
      </div>

      <div className="px-3 text-center sm:px-8">
        <div className="flex items-center justify-center gap-3 font-mono text-3xl font-bold tabular-nums text-white sm:text-5xl">
          <span>{match.score.home}</span>

          <span className="text-[#596356]">:</span>

          <span>{match.score.away}</span>
        </div>

        <p className="mt-2 font-mono text-[9px] tracking-[0.16em] text-[#b5f36a]">
          {getPhaseLabel(match.phase)}
        </p>

        <p className="mt-1 font-mono text-xs text-[#d2dbce]">
          {formatClock(match.elapsedSeconds)}
        </p>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
        <div className="min-w-0 text-right">
          <p className="font-mono text-[9px] tracking-widest text-[#89938a]">
            AWAY
          </p>

          <h2 className="mt-1 truncate text-xs font-bold text-white sm:text-base">
            {match.awayTeam.name}
          </h2>
        </div>

        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5eaf2] text-sm font-extrabold text-[#202a3a] sm:size-12">
          A
        </div>
      </div>
    </section>
  );
}

function FootballPitch({ controller }: { controller: MatchController }) {
  const { match } = controller;

  const homePlayers = match.homeSelection.startingXI
    .map((id) => getPlayer(match.homeTeam.squad, id))
    .filter((player): player is Player => player !== undefined);

  const awayPlayers = match.awaySelection.startingXI
    .map((id) => getPlayer(match.awayTeam.squad, id))
    .filter((player): player is Player => player !== undefined);

  const toPitchX = (x: number) => 12 + (x / 105) * 676;
  const toPitchY = (y: number) => 12 + (y / 68) * 416;

  const ballX = toPitchX(match.ballPosition.x);
  const ballY = toPitchY(match.ballPosition.y);

  const renderPlayer = (
    player: Player,
    index: number,
    team: "home" | "away",
  ) => {
    const position = match.playerPositions[player.id];

    if (!position) return null;

    const x = toPitchX(position.x);
    const y = toPitchY(position.y);
    const isHome = team === "home";
    const isCarrier = match.ballCarrierId === player.id;

    return (
      <motion.g
        key={player.id}
        initial={false}
        animate={{ x, y }}
        transition={{
          x: {
            type: "tween",
            duration: 0.9,
            ease: "linear",
          },
          y: {
            type: "tween",
            duration: 0.9,
            ease: "linear",
          },
        }}
      >
        <title>
          {player.name} — {player.primaryPosition}
          {isCarrier ? " — In possession" : ""}
        </title>

        {isCarrier && (
          <motion.circle
            r="19"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.9"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{
              x: {
                type: "tween",
                duration: 0.35,
                ease: "linear",
              },
              y: {
                type: "tween",
                duration: 0.35,
                ease: "linear",
              },
            }}
          />
        )}

        <circle
          r="13"
          fill={isHome ? "#b5f36a" : "#e8edf5"}
          stroke={isHome ? "#efffdc" : "#ffffff"}
          strokeWidth="1.5"
        />

        <text
          y="4"
          textAnchor="middle"
          fill={isHome ? "#152014" : "#202a3a"}
          fontSize="10"
          fontWeight="800"
        >
          {index + 1}
        </text>

        <text
          y="27"
          textAnchor="middle"
          fill="white"
          stroke="#173b26"
          strokeWidth="3"
          paintOrder="stroke"
          fontSize="9"
          fontWeight="600"
        >
          {player.primaryPosition}
        </text>
      </motion.g>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#205f39]">
      <svg
        viewBox="0 0 700 440"
        className="block h-auto w-full"
        role="img"
        aria-label="Live football pitch showing actual engine player positions and ball position"
      >
        <defs>
          <pattern
            id="pitch-grass"
            width="100"
            height="440"
            patternUnits="userSpaceOnUse"
          >
            <rect width="50" height="440" fill="#1d663c" />
            <rect x="50" width="50" height="440" fill="#205f39" />
          </pattern>
        </defs>

        <rect width="700" height="440" fill="url(#pitch-grass)" />

        <g
          fill="none"
          stroke="#ffffffa8"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        >
          <rect x="12" y="12" width="676" height="416" />
          <line x1="350" y1="12" x2="350" y2="428" />
          <circle cx="350" cy="220" r="68" />
          <circle cx="350" cy="220" r="3" fill="white" />

          <rect x="12" y="105" width="105" height="230" />
          <rect x="12" y="160" width="42" height="120" />
          <circle cx="88" cy="220" r="3" fill="white" />

          <rect x="583" y="105" width="105" height="230" />
          <rect x="646" y="160" width="42" height="120" />
          <circle cx="612" cy="220" r="3" fill="white" />

          <path d="M117 165 A65 65 0 0 1 117 275" />
          <path d="M583 165 A65 65 0 0 0 583 275" />
        </g>

        {homePlayers.map((player, index) =>
          renderPlayer(player, index, "home"),
        )}

        {awayPlayers.map((player, index) =>
          renderPlayer(player, index, "away"),
        )}

        <motion.g
          initial={false}
          animate={{ x: ballX, y: ballY }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 24,
            mass: 0.5,
          }}
        >
          <circle r="11" fill="white" opacity="0.2" />
          <circle r="5" fill="white" stroke="#1c251b" strokeWidth="1.5" />
        </motion.g>
      </svg>
    </div>
  );
}

interface MatchControlsProps {
  controller: MatchController;

  playbackSpeed: number;

  onPauseResume: () => void;

  onSecondHalf: () => void;

  onPlaybackSpeedChange: (speed: number) => void;
}

function MatchControls({
  controller,

  playbackSpeed,

  onPauseResume,

  onSecondHalf,

  onPlaybackSpeedChange,
}: MatchControlsProps) {
  const isHalfTime = controller.match.phase === "half-time";

  const isFullTime = controller.match.phase === "full-time";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={onPauseResume}
        disabled={isFullTime}
        className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {controller.isPaused ? "▶ Play" : "Ⅱ Pause"}
      </button>

      {isHalfTime && (
        <button
          onClick={onSecondHalf}
          className="rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-black transition hover:bg-amber-300"
        >
          Start Second Half
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">
          Speed
        </span>

        {[1, 2, 4, 8].map((speed) => (
          <button
            key={speed}
            onClick={() => onPlaybackSpeedChange(speed)}
            aria-pressed={playbackSpeed === speed}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              playbackSpeed === speed
                ? "bg-white text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {speed}×
          </button>
        ))}
      </div>

      {isFullTime && (
        <span className="text-sm font-semibold text-emerald-400">
          Match Finished
        </span>
      )}
    </div>
  );
}

const FORMATION_PRESETS: ReadonlyArray<{
  label: string;
  value: Formation;
}> = [
  { label: "4-3-3", value: { defenders: 4, midfielders: 3, forwards: 3 } },
  { label: "4-4-2", value: { defenders: 4, midfielders: 4, forwards: 2 } },
  { label: "4-5-1", value: { defenders: 4, midfielders: 5, forwards: 1 } },
  { label: "3-5-2", value: { defenders: 3, midfielders: 5, forwards: 2 } },
  { label: "3-4-3", value: { defenders: 3, midfielders: 4, forwards: 3 } },
];

function ManagerPanel({
  controller,
  onTacticsChange,
  onFormationChange,
  onSubstitution,
  error,
}: {
  controller: MatchController;
  onTacticsChange: (tactics: Tactics) => void;
  onFormationChange: (formation: Formation) => void;
  onSubstitution: (outgoingId: string, incomingId: string) => void;
  error: string | null;
}) {
  const { match } = controller;
  const selection = match.homeSelection;
  const team = match.homeTeam;
  const [outgoingId, setOutgoingId] = useState(selection.startingXI[0] ?? "");
  const [incomingId, setIncomingId] = useState(selection.substitutes[0] ?? "");

  useEffect(() => {
    if (!selection.startingXI.includes(outgoingId)) {
      setOutgoingId(selection.startingXI[0] ?? "");
    }
    if (!selection.substitutes.includes(incomingId)) {
      setIncomingId(selection.substitutes[0] ?? "");
    }
  }, [selection.startingXI, selection.substitutes, outgoingId, incomingId]);

  const activePlayers = selection.startingXI
    .map((id) => getPlayer(team.squad, id))
    .filter((player): player is Player => player !== undefined);

  const substitutePlayers = selection.substitutes
    .map((id) => getPlayer(team.squad, id))
    .filter((player): player is Player => player !== undefined);

  const currentFormation =
    FORMATION_PRESETS.find(
      ({ value }) =>
        value.defenders === selection.formation.defenders &&
        value.midfielders === selection.formation.midfielders &&
        value.forwards === selection.formation.forwards,
    )?.label ??
    `${selection.formation.defenders}-${selection.formation.midfielders}-${selection.formation.forwards}`;

  const isFullTime = match.phase === "full-time";
  const substitutionsUsed = match.substitutionsUsed.home;

  const updateTactic = (key: keyof Tactics, value: number) => {
    onTacticsChange({ ...selection.tactics, [key]: value });
  };

  const sliders: ReadonlyArray<{
    key: keyof Tactics;
    label: string;
    description: string;
  }> = [
    {
      key: "mentality",
      label: "Mentality",
      description: "Defensive to attacking",
    },
    {
      key: "pressing",
      label: "Pressing",
      description: "How aggressively to close down",
    },
    {
      key: "tempo",
      label: "Tempo",
      description: "Speed of possession and transitions",
    },
    { key: "width", label: "Width", description: "How wide the team plays" },
    {
      key: "defensiveLine",
      label: "Defensive line",
      description: "Depth of the back line",
    },
  ];

  return (
    <section className="rounded-xl border border-white/[0.07] bg-[#191f19] p-5">
      <SectionHeading
        eyebrow="MANAGER'S OFFICE"
        title="Team Instructions"
        trailing={
          <span className="font-mono text-[9px] text-[#89938a]">
            {team.name.toUpperCase()}
          </span>
        }
      />

      <div className="space-y-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label
              htmlFor="team-formation"
              className="text-xs font-semibold text-white"
            >
              Formation
            </label>
            <span className="font-mono text-xs text-[#b5f36a]">
              {currentFormation}
            </span>
          </div>
          <select
            id="team-formation"
            value={currentFormation}
            disabled={isFullTime}
            onChange={(event) => {
              const preset = FORMATION_PRESETS.find(
                ({ label }) => label === event.target.value,
              );
              if (preset) onFormationChange(preset.value);
            }}
            className="w-full rounded-lg border border-white/10 bg-[#111711] px-3 py-2.5 text-sm text-white outline-none focus:border-[#b5f36a]/60 disabled:opacity-50"
          >
            {!FORMATION_PRESETS.some(
              ({ label }) => label === currentFormation,
            ) && (
              <option value={currentFormation}>
                {currentFormation} (current)
              </option>
            )}
            {FORMATION_PRESETS.map(({ label }) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-white/[0.07] pt-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">
              Tactical instructions
            </h3>
            <span className="font-mono text-[9px] text-[#89938a]">1–100</span>
          </div>

          <div className="space-y-4">
            {sliders.map(({ key, label, description }) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div>
                    <label
                      htmlFor={`tactic-${key}`}
                      className="text-xs font-medium text-[#dce4d8]"
                    >
                      {label}
                    </label>
                    <p className="text-[10px] text-[#89938a]">{description}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#b5f36a]">
                    {selection.tactics[key]}
                  </span>
                </div>
                <input
                  id={`tactic-${key}`}
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={selection.tactics[key]}
                  disabled={isFullTime}
                  onChange={(event) =>
                    updateTactic(key, Number(event.target.value))
                  }
                  className="w-full accent-[#b5f36a] disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.07] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Substitutions</h3>
            <span className="font-mono text-[10px] text-[#89938a]">
              {substitutionsUsed}/5 used
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[10px] text-[#89938a]">
              Player off
              <select
                value={outgoingId}
                onChange={(event) => setOutgoingId(event.target.value)}
                disabled={isFullTime || activePlayers.length === 0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#111711] px-3 py-2.5 text-xs text-white outline-none focus:border-[#b5f36a]/60"
              >
                {activePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} · {player.primaryPosition}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-[#89938a]">
              Player on
              <select
                value={incomingId}
                onChange={(event) => setIncomingId(event.target.value)}
                disabled={isFullTime || substitutePlayers.length === 0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#111711] px-3 py-2.5 text-xs text-white outline-none focus:border-[#b5f36a]/60"
              >
                {substitutePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} · {player.primaryPosition}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => onSubstitution(outgoingId, incomingId)}
            disabled={
              isFullTime ||
              !controller.isPaused ||
              !outgoingId ||
              !incomingId ||
              substitutePlayers.length === 0 ||
              substitutionsUsed >= 5
            }
            className="mt-3 w-full rounded-lg border border-[#b5f36a]/30 bg-[#b5f36a]/10 px-4 py-2.5 text-xs font-bold text-[#b5f36a] transition hover:bg-[#b5f36a]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm substitution
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-[#89938a]">
            Pause the match to confirm a substitution. Choose a player currently
            on the pitch and an available substitute.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function MatchStatistics({ events }: { events: readonly MatchEvent[] }) {
  const goals = events.filter((event) => event.type === "goal").length;

  const shots = events.filter((event) => event.type === "shot").length;

  const passes = events.filter((event) => event.type === "pass").length;

  const saves = events.filter((event) => event.type === "save").length;

  const stats = [
    { label: "Total Goals", value: goals, highlight: true },

    { label: "Shots", value: shots },

    { label: "Passes", value: passes },

    { label: "Saves", value: saves },
  ];

  return (
    <section className="rounded-xl border border-white/[0.07] bg-[#191f19] p-5">
      <SectionHeading
        eyebrow="MATCH ANALYTICS"
        title="Live Statistics"
        trailing={
          <span className="rounded bg-[#293b28] px-2 py-1 font-mono text-[9px] text-[#b5f36a]">
            LIVE
          </span>
        }
      />

      <div className="grid gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`flex items-center justify-between rounded-lg px-4 py-3 ${
              stat.highlight ? "bg-[#263322]" : "border-b border-white/[0.06]"
            }`}
          >
            <span className="text-xs text-[#aab4a8]">{stat.label}</span>

            <strong
              className={`font-mono text-sm ${
                stat.highlight ? "text-[#b5f36a]" : "text-white"
              }`}
            >
              {stat.value}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchCommentary({ events }: { events: readonly MatchEvent[] }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-[#191f19] p-5">
      <SectionHeading
        eyebrow="LIVE FEED"
        title="Match Commentary"
        trailing={
          <span className="font-mono text-[9px] text-[#89938a]">
            {events.length} EVENTS
          </span>
        }
      />

      <div className="max-h-[390px] space-y-0 overflow-y-auto">
        {events.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#89938a]">
            Waiting for kickoff...
          </p>
        ) : (
          [...events]

            .reverse()

            .slice(0, 15)

            .map((event) => (
              <article
                key={event.id}
                className="grid grid-cols-[42px_1fr] gap-3 border-b border-white/[0.06] py-3 last:border-0"
              >
                <span className="pt-0.5 font-mono text-[11px] text-[#b5f36a]">
                  {event.minute}'
                </span>

                <div>
                  <p
                    className={`font-mono text-[9px] tracking-wider ${
                      event.type === "goal"
                        ? "text-[#b5f36a]"
                        : "text-[#aebbaa]"
                    }`}
                  >
                    {event.type.replaceAll("-", " ").toUpperCase()}
                  </p>

                  <p className="mt-1 text-[11px] leading-relaxed text-[#c2cbc0]">
                    {event.description}
                  </p>
                </div>
              </article>
            ))
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [controller, setController] = useState<MatchController>(
    createInitialController,
  );

  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [managerError, setManagerError] = useState<string | null>(null);
  const { match } = controller;

  function handleTacticsChange(tactics: Tactics) {
    setManagerError(null);
    setController(changeTeamTactics(controller, match.homeTeam.id, tactics));
  }

  function handleFormationChange(formation: Formation) {
    setManagerError(null);
    try {
      setController(
        changeTeamFormation(controller, match.homeTeam.id, formation),
      );
    } catch (error) {
      setManagerError(
        error instanceof Error ? error.message : "Could not change formation.",
      );
    }
  }

  function handleSubstitution(outgoingId: string, incomingId: string) {
    setManagerError(null);
    try {
      setController(
        makeSubstitution(controller, match.homeTeam.id, outgoingId, incomingId),
      );
    } catch (error) {
      setManagerError(
        error instanceof Error
          ? error.message
          : "Substitution could not be completed.",
      );
    }
  }
  function handlePauseResume() {
    setController((current) =>
      current.isPaused ? resumeMatch(current) : pauseMatch(current),
    );
  }

  function handleSecondHalf() {
    setController((current) => {
      const readyController = current.isPaused ? resumeMatch(current) : current;
      return startControllerSecondHalf(readyController);
    });
  }

  function handleNewMatch() {
    setManagerError(null);
    setController(createInitialController());
  }

  // One simulation action per tick keeps the pitch and commentary readable.

  // The interval is cleaned up whenever playback pauses or the half changes.

  useEffect(() => {
    const isPlayingPhase =
      controller.match.phase === "first-half" ||
      controller.match.phase === "second-half";

    if (controller.isPaused || !isPlayingPhase) return;

    const intervalId = window.setInterval(() => {
      setController((current) => {
        const canAdvance =
          current.match.phase === "first-half" ||
          current.match.phase === "second-half";

        if (current.isPaused || !canAdvance) return current;

        return advanceMatch(current, 1);
      });
    }, 1000 / playbackSpeed);

    return () => window.clearInterval(intervalId);
  }, [controller.isPaused, controller.match.phase, playbackSpeed]);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_50%_-30%,#263528_0%,transparent_60%),#101510] text-[#f0f2ed]">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-9">
        <TopBar />

        <section className="flex flex-wrap items-center justify-between gap-4 py-8">
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] text-[#b5f36a]">
              MATCH CENTRE / SIMULATION
            </p>

            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Matchday Control
            </h1>

            <p className="mt-1 text-xs text-[#89938a]">
              Manage the game. Read the match. Make your decisions.
            </p>
          </div>

          <button
            onClick={handleNewMatch}
            className="rounded-lg border border-white/10 bg-[#202920] px-4 py-3 text-xs font-bold text-white transition hover:border-[#b5f36a]/50 hover:bg-[#283328]"
          >
            ↻ New Match
          </button>
        </section>

        <Scoreboard controller={controller} />

        <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
          <section className="min-w-0 rounded-xl border border-white/[0.07] bg-[#191f19] p-4 sm:p-5">
            <SectionHeading
              eyebrow="LIVE VISUALIZATION"
              title="The Pitch"
              trailing={
                <span className="font-mono text-[9px] text-[#89938a]">
                  105 × 68 M
                </span>
              }
            />

            <FootballPitch controller={controller} />

            <div className="mt-4 flex flex-wrap items-center gap-5 text-[10px] text-[#89938a]">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#b5f36a]" />
                Home team
              </span>

              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#e8edf5]" />
                Away team
              </span>

              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-white" />
                Ball
              </span>
            </div>

            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <MatchControls
                controller={controller}
                playbackSpeed={playbackSpeed}
                onPauseResume={handlePauseResume}
                onSecondHalf={handleSecondHalf}
                onPlaybackSpeedChange={setPlaybackSpeed}
              />
            </div>

            {controller.isPaused && match.phase !== "full-time" && (
              <p className="mt-3 text-xs text-amber-300">Simulation paused</p>
            )}

            {match.phase === "half-time" && (
              <p className="mt-3 text-xs text-amber-300">
                Half-time. Start the second half when you are ready.
              </p>
            )}

            {match.phase === "full-time" && (
              <p className="mt-3 text-xs text-emerald-400">
                Full-time. Start a new match to simulate again.
              </p>
            )}
          </section>

          <aside className="min-w-0">
            <ManagerPanel
              controller={controller}
              onTacticsChange={handleTacticsChange}
              onFormationChange={handleFormationChange}
              onSubstitution={handleSubstitution}
              error={managerError}
            />
          </aside>
        </div>

        <section className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)]">
          <MatchStatistics events={match.events} />
          <MatchCommentary events={match.events} />
        </section>

        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/[0.07] py-6 font-mono text-[9px] tracking-wider text-[#667064]">
          <span>TOUCHLINE FOOTBALL ENGINE</span>

          <span>SEE THE GAME. CONTROL THE GAME.</span>
        </footer>
      </div>
    </main>
  );
}
