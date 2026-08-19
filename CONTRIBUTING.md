# Contributing to QuestUI

Thank you for considering a contribution to QuestUI.

QuestUI is a standalone Vencord userplugin for Discord Quest shortcuts, a live mini Dashboard, explicit user-click Accept/Claim actions, Discord-native Quest-list refresh, optional OrionQuests companion controls, status indicators, filtering, and Quest Home counters.

## Project scope

Contributions that fit the current scope include:

- Quest-related UI, accessibility, filtering, reward/progress presentation, and navigation.
- Explicit user-click Quest enrollment and reward claiming through Discord's verified native actions.
- Discord-native Quest-list refresh through the client's own fetch-and-dispatch action.
- Optional Orion controls through a stable narrow companion surface while all farming logic remains owned by Orion.
- Compatibility fixes, safer webpack lookups/patches, installation, tests, CI, and documentation.

QuestUI does **not**:

- Generate Quest progress, heartbeats, video/activity/achievement progress, game spoofing, or stream spoofing.
- Automatically enroll or claim without the explicitly approved user-click path.
- Bypass CAPTCHA/challenges or silently retry failed manual mutations.
- Replace verified native Enroll/Claim/Quest-refresh actions with handcrafted REST fallbacks merely to make a compatibility failure disappear.
- Import/reimplement Orion farming internals or mutate Orion settings.
- Use plugin enable/disable as Orion Start/Stop.
- Treat Stop as Pause or implement targeted `startQuest` behavior.

The currently approved Orion companion scope includes engine Start/Stop, global Pause/Resume, exact-ID per-Quest Pause/Resume, and engine-wide Start from an enrolled card. Broader automation still requires maintainer approval.

## Before starting

Search existing issues and pull requests first. For substantial scope/architecture changes, discuss the behavior before writing a large implementation. Small bug fixes, compatibility fixes, accessibility work, and documentation corrections may be submitted directly when the problem and solution are clear.

## Development setup

QuestUI has no standalone package manifest. Clone it into a Vencord source checkout:

```bash
cd Vencord/src/userplugins
git clone https://github.com/<username>/QuestUI.git
cd ../..
pnpm install --frozen-lockfile
```

Create a focused branch inside the userplugin checkout and run all commands from the Vencord repository root.

## Automated validation

Run:

