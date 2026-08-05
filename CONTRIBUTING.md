# Contributing to QuestUI

Thank you for considering a contribution to QuestUI.

QuestUI is a standalone Vencord userplugin that provides read-only Discord Quest interface features, including Quest Home shortcuts, status indicators, and optional colored counters.

## Project scope

Contributions that fit the current scope include:

- Quest-related user interface improvements.
- Accessibility improvements.
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

When adding, replacing, or removing a webpack lookup in `QuestButton.tsx`, `stores.ts`, or another source file, review `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups that QuestUI actually performs. A stale signature cannot detect a failure for a lookup that no longer exists, while a missing signature leaves a current lookup without reporter coverage.

## Manual testing

Only test the areas affected by your change, but include enough evidence to show that the change works in a real Discord client.

### Top-bar button changes

Verify that:

- The button appears in Discord's top bar.
- Clicking the button opens `/quest-home`.
- The tooltip contains the expected quest status.
- The status dot appears only when attention is required.
- The top-bar button does not receive settings-bar-only classes.

### Settings-bar button changes

Verify that:

- The button appears beside mute, deafen, and settings.
- Clicking the button opens `/quest-home`.
- The button has a tooltip.
- The rendered element has an accessible name.
- The `quest-ui-settings-button` class reaches the rendered element.
- The button is not duplicated after a re-render.
- QuestUI still coexists with Vencord's `GameActivityToggle` when that plugin is enabled.

### Colored counter changes

Verify that:

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

QuestUI settings that modify patches require a Discord restart. Restart Discord before concluding that a patch-related setting is not working.

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

Keep pull requests focused. Avoid combining unrelated refactors, features, and documentation changes unless they are necessary parts of the same fix.

## Responsibility for submitted changes

Contributors are responsible for understanding the code they submit.

You should be able to:

- Explain the implementation.
- Respond to review feedback.
- Update the contribution when Discord or Vencord behavior has been misunderstood.
- Correct or revert the change if it introduces a regression.

By submitting a contribution, you agree that it may be distributed under QuestUI's existing license.
