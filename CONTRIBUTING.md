# Contributing to QuestUI

Thank you for considering a contribution to QuestUI.

QuestUI is a standalone Vencord userplugin that provides Discord Quest interface features, including Quest shortcuts, a live mini Dashboard, explicit user-click Accept/Claim actions, optional global OrionQuests controls, status indicators, filtering, and optional Quest Home counters.

## Project scope

Contributions that fit the current scope include:

- Quest-related user interface improvements.
- Dashboard, filtering, progress-display, reward-display, and accessibility improvements.
- Quest Home navigation.
- Quest status indicators and counters.
- Explicit user-click Quest enrollment and reward claiming through Discord's verified native actions.
- Optional global Orion controls that use Orion's narrow companion state/control surface while leaving farming logic owned by Orion.
- Discord and Vencord compatibility fixes.
- Safer webpack lookups and patch matchers.
- Installation and update improvements.
- Documentation and compatibility CI.

QuestUI currently does not:

- Automatically enroll in quests.
- Complete quests or generate quest progress.
- Automatically claim quest rewards.
- Spoof running games or application streams.
- Generate Quest heartbeats, video progress, activity progress, or achievement progress.
- Bypass Discord verification or challenges.
- Replace a verified native Enroll/Claim action with a handcrafted direct REST mutation just to avoid a compatibility failure.
- Import or reimplement Orion farming internals.
- Modify Orion settings or use plugin enable/disable as an engine-control substitute.
- Provide per-Quest Orion controls while current Orion lacks a stable public per-Quest control surface.
- Provide pause/resume through the current Orion bridge; `start` and `stop` must not be relabeled as those different operations.

The maintainer has approved the narrow manual Accept/Claim scope and the global Orion companion-control bridge. Other feature requests that would change scope should explain why the functionality belongs in QuestUI rather than in a Quest automation plugin.

## Before starting

Search existing issues and pull requests before beginning work.

For substantial features, architectural changes, or changes to the project scope, open an enhancement issue first. This allows the implementation and expected behavior to be discussed before significant work is done.

Small bug fixes, compatibility fixes, accessibility improvements, and documentation corrections may be submitted directly when the problem and solution are clear.

## Development setup

QuestUI does not have a standalone package manifest. It is built and type-checked as a Vencord userplugin inside a Vencord source checkout.

Fork QuestUI, then clone your fork into Vencord's userplugins directory:

```bash
cd Vencord/src/userplugins
git clone https://github.com/<username>/QuestUI.git
cd ../..
```

Install the Vencord dependencies:

```bash
pnpm install --frozen-lockfile
```

Create a branch for your work:

```bash
cd src/userplugins/QuestUI
git switch -c fix/short-description
cd ../../..
```

Use a descriptive branch name such as:

```text
fix/settings-bar-tooltip
feat/quest-status-display
docs/installation-guide
ci/reporter-validation
```

## Automated validation

Run these commands from the Vencord repository root:

```bash
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

The repository CI also performs:

- A clean Vencord build.
- A Vencord TypeScript check.
- QuestUI bundle verification.
- A second build/type-check with current upstream `nyxxbit/discord-quest-completer` installed beside QuestUI.
- Reporter parser validation.
- Discord Stable patch-reporter validation.
- Discord Canary patch-reporter validation.

Contributors are not expected to reproduce the full Stable and Canary reporter workflow locally.

If `pnpm testTsc` reports errors from unrelated userplugins in an existing local checkout, include that information in the pull request and confirm that none of the reported files belong to QuestUI.

## Discord matchers and webpack lookups

QuestUI depends on Discord internals, so matcher changes require particular care.

When working with patches or webpack lookups:

- Prefer stable code fragments, meaningful properties, or identifiable component behavior.
- Avoid relying on minified CSS module keys when a safer matcher is available.
- Avoid raw DOM manipulation when the same result can be achieved through React components or Vencord patches.
- Keep matchers narrow enough to avoid resolving unrelated Discord components.
- Explain why a new matcher is expected to remain stable across Discord builds.
- Do not broaden a matcher merely to make a build or reporter pass.

When adding, replacing, or removing a webpack lookup in `QuestButton.tsx`, `QuestDashboard.tsx`, `questActions.ts`, `stores.ts`, or another source file, review `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups that QuestUI actually performs. This includes Dashboard lookups for Discord's native Quest completion selector, themed Quest asset resolver, Orb component, native Enroll action, and native Claim action. The Enroll finder uses `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`; the Claim finder uses its verified begin/success/failure fragments plus `traffic_metadata_sealed`. A stale signature cannot detect a failure for a lookup that no longer exists, while a missing signature leaves a current lookup without reporter coverage.

Vencord PluginManager and Commands API imports are ordinary Vencord APIs, not Discord webpack finders, and therefore do not get reporter signatures.

## Progress and Quest data invariants

QuestUI should mirror Discord's Quest state rather than inventing a second progress pipeline.

When changing progress or task-selection logic:

- Use Discord's native Quest completion selector for the Dashboard progress ring and displayed completion text when available.
- Do not add an independent QuestUI heartbeat/progress clock or consume Orion's private dashboard counter as a second source of truth.
- Keep the local refresh path read-only; it may trigger React re-evaluation but must not advance progress itself.
- Prefer Discord's native active-task selection before a local compatibility fallback.
- Prefer `taskConfigV2` over the legacy task config instead of merging both schemas into duplicate tasks.
- Verify the same behavior with OrionQuests installed and absent where the change touches shared Quest state.

When changing Quest artwork or reward presentation:

- Treat Discord Quest asset fields as asset keys and resolve them through Discord's native Quest asset helper.
- Reuse Discord's native Orb component rather than copying an Orb URL or image into QuestUI.
- Keep normalized base reward data separate from presentation-only Nitro Orb adjustments.

## Manual Accept / Claim invariants

Manual Quest mutations are intentionally narrow:

- Require an explicit click for every action.
- Keep manual action orchestration in `questActions.ts`.
- Re-read current Quest state immediately before mutation and require complete Quest configuration.
- Scope duplicate guards to Discord account + Quest.
- Re-check account identity on QuestStore events and at the wait timeout; never report wrong-account success.
- Respect both Discord's account-level Quest-access suspension and `questEnrollmentBlockedUntil`; malformed present safety state fails closed.
- Malformed present Quest start/expiry/reward-expiry timestamps fail closed.
- Enrollment must reuse Discord's native action identified by `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`.
- Pass Discord's Quest Home desktop location as `questContent` and let the native action own attribution/sealed metadata, duplicate suppression, CAPTCHA handling, Flux events, and QuestStore updates.
- Validate native enrollment results explicitly: `success`, `captcha_failed`, `previous_in_flight_request`, and `unknown_error`; unfamiliar shapes fail closed.
- Never add a silent handcrafted REST fallback when a native action finder fails. Fix the compatibility boundary and reporter instead.
- Claim must reuse the verified native Discord claim action while its finder remains reporter-covered.
- In-game rewards require exactly one unambiguous configured platform. Unknown, malformed, or ambiguous reward data fails closed.
- Never bypass CAPTCHA/challenges or automatically retry them. A recognized verification cancellation is an explicit failure and must not be presented as a successful `Sent` state.
- Never optimistically mutate QuestStore.
- Keep bounded duplicate protection after successful or transport-ambiguous submissions Discord has not reflected in QuestStore yet.
- Listener registration/teardown must remain leak-safe even if a store invokes a callback synchronously during registration.
- Show success/failure; do not swallow errors.

## Orion global-control invariants

Orion integration is optional and must disappear or fail safely when Orion is unavailable or does not expose the expected companion surface.

