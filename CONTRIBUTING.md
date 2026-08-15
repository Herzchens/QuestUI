# Contributing to QuestUI

Thank you for considering a contribution to QuestUI.

QuestUI is a standalone Vencord userplugin that provides read-only Discord Quest interface features, including Quest shortcuts, a live mini Dashboard, status indicators, filtering, and optional Quest Home counters.

## Project scope

Contributions that fit the current scope include:

- Quest-related user interface improvements.
- Dashboard, filtering, progress-display, reward-display, and accessibility improvements.
- Quest Home navigation.
- Quest status indicators and counters.
- Discord and Vencord compatibility fixes.
- Safer webpack lookups and patch matchers.
- Installation and update improvements.
- Documentation and compatibility CI.

QuestUI currently does not:

- Enroll in quests.
- Complete quests.
- Claim quest rewards.
- Spoof running games or application streams.
- Automate quest progress.
- Send quest-related network requests.

Feature requests that would change this scope may still be discussed, but they should explain why the functionality belongs in QuestUI rather than in a quest automation plugin.

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
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

The repository CI also performs:

- A clean Vencord build.
- A Vencord TypeScript check.
- QuestUI bundle verification.
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

When adding, replacing, or removing a webpack lookup in `QuestButton.tsx`, `QuestDashboard.tsx`, `stores.ts`, or another source file, review `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups that QuestUI actually performs. This includes Dashboard lookups for Discord's native Quest completion selector, themed Quest asset resolver, and Orb component. A stale signature cannot detect a failure for a lookup that no longer exists, while a missing signature leaves a current lookup without reporter coverage.

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

### Detailed Status changes

Verify that:

- Priority remains In Progress, then Ready to Claim, then Available.
- The numeric badge count belongs to the state whose color is displayed.
- The tooltip still reports the full attention breakdown.
- Same-as-Dashboard scope and Custom filters behave as configured.
- Detailed Status is disabled when both QuestUI shortcut buttons are disabled.

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

Dashboard Mode, Detailed Status, and filter changes are runtime settings and should update without a Discord restart. If both shortcut buttons are disabled, Dashboard Mode and Detailed Status are intentionally locked while Quest Home Counters remain independent.

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

Keep pull requests focused. Avoid combining unrelated refactors, features, and documentation changes unless they are necessary parts of the same fix.

## Responsibility for submitted changes

Contributors are responsible for understanding the code they submit.

You should be able to:

- Explain the implementation.
- Respond to review feedback.
- Update the contribution when Discord or Vencord behavior has been misunderstood.
- Correct or revert the change if it introduces a regression.

By submitting a contribution, you agree that it may be distributed under QuestUI's existing license.
