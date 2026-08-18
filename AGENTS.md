# QuestUI Agent Guide

These instructions apply to the entire repository.

QuestUI is a standalone Vencord userplugin for Discord Quest UI, narrowly-scoped user-initiated Quest actions, and optional global controls for a separately installed OrionQuests plugin. Read `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` before making changes.

## Project boundaries

QuestUI may:

- Add or improve Quest-related user interface elements.
- Display Quest status, progress, reward, artwork, and expiry information already available in the Discord client.
- Navigate to Discord's Quest Home.
- Enroll in a Quest only after an explicit user click in QuestUI, through Discord's verified native enrollment action.
- Claim a completed Quest reward only after an explicit user click in QuestUI, through Discord's verified native claim action.
- Read OrionQuests' explicit companion engine state and delegate explicit global Start/Stop clicks through Orion's watcher-aware companion control surface.
- Improve accessibility, compatibility, installation, testing, and documentation.
- Improve Vencord patches, webpack lookups, and compatibility checks.

QuestUI must not:

- Automatically enroll in Quests.
- Automatically claim Quest rewards.
- Complete Quests or generate Quest progress itself.
- Spoof running games or application streams.
- Generate Quest heartbeats, video progress, activity progress, or achievement progress.
- Retry manual Quest actions automatically after an error.
- Bypass Discord CAPTCHA, challenge, age-verification, or account-safety checks.
- Rebuild or directly send Quest enrollment/claim network requests while the verified native Discord action is available.
- Import, copy, or reimplement OrionQuests farming internals.
- Reach into Orion TaskRunner, Traffic, Patcher, checkout paths, or private source modules.
- Maintain a second Orion engine-running flag or infer engine state from QuestUI clicks.
- Enable or disable the Orion plugin itself as a substitute for starting/stopping Orion's engine.
- Mutate Orion settings such as auto-enroll, enrollment watching, concurrency, achievement bypass, auto-claim, or activity hiding.
- Add per-Quest Orion controls unless Orion exposes a stable public per-Quest control surface and the maintainer explicitly approves using it.
- Treat Orion `stop` as pause or Orion `start` as resume. Pause/resume are separate capabilities and are not implemented by the current bridge.
- Become a combined QuestUI and OrionQuests farming implementation.

The maintainer explicitly approved the narrow scope change above. Any new automation or Quest mutation still requires explicit maintainer approval.

## Repository map

- `index.tsx`
  - Plugin metadata.
  - Vencord patches.
  - Component insertion points.
- `QuestButton.tsx`
  - Top-bar and settings-bar Quest shortcuts.
  - Basic and Detailed Status indicators.
  - Status tooltip and Quest Home counters.
  - Dashboard/open-Quest-Home click behavior.
- `QuestDashboard.tsx`
  - Mini Dashboard UI, card layout, filter popout, Quest artwork, reward presentation, expiry presentation, and native Discord progress integration.
- `QuestDashboardShell.tsx`
  - Optional smart Orion control placement beside the Dashboard Filter button.
- `QuestCardActions.tsx`
  - Explicit manual Accept/Claim controls.
- `questActionLogic.ts`
  - Pure native-enroll result, reward-target, claim-result, and challenge decisions.
- `questActionRuntimeLogic.ts`
  - Pure timestamp/account-timeout/listener safety decisions used by manual actions.
- `questActions.ts`
  - The only QuestUI-owned manual Quest action orchestration; it delegates the actual enrollment and claim mutations to Discord's verified native actions.
- `orionCommandLogic.ts`
  - Pure validation for Orion's registered command identity and narrow companion state/control surface.
- `orionIntegration.ts`
  - Vencord PluginManager/Commands-registry detection, exact command ownership validation, companion state/control access, and cross-Dashboard locking.
- `OrionControls.tsx`
  - Single state-aware icon-only global Orion control.
- `questData.ts`
  - Shared Quest normalization, status classification, filtering, sorting, progress/task fallback data, and live QuestStore subscription.
- `settings.ts`
  - User-facing QuestUI settings and dependency/visibility rules.
- `stores.ts`
  - Lazy Discord Quest store resolution.
- `styles.css`
  - Quest button, Dashboard, card, filter, tooltip, and status styling.
- `detailStatus.css`
  - Detailed Status custom-background compatibility and compact badge overrides.
- `actions.css`
  - Manual Quest action controls.
- `orion.css`
  - Smart Orion header-control styling and reserved header spacing.
- `scrollbar.css`
  - Final Dashboard scrollbar overrides for Windows/Electron behavior.
- `scripts/testQuestActionLogic.ts`
  - Pure native-enroll/claim decision tests.
- `scripts/testQuestActionRuntimeLogic.ts`
  - Pure manual mutation safety tests, including synchronous listener-registration cleanup.
