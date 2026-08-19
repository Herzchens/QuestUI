# QuestUI Agent Guide

These instructions apply to the entire repository. Read `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `docs/RELEASES.md` before changing behavior or release metadata.

QuestUI is a standalone Vencord userplugin for Discord Quest UI, narrowly scoped user-initiated Quest actions, Discord-native Quest-list refresh, and optional controls for a separately installed OrionQuests plugin.

## Project boundaries

QuestUI may:

- add or improve Quest-related UI;
- display Quest state/progress/reward/artwork/expiry already exposed by Discord;
- navigate to Quest Home;
- enroll only after an explicit QuestUI click through Discord's verified native enrollment action;
- claim only after an explicit QuestUI click through Discord's verified native claim action;
- invoke Discord's native current-Quest refresh after an explicit Reload click;
- read an explicit Orion companion state surface and delegate Start/Stop/Pause/Resume through it;
- auto-start compatible Orion only after Discord confirms a QuestUI enrollment in QuestStore;
- improve accessibility, compatibility, tests, CI, documentation, and release packaging.

QuestUI must not:

- auto-enroll or auto-claim without the approved explicit click;
- complete Quests or generate progress itself;
- spoof games/streams, heartbeats, video/activity/achievement progress;
- auto-retry failed manual mutations;
- bypass CAPTCHA, age verification, challenges, or account-safety checks;
- replace verified native actions with handcrafted REST merely to bypass a compatibility failure;
- import/copy/reimplement Orion farming internals or private runtime modules;
- keep a second Orion state mirror or infer Orion state from QuestUI clicks;
- mutate Orion settings or enable/disable the plugin as a Start/Stop substitute;
- treat Stop as Pause;
- implement targeted `startQuest`;
- become a combined QuestUI + Orion farming implementation.

The maintainer approved the current companion surface: global Start/Pause/Resume + Stop, exact-ID per-Quest Pause/Resume, and engine-wide Start from an enrolled card. Anything broader requires explicit approval.

## Repository map

- `index.tsx` — plugin metadata and Vencord patches.
- `QuestButton.tsx` — shortcuts, status indicators, counters, dashboard/open-home behavior.
- `QuestDashboard.tsx` — Dashboard cards, filters, artwork/rewards, native progress, summary, and expiry presentation.
- `QuestDashboardShell.tsx` — visible **Quest Dashboard** title/native Quest icon, premium-aware Nitro tag, and fixed header tools.
- `dashboardPolish.css` — title sweep, Nitro surface, summary layout, and elapsed-progress tones.
- `QuestCardActions.tsx` — explicit Accept/Claim, `Processing…`, confirmed-enrollment Orion auto-start, and per-Quest control slot.
- `questActions.ts` — manual Enroll/Claim orchestration delegating to Discord native actions.
- `questData.ts` — normalization/filtering/sorting and live read-only QuestStore snapshot source.
- `questReload.ts`, `questReloadLogic.ts`, `QuestReloadControl.tsx` — native current-Quest refresh and whole-rotation spinner state.
- `orionCommandLogic.ts`, `orionControlLogic.ts`, `orionIntegration.ts` — companion validation, state machine, and safe delegation.
- `OrionControls.tsx`, `OrionQuestControl.tsx`, `orionIcons.tsx` — global/per-Quest controls and shared icons.
- `actions.css`, `orion.css`, `reload.css` — action/control styling.
- `scripts/` — pure regression tests and Stable/Canary reporter checks.
- `.github/workflows/compatibility.yml` — build/type-check, pure tests, Orion matrix, bundle checks, reporters.
- `docs/RELEASES.md` — Stable/Beta source pairing and publishing checklist.

## Development environment

Install QuestUI at:

```text
Vencord/src/userplugins/QuestUI
```

Run from the Vencord root:

```bash
pnpm install --frozen-lockfile
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionControlLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestReloadLogic.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

Do not install packages from inside QuestUI. Never claim hosted CI passed without inspecting the actual jobs.

## Change discipline

- Inspect current source/branch history before editing.
- Keep history logical; avoid fixup/test-noise commits in final history.
- Make the smallest complete change and preserve unrelated behavior.
- Treat unknown worktree changes as belonging to someone else.
- Do not leave dead adapters, speculative APIs, duplicated implementations, swallowed failures, or unvalidated fallbacks.
- Do not fabricate Discord channel contexts.
- Never push or force-push `main`.
- Do not create/merge a PR unless explicitly requested.

## Sources of truth

### Discord

- QuestStore/native selectors own availability, enrollment, completion, claim state, progress, task selection, and refresh results.
- The 250 ms fallback is render-only: it may re-read Discord state, never increment progress or send farming requests.
- Prefer Discord's native completion/selected-task selectors.
- Prefer `taskConfigV2` over legacy `taskConfig`; do not merge both into duplicate tasks.

### Orion

- Orion's companion snapshot owns engine/task state (`running`, `queued`, `paused`, `stopped`).
- React state in controls may only schedule rendering/pending UI; never retain a stale snapshot copy across plugin reloads.
- Subscribe for immediate updates and re-read the current companion object on render.
- Validate registered-command ownership and method identity immediately before mutation.

## Manual Accept / Claim invariants

- Every mutation requires an explicit click.
- Re-read the Quest from QuestStore immediately before mutation.
- Require complete current config and fail closed on malformed present safety timestamps.
- Scope duplicate guards to account + Quest and re-check account identity on store events/timeouts.
- Enrollment uses the native finder containing `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`.
- Claim uses the verified native finder containing begin/success/failure plus `traffic_metadata_sealed`.
- Never silently fall back to handcrafted REST.
- Never solve/bypass challenges or auto-retry them.
- Never optimistically mutate QuestStore.
- Confirmed enrollment may start compatible idle Orion; submitted/uncertain enrollment may not.
- Pending copy is `Processing…`.

## Orion control invariants

Compatible Orion must own the exact registered `orion` command, expose `start`, `stop`, `pause`, `resume`, and provide `getControlSnapshot`, `subscribeControlState`, `controlEngine`, `controlAll`, `controlQuest` plus retained engine-only compatibility methods.

Header order:

```text
Smart Start/Pause/Resume → Stop → Reload → Filter
```

Global state rules:

- no Discord Available/In-Progress Quest → Smart and Stop disabled;
- engine stopped + unfinished work → Start enabled, Stop disabled;
- engine stopped + paused work → Resume enabled, Stop disabled;
- engine running + RUNNING/QUEUE → Pause enabled, Stop enabled;
- engine running + only PAUSED controllable work → Resume enabled, Stop enabled;
- engine running before any controllable row is published → Smart disabled, Stop enabled.

Icon rules:

- Start and Resume use the exact same `OrionPlayIcon`;
- Pause uses the real yellow `OrionPauseIcon`, never literal `||` text;
- Stop uses the square Stop glyph and remains engine shutdown/cleanup.

Per-Quest rules:

- Available → large Accept;
- confirmed enrollment → compatible compact Orion control in the same slot;
- engine stopped → per-card Start starts the global engine;
- exact Quest RUNNING/QUEUE → Pause;
- exact Quest PAUSED → Resume;
- unknown/scanning while running → disabled rather than guessed;
- completed/claimable → Orion control disappears and Claim appears;
- Pause/Resume are exact-ID operations; Start is not targeted;
- Orion scheduler/concurrency remains authoritative.

Use Vencord's native toast API for explicit success/failure feedback.

## Reload invariants

- Resolve native refresh with `findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN")`.
- Never hand-mutate QuestStore or reload the whole client.
- Start the request immediately.
- Complete at least three full icon rotations.
- While request is in flight, continue spinning.
- If it settles mid-rotation, stop only on the next `animationiteration` boundary; never snap a partial rotation.
- Coalesce overlapping native calls and synchronously guard duplicate clicks.
- Success with no new Quest is still success.
- Keep Reload available without Orion and theme-readable while pending/disabled.

## Dashboard presentation invariants

- Visible title: **Quest Dashboard** + Discord's native Quest icon.
- Nitro eligibility comes from the current user's Discord `premiumType`; the tag must remain visible for an eligible account even if profile badge artwork is not hydrated.
- Use Discord's native Nitro profile-badge artwork when available and the existing fallback glyph otherwise. Do not add a new Discord webpack finder for Nitro.
- Title sweep is a seamless linear right-to-left loop with an exact repeat period; no reset/transition frame.
- Summary stays on one row and visually below the tool row.
- In Progress, Ready to Claim, and Available follow the current Dashboard card scope.
- **Claimed is always present** and its count comes from the full live Quest snapshot, even when Claimed cards are filtered out.
- Timed progress uses `mm:ss / mm:ss`; only the current elapsed value is stage-colored. Prefix/target remain neutral.
- Dashboard expiry copy is presentation-only and appears only within the 15-day window; never mutate underlying expiry/status to achieve this.

## Discord patch / webpack rules

- Treat every Discord matcher/finder as a compatibility boundary.
- Prefer stable code fragments/meaningful properties; avoid broad minified-key lookups.
- Any finder change requires `WEBPACK_FIND_SIGNATURES` review.
- Current reporter coverage includes QuestStore, native task/progress selectors, artwork, Orb component, native Enroll, native Claim, and native current-Quest Reload.
- Vencord PluginManager/Commands and `UserStore`/`UserProfileStore` common-store access are not new Discord webpack finders.

## Verification

Run the full local gate for source changes. For companion changes, also run Orion pause/resume regression tests and build/type-check both plugins together.

Manual checks should cover the affected states. For the current beta this includes header/Nitro layout, one-line summary including always-visible Claimed, `mm:ss` current-only progress coloring, 15-day expiry display, Accept/Claim, global/per-Quest Orion transitions, concurrency, Reload whole rotations, dark/light themes, and plugin replacement/reload safety.

Automated checks do not substitute for live Discord evidence. State exactly what was and was not tested.

## Release discipline

- Stable release source is `main`.
- Beta source is `feat/quest-actions-orion-controls`.
- The beta Orion-control feature set must be paired with `Herzchens/discord-quest-completer:feat/per-quest-pause-resume`; do not imply current upstream nyxxbit exposes the same companion API.
- Keep QuestUI and Orion source/license boundaries separate in packages.
- Git tags/releases require maintainer approval. The maintainer has explicitly requested the current Stable/Beta release preparation; still verify target SHAs/tag availability before publishing.

## Issue / PR safety

- Do not create an issue or PR unless explicitly requested.
- Before opening a PR, ask whether the final diff was reviewed by a human.
- If proceeding without confirmed human review, add `AI_REVIEW_REQUIRED.txt` containing exactly:

  `This pull request was generated automatically by AI and has not been reviewed by a human.`

- Never claim human review unless explicitly confirmed.
- Do not weaken this section unless the maintainer explicitly requests that exact change.