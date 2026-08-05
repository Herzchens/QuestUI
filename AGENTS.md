# QuestUI Agent Guide

These instructions apply to the entire repository.

QuestUI is a standalone Vencord userplugin that adds read-only Discord Quest interface features. Read `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` before making changes.

## Project boundaries

QuestUI may:

- Add or improve Quest-related user interface elements.
- Display Quest status information.
- Navigate to Discord's Quest Home.
- Improve accessibility, compatibility, installation, and documentation.
- Improve Vencord patches, webpack lookups, and compatibility checks.

QuestUI must not:

- Enroll in Quests.
- Complete Quests.
- Claim Quest rewards.
- Spoof running games or application streams.
- Automate Quest progress.
- Send Quest-related network requests.
- Become a combined QuestUI and OrionQuests implementation.

Preserve QuestUI as a read-only interface plugin unless the maintainer explicitly approves a project-scope change.

## Repository map

- `index.tsx`
  - Plugin metadata.
  - Vencord patches.
  - Component insertion points.
- `QuestButton.tsx`
  - Top-bar and settings-bar Quest buttons.
  - Quest status calculation.
  - Status counters and tooltips.
  - Quest Home navigation.
- `settings.ts`
  - User-facing QuestUI settings.
- `stores.ts`
  - Lazy Discord Quest store resolution.
- `styles.css`
  - Quest button state styles and settings-bar sizing.
- `scripts/checkQuestUIReporter.mjs`
  - Validates Vencord patch-reporter output.
  - Tracks QuestUI webpack lookup signatures.
- `.github/workflows/compatibility.yml`
  - Clean Vencord build and type-check.
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
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

Do not run package installation from inside the QuestUI directory.

The full Discord Stable and Canary reporter jobs run in GitHub Actions. Do not attempt to reproduce those jobs locally unless the user explicitly requests it.

## Change discipline

- Inspect the current implementation before editing.
- Make the smallest change that fully solves the requested problem.
- Do not combine unrelated refactors with a bug fix.
- Do not silently change project scope.
- Do not modify documentation or credits unless the task requires it.
- Preserve user-facing behavior that is unrelated to the requested change.
- Do not remove compatibility handling merely because it appears redundant.
- Explain any matcher or webpack lookup change in the resulting pull request.
- Never force-push `main`.
- Never push directly to `main`.
- Do not merge a pull request without explicit maintainer approval.

Before editing a file, check whether the working tree contains unrelated changes. Treat unknown changes as belonging to another contributor or agent.

## UI implementation rules

Use Vencord and React components rather than raw DOM manipulation.

When modifying the top-bar or settings-bar Quest button:

- Preserve navigation through `NavigationRouter.transitionTo("/quest-home")`.
- Preserve the tooltip and accessible name.
- Ensure the settings-bar element receives `quest-ui-settings-button`.
- Keep state classes on the rendered clickable element.
- Do not introduce an unnecessary wrapper around `TopBarButton`.
- Ensure the button is not duplicated after a re-render.
- Preserve compatibility with Vencord's `GameActivityToggle`.

When modifying colored counters:

- Red represents enrollable Quests.
- Yellow represents enrolled Quests.
- Green represents completed Quests ready to claim.
- Blurple represents claimed Quests.
- Do not display a counter whose count is zero.
- Do not add duplicate counters after navigation or re-rendering.

When modifying Quest status calculation, preserve support for:

- Enrollable Quests.
- Enrolled Quests.
- Completed but unclaimed Quests.
- Claimed Quests.
- Expired Quests.
- Time-based status refresh.

QuestUI patch-related settings require a Discord restart. Do not diagnose a patch setting as broken without accounting for `restartNeeded`.

## Discord patch and webpack rules

Discord internals are unstable. Treat every matcher and webpack lookup as a compatibility boundary.

- Prefer meaningful properties and identifiable code fragments.
- Avoid minified CSS module keys.
- Avoid broad lookups that may resolve an unrelated component.
- Do not replace an exact Flux store lookup with a less specific property lookup without a verified reason.
- Keep patch alternatives that support coexistence with built-in Vencord plugins.
- Document why a matcher should remain stable across Discord builds.

When adding, changing, or removing a webpack lookup, inspect `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups QuestUI actually performs.

A removed lookup must not leave a stale reporter signature. A new lookup must not be left without reporter coverage.

## Verification

For every source-code change, run:

```bash
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

For UI changes, also verify the affected interface in a real Discord client when possible.

Settings-bar changes should verify:

- The button is visible.
- Click navigation works.
- Tooltip text exists.
- The rendered element has an accessible name.
- `quest-ui-settings-button` reaches the DOM.
- State classes reach the same rendered element.
- `GameActivityToggle` can remain enabled beside QuestUI.

Top-bar changes should verify:

- Click navigation works.
- Tooltip state text remains correct.
- Attention status remains visible.
- Settings-bar-only classes are not applied.

If a command fails because of an unrelated userplugin, report the exact failure and confirm whether any QuestUI file is involved. Do not modify an unrelated plugin to make the check pass.

## Documentation

Update `CHANGELOG.md` under `Unreleased` for:

- User-visible fixes.
- New user-visible features.
- Meaningful Discord or Vencord compatibility changes.

Do not create a release version unless the maintainer explicitly requests one.

Keep `README.md` focused on users and installation. Keep contributor workflow details in `CONTRIBUTING.md`.

## Issue and pull request safety

- Do not create an issue or pull request unless the user explicitly requests it.
- Before opening a pull request, ask whether the final diff has been reviewed by a human.
- If the user explicitly confirms that the final diff has been reviewed, open the pull request normally.
- If the user asks to proceed without review, or does not confirm review after being asked, add `AI_REVIEW_REQUIRED.txt` to the proposed changes containing exactly:

  `This pull request was generated automatically by AI and has not been reviewed by a human.`

- Never claim that a human reviewed the diff unless the user explicitly confirmed it.
- Do not remove or weaken this section unless the repository maintainer explicitly requests that exact change.
