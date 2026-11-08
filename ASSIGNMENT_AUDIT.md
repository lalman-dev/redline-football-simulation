# REDLINE FOOTBALL ENGINE — Assignment Audit

Status reflects the current code and tests. “Implemented” means the feature exists for the rules and events the prototype models; it does not imply full professional match realism or IFAB compliance.

| Requirement | Status | Implementation and limitations |
|---|---|---|
| 11v11 match simulation | Implemented | Match setup validates an eleven-player starting XI with one goalkeeper. Send-offs reduce the active lineup; play ends if a team falls below seven players. |
| 90-minute matches and stoppage time | Partially implemented | First and second halves end at 45 and 90 minutes plus added time. Added time uses fixed increments for selected events, not full timekeeping or a referee-announced minimum. |
| Seeded deterministic simulation | Implemented | Match actions use the seeded RNG. Snapshot state includes the RNG state for deterministic continuation. |
| Match event log and statistics | Implemented | Events drive team and player counts, minutes, assists and match explanations. Possession is reconstructed from discrete events and is an approximation. |
| Teams, squads, formations and player attributes | Implemented | Teams, selections, formations, tactics and attributes are validated; attributes influence relevant match actions. |
| Tactical decisions affect match outcomes | Partially implemented | Tactics affect action selection, player movement and defensive pressure. The tactical model and synthetic comparisons do not establish realistic balance or causal effects. |
| Pause, resume and match advancement | Implemented | The controller supports pause/resume, action, minute, next-event and event-type advancement. Minute advancement is action-atomic and can pass the requested minute by a few seconds. |
| Substitutions and in-match tactical changes | Implemented | The manager controller supports substitutions and tactical/formation changes, with modeled substitution limits and event logging. |
| Post-match fatigue, minutes, injuries, cards and suspensions | Partially implemented | Match minutes and cards are recorded. Fatigue is a time/stamina-based performance adjustment, not accumulated player energy or season carry-over. Injuries and suspension carry-over are not implemented. |
| Save and restore | Implemented | Versioned snapshots validate match structure and preserve events and RNG state. There is no cross-version migration. |
| Headless/background simulations | Partially implemented | `simulateMatch` runs matches without the visualizer using the shared action executor. It is synchronous; background workers and parallel simulation are not implemented. |
| Match visualizer and manager controls | Implemented | The React UI displays match state and provides playback, pause/resume, tactical changes and substitutions. |
| IFAB Laws 2026/27 coverage | Not implemented | This is not an IFAB-compliant referee. Rules are simplified; offside, advantage, DOGSO assessment, injuries and several restarts and disciplinary details are missing. |
| Calibration and testing | Partially implemented | Vitest tests, build checks and seeded calibration/validation scripts are present. Calibration uses synthetic teams and shows a known penalty-frequency issue; it is not a sourced real-match benchmark. |

## Current calibration note

In the latest 1,000-match synthetic run, the engine averaged **4.79 goals per match** and awarded **3,985 penalties**. Open-play conversion was **7.2%**; penalty-area foul frequency accounts for much of the elevated total. The broad 2.2–3.2 goals-per-match calibration target is not currently met. The calibration report separates penalty and open-play outcomes and found no score/goal-event mismatches.

## Verification

The current suite has 180 Vitest tests across 15 files. The production build, calibration, strength, tactics and shooting validation commands have been run. Their synthetic results are regression signals, not proof of real-world accuracy.