- `scripts/testOrionCommandLogic.ts`
  - Pure Orion command-identity and companion-surface tests.
- `scripts/checkQuestUIReporter.mjs`
  - Validates Vencord patch-reporter output.
  - Tracks QuestUI Discord webpack lookup signatures.
- `.github/workflows/compatibility.yml`
  - Clean Vencord build and type-check.
  - Combined build/type-check with current upstream OrionQuests.
  - Bundle verification.
  - Stable and Canary patch-reporter checks.

## Development environment

QuestUI does not have a standalone package manifest.

It must be installed inside a Vencord source checkout at:

```text
Vencord/src/userplugins/QuestUI
```

Run development commands from the Vencord repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

Do not run package installation from inside the QuestUI directory.

The full Discord Stable/Canary reporter and combined upstream-Orion jobs run in GitHub Actions. Do not claim they passed without inspecting the actual jobs.

## Change discipline

- Inspect the current implementation before editing.
- Inspect current branch/history before writing so fixup noise does not become the submitted history.
- Make the smallest change that fully solves the requested problem.
- Do not combine unrelated refactors with a bug fix.
- Do not silently change project scope.
- Do not modify documentation or credits unless the task requires it.
- Preserve user-facing behavior that is unrelated to the requested change.
- Do not remove compatibility handling merely because it appears redundant.
- Do not leave dead adapters, unused components/styles, speculative control surfaces, duplicate implementations, swallowed failures, or unvalidated fallback paths.
- Explain any matcher or Discord webpack lookup change in the resulting pull request.
- Never force-push `main`.
- Never push directly to `main`.
- Do not merge a pull request without explicit maintainer approval.

Before editing a file, check whether the working tree contains unrelated changes. Treat unknown changes as belonging to another contributor or agent.

## UI implementation rules

Use Vencord and React components rather than raw DOM manipulation.

When modifying the top-bar or settings-bar Quest shortcut:

- Preserve direct navigation through `NavigationRouter.transitionTo("/quest-home")` when Dashboard Mode is disabled.
- Preserve Dashboard Mode opening the mini Dashboard when enabled.
- Keep an always-available route from the Dashboard to Discord Quest Home.
- Preserve the tooltip and accessible name.
- Ensure the settings-bar element receives `quest-ui-settings-button`.
- Keep state classes on the rendered clickable element.
- Do not introduce an unnecessary wrapper around `TopBarButton`.
- Ensure the button is not duplicated after a re-render.
- Preserve compatibility with Vencord's `GameActivityToggle`.

When modifying colored Quest Home counters:

- Red represents enrollable Quests.
- Yellow represents enrolled Quests.
- Green represents completed Quests ready to claim.
- Blurple represents claimed Quests.
- Do not display a counter whose count is zero.
- Do not add duplicate counters after navigation or re-rendering.
- Keep Quest Home Counters independent of whether either QuestUI shortcut button is enabled.

When modifying Quest status calculation or normalization, preserve support for:

- Enrollable Quests.
- Enrolled Quests.
- Completed but unclaimed Quests.
- Claimed Quests.
- Expired Quests.
- Legacy `taskConfig` and current `taskConfigV2` shapes.
- Time-based status refresh.

When modifying Dashboard progress:

- Discord's native Quest completion selector is the source of truth for the progress ring and displayed completion text when available.
- Do not add an independent QuestUI heartbeat/progress clock, heartbeat simulator, or Orion-specific progress counter.
- Keep the local refresh path read-only; it may force React to re-evaluate local Discord state but must not increment progress itself or send farming/progress requests.
- Prefer Discord's native active-task selection before local compatibility fallback logic.
- Keep progress behavior the same whether OrionQuests is installed or not: QuestUI consumes resulting Discord Quest state rather than Orion dashboard counters.

### Manual Accept / Claim