- Discover `OrionQuests` through Vencord PluginManager, never a folder/path assumption.
- Continue validating Orion's registered `orion` command identity through Vencord Commands API so QuestUI does not attach to an unrelated plugin object.
- Require the registered command to be the exact object declared by OrionQuests, be owned by `OrionQuests`, and expose the expected required string `action` option with `start` and `stop` choices.
- Require the companion surface to expose real `getEngineRunning`, `subscribeEngineRunning`, and watcher-aware `controlEngine(start|stop)` methods.
- Require Dashboard Mode and Orion installed/enabled/lifecycle-started before the control is usable.
- Re-check plugin/command/control identity immediately before execution so an already-open Dashboard cannot call a disabled/reloaded/replaced Orion object.
- Use Orion's real engine state; never create a QuestUI running-state mirror or infer running state from a click.
- Subscribe to Orion's runtime state notifications so Auto Start, enrollment-watcher starts, `/orion start|stop`, natural queue drain, and QuestUI control clicks all update the same smart button.
- Render one icon-only control immediately left of Filter: **▶ Start All** when stopped and **■ Stop All** when running. Keep accessible labels/tooltips.
- Delegate Start/Stop to Orion's companion control path, which must preserve the same `ensureStart`/`ensureStop` watcher and cleanup semantics as Orion's slash command.
- The Dashboard control must not require a selected chat channel; do not fabricate a channel merely to satisfy slash-command output.
- Do not describe `start` as Resume or `stop` as Pause. Pause/resume are separate, currently unimplemented capabilities.
- Use a module-level cross-Dashboard lock plus component pending state to prevent duplicate calls.
- Do not touch Orion auto-enroll, watcher configuration, concurrency, farming, bypass, claim, or activity settings.
- Do not implement per-Quest controls until a stable public per-Quest surface exists and the maintainer approves it.

## Manual testing

Only test the areas affected by your change, but include enough evidence to show that the change works in a real Discord client.

### Top-bar shortcut changes

Verify that:

- The button appears in Discord's top bar.
- With Dashboard Mode disabled, clicking reaches `/quest-home`.
- With Dashboard Mode enabled, clicking opens the mini Dashboard.
- The tooltip contains the expected Quest status.
- Basic/Detailed Status appears only as configured.
- The top-bar button does not receive settings-bar-only classes.

### Settings-bar shortcut changes

Verify that:

- The button appears beside mute, deafen, and settings.
- With Dashboard Mode disabled, clicking reaches `/quest-home`.
- With Dashboard Mode enabled, clicking opens the mini Dashboard.
- The button has a tooltip.
- The rendered element has an accessible name.
- The `quest-ui-settings-button` class reaches the rendered element.
- The button is not duplicated after a re-render.
- QuestUI still coexists with Vencord's `GameActivityToggle` when that plugin is enabled.

### Dashboard changes

Verify the affected behavior, including where relevant:

- An already-open Dashboard updates when Quest state changes.
- Active Quest progress text matches Discord Quest Home at the same moment.
- Multi-option/multi-platform Quests use the task Discord selected.
- Quest artwork loads through Discord's asset resolver, with generic artwork only as a fallback.
- The task-type micro badge remains visible over artwork.
- The Filter button opens a floating popout and does not reflow the Dashboard.
- Filter active-state count, Recommended, and Clear all behave as expected.
- Expiry text remains visible below the progress ring and changes urgency color appropriately.
- The scrollbar thumb remains visible during hover/drag and native arrow buttons do not appear.
- `Open Quest Home` remains reachable.
- Eligible Nitro Orb rewards display the adjusted amount, while ineligible/base rewards remain unchanged.

### Manual Quest-action changes

Verify where suitable Quests/accounts are available:

- Exactly one native action invocation is made per explicit click.
- Account-level Quest-access suspension and enrollment blocks are rejected before mutation.
- Malformed safety timestamps fail closed.
- Native enrollment duplicate/CAPTCHA/unknown results are handled without REST fallback or automatic retry.
- Ambiguous in-game reward platforms fail closed.
- CAPTCHA/challenge cancellation stays a failure and does not show `Sent`.
- Switching accounts while a request waits cannot produce a wrong-account success result.
- Store-confirmed actions transition normally.
- Successful-but-unconfirmed or transport-ambiguous submissions stay guarded only for the bounded hold.
- QuestStore listeners and timers clean up on confirmation/timeout, including synchronous-registration edge cases.

### Orion global-control changes

Verify that:

- Orion absent hides the setting and leaves Dashboard behavior unchanged.
- Orion installed but disabled/not-started/command-incompatible/companion-incompatible has no callable control.
- Orion stopped shows only **▶ Start All**; Orion running shows only **■ Stop All**.
- Auto Start, enrollment-watcher starts, `/orion start`, `/orion stop`, natural queue drain, and QuestUI control clicks update the button from the same real engine state.
- **▶** uses Orion's normal watcher-aware start path.
- **■** uses Orion's normal stop path, including Orion-owned cleanup/watcher behavior.
- Start/Stop works from non-chat Discord views without fabricating a channel.
- Neither control state is presented as Resume/Pause.
- Disabling/reloading/replacing Orion while a Dashboard is open makes a stale control fail safely.
- Duplicate global control calls are blocked.
- No Orion TaskRunner/Traffic/Patcher/farming source import is required.

### Detailed Status changes

Verify that:

- Priority remains In Progress, then Ready to Claim, then Available.
- The numeric badge count belongs to the state whose color is displayed.
- The tooltip still reports the full attention breakdown.
- Same-as-Dashboard scope and Custom filters behave as configured.
- Detailed Status is disabled when both QuestUI shortcut buttons are disabled.
- The Detailed Status badge remains visibly smaller than the Quest icon and custom Discord backgrounds do not add a dark frame.

### Quest Home Counter changes

Verify that:

- Counters work even when both QuestUI shortcut buttons are disabled.
- Counters are added only to the intended Quest Home interface.
- Counters are not duplicated after navigation or re-rendering.
- Enrollable quests use the danger color.
- Enrolled quests use the warning color.
- Claimable quests use the positive color.
- Claimed quests use the blurple color.
- Disabling the setting removes the counters after Discord restarts.

### Quest status changes

Test the affected status categories where possible:

- Enrollable.
- Enrolled and in progress.
- Completed and ready to claim.
- Claimed.
- Expired.

Also check time-based behavior if the change affects expiry or periodic status refresh.

### Settings changes

Only patch-related settings require a Discord restart:

- Top Bar Button.
- Settings Bar Button.
- Quest Home Counters.

Dashboard Mode, Detailed Status, filter changes, manual Quest actions, and Orion global controls are runtime behavior and should update without a Discord restart. If both shortcut buttons are disabled, Dashboard Mode and Detailed Status are intentionally locked while Quest Home Counters remain independent.

## Documentation and changelog

Update documentation when a change affects:

- Installation.
- Update instructions.
- Supported installation methods.
- Settings.
- User-visible behavior.
- Compatibility expectations.

Add user-visible changes and compatibility fixes to the `Unreleased` section of `CHANGELOG.md`.

Small wording corrections, internal housekeeping, and repository-only community files generally do not require a changelog entry.

Do not create a new release version unless the maintainer has requested it.

## Commit messages

Clear commit messages are preferred.

The repository commonly uses prefixes such as:

```text
fix:
feat:
docs:
ci:
chore:
```

Examples:

```text
fix: preserve settings-bar tooltip and accessibility
docs: clarify Orion devbuild installation
ci: monitor the new webpack lookup
```

These prefixes are recommended but are not enforced as a strict contribution requirement.

## Pull requests

A pull request should explain:

- The problem being addressed.
- The cause, when known.
- The implementation used to solve it.
- Any important behavior intentionally left unchanged.
- The automated checks that were run.
- The Discord channel or client used for manual testing.
- Any known compatibility risks.

For visual, interaction, or accessibility changes, include appropriate evidence such as:

- Screenshots.
- A short video.
- Relevant DOM output.
- Accessible-name or tooltip verification.
- Before-and-after behavior.

For Dashboard/progress changes, also describe whether the implementation reuses Discord's native Quest selectors/helpers and identify any new webpack lookup added to reporter coverage.

For manual Quest actions, document the native action path and challenge behavior that were verified. For Orion controls, distinguish companion-surface/build verification from a real farming-lifecycle test.

Keep pull requests focused. Avoid combining unrelated refactors, features, and documentation changes unless they are necessary parts of the same fix.

## Responsibility for submitted changes

Contributors are responsible for understanding the code they submit.

You should be able to:

- Explain the implementation.
- Respond to review feedback.
- Update the contribution when Discord or Vencord behavior has been misunderstood.
- Correct or revert the change if it introduces a regression.

By submitting a contribution, you agree that it may be distributed under QuestUI's existing license.