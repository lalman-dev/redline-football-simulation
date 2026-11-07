import { useEffect, useState, type ReactNode } from "react";

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
} from "../engine/match-controller.js";
import type { MatchController } from "../engine/match-controller.js";
import type { MatchEvent } from "../engine/match-types.js";
import type { Player } from "../engine/types.js";

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

  return createMatchController(initialState, homeTeam.id);
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
      <g key={player.id} transform={`translate(${x},${y})`}>
        <title>
          {player.name} — {player.primaryPosition}
          {isCarrier ? " — In possession" : ""}
        </title>
        {isCarrier && (
          <circle
            r="19"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.9"
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
      </g>
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
        {/* Pitch markings */}
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
        {/* Home team: engine-owned positions */}
        {homePlayers.map((player, index) =>
          renderPlayer(player, index, "home"),
        )}
        {/* Away team: engine-owned positions */}
        {awayPlayers.map((player, index) =>
          renderPlayer(player, index, "away"),
        )}
        {/* Ball: engine-owned position */}
        <g transform={`translate(${ballX},${ballY})`}>
          <circle r="10" fill="white" opacity="0.2" />
          <circle r="5" fill="white" stroke="#1c251b" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

interface MatchControlsProps {
  controller: MatchController;
  playbackSpeed: number;
  onAdvance: () => void;
  onPauseResume: () => void;
  onSecondHalf: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
}

function MatchControls({
  controller,
  playbackSpeed,
  onAdvance,
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
                  {event.minute}&apos;
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
  const { match } = controller;

  function handleAdvance() {
    setController((current) => advanceMatch(current, 5));
  }

  function handlePauseResume() {
    setController((current) =>
      current.isPaused ? resumeMatch(current) : pauseMatch(current),
    );
  }

  function handleSecondHalf() {
    setController((current) => startControllerSecondHalf(current));
  }

  function handleNewMatch() {
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
                onAdvance={handleAdvance}
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

          <aside className="grid min-w-0 gap-5">
            <MatchStatistics events={match.events} />
            <MatchCommentary events={match.events} />
          </aside>
        </div>

        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/[0.07] py-6 font-mono text-[9px] tracking-wider text-[#667064]">
          <span>TOUCHLINE FOOTBALL ENGINE</span>
          <span>SEE THE GAME. CONTROL THE GAME.</span>
        </footer>
      </div>
    </main>
  );
}
