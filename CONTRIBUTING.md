# Contributing to QuestUI

Thanks for helping improve QuestUI. Keep changes focused, evidence-backed, and within the project boundaries below.

Read `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `docs/RELEASES.md` before changing behavior, compatibility contracts, or release metadata. `AGENTS.md` is the authoritative reference for detailed implementation invariants across all subsystems.

## Scope

QuestUI is a standalone Vencord userplugin. It may improve Discord Quest UI across its six built-in themes and Graphics/Reduced Motion presets, perform explicit user-authorized native Accept/Claim actions including dynamic filtered **Accept All / Claim All**, request Discord's native Quest-list refresh (including scheduled background refresh), display native Orb/runtime metadata, provide account-scoped Ignore/Unignore presentation preferences, provide sanitized QuestUI/Orion diagnostics, send local Vencord/native desktop notifications, present an account-scoped Event Log-backed Notification Center, optionally delegate controls to a separately installed compatible OrionQuests companion, and update supported official source checkouts through the explicit managed-update flows.

Do not turn QuestUI into a Quest farming engine. Do not add automatic enrollment/claim, progress spoofing, heartbeats, targeted quest execution, challenge bypasses, private Orion farming imports, or a companion-bot/backend/DM requirement just to deliver QuestUI notifications.

## Development setup

Place the repository at:

```text
Vencord/src/userplugins/QuestUI
```

`.github/workflows/compatibility.yml` is the authoritative full CI matrix (currently 45 test files across `tests/`, plus theme-contract, generated-asset, Vencord build/type-check, upstream Orion coexistence, and Stable/Canary reporter gates).

Run baseline and focused checks from the Vencord root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test:ts
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
node src/userplugins/QuestUI/scripts/checkThemeContract.mjs --self-test
node src/userplugins/QuestUI/scripts/checkThemeContract.mjs
node src/userplugins/QuestUI/src/themes/obsidian/generateFractureAssets.mjs --check

# Focused examples (see .github/workflows/compatibility.yml for all 45 test files):
pnpm exec tsx src/userplugins/QuestUI/tests/quests/batchToolbar.test.ts
pnpm exec tsx src/userplugins/QuestUI/tests/quests/ignoredRuntime.test.ts
pnpm exec tsx src/userplugins/QuestUI/tests/orion/exclusionIntegration.test.ts
pnpm exec tsx src/userplugins/QuestUI/tests/dashboard/graphics.test.ts
node src/userplugins/QuestUI/tests/themes/graphicsVisual.test.mjs
```

Do not install packages inside QuestUI; it uses Vencord's toolchain.

## Change quality

- Inspect the current implementation before editing.
- Prove a bug or compatibility issue with source/runtime/test evidence before labelling it as confirmed.
- Prefer root-cause fixes over timers, state mirrors, fabricated contexts, or broad fallbacks.
- Keep source-of-truth state in Discord/Orion rather than duplicating it in QuestUI.
- Preserve unrelated behavior, account isolation, and persistence fail-closed boundaries.
- Remove dead branches/adapters created by a refactor.
- Keep final history logical; avoid `fix CI`, test-noise, or temporary commits when they can be cleaned before handoff.
- Do not weaken CI assertions just to make a check green; correct false-positive/brittle assertions at the layer they actually verify.

## Core behavioral guidelines

Detailed invariants for every subsystem live in `AGENTS.md`. Key contributor expectations:

- **Discord Quest state:** QuestStore/native selectors are authoritative; the 250 ms fallback refresh is render-only. Prefer `taskConfigV2` over legacy `taskConfig`.
- **Manual and batch actions:** Every mutation requires explicit user authorization. The toolbar batch control dynamically selects **Claim All** when claimable candidates exist and **Accept All** otherwise (disabled when empty), bounded to the active filters and excluding ignored/hidden Quests. Batch mutations share a synchronous module-global lock, pace sequential requests by 1-3 seconds, recheck account/eligibility, handle HTTP 429 / `Retry-After`, preserve partial confirmed results, and stop on verification or uncertainty without auto-retrying. Confirmed per-card enrollment may auto-start compatible idle Orion; batch Accept All does not.
- **Ignore / Unignore:** Applies to Available and In Progress Quests; claimed and expired Quests are pruned. Persistence (`src/quests/ignored/runtime.ts`, max 512 Quests per account and 32 accounts) happens first; QuestUI then attempts capability-detected native Orion exclusion sync (not yet implemented upstream) or reactive Pause enforcement (`src/orion/ignoreRuntime.ts`). A failed Orion Pause never reverts a persisted Ignore, and the reactive fallback cannot guarantee ignored work never briefly starts. Global/per-Quest Resume skips or blocks ignored Quests; Unignore never auto-resumes or auto-starts Orion.
- **Themes and Graphics:** Six standalone built-in themes (`Default`, `Liquid Glass`, `Obsidian`, `Sakura`, `Terminal`, `Origami`) own their managed CSS (`src/themes/registry.ts`). Graphics presets (`Light` = Low + Reduced Motion, `Low`, `Medium`, `High`, `Max` default, locked `Ultra` preview) are shared across themes, respect system `prefers-reduced-motion`, gate expensive artwork processing/caches, and never alter Quest or Orion functional behavior. A public custom-theme API and Quest Home theming are planned future work.
- **Notifications, Center, Event Log, and Reload:** Notifications use Vencord's Notifications API. Notification Center reuses sanitized Event Log events (including product-specific update availability/completion/failure and `QUEST_CLAIM_ALL_STOPPED`, while `QUEST_CLAIM_ALL_SUCCEEDED` stays diagnostic-only; `QUEST_ACCEPT_ALL_*` currently stay in Event Log only while individual `QUEST_ACCEPT_SUCCEEDED`/`FAILED` appear in Center). Event Log captures only QuestUI/recognized Orion output, redacts secrets, compacts `events.jsonl` from 10 MiB toward 5 MiB, and uses 250-row cursor pagination. Native Reload runs manually or via background auto-reload (default 5h).
- **Orion companion integration:** Consume only the explicit companion surface (`v4.10.7+` core controls, `v4.11.0+` optional `subscribeEvents()` and `getSchedulerSnapshot()` / `subscribeSchedulerState()`). Keep QuestUI and Orion source/license boundaries separate.

## Webpack / patch compatibility

Discord internals are unstable. Treat every finder/patch as a compatibility boundary:

- Prefer identifiable code fragments and meaningful properties; avoid broad minified-key lookups when safer anchors exist.
- Review `WEBPACK_FIND_SIGNATURES` whenever a Discord webpack lookup changes.
- Keep `scripts/checkQuestUIReporter.mjs` synchronized with lookup coverage; regression tests live under `tests/<feature>/`.

## Testing and release safety

Automated tests are necessary but not sufficient. Never represent CI or synthetic/headless-browser output as proof of live Discord runtime behavior. For relevant changes, manually verify affected Discord states and state clearly what was and was not tested.

- Keep both real-Git managed-updater suites fail-closed; do not describe Orion's lightweight/unsigned upstream tags as cryptographically verified, and do not remove the legacy root `version.ts` bridge.
- Never push or force-push `main`, and do not create issues, PRs, tags, or releases unless explicitly requested by the maintainer. Follow `AGENTS.md` PR-creation and human-review rules whenever creating a PR.