```bash
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionControlLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestReloadLogic.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

CI additionally performs clean Vencord builds/type-checks, bundle assertions, a current-upstream Orion build, a compatible pause/resume companion-fork build, reporter parser validation, and Discord Stable/Canary patch reporters. Do not claim those checks are green without inspecting their actual jobs.

If an existing local checkout fails because of an unrelated userplugin, report the exact failure and verify whether any QuestUI file is involved rather than modifying unrelated code.

## Discord matchers and webpack lookups

Discord internals are a compatibility boundary.

- Prefer stable code fragments, meaningful properties, and identifiable behavior.
- Avoid raw DOM manipulation when React/Vencord APIs solve the same problem.
- Keep finders narrow; do not broaden them just to make a reporter pass.
- Explain why new anchors are expected to remain stable.
- Keep `scripts/checkQuestUIReporter.mjs` synchronized with every QuestUI Discord webpack lookup.

Current reporter coverage includes the QuestStore resolver, native task/completion selectors, Quest asset resolver, Orb component, native Enroll, native Claim, and native current-Quest Reload finder (`QUESTS_FETCH_CURRENT_QUESTS_BEGIN`). Vencord PluginManager/Commands imports and current-user/profile access through `UserStore` / `UserProfileStore` are Vencord APIs rather than new Discord webpack finders. Reusing the already-reported native Quest-icon finder in another Dashboard presentation point does not require a duplicate reporter signature.

## Quest data and progress invariants

- Discord QuestStore/native selectors are the source of truth.
- Do not create a second QuestUI progress pipeline or consume Orion private counters as progress truth.
- Local periodic refresh is render-only.
- Prefer Discord's native active-task selection; prefer `taskConfigV2` over legacy `taskConfig` rather than merging duplicate schemas.
- Artwork must use Discord's native Quest asset resolver; Orb display should reuse Discord's native Orb component.
- Keep normalized base reward data separate from presentation-only Nitro multiplier display.

## Manual Accept / Claim invariants

- Every mutation requires an explicit click.
- Keep orchestration in `questActions.ts`.
- Re-read current Quest state immediately before mutation and require complete config.
- Scope duplicate guards to account + Quest and re-check account identity on events/timeouts.
- Respect Quest access suspension, enrollment blocks, and valid start/expiry/reward-expiry timestamps; malformed present safety state fails closed.
- Enrollment must reuse Discord's native action identified by `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`.
- Claim must reuse the verified native claim action containing begin/success/failure plus `traffic_metadata_sealed`.
- Never add a silent handcrafted REST fallback when a native finder breaks.
- Never bypass or auto-retry CAPTCHA/challenges.
- Never optimistically mutate QuestStore.
- Keep bounded duplicate protection after successful or transport-ambiguous submissions not yet reflected by Discord.
- Listener registration/teardown must remain leak-safe, including synchronous callback-on-registration cases.
- Pending UI copy is `Processing…`.
- Confirmed QuestUI enrollment may start compatible idle Orion. Submitted/unconfirmed enrollment must not.

## Orion companion-control invariants

Orion integration is optional and must fail closed when the expected companion build is unavailable.

Discovery/identity:

- Discover `OrionQuests` through Vencord PluginManager, never folder assumptions.
- Require the exact registered `orion` command object declared by Orion, owned by `OrionQuests`.
- Require the action option and `start`, `stop`, `pause`, `resume` choices.
- Re-check plugin, command, lifecycle, and method identity immediately before invocation.

State/control:

- Require source-of-truth companion snapshot/subscription and engine/global/per-Quest control methods.
- Never keep a QuestUI copy of Orion running/task state as truth. React state may only trigger rerenders/pending UI; re-read the current companion snapshot on render.
- Never fabricate a Discord channel or invoke the slash callback for UI control.
- Keep a module-level cross-Dashboard lock plus component pending state.
- Do not mutate Orion farming/settings internals.

Global UI order and semantics:

```text
Smart Start/Pause/Resume → Stop → Reload → Filter
```

- No Available/In-Progress Quest → Smart and Stop disabled.
- Engine stopped + unfinished work → Start enabled, Stop disabled.
- Engine stopped + paused work → Resume enabled, Stop disabled.
- Engine running + RUNNING/QUEUE → Pause enabled, Stop enabled.
- Engine running + only PAUSED → Resume enabled, Stop enabled.
- Engine running before a controllable row is published → Smart disabled, Stop enabled.
- Start and Resume must use the exact same Play icon component.
- Pause must use a real two-bar SVG glyph and warning/yellow color, not literal `||` text.
- Stop remains real engine shutdown/cleanup, not Pause.

Per-Quest UI:

- Available → large Accept.
- Confirmed enrolled/In Progress → compact Orion control in the same slot.
- Engine stopped → Start global engine.
- RUNNING/QUEUE → exact-ID Pause.
- PAUSED → exact-ID Resume.
- Unknown/scanning while engine running → disabled control rather than guessed state.
- Claimable → Orion control disappears and Claim appears.
- Never implement targeted Start; Orion owns scheduling and concurrency.

Use Vencord's native toast API for explicit control success/failure feedback.

## Dashboard header invariants

- The visible title is **Quest Dashboard** followed by Discord's native Quest icon.
- The title may use a subtle brand accent, but it must respect `prefers-reduced-motion` and remain legible on dark/light themes.
- When the loaded current-user Discord profile exposes its native Nitro profile badge, render a compact colored **Nitro** tag using that badge icon. If the badge/profile is unavailable, omit the tag rather than guessing.
- In Progress, Ready to Claim, and Available counters stay on one summary row at normal Dashboard width and sit clearly below the title/tool row.
- Do not reserve Orion/Reload tool width on the summary row; tool-space reservation belongs to the title/tool row only.

## Quest Reload invariants

- Use Discord's native current-Quest fetch-and-dispatch action found by `QUESTS_FETCH_CURRENT_QUESTS_BEGIN`.
- Do not reload the whole Discord client or hand-mutate QuestStore.
- Start the request immediately.
- Complete at least three full circular-arrow rotations before stopping.
- If the request is still in flight after three rotations, keep spinning.
- If the request settles mid-rotation, finish that rotation and stop on the next animation-iteration boundary rather than snapping back from a partial turn.
- Coalesce overlapping native calls to one in-flight request and synchronously guard duplicate component clicks.
- A successful request with no new Quest is still success.
- Surface success/failure through Vencord's native toast API.
- Keep Reload usable without Orion integration.
- Reuse the Filter button's theme-safe visual skin rather than maintaining a drifting Reload-only palette, while keeping the Reload glyph itself readable in dark/light and pending/disabled states.

## Manual testing

Test the states relevant to the change in a real Discord client when possible. For the current Dashboard controls, cover at least:

- Header reads **Quest Dashboard**, the native Quest icon is aligned with it, a Nitro tag appears only when the loaded current-user profile exposes the Nitro badge, and the title does not overlap controls.
- In Progress, Ready to Claim, and Available stay on one line with the intended extra vertical separation.
- Orion absent/disabled/incompatible → no callable Orion control; Reload and normal QuestUI still work.
- Idle unfinished work → Start enabled / Stop disabled.
- Running work → yellow Pause + enabled Stop.
- Explicit pause → Resume uses exactly the same Play glyph as Start.
- Stop preserves Discord progress; later Start continues unfinished non-paused Quest progress from Discord state.
- Per-Quest RUNNING/QUEUE ↔ PAUSED behavior targets the exact Quest ID.
- Accept → `Processing…` → confirmed enrollment → compact Orion control; idle Orion auto-starts only after confirmation.
- Concurrency pressure queues excess accepted Quests instead of using targeted Start.
- Completion removes per-Quest control and exposes Claim.
- All Quests complete → both Smart and Stop disabled.
- Reload glyph remains legible on dark/light themes, sends the native request immediately, completes at least three full rotations, waits for a whole-rotation boundary after slower requests, fetches newly available Quests without Ctrl+R, and shows success/failure through Vencord toast.
- Plugin reload/disable/replacement while Dashboard is open fails safely rather than calling a stale object.

Automated build/reporter output is not live Discord evidence. State exactly what was and was not tested.

## Documentation and changelog

Update user-facing documentation when behavior, settings, installation, or compatibility expectations change. Add user-visible features/fixes to `CHANGELOG.md` under `Unreleased`. Do not create a release version without maintainer approval.

## Commit and PR discipline

Use clear, focused commits (commonly `feat:`, `fix:`, `docs:`, `ci:`, `chore:`). Avoid CI/fixup noise in final history when it can be cleaned before handoff.

A PR should explain the problem, implementation, intentionally unchanged behavior, tests actually run, manual environment/evidence, and remaining risks. Keep it focused.

Do not create an issue or PR unless the user explicitly requests it. Before opening a PR, ask whether the final diff has been reviewed by a human. If the user explicitly proceeds without confirmed human review, add `AI_REVIEW_REQUIRED.txt` containing exactly:

`This pull request was generated automatically by AI and has not been reviewed by a human.`

Never claim human review unless the user explicitly confirmed it.
