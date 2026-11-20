import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  advanceMatch,
  pauseMatch,
  resumeMatch,
  startControllerSecondHalf,
  changeTeamTactics,
  changeTeamFormation,
  makeSubstitution,
  advanceByMinutes,
  advanceUntilNextEvent,
} from "../engine/match-controller.js";
import { buildMatchReport, formatEventMinute, sortMatchTimeline } from "./match-report.js";
import { sortPlayerRatings, type PlayerRating, type PlayerRatingSort } from "./player-ratings.js";
import { getMatchStatistics } from "../engine/statistics.js";

import type { MatchController } from "../engine/match-controller.js";
import type { MatchEvent } from "../engine/match-types.js";
import type { Formation, Player, PlayerPosition, Tactics, Team } from "../engine/types.js";
import { createMatchSessionController } from "./match-session.js";

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

function displayPlayerName(player: Player, teamName: string, squad: readonly Player[]): string {
  const name = player.name.trim();
  if (name && name !== `Player ${player.id}`) return name;
  const positionIndex = squad.filter((candidate) => candidate.primaryPosition === player.primaryPosition)
    .findIndex((candidate) => candidate.id === player.id);
  const ordinal = positionIndex >= 0 ? ` ${positionIndex + 1}` : "";
  return `${teamName} ${player.primaryPosition}${ordinal}`;
}

function displayTeamName(team: Team, side: "home" | "away"): string {
  return team.name.trim() || (side === "home" ? "Home team" : "Away team");
}

function displayEventDescription(event: MatchEvent, match: MatchController["match"]): string {
  let description = event.description;
  for (const team of [match.homeTeam, match.awayTeam]) {
    const teamName = displayTeamName(team, team.id === match.homeTeam.id ? "home" : "away");
    for (const player of team.squad) {
      if (player.name.trim() === `Player ${player.id}` && description.includes(player.name)) {
        description = description.replaceAll(player.name, displayPlayerName(player, teamName, team.squad));
      }
    }
  }
  return description.trim() || `${event.type.replaceAll("-", " ")} event`;
}

function playerAttributeSummary(player: Player): string {
  if (player.primaryPosition === "GK") return `GK ${player.attributes.goalkeeping} · POS ${player.attributes.positioning}`;
  if (["CB", "LB", "RB", "DM"].includes(player.primaryPosition)) return `TACK ${player.attributes.tackling} · PASS ${player.attributes.passing}`;
  if (["CM", "AM"].includes(player.primaryPosition)) return `PASS ${player.attributes.passing} · DEC ${player.attributes.decisionMaking}`;
  return `FIN ${player.attributes.finishing} · SHOOT ${player.attributes.shooting}`;
}

function TopBar() {
  return (
    <header className="flex min-h-[76px] items-center justify-between border-b border-white/[0.07]">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#b5f36a] text-xl font-extrabold text-[#152010]">
          R
        </div>
        <div>
          <h1 className="text-sm font-extrabold tracking-[0.2em] text-[#b5f36a]">
            REDLINE
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

function Scoreboard({
  controller,
  onTeamNameChange,
}: {
  controller: MatchController;
  onTeamNameChange: (side: "home" | "away", name: string) => void;
}) {
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

          <input aria-label="Home team name" maxLength={32} value={match.homeTeam.name} disabled={!controller.isPaused || match.elapsedSeconds > 0} onChange={(event) => onTeamNameChange("home", event.target.value)} className="mt-1 w-full min-w-0 bg-transparent text-xs font-bold text-white outline-none disabled:cursor-default sm:text-base" />
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

          <input aria-label="Away team name" maxLength={32} value={match.awayTeam.name} disabled={!controller.isPaused || match.elapsedSeconds > 0} onChange={(event) => onTeamNameChange("away", event.target.value)} className="mt-1 w-full min-w-0 bg-transparent text-right text-xs font-bold text-white outline-none disabled:cursor-default sm:text-base" />
        </div>

        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e5eaf2] text-sm font-extrabold text-[#202a3a] sm:size-12">
          A
        </div>
      </div>
    </section>
  );
}

function FootballPitch({
  controller,
  playbackSpeed,
}: {
  controller: MatchController;
  playbackSpeed: number;
}) {
  const { match } = controller;

  const animationDuration = 0.9 / playbackSpeed;
  const pulseDuration = 0.7 / playbackSpeed;

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
    team: "home" | "away",
  ) => {
    const position = match.playerPositions[player.id];
    if (!position) return null;

    const x = toPitchX(position.x);
    const y = toPitchY(position.y);
    const isHome = team === "home";
    const isCarrier = match.ballCarrierId === player.id;
    const clubName = displayTeamName(isHome ? match.homeTeam : match.awayTeam, team);
    const playerName = displayPlayerName(player, clubName, isHome ? match.homeTeam.squad : match.awayTeam.squad);
    const crowded = [...homePlayers, ...awayPlayers].some((other) => {
      if (other.id === player.id) return false;
      const otherPosition = match.playerPositions[other.id];
      return otherPosition !== undefined && Math.hypot(otherPosition.x - position.x, otherPosition.y - position.y) < 4;
    });
    const carrierLabelX = x > 560 ? -20 : 20;
    const carrierLabelY = y < 40 ? 32 : -16;
    const carrierLabelAnchor = x > 560 ? "end" : "start";

    return (
      <motion.g
        key={player.id}
        initial={false}
        animate={{ x, y }}
        transition={{
          x: {
            type: "tween",
            duration: animationDuration,
            ease: "linear",
          },
          y: {
            type: "tween",
            duration: animationDuration,
            ease: "linear",
          },
        }}
      >
        <title>
          {playerName} — {player.primaryPosition}
          {isCarrier ? " — In possession" : ""}
        </title>

        {isCarrier && (
          <motion.circle
            r="22"
            fill="none"
            stroke="#d9ff9d"
            strokeWidth="3"
            opacity="0.9"
            animate={
              controller.isPaused ? { scale: 1 } : { scale: [1, 1.12, 1] }
            }
            transition={{
              duration: pulseDuration,
              ease: "easeInOut",
              repeat: controller.isPaused ? 0 : Infinity,
            }}
          />
        )}

        {isCarrier && <circle r="16" fill="none" stroke="#101510" strokeWidth="2" />}

        <circle
          r={crowded ? 9 : 13}
          fill={isHome ? "#b5f36a" : "#e8edf5"}
          stroke={isHome ? "#efffdc" : "#ffffff"}
          strokeWidth="1.5"
        />

        {!crowded && <text
          y="4"
          textAnchor="middle"
          fill="white"
          stroke="#173b26"
          strokeWidth="3"
          paintOrder="stroke"
          fontSize="9"
          fontWeight="600"
        >
          {player.primaryPosition}
        </text>}
        {isCarrier && <text x={carrierLabelX} y={carrierLabelY} textAnchor={carrierLabelAnchor} fill="white" stroke="#101510" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="700">{playerName}</text>}
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

        {homePlayers.map((player) => renderPlayer(player, "home"))}

        {awayPlayers.map((player) => renderPlayer(player, "away"))}

        <motion.g
          initial={false}
          animate={{ x: ballX, y: ballY }}
          transition={{
            type: "tween",
            duration: animationDuration,
            ease: "linear",
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
  onAdvanceMinutes: (minutes: number) => void;
  onNextEvent: () => void;
}

function MatchControls({
  controller,
  playbackSpeed,
  onPauseResume,
  onSecondHalf,
  onPlaybackSpeedChange,
  onAdvanceMinutes,
  onNextEvent,
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

      <button disabled={isFullTime || isHalfTime} onClick={() => onAdvanceMinutes(1)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">+1 minute</button>
      <button disabled={isFullTime || isHalfTime} onClick={onNextEvent} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">Next event</button>

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
  const activePlayers = selection.startingXI
    .map((id) => getPlayer(team.squad, id))
    .filter((player): player is Player => player !== undefined && !match.dismissedPlayerIds.includes(player.id));

  const substitutePlayers = selection.substitutes
    .map((id) => getPlayer(team.squad, id))
    .filter((player): player is Player => player !== undefined);

  const defaultOutgoing = activePlayers.find((player) => player.primaryPosition !== "GK") ?? activePlayers[0];
  const defaultIncoming = substitutePlayers.find((player) => player.primaryPosition === defaultOutgoing?.primaryPosition)
    ?? substitutePlayers.find((player) => player.primaryPosition !== "GK")
    ?? substitutePlayers[0];
  const [outgoingId, setOutgoingId] = useState(defaultOutgoing?.id ?? "");
  const [incomingId, setIncomingId] = useState(defaultIncoming?.id ?? "");
  const outgoingPlayer = activePlayers.find((player) => player.id === outgoingId);
  const eligibleSubstitutes = substitutePlayers.filter((player) =>
    outgoingPlayer?.primaryPosition === "GK"
      ? player.primaryPosition === "GK"
      : player.primaryPosition !== "GK",
  );

  useEffect(() => {
    if (!activePlayers.some((player) => player.id === outgoingId)) {
      setOutgoingId(defaultOutgoing?.id ?? "");
    }
    if (!eligibleSubstitutes.some((player) => player.id === incomingId)) {
      setIncomingId(eligibleSubstitutes[0]?.id ?? "");
    }
  }, [selection.startingXI, selection.substitutes, match.dismissedPlayerIds, outgoingId, incomingId, defaultOutgoing?.id, eligibleSubstitutes]);

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
                    {displayPlayerName(player, displayTeamName(team, "home"), team.squad)} · {player.primaryPosition} · {playerAttributeSummary(player)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-[#89938a]">
              Player on
              <select
                value={incomingId}
                onChange={(event) => setIncomingId(event.target.value)}
                disabled={isFullTime || eligibleSubstitutes.length === 0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#111711] px-3 py-2.5 text-xs text-white outline-none focus:border-[#b5f36a]/60"
              >
                {eligibleSubstitutes.map((player) => (
                  <option key={player.id} value={player.id}>
                    {displayPlayerName(player, displayTeamName(team, "home"), team.squad)} · {player.primaryPosition} · {playerAttributeSummary(player)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-[10px] text-[#89938a]">Eligible replacements for {outgoingPlayer?.primaryPosition ?? "selected player"}: {eligibleSubstitutes.length || "none available"}</p>

          <button
            type="button"
            onClick={() => onSubstitution(outgoingId, incomingId)}
            disabled={
              isFullTime ||
              !controller.isPaused ||
              !outgoingId ||
              !incomingId ||
              eligibleSubstitutes.length === 0 ||
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

function MatchStatistics({ controller }: { controller: MatchController }) {
  const { match } = controller;
  const stats = getMatchStatistics(match);
  const rows = [
    { label: "Possession", key: "possessionPercentage", suffix: "%" },
    { label: "Goals", key: "goals", suffix: "" },
    { label: "Shots", key: "shots", suffix: "" },
    { label: "On target", key: "shotsOnTarget", suffix: "" },
    { label: "Passes", key: "passes", suffix: "" },
    { label: "Pass accuracy", key: "passAccuracy", suffix: "%" },
    { label: "Tackles", key: "tackles", suffix: "" },
    { label: "Fouls", key: "fouls", suffix: "" },
    { label: "Saves", key: "saves", suffix: "" },
    { label: "Cards (Y / R)", key: "yellowCards", suffix: "" },
    { label: "Substitutions", key: "substitutions", suffix: "" },
  ] as const;

  return (
    <section className="rounded-xl border border-white/[0.07] bg-[#191f19] p-5">
      <SectionHeading
        eyebrow="MATCH ANALYTICS"
        title="Live comparison"
        trailing={
          <span className="font-mono text-[9px] text-[#89938a]">{match.homeTeam.name} / {match.awayTeam.name}</span>
        }
      />

      <div className="space-y-1">
        {rows.map(({ label, key, suffix }) => {
          const homeValue = stats.home[key];
          const awayValue = stats.away[key];
          const total = homeValue + awayValue;
          const homeShare = total > 0 ? homeValue / total * 100 : 50;
          const displayHome = key === "yellowCards" ? `${homeValue} / ${stats.home.redCards}` : `${homeValue}${suffix}`;
          const displayAway = key === "yellowCards" ? `${awayValue} / ${stats.away.redCards}` : `${awayValue}${suffix}`;
          return <div key={label} className="grid grid-cols-[minmax(38px,auto)_1fr_minmax(38px,auto)] items-center gap-3 border-b border-white/[0.05] py-2.5">
            <span className="text-right font-mono text-xs font-semibold text-[#d9ff9d]">{displayHome}</span>
            <div><div className="mb-1 text-center text-[10px] text-[#aab4a8]">{label}</div><div className="flex h-1.5 overflow-hidden rounded-full bg-white/10"><span className="bg-[#b5f36a] transition-[width] duration-300" style={{ width: `${homeShare}%` }} /><span className="flex-1 bg-[#c8d1dc]" /></div></div>
            <span className="font-mono text-xs font-semibold text-[#e8edf5]">{displayAway}</span>
          </div>;
        })}
      </div>
    </section>
  );
}

function MatchCommentary({ controller }: { controller: MatchController }) {
  const { match } = controller;
  const events = sortMatchTimeline(match.events).slice(-20);
  const emphasis: Partial<Record<MatchEvent["type"], string>> = {
    goal: "border-[#b5f36a]/50 bg-[#b5f36a]/[0.06] text-[#d9ff9d]",
    save: "border-sky-400/40 bg-sky-400/[0.05] text-sky-200",
    foul: "border-amber-300/40 bg-amber-300/[0.04] text-amber-200",
    "yellow-card": "border-amber-300/50 bg-amber-300/[0.06] text-amber-200",
    "red-card": "border-red-400/50 bg-red-400/[0.06] text-red-200",
    substitution: "border-sky-300/40 bg-sky-300/[0.04] text-sky-100",
  };
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
          events.map((event) => (
              <article
                key={event.id}
                className={`grid grid-cols-[54px_1fr] gap-3 border-b border-l-2 border-white/[0.06] py-3 pl-3 last:border-b-0 ${eventTone(event.type)} ${emphasis[event.type] ?? "text-[#aebbaa]"}`}
              >
                <span className="pt-0.5 font-mono text-[11px] text-[#b5f36a]">
                  {formatEventMinute(match, event)}
                </span>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[9px] tracking-wider">{event.type.replaceAll("-", " ").toUpperCase()}</p>
                    {event.teamId && <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] text-[#c2cbc0]">{event.teamId === match.homeTeam.id ? displayTeamName(match.homeTeam, "home") : displayTeamName(match.awayTeam, "away")}</span>}
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-[#c2cbc0]">
                    {displayEventDescription(event, match)}
                  </p>
                </div>
              </article>
            ))
        )}
      </div>
    </section>
  );
}

function PlayerPerformanceTable({
  teamName,
  squad,
  side,
  entries,
  manOfTheMatch,
}: {
  teamName: string;
  squad: readonly Player[];
  side: "home" | "away";
  entries: readonly PlayerRating[];
  manOfTheMatch: PlayerRating | null;
}) {
  const [sortBy, setSortBy] = useState<PlayerRatingSort>("rating");
  const [positionFilter, setPositionFilter] = useState<PlayerPosition | "ALL">("ALL");
  const positions: readonly PlayerPosition[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];
  const visible = sortPlayerRatings(
    entries.filter((entry) => entry.stats.minutesPlayed > 0 && (positionFilter === "ALL" || entry.player.primaryPosition === positionFilter)),
    sortBy,
  );
  return <section className={`min-w-0 rounded-lg border p-4 ${side === "home" ? "border-[#b5f36a]/20 bg-[#b5f36a]/[0.025]" : "border-white/10 bg-white/[0.02]"}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h4 className="min-w-0 truncate text-sm font-semibold text-white">{teamName} <span className="ml-1 font-mono text-[9px] uppercase tracking-wider text-[#89938a]">{side}</span></h4>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`position-${side}`}>Filter {side} players by position</label>
        <select id={`position-${side}`} value={positionFilter} onChange={(event) => setPositionFilter(event.target.value as PlayerPosition | "ALL")} className="max-w-28 rounded border border-white/10 bg-[#111711] px-2 py-1.5 text-[10px] text-white">
          <option value="ALL">All positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}
        </select>
        <label className="sr-only" htmlFor={`sort-${side}`}>Sort {side} players</label>
        <select id={`sort-${side}`} value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerRatingSort)} className="rounded border border-white/10 bg-[#111711] px-2 py-1.5 text-[10px] text-white">
          <option value="rating">Sort: rating</option><option value="minutes">Sort: minutes</option><option value="position">Sort: position</option>
        </select>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[660px] text-left text-[11px]">
        <thead className="text-[#89938a]"><tr>{["Player", "Pos", "Min", "Rating", "G", "A", "Shots", "Pass %", "Tackles won / attempts"].map((label) => <th key={label} className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{visible.map((entry) => {
          const isMotm = entry.player.id === manOfTheMatch?.player.id;
          const wonTackles = entry.stats.successfulTackles;
          const tackleDisplay = entry.stats.tackles ? `${wonTackles}/${entry.stats.tackles} · ${entry.stats.tackleSuccessPercentage}%` : "—";
          return <tr key={entry.player.id} className={`border-t border-white/[0.06] ${isMotm ? "bg-[#b5f36a]/[0.09]" : ""}`}>
            <td className="whitespace-nowrap px-2 py-2.5 font-medium text-white">{displayPlayerName(entry.player, teamName, squad)}{isMotm && <span className="ml-2 rounded bg-[#b5f36a]/20 px-1.5 py-0.5 font-mono text-[8px] text-[#d9ff9d]">MOTM</span>}</td>
            <td className="px-2 py-2.5 text-[#aab5a7]">{entry.player.primaryPosition}</td>
            <td className="px-2 py-2.5 font-mono text-white">{entry.stats.minutesPlayed}</td>
            <td className="px-2 py-2.5 font-mono font-semibold text-[#b5f36a]">{entry.rating?.toFixed(1) ?? "—"}</td>
            <td className="px-2 py-2.5">{entry.stats.goals}</td><td className="px-2 py-2.5">{entry.stats.assists}</td><td className="px-2 py-2.5">{entry.stats.shots}</td>
            <td className="px-2 py-2.5">{entry.stats.passes ? `${entry.stats.passAccuracy}%` : "—"}</td><td className="whitespace-nowrap px-2 py-2.5">{tackleDisplay}</td>
          </tr>;
        })}</tbody>
      </table>
      {visible.length === 0 && <p className="py-5 text-center text-xs text-[#89938a]">No players match this position filter.</p>}
    </div>
  </section>;
}

function eventTone(type: MatchEvent["type"]): string {
  const tones: Partial<Record<MatchEvent["type"], string>> = {
    goal: "border-l-[#b5f36a] bg-[#b5f36a]/[0.055]",
    save: "border-l-sky-400 bg-sky-400/[0.045]",
    foul: "border-l-amber-300 bg-amber-300/[0.035]",
    "yellow-card": "border-l-amber-300 bg-amber-300/[0.06]",
    "red-card": "border-l-red-400 bg-red-400/[0.06]",
    substitution: "border-l-sky-300 bg-sky-300/[0.04]",
    "tactical-change": "border-l-violet-300 bg-violet-300/[0.04]",
  };
  return tones[type] ?? "border-l-transparent";
}

function PostMatchAnalysis({ controller }: { controller: MatchController }) {
  const { match } = controller;
  if (match.phase !== "full-time") return null;
  const report = buildMatchReport(match);
  const { statistics: summary, ratings, manOfTheMatch: motm } = report;
  const rows: ReadonlyArray<[string, keyof typeof summary.home]> = [
    ["Possession", "possessionPercentage"], ["Goals", "goals"], ["Shots", "shots"], ["Shots on target", "shotsOnTarget"],
    ["Saves", "saves"], ["Passes", "passes"], ["Pass accuracy", "passAccuracy"], ["Tackles", "tackles"],
    ["Successful tackles", "successfulTackles"], ["Fouls", "fouls"], ["Yellow cards", "yellowCards"], ["Red cards", "redCards"], ["Substitutions", "substitutions"],
  ];
  const homeName = displayTeamName(match.homeTeam, "home");
  const awayName = displayTeamName(match.awayTeam, "away");
  const homeWon = match.score.home > match.score.away;
  const awayWon = match.score.away > match.score.home;
  const goals = report.timeline.filter((event) => event.type === "goal");
  const goalLines = goals.map((event) => {
    const eventIndex = report.timeline.findIndex((candidate) => candidate.id === event.id);
    const scorerPlayer = [...match.homeTeam.squad, ...match.awayTeam.squad].find((player) => player.id === event.playerId);
    const scorerTeam = event.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
    const scorerSide = event.teamId === match.homeTeam.id ? "home" : "away";
    const scorer = scorerPlayer ? displayPlayerName(scorerPlayer, displayTeamName(scorerTeam, scorerSide), scorerTeam.squad) : "Scorer unavailable";
    const team = displayTeamName(scorerTeam, scorerSide);
    let assistName: string | undefined;
    for (let cursor = eventIndex - 1; cursor >= 0; cursor -= 1) {
      const previous = report.timeline[cursor]!;
      if (["kickoff", "goal", "free-kick", "penalty"].includes(previous.type)) break;
      if (previous.type === "shot") {
        if (previous.teamId === event.teamId && previous.playerId === event.playerId && previous.elapsedSeconds === event.elapsedSeconds) continue;
        break;
      }
      if (previous.type === "pass") {
        if (previous.teamId === event.teamId && previous.outcome === "successful" && previous.playerId !== event.playerId) {
          const assister = [...match.homeTeam.squad, ...match.awayTeam.squad].find((player) => player.id === previous.playerId);
          const assistTeam = previous.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
          assistName = assister ? displayPlayerName(assister, displayTeamName(assistTeam, previous.teamId === match.homeTeam.id ? "home" : "away"), assistTeam.squad) : undefined;
        }
        break;
      }
      if (previous.type === "carry" && previous.teamId !== event.teamId) break;
      if (previous.type === "tackle" && previous.outcome === "successful") break;
    }
    return `${formatEventMinute(match, event)} ${scorer} (${team})${assistName ? ` · Assist: ${assistName}` : ""}`;
  });
  return <section className="mt-5 space-y-5 rounded-xl border border-[#b5f36a]/20 bg-[#191f19] p-5 sm:p-6" aria-labelledby="post-match-title">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-mono text-[9px] tracking-[0.16em] text-[#b5f36a]">FULL-TIME REPORT</p><h2 id="post-match-title" className="mt-1 text-xl font-bold text-white">{homeName} {match.score.home}–{match.score.away} {awayName}</h2><p className="mt-1 text-xs text-[#89938a]">{homeWon ? `${homeName} won` : awayWon ? `${awayName} won` : "Draw"} · {Math.floor(match.elapsedSeconds / 60)} minutes played</p></div>
      {motm && <div className="rounded-lg border border-[#b5f36a]/25 bg-[#b5f36a]/[0.07] px-4 py-3"><p className="font-mono text-[9px] text-[#b5f36a]">MAN OF THE MATCH · {motm.rating?.toFixed(1)}</p><p className="mt-1 text-sm font-semibold text-white">{displayPlayerName(motm.player, displayTeamName(motm.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam, motm.teamId === match.homeTeam.id ? "home" : "away"), motm.teamId === match.homeTeam.id ? match.homeTeam.squad : match.awayTeam.squad)} · {motm.player.primaryPosition}</p><p className="mt-1 max-w-sm text-[10px] text-[#aab5a7]">{motm.reason}</p></div>}
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div><h3 className="mb-3 text-sm font-semibold text-white">Team comparison</h3><div className="space-y-2">{rows.map(([label, key]) => <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/[0.06] py-2 text-xs"><span className="text-right font-mono text-white">{summary.home[key]}{key === "possessionPercentage" || key === "passAccuracy" ? "%" : ""}</span><span className="text-center text-[10px] text-[#89938a]">{label}</span><span className="font-mono text-white">{summary.away[key]}{key === "possessionPercentage" || key === "passAccuracy" ? "%" : ""}</span></div>)}</div></div>
      <div className="space-y-3"><h3 className="text-sm font-semibold text-white">Player performance</h3><div className="grid gap-3 xl:grid-cols-2"><PlayerPerformanceTable teamName={homeName} squad={match.homeTeam.squad} side="home" entries={ratings.filter((entry) => entry.teamId === match.homeTeam.id)} manOfTheMatch={motm} /><PlayerPerformanceTable teamName={awayName} squad={match.awayTeam.squad} side="away" entries={ratings.filter((entry) => entry.teamId === match.awayTeam.id)} manOfTheMatch={motm} /></div><p className="text-[10px] text-[#89938a]">Ratings use the existing 6.0 baseline and position-weighted recorded contributions and deductions. Unused players are ungraded.</p></div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold text-white">Goalscorers & assists</h3>{goalLines.length ? goalLines.map((line, index) => <p key={`${line}-${index}`} className="py-1 text-xs text-[#c2cbc0]">{line}</p>) : <p className="text-xs text-[#89938a]">No goals recorded.</p>}<h3 className="mb-2 mt-4 text-sm font-semibold text-white">Tactical record</h3><p className="text-xs text-[#aab5a7]">Formations at full-time: {match.homeSelection.formation.defenders}-{match.homeSelection.formation.midfielders}-{match.homeSelection.formation.forwards} / {match.awaySelection.formation.defenders}-{match.awaySelection.formation.midfielders}-{match.awaySelection.formation.forwards}. Tactical changes are listed in the timeline.</p></div><div><h3 className="mb-2 text-sm font-semibold text-white">Full match timeline</h3><div className="max-h-72 space-y-1 overflow-y-auto">{report.timeline.map((event) => <div key={event.id} className={`grid grid-cols-[54px_100px_1fr] gap-2 border-b border-l-2 border-white/[0.05] py-2 pl-2 text-[10px] ${eventTone(event.type)}`}><span className="font-mono text-[#b5f36a]">{formatEventMinute(match, event)}</span><span className="uppercase text-[#89938a]">{event.type.replaceAll("-", " ")}</span><span className="text-[#c2cbc0]">{displayEventDescription(event, match)}</span></div>)}</div></div></div>
  </section>;
}

export default function App() {
  const [teamNames, setTeamNames] = useState({ home: "Team home", away: "Team away" });
  const [controller, setController] = useState<MatchController>(
    () => createMatchSessionController(teamNames.home, teamNames.away),
  );

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [managerError, setManagerError] = useState<string | null>(null);
  const { match } = controller;

  function handleTeamNameChange(side: "home" | "away", name: string) {
    setTeamNames((current) => ({ ...current, [side]: name }));
    setController((current) => {
      if (current.match.elapsedSeconds > 0) return current;
      const oldTeam = side === "home" ? current.match.homeTeam : current.match.awayTeam;
      const renamedTeam = { ...oldTeam, name };
      const events = current.match.events.map((event) =>
        event.type === "kickoff" && event.elapsedSeconds === 0 && event.teamId === oldTeam.id
          ? { ...event, description: `${displayTeamName(renamedTeam, side)} kick off.` }
          : event,
      );
      return {
        ...current,
        match: {
          ...current.match,
          ...(side === "home" ? { homeTeam: renamedTeam } : { awayTeam: renamedTeam }),
          events,
        },
      };
    });
  }

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
    setController(createMatchSessionController(teamNames.home, teamNames.away));
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

        <Scoreboard controller={controller} onTeamNameChange={handleTeamNameChange} />

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

            <FootballPitch
              controller={controller}
              playbackSpeed={playbackSpeed}
            />

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
                onAdvanceMinutes={(minutes) => setController((current) => {
                  const wasPaused = current.isPaused;
                  const playing = wasPaused ? resumeMatch(current) : current;
                  const advanced = advanceByMinutes(playing, minutes);
                  return wasPaused ? pauseMatch(advanced) : advanced;
                })}
                onNextEvent={() => setController((current) => {
                  const wasPaused = current.isPaused;
                  let advanced = wasPaused ? resumeMatch(current) : current;
                  const originalEventCount = advanced.match.events.length;
                  for (let step = 0; step < 5000 && advanced.match.events.length === originalEventCount && advanced.match.phase !== "full-time"; step += 1) {
                    advanced = advanceUntilNextEvent(advanced);
                  }
                  return wasPaused ? pauseMatch(advanced) : advanced;
                })}
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
          <MatchStatistics controller={controller} />
          <MatchCommentary controller={controller} />
        </section>

        <PostMatchAnalysis controller={controller} />

        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/[0.07] py-6 font-mono text-[9px] tracking-wider text-[#667064]">
          <span>REDLINE FOOTBALL ENGINE</span>

          <span>SEE THE GAME. CONTROL THE GAME.</span>
        </footer>
      </div>
    </main>
  );
}
