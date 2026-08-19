# QuestUI Agent Guide

These instructions apply to the entire repository.

QuestUI is a standalone Vencord userplugin for Discord Quest UI, narrowly scoped user-initiated Quest actions, Discord-native Quest-list refresh, and optional controls for a separately installed OrionQuests plugin. Read `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` before making changes.

## Project boundaries

QuestUI may:

- Add or improve Quest-related UI.
- Display Quest status, progress, reward, artwork, and expiry already available in Discord.
- Navigate to Discord Quest Home.
- Enroll in a Quest only after an explicit QuestUI click, through Discord's verified native enrollment action.
- Claim a completed Quest reward only after an explicit QuestUI click, through Discord's verified native claim action.
- Ask Discord's native current-Quest action to refresh QuestStore after an explicit Reload click.
- Read an explicit OrionQuests companion state surface and delegate Start, Stop, Pause, and Resume controls through that surface.
- Auto-start Orion after a QuestUI enrollment only after Discord has confirmed the enrollment in QuestStore.
- Improve accessibility, compatibility, testing, CI, and documentation.

QuestUI must not:

- Automatically enroll or claim Quests without the explicit manual action described above.
- Complete Quests or generate progress itself.
- Spoof running games or streams.
- Generate Quest heartbeats, video progress, activity progress, or achievement progress.
- Retry manual Quest mutations automatically after failure.
- Bypass CAPTCHA, challenges, age verification, or account-safety checks.
- Replace verified native Enroll/Claim/Quest-refresh actions with handcrafted REST mutations merely to bypass a compatibility failure.
- Import, copy, or reimplement Orion farming internals.
- Reach into Orion TaskRunner, Traffic, Patcher, checkout paths, or private source modules.
- Maintain a second Orion engine/task-state mirror or infer Orion state from QuestUI clicks.
- Enable/disable the Orion plugin as a substitute for engine Start/Stop.
- Mutate Orion settings such as auto-enroll, enrollment watching, concurrency, achievement bypass, auto-claim, or activity hiding.
- Treat Orion Stop as Pause. Stop remains engine shutdown; Pause is task control.
- Implement targeted `startQuest`. Start remains engine-wide and Orion owns queue/concurrency decisions.
- Become a combined QuestUI + Orion farming implementation.

The maintainer explicitly approved the current companion surface, including global Start/Pause/Resume + Stop, exact-ID per-Quest Pause/Resume, and engine-wide Start from an enrolled card. Any broader automation or Quest mutation still requires explicit approval.

## Repository map

- `index.tsx` — plugin metadata and Vencord patches.
- `QuestButton.tsx` — top/settings-bar shortcuts, status indicators, counters, dashboard/open-home behavior.
- `QuestDashboard.tsx` — mini Dashboard, cards, filter popout, artwork, rewards, expiry, native progress integration.
- `QuestDashboardShell.tsx` — visible **Quest Dashboard** title/native Quest icon, optional native Nitro profile-badge tag, and fixed header tool row.
- `dashboardPolish.css` — title accent, Nitro tag, header-space ownership, and one-line attention summary overrides.
- `QuestCardActions.tsx` — explicit Accept/Claim controls, `Processing…` state, confirmed-enrollment Orion auto-start, and per-Quest control slot.
- `questActions.ts` — the only QuestUI-owned manual Enroll/Claim orchestration; delegates mutations to Discord native actions.
- `questActionLogic.ts` / `questActionRuntimeLogic.ts` — pure manual-action decisions and safety helpers.
- `questData.ts` — Quest normalization/filtering/sorting and live read-only QuestStore snapshot source.
- `questReload.ts` / `questReloadLogic.ts` / `QuestReloadControl.tsx` — Discord-native current-Quest refresh and full-rotation spinner state.
- `orionCommandLogic.ts` — pure registered-command and companion-surface validation.
- `orionControlLogic.ts` — pure global/per-Quest control state machine.
- `orionIntegration.ts` — PluginManager/Commands detection, exact ownership validation, source-of-truth companion access, cross-Dashboard locking, and safe invocation.
- `OrionControls.tsx` — global smart Start/Pause/Resume plus separate Stop.
- `OrionQuestControl.tsx` — compact enrolled-card Start/Pause/Resume.
- `orionIcons.tsx` — shared Play/Pause/Stop glyphs. Start and Resume must use the exact same Play component.
- `actions.css`, `orion.css`, `reload.css` — manual/per-Quest actions, global Orion header tools, Reload animation.
- `scripts/testOrionControlLogic.ts` — pure smart/global/per-Quest state matrix.
- `scripts/testQuestReloadLogic.ts` — Reload minimum/full-rotation state logic.
- `scripts/checkQuestUIReporter.mjs` — Stable/Canary webpack-find reporter validation.
- `.github/workflows/compatibility.yml` — clean Vencord build/type-check, pure tests, bundle assertions, upstream/fork Orion matrix, Stable/Canary reporters.

## Development environment

QuestUI has no standalone package manifest. Install it inside a Vencord checkout at:

```text
Vencord/src/userplugins/QuestUI
```

Run commands from the Vencord repository root:

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

Do not install packages from inside the QuestUI directory.

GitHub Actions additionally exercises current upstream Orion, the compatible pause/resume fork, and Discord Stable/Canary reporters. Never claim those passed without inspecting actual jobs.

## Change discipline

- Inspect current source and branch history before editing.
- Keep history logical; do not submit fixup/test-noise commits when a clean logical commit can be amended before handoff.
- Make the smallest change that fully solves the request.
- Preserve unrelated user-facing behavior.
- Treat unknown worktree changes as belonging to someone else.
- Do not leave dead adapters, speculative APIs, duplicate implementations, swallowed failures, or unvalidated fallbacks.
- Do not create fake Discord channel contexts.
- Never push directly to or force-push `main`.
- Do not create or merge a PR unless explicitly requested.

## Source-of-truth rules

### Discord Quest state

- Discord QuestStore/native selectors are the source of truth for Quest availability, enrollment, completion, claim state, progress, task selection, and refresh results.
- The 250 ms QuestUI fallback is render-only. It may re-read Discord state; it must never increment progress or send farming requests.
- Discord's native completion selector owns progress-ring ratio/text when available.
- Prefer Discord's native selected task before local compatibility fallback.
- Prefer `taskConfigV2` over legacy `taskConfig`; do not merge them into duplicate tasks.

### Orion state

- Orion's companion snapshot is the source of truth for engine running state and Orion task states (`running`, `queued`, `paused`, `stopped`).
- React state in Orion controls may be used only as a render revision/pending flag. Do not store a fallback copy of Orion's snapshot that can outlive a plugin reload.
- Subscribe to Orion's control-state emitter for immediate normal updates, and re-read the current companion object on render.
- Validate exact registered-command object ownership through Vencord Commands API and re-check plugin/command/method identity immediately before mutation.

## Manual Accept / Claim invariants

- Every Enroll/Claim mutation requires an explicit click.
- Re-read the Quest from `QuestsStore` immediately before mutation; never trust only the card snapshot.
- Require complete current Quest config.
- Scope duplicate guards to account + Quest.
- Re-check account identity on store events and at confirmation timeout.
- Respect Quest access suspension and `questEnrollmentBlockedUntil`; malformed present safety state fails closed.
- Malformed present start/expiry/reward-expiry timestamps fail closed.
- Enrollment must use Discord's native action finder containing `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`.
- Claim must use the verified native claim finder containing begin/success/failure plus `traffic_metadata_sealed`.
- Never silently fall back to handcrafted REST when a native finder breaks.
- Never solve or bypass challenges and never auto-retry them.
- Never optimistically mutate QuestStore.
- Successful or transport-ambiguous submissions may stay guarded only for a bounded hold.
- Store-confirmed enrollment may trigger Orion Start only when Orion integration is enabled/compatible and the engine is idle. Unconfirmed/submitted enrollment is insufficient.
- Pending manual copy is `Processing…`.

## Orion control invariants

A compatible Orion build must:

- own the exact registered Vencord `orion` command;
- expose action choices `start`, `stop`, `pause`, and `resume`;
- expose `getControlSnapshot`, `subscribeControlState`, `controlEngine`, `controlAll`, and `controlQuest` plus the legacy engine-only methods retained for compatibility;
- keep farming, queueing, progress, and cleanup behavior inside Orion.

Global header order must remain:

```text
Smart Start/Pause/Resume → Stop → Reload → Filter
```

Global state rules:

- No Discord `available` or `in-progress` Quest → Smart and Stop disabled.
- Engine stopped + unfinished work → Start enabled, Stop disabled.
- Engine stopped + paused work → Resume enabled, Stop disabled.
- Engine running + RUNNING/QUEUE work → Pause enabled, Stop enabled.
- Engine running + only PAUSED controllable work → Resume enabled, Stop enabled.
- Engine running but no published controllable row yet → Smart disabled, Stop enabled.

Icon rules:

- Start and Resume use the exact same `OrionPlayIcon`.
- Pause uses `OrionPauseIcon`, a real SVG two-bar glyph; never render literal `||`/`| |` text.
- Pause is warning/yellow.
- Stop uses the square Stop glyph.

Per-Quest rules:

- Available card → large Accept button.
- After confirmed enrollment → Accept disappears; compatible Orion control occupies the same action slot.
- Engine stopped → per-card Start, but it starts the global engine.
- Orion RUNNING/QUEUE for that exact Quest ID → Pause.
- Orion PAUSED → Resume.
- Engine running before Orion publishes a row → control disabled; do not guess.
- Completed/claimable → Orion control disappears and Claim Reward appears.
- Pause/Resume are exact-ID operations; Start is not targeted.
- Orion scheduler/concurrency remains authoritative for which accepted Quest runs or queues.

All explicit Start/Stop/Pause/Resume clicks should surface visible success/failure feedback through Vencord's native toast API. Do not fabricate a channel or invoke slash-command callbacks just to get a response.

## Quest Reload invariants

- Resolve Discord's native refresh with `findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN")`.
- Invoke that native fetch-and-dispatch action; never hand-mutate QuestStore and never reload the whole Discord client.
- Start the request immediately.
- Complete at least three full icon rotations before stopping.
- If the request remains in flight after three rotations, keep spinning.
- If the request settles mid-rotation, finish that rotation and stop only on the next `animationiteration` boundary; never snap a partial turn back to zero.
- Reduced-motion mode may slow the rotation but must preserve whole-rotation semantics.
- Coalesce overlapping native calls to one in-flight request, and synchronously guard duplicate component clicks as well.
- Success means the native refresh completed, even when no new Quest appears.
- Show explicit success/failure feedback through Vencord's native toast API.
- Keep Reload available independently of Orion integration.
- Keep the Reload glyph theme-readable in idle and disabled/spinning states; disabled pending state must not dim the icon into the dark surface.

## Dashboard header invariants

- The visible heading is **Quest Dashboard** followed by Discord's native Quest icon.
- If the current account's loaded Discord profile exposes the native Discord Nitro profile badge, show a compact colored **Nitro** tag using that badge icon; otherwise show no tag and do not guess subscription state.
- The Nitro tag must use profile/store data already exposed through Vencord commons, not a new Discord webpack finder.
- Keep In Progress, Ready to Claim, and Available on one row and visually below the title/tool row.

## Discord patch and webpack rules

Discord internals are unstable. Treat every matcher/finder as a compatibility boundary.

- Prefer identifiable code fragments and meaningful properties.
- Avoid broad/minified-key lookups when safer anchors exist.
- Keep patch alternatives required for coexistence with Vencord plugins.
- Any added/changed/removed Discord webpack lookup requires matching `WEBPACK_FIND_SIGNATURES` review.
- Current reporter-covered finders include QuestStore, native task/progress selectors, artwork, Orb component, native Enroll, native Claim, and native current-Quest Reload.
- Vencord PluginManager/Commands API imports are not Discord webpack finders and need no reporter signature.
- Reusing the existing native Quest-icon finder for another Dashboard presentation point does not introduce a new lookup signature; do not duplicate reporter entries for an identical finder.
- Reading the current user/profile through `UserStore`/`UserProfileStore` is a Vencord common-store access and does not add a Discord webpack finder.

## Verification

For source changes run the full local gate shown under Development environment. For compatible Orion integration changes, also run Orion's own pause/resume regression tests from its userplugin checkout and build/type-check both plugins together.

Manual testing should cover affected states, including when relevant:

- Dashboard title reads **Quest Dashboard**, uses Discord's native Quest icon, shows the Nitro tag only when the loaded current-user profile exposes the Nitro badge, and does not overlap header tools.
- In Progress, Ready to Claim, and Available stay on one summary row with the requested extra vertical separation below the title.
- Accept invokes exactly once and transitions `Processing…` → enrolled state.
- Confirmed Accept starts idle Orion; unconfirmed Accept does not.
- Three accepted Quests with concurrency two leave excess work queued rather than inventing targeted Start behavior.
- Global idle: Start enabled / Stop disabled.
- Global running: Pause + Stop enabled.
- Explicit pause: Resume appears with the same Play icon as Start.
- Stop leaves Discord progress intact; later Start continues unfinished non-paused work from Discord state.
- Per-Quest RUNNING/QUEUE ↔ PAUSED transitions are immediate and exact-ID.
- Finished Quest drops Orion control and shows Claim.
- All Quests finished: both Smart and Stop disabled.
- Reload glyph stays legible on dark/light themes, starts its native request immediately, completes at least three full rotations, finishes the current rotation after a slow request settles, updates newly fetched Quests without Ctrl+R, and reports both success and failure through Vencord toast.
- Orion absent/disabled/reloaded/incompatible fails safely and never leaves a stale callable control.

Automated tests do not substitute for live Discord mutation/Orion lifecycle testing. Never claim live verification that did not happen.

## Documentation

Update `CHANGELOG.md` under `Unreleased` for user-visible features/fixes and meaningful compatibility changes. Keep README user-facing; keep implementation invariants here and in CONTRIBUTING.

Do not create a release version unless explicitly requested.

## Issue and pull request safety

- Do not create an issue or pull request unless the user explicitly requests it.
- Before opening a pull request, ask whether the final diff has been reviewed by a human.
- If the user explicitly confirms review, open it normally.
- If the user asks to proceed without review, or does not confirm after being asked, add `AI_REVIEW_REQUIRED.txt` containing exactly:

  `This pull request was generated automatically by AI and has not been reviewed by a human.`

- Never claim human review unless explicitly confirmed.
- Do not remove or weaken this section unless the repository maintainer explicitly requests that exact change.