- Every mutation requires an explicit user click.
- Keep all QuestUI manual action orchestration in `questActions.ts`.
- Re-read the Quest from `QuestsStore` immediately before mutation; do not trust a stale Dashboard card snapshot.
- Require complete current Quest configuration before mutation.
- Scope duplicate-action guards to current Discord account + Quest.
- Re-check account identity on QuestStore events **and at confirmation timeout**. An account switch must never become wrong-account success.
- Respect `questEnrollmentBlockedUntil`; a present malformed value fails closed.
- Treat malformed present Quest start/expiry/reward-expiry timestamps as unsafe and fail closed.
- Enrollment must reuse Discord's verified native enrollment action. Its finder must include `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`, with matching Stable/Canary reporter coverage.
- Pass `QUEST_HOME_DESKTOP` as the native enrollment `questContent`; let Discord's action build attribution/sealed metadata, own its duplicate guard, CAPTCHA path, Flux events, and QuestStore update.
- Validate the native enrollment result. Handle `success`, `captcha_failed`, `previous_in_flight_request`, and `unknown_error` explicitly; unfamiliar results fail closed.
- Do not silently fall back to a handcrafted REST enrollment request if the native finder breaks. Reporter/runtime failure must stay visible so the compatibility boundary is fixed instead of bypassed.
- Reward claiming must reuse the verified native Discord claim action while its finder remains reporter-covered.
- Keep the native Claim finder narrow: begin, success, failure, and `traffic_metadata_sealed` are all part of the verified lookup.
- In-game rewards require exactly one unambiguous configured platform. Unknown/malformed/ambiguous reward data fails closed and directs the user to Quest Home.
- Never solve or bypass CAPTCHA/challenges and never automatically retry them.
- Never optimistically mutate QuestStore.
- Successful or transport-ambiguous submissions may remain guarded only for a bounded hold.
- Surface success and failure; do not swallow rejected actions.

### OrionQuests global controls

- Detect `OrionQuests` through Vencord PluginManager, never a folder/path assumption.
- Validate Orion's registered `orion` command through Vencord Commands API and require exact plugin ownership plus the expected required `action` option with `start` and `stop`.
- Require the companion surface to expose `getEngineRunning`, `subscribeEngineRunning`, and `controlEngine(start|stop)`.
- Require Orion installed, enabled, lifecycle-started, command-valid, and companion-compatible before controls are callable.
- Re-check plugin/command/control identity immediately before invocation so a stale Dashboard cannot call a disabled/reloaded/replaced plugin.
- Use Orion's real engine-running state. Do not maintain or infer a QuestUI mirror flag.
- Subscribe to Orion's state notifications so Auto Start, enrollment-watcher starts, `/orion start|stop`, natural queue drain, and QuestUI Start/Stop clicks update the same control immediately.
- Render one icon-only control immediately left of Filter: **▶ Start All** when stopped, **■ Stop All** when running. Keep accessible labels/tooltips.
- Delegate Start/Stop to Orion's watcher-aware companion control path rather than invoking the slash-command callback.
- Do not require or fabricate a Discord channel for Dashboard Start/Stop. The companion path exists specifically so non-chat views can control Orion without emitting a Clyde command response.
- Do not enable/disable Orion itself as Start/Stop behavior.
- Do not describe Start as Resume or Stop as Pause. Pause/resume are separate, currently unimplemented capabilities.
- Use a module-level cross-Dashboard lock plus component pending state to prevent duplicate calls.
- Do not add per-Quest Orion controls while no stable public per-Quest surface exists.
- Never mutate Orion auto-enroll, enrollment watcher configuration, concurrency, farming, achievement bypass, auto-claim, or activity-hiding settings.

When modifying Quest artwork or Orb presentation:

- Quest asset values are Discord asset keys, not direct URLs. Resolve them through Discord's native Quest asset helper.
- Reuse Discord's native Orb component rather than maintaining a copied Orb asset URL.
- Keep generic task artwork only as a fallback when Discord does not provide or load Quest artwork.

QuestUI settings that control patches (`Top Bar Button`, `Settings Bar Button`, and `Quest Home Counters`) require a Discord restart. Runtime Dashboard/Detailed Status/filter/manual-action/Orion-control settings do not. Do not diagnose a setting as broken without checking whether it is patch-related and accounting for `restartNeeded`.

## Discord patch and webpack rules

Discord internals are unstable. Treat every matcher and webpack lookup as a compatibility boundary.

- Prefer meaningful properties and identifiable code fragments.
- Avoid minified CSS module keys.
- Avoid broad lookups that may resolve an unrelated component.
- Do not replace an exact Flux store lookup with a less specific property lookup without a verified reason.
- Keep patch alternatives that support coexistence with built-in Vencord plugins.
- Document why a matcher should remain stable across Discord builds.

When adding, changing, or removing a Discord webpack lookup, inspect `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups QuestUI actually performs, including native Quest progress/task selection, asset, Orb-component, native Enroll, and native Claim lookups.

A removed lookup must not leave a stale reporter signature. A new lookup must not be left without reporter coverage. Vencord PluginManager/Commands API imports are not Discord webpack finders and do not need reporter signatures.

## Verification

For every source-code change, run:

```bash
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

CI must additionally pass the current-upstream Orion companion build/type-check plus Discord Stable and Canary reporter jobs before compatibility is called green. Do not increase reporter timeouts to hide a hang.

Automated tests/build/reporter output do not substitute for a real Discord mutation or Orion lifecycle test. Never claim live verification that did not happen.

For UI changes, also verify the affected interface in a real Discord client when possible.

