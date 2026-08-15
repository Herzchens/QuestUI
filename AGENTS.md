# QuestUI Agent Guide

These instructions apply to the entire repository.

QuestUI is a standalone Vencord userplugin that adds read-only Discord Quest interface features. Read `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` before making changes.

## Project boundaries

QuestUI may:

- Add or improve Quest-related user interface elements.
- Display Quest status, progress, reward, and expiry information already available in the Discord client.
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
  - Top-bar and settings-bar Quest shortcuts.
  - Basic and Detailed Status indicators.
  - Status tooltip and Quest Home counters.
  - Dashboard/open-Quest-Home click behavior.
- `QuestDashboard.tsx`
  - Mini Dashboard UI, card layout, filter popout, Quest artwork, reward presentation, expiry presentation, and native Discord progress integration.
- `questData.ts`
  - Shared Quest normalization, status classification, filtering, sorting, progress/task fallback data, and live QuestStore subscription.
- `settings.ts`
  - User-facing QuestUI settings and dependency/visibility rules.
- `stores.ts`
  - Lazy Discord Quest store resolution.
- `styles.css`
  - Quest button, Dashboard, card, filter, tooltip, and status styling.
- `scrollbar.css`
  - Final Dashboard scrollbar overrides for Windows/Electron behavior.
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
- Do not add an independent QuestUI progress clock, heartbeat simulator, or Orion-specific progress counter.
- Keep the local refresh path read-only; it may force React to re-evaluate local Discord state but must not increment progress itself or send Quest network requests.
- Prefer Discord's native active-task selection before local compatibility fallback logic.
- Keep behavior the same whether OrionQuests is installed or not: QuestUI consumes the resulting Discord Quest state rather than Orion's own dashboard counters.

When modifying Quest artwork or Orb presentation:

- Quest asset values are Discord asset keys, not direct URLs. Resolve them through Discord's native Quest asset helper.
- Reuse Discord's native Orb component rather than maintaining a copied Orb asset URL.
- Keep generic task artwork only as a fallback when Discord does not provide or load Quest artwork.

QuestUI settings that control patches (`Top Bar Button`, `Settings Bar Button`, and `Quest Home Counters`) require a Discord restart. Runtime Dashboard/Detailed Status/filter settings do not. Do not diagnose a setting as broken without checking whether it is patch-related and accounting for `restartNeeded`.

## Discord patch and webpack rules

Discord internals are unstable. Treat every matcher and webpack lookup as a compatibility boundary.

- Prefer meaningful properties and identifiable code fragments.
- Avoid minified CSS module keys.
- Avoid broad lookups that may resolve an unrelated component.
- Do not replace an exact Flux store lookup with a less specific property lookup without a verified reason.
- Keep patch alternatives that support coexistence with built-in Vencord plugins.
- Document why a matcher should remain stable across Discord builds.

When adding, changing, or removing a webpack lookup, inspect `scripts/checkQuestUIReporter.mjs`.

Keep `WEBPACK_FIND_SIGNATURES` synchronized with the lookups QuestUI actually performs, including native Quest progress, asset, and Orb-component lookups used by the Dashboard.

A removed lookup must not leave a stale reporter signature. A new lookup must not be left without reporter coverage.

## Verification

For every source-code change, run:

```bash
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

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

Detailed Status changes should verify:

- Priority remains In Progress, then Ready to Claim, then Available.
- The badge number belongs to the displayed priority state.
- Dashboard scope and custom scope filtering behave as configured.
- Detailed Status is disabled when both QuestUI shortcut buttons are disabled.

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