Settings-bar shortcut changes should verify:

- The button is visible.
- With Dashboard Mode off, click navigation reaches `/quest-home`.
- With Dashboard Mode on, clicking opens the Dashboard.
- Tooltip text exists.
- The rendered element has an accessible name.
- `quest-ui-settings-button` reaches the DOM.
- State classes reach the same rendered element.
- `GameActivityToggle` can remain enabled beside QuestUI.

Top-bar shortcut changes should verify:

- With Dashboard Mode off, click navigation reaches `/quest-home`.
- With Dashboard Mode on, clicking opens the Dashboard.
- Tooltip state text remains correct.
- Attention status remains visible.
- Settings-bar-only classes are not applied.

Dashboard changes should verify when relevant:

- Quest cards update while the Dashboard remains open.
- Discord Quest Home and QuestUI show the same progress ring text for an active Quest.
- Quest artwork resolves when Discord provides an asset, with generic artwork only as fallback.
- The Filter button opens a floating popout rather than reflowing the Dashboard.
- Recommended/Clear all and status/reward/task-type filters update immediately.
- Expiry text remains visible below the progress ring and uses the intended urgency color.
- The custom scrollbar remains visible while hovered/dragged and does not show native arrow buttons.
- `Open Quest Home` remains available from the Dashboard.
- Eligible Nitro Orb rewards display the adjusted amount without altering the normalized base reward.

Manual Quest-action changes should verify when suitable live Quests exist:

- Exactly one native action invocation per explicit click.
- Enrollment blocks are rejected before mutation.
- Malformed safety timestamps fail closed.
- Native enrollment duplicate/CAPTCHA/unknown results are handled without REST fallback or automatic retry.
- Ambiguous in-game reward targets fail closed.
- Challenge/CAPTCHA failures remain visible with no bypass/retry.
- Account switch while pending cannot produce wrong-account success.
- Store-confirmed actions transition normally.
- Unconfirmed successful/transport-ambiguous submissions unlock only after the bounded guard.
- QuestStore listeners/timers are cleaned after confirmation/timeout, including synchronous registration edge cases.

Orion global-control changes should verify when a compatible Orion build is available:

- Absent Orion: setting hidden and Dashboard unaffected.
- Installed but disabled/not-started/command-incompatible/companion-incompatible Orion: no callable control.
- Stopped engine renders only **▶ Start All**; running engine renders only **■ Stop All**.
- Auto Start, enrollment-watcher start, `/orion start`, `/orion stop`, natural queue drain, and QuestUI Start/Stop all update the button from Orion's same real engine state.
- **▶** uses Orion's normal watcher-aware start path.
- **■** uses Orion's normal stop path, including Orion-owned watcher/cleanup behavior.
- Start/Stop works from non-chat Discord views with no synthetic channel context.
- Plugin/command/control replacement or plugin disable while Dashboard is open fails safely at click time.
- Duplicate global calls are blocked.
- No Orion TaskRunner/Traffic/Patcher/farming source import is required.

Detailed Status changes should verify:

- Priority remains In Progress, then Ready to Claim, then Available.
- The badge number belongs to the displayed priority state.
- Dashboard scope and custom scope filtering behave as configured.
- Detailed Status is disabled when both QuestUI shortcut buttons are disabled.
- The badge remains visibly smaller than the Quest icon and custom Discord backgrounds do not add a dark frame.

Quest Home Counter changes should verify:

- Counters work even when both QuestUI shortcut buttons are disabled.
- Counters are added only to the intended Quest Home interface.
- Counters are not duplicated after navigation or re-rendering.

If a command fails because of an unrelated userplugin, report the exact failure and confirm whether any QuestUI file is involved. Do not modify an unrelated plugin to make the check pass.

## Documentation

Update `CHANGELOG.md` under `Unreleased` for:

- User-visible fixes.
- New user-visible features.
- Meaningful Discord or Vencord compatibility changes.

Do not create a release version unless the maintainer explicitly requests one.

Keep `README.md` focused on users and installation. Keep contributor workflow and implementation invariants in `CONTRIBUTING.md` and this guide.

## Issue and pull request safety

- Do not create an issue or pull request unless the user explicitly requests it.
- Before opening a pull request, ask whether the final diff has been reviewed by a human.
- If the user explicitly confirms that the final diff has been reviewed, open the pull request normally.
- If the user asks to proceed without review, or does not confirm review after being asked, add `AI_REVIEW_REQUIRED.txt` to the proposed changes containing exactly:

  `This pull request was generated automatically by AI and has not been reviewed by a human.`

- Never claim that a human reviewed the diff unless the user explicitly confirmed it.
- Do not remove or weaken this section unless the repository maintainer explicitly requests that exact change.