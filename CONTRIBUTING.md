# Contributing to QuestUI

Thanks for helping improve QuestUI. Keep changes focused, evidence-backed, and within the project boundaries below.

Read `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `docs/RELEASES.md` before changing behavior, compatibility contracts, or release metadata.

## Scope

QuestUI is a standalone Vencord userplugin. It may improve Discord Quest UI, perform explicit user-authorized native Accept/Claim actions including bounded sequential Claim all, request Discord's native Quest-list refresh, display native Orb/runtime metadata, provide account-scoped Ignore/Unignore presentation preferences, provide sanitized QuestUI/Orion diagnostics, send local Vencord/native desktop notifications, and optionally delegate controls to a separately installed compatible OrionQuests companion.

Do not turn QuestUI into a Quest farming engine. Do not add automatic enrollment/claim, progress spoofing, heartbeats, targeted quest execution, challenge bypasses, private Orion farming imports, or a companion-bot/backend/DM requirement just to deliver QuestUI notifications.

## Development setup

Place the repository at:

```text
Vencord/src/userplugins/QuestUI
```

Run from the Vencord root:

```bash
pnpm install --frozen-lockfile
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestActionRuntimeLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testClaimAllLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionControlLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionEventLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionSchedulerLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestReloadLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestShortcutLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrbBalanceLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testDashboardSortLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testIgnoredQuestLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testNotificationLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testEventLogLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testVersionChannel.ts
pnpm build
pnpm testTsc
node src/userplugins/QuestUI/scripts/checkQuestUIReporter.mjs --self-test
```

Do not install packages inside QuestUI; it uses Vencord's toolchain.

## Change quality

- Inspect the current implementation before editing.
- Prove a bug or compatibility issue with source/runtime/test evidence before labelling it as confirmed.
- Prefer root-cause fixes over timers, state mirrors, fabricated contexts, or broad fallbacks.
- Keep source-of-truth state in Discord/Orion rather than duplicating it in QuestUI.
- Preserve unrelated behavior.
- Remove dead branches/adapters created by a refactor.
- Keep final history logical; avoid `fix CI`, test-noise, or temporary commits when they can be cleaned before handoff.
- Do not weaken CI assertions just to make a check green; correct false-positive/brittle assertions at the layer they actually verify.

## Discord Quest state

Discord QuestStore/native selectors are authoritative for availability, enrollment, completion, claim state, progress, task selection, and native refresh results.

The local 250 ms refresh is render-only. It may re-read Discord state but must never increment progress or send Quest farming traffic.

Prefer `taskConfigV2` over legacy `taskConfig`; do not merge both into duplicate tasks.

## Manual Accept / Claim

- Mutation requires explicit QuestUI user authorization. One **Claim all** click may authorize only the fixed same-account snapshot of currently Ready, non-ignored Quest IDs captured by that click.
- Claim all must process that snapshot strictly one at a time, re-read QuestStore before every claim, advance only after store confirmation, and never append newly claimable Quests.
- Keep the header **Claim All N** control immediately after Stop and before Reload. It stays visible, is disabled at `N = 0`, and is actionable from one non-ignored Ready reward onward.
- Stop on account change, CAPTCHA/verification, changed/unavailable Quest state, native failure, or ambiguous/submitted-only outcomes. Do not auto-retry or continue past uncertainty.
- Acquire a module-global Claim all lock synchronously before async work so rapid double-clicks, stale per-card click events, and Dashboard close/reopen cannot create overlapping batches. Refuse Claim all while a same-account per-card claim is in-flight/held, and re-check the global batch lock inside the card Claim handler as well as disabling the button.
- Re-read the Quest from QuestStore immediately before mutation.
- Fail closed on malformed present safety/config timestamps.
- Scope duplicate guards to account + Quest.
- Enrollment must reuse Discord's native action identified by `QUESTS_ENROLL_BEGIN`, `QUESTS_ENROLL_SUCCESS`, `QUESTS_ENROLL_FAILURE`, and `previous_in_flight_request`.
- Claim must reuse the verified native claim action including begin/success/failure and sealed traffic metadata.
- Do not silently replace a broken finder with handcrafted REST.
- Do not solve/bypass CAPTCHA or other challenges and do not auto-retry them.
- Do not optimistically mutate QuestStore.
- Confirmed enrollment may auto-start compatible idle Orion; submitted/uncertain enrollment may not.
- Pending text is `Processing…`.

## Orion companion integration

QuestUI may consume only the explicit companion surface. It must not import Orion's TaskRunner, Traffic, Patcher, farming queues, settings internals, or checkout paths.

A compatible Orion build owns the exact registered `orion` command and exposes `start`, `stop`, `pause`, `resume`, source-of-truth control snapshots/subscriptions, engine Start/Stop, global Pause/Resume, and exact-ID per-Quest Pause/Resume.

Optional additive capabilities are feature-detected independently:

- `subscribeEvents()` supplies structured Orion diagnostic events. Validate the payload at QuestUI's boundary; structured code/category/level/failure fields are authoritative and the human message is detail only.
- `getSchedulerSnapshot()` + `subscribeSchedulerState()` supply live scheduler metadata. Treat the current batch as unordered and never infer queue position or future execution order.
- Absence of either capability must not disable the core v4.10.7+ Orion control integration.

Global UI order:

```text
Smart Start/Pause/Resume → Stop → Claim All → Reload → Update → Event Log → Sort → Filter → Home
```

State rules:

- no Available/In-Progress Quest → Smart and Stop disabled;
- engine stopped + unfinished work → Start enabled, Stop disabled;
- engine stopped + paused work → Resume enabled, Stop disabled;
- engine running + RUNNING/QUEUE → Pause enabled, Stop enabled;
- engine running + only PAUSED → Resume enabled, Stop enabled;
- engine running before a controllable row exists → Smart disabled, Stop enabled.

Start and Resume use the exact same Play icon. Pause is a real two-bar yellow SVG, never literal `||`. Stop remains engine shutdown/cleanup.

Per-Quest UI:

- Available → large Accept;
- confirmed enrolled/In Progress → compact Orion control in the same slot;
- engine stopped → Start global engine;
- RUNNING/QUEUE → exact-ID Pause;
- PAUSED → exact-ID Resume;
- unknown/scanning while engine runs → disabled rather than guessed;
- claimable → control disappears and Claim appears;
- never implement targeted Start; Orion owns scheduling/concurrency.

Use Vencord's native toast API for explicit control success/failure feedback. Never fabricate a Discord channel to invoke slash callbacks.

## Ignore / Unignore

Ignored is a QuestUI-local, account-scoped presentation state. It is never a normalized Discord Quest status and must not mutate Discord enrollment, progress, completion, reward, or claim state.

- Persist ignored Quest IDs per Discord account and never allow an account to inherit another account's ignored set.
- A normal enrolled In-Progress Quest may be ignored. Later real status changes keep it recoverable except **Expired**: expiration immediately ends Ignore and stale persisted IDs are pruned best-effort.
- Ignored Quests are excluded from the normal Dashboard, shortcut attention, Detailed Status, Quest Home counters, and QuestUI notification attention paths.
- Ignored Quests remain available through the explicit **Ignored** catalogue and retain their real Discord status/progress while shown there.
- Ignored and Hidden are distinct. Ignored cards do not inflate Hidden; Hidden remains the count of non-ignored cards removed by normal Dashboard filters.
- When compatible Orion explicitly reports the exact Quest active (`running` / `queued`, or scheduler `running` / `waiting`), Ignore may delegate an exact-ID Pause before persistence.
- If that Pause fails and a fresh Orion snapshot still reports the exact Quest active, Ignore fails closed and must not be saved.
- Ignore must never global-Stop Orion. Unignore must never auto-Resume or auto-Start Orion.
- If Orion Pause succeeds but Ignore persistence fails, leave the Quest visible and paused rather than auto-resuming as rollback.
- Persistence failure must re-read/restore saved local state instead of presenting an unsaved optimistic Ignore as durable.

## Notifications

QuestUI notification delivery stays local-first through Vencord's Notifications API. Do not add a companion bot, backend, webhook relay, or user-token DM mechanism as a requirement for this feature.

- **New Quest Available**, **Ready to Claim**, and **Problems** are independently configurable and default to enabled.
- New-Quest eligibility is a previously unseen same-account Quest first observed as Discord **Available** after the initial store baseline.
- Completion eligibility is an observed same-account Discord **In Progress → Ready to Claim** transition.
- Initial hydration, plugin restart, account switch, Ignore/Unignore hydration, and enabling the setting after completion must not synthesize a completion notification.
- Do not notify for progress ticks or unchanged re-renders. One observed completion transition produces at most one notification.
- Ignored Quests do not generate QuestUI completion/problem attention while ignored.
- Runtime-problem notifications consume sanitized Event Log rows rather than raw unrelated console traffic.
- `error` is actionable; `warning` is actionable only when structured detail explicitly marks it terminal. Normal retry/fallback/recovery warnings are not notification-worthy.
- Existing Event Log history is a baseline, not a backlog. Account changes reset the problem baseline.
- Suppress short-lived duplicate notifications for the same source/event code/Quest/summary while preserving distinct failures.
- Allow desktop Event Log persistence to settle before deciding a new sanitized row is absent.
- Normal notification persistence/delivery behavior belongs to Vencord's notification settings and Notification Log rather than a QuestUI-owned OS-notification subsystem.

## Dashboard presentation

Keep the current presentation contracts unless a change explicitly targets them:

- visible title: **Quest Dashboard** + Discord native Quest icon;
- boosted Quest rewards come from Discord's explicit `premiumOrbQuantity` field when present; do not locally invent the multiplier;
- use Discord's native Quest multiplier eligibility classifier to distinguish `NITRO` from `XBOX_GAME_PASS`; never infer Xbox from reward values or from `!Nitro`;
- show **Nitro** for the Nitro source and **Xbox+** with the Xbox brand mark for the Xbox Game Pass source. Prefer Discord's native classifier, then its `MORE_QUEST_ORBS` perk source if the webpack classifier surface is unavailable. If both sources are present, mirror Discord's Nitro precedence;
- title color sweep is a seamless linear right-to-left loop with no reset frame;
- summary remains one line below tools and always renders Available / Ready / In Progress / Claimed / Expired / Ignored / Hidden, including zero values;
- the five Discord status counts come from the full non-ignored live Quest snapshot; Ignored is a separate local count; Hidden reflects only normal filtering of non-ignored cards;
- In Progress / Ready are the accepted-active bucket and stay above Available/Claimed/Expired under every sort mode;
- required-time sorting compares normalized timed-task seconds and excludes achievement/count targets;
- timed progress displays `mm:ss / mm:ss` and only the current elapsed value receives completion-stage color;
- valid expiry copy stays visible; expired-history visibility is controlled separately by the age filter (15-day recommended default, All for unlimited history).

## Event Log

- Capture only QuestUI and confidently recognized Orion output; never collect Discord/general plugin console spam.
- Preserve the original console call and do not clobber wrappers installed by another plugin after QuestUI starts.
- Sanitize secrets before writing to disk or copying a diagnostic report.
- New records are account-scoped at capture time. Keep pre-account records visibly **LEGACY** and unscoped when their original owner cannot be proven; never migrate them by guess.
- Persist one `events.jsonl` file; compact from over 10 MiB toward about 5 MiB by dropping oldest complete records without splitting JSONL records.
- Reject malformed persisted core records before sort/render logic; valid legacy rows that merely lack newer account/category fields must remain readable.
- Keep Source / Level / Category filtering, search, day grouping, newest/oldest/errors-first sorting, **View details**, Open file and confirmation-gated Clear log behavior testable.
- Large desktop histories use stable snapshot/cursor pagination in pages of 250 events plus QuestUI-owned windowed rendering. Do not reintroduce a hidden 5,000-row fallback or mix pages from different query generations/sessions.
- Auto-pagination should fire only after genuine user scrolling reaches the bottom margin; cancel stale pagination/live-refresh timers across search/filter/sort/account resets.
- Classify fallback Orion console messages by namespace/context rather than naive keywords so retry/fallback/recovery logs are not mislabeled as terminal failures.
- When structured events are available, reconcile their short-lived console shadows rather than persisting duplicate twins.
- Orion v4.10.7 remains the hard core-control minimum. Structured-event and scheduler APIs are additive capabilities; compatible builds without them keep safe fallback behavior.

## Quest Reload

- Use Discord's native current-Quest fetch/dispatch action found by `QUESTS_FETCH_CURRENT_QUESTS_BEGIN`.
- Never reload the whole Discord client or hand-mutate QuestStore.
- Start the request immediately.
- Complete at least three full rotations.
- Keep spinning while the request is in flight.
- If it settles mid-rotation, finish the current rotation and stop on `animationiteration`.
- Coalesce overlapping native requests and synchronously guard duplicate clicks.
- Success with no new Quest remains success.
- Keep Reload independent of Orion, theme-readable, and on Vencord native toast feedback.

## Webpack / patch compatibility

Discord internals are unstable. Treat every finder/patch as a compatibility boundary.

- Prefer identifiable code fragments and meaningful properties.
- Avoid broad minified-key lookups when safer anchors exist.
- Review `WEBPACK_FIND_SIGNATURES` whenever a Discord webpack lookup changes.
- Keep `scripts/checkQuestUIReporter.mjs` synchronized with lookup coverage.
- Vencord PluginManager/Commands and current-user/profile stores exposed through Vencord commons are not new Discord webpack finders.

## Testing

Automated tests are necessary but not sufficient. For relevant changes, manual-test actual Discord states and report what was truly observed.

Current manual coverage should include:

- title/native Quest icon/Nitro-or-Xbox+ badge without overlap;
- seven-item summary including zero/ Ignored / Hidden counts and even spacing;
- Sort/Filter/Home controls and custom popouts;
- expired-age 7/15/30/90/All/custom filtering plus expiry copy outside 15 days;
- accepted-Quest pinning and required-time sorting;
- native Orb balance including zero and runtime version/health chips;
- Ignore persistence/account isolation, expiry ending Ignore and cleaning stale IDs, Ignored catalogue visibility, Ignored-vs-Hidden counts, and exclusion from all normal attention surfaces;
- active Orion exact-ID Pause on Ignore, no global Stop, and no auto-Resume on Unignore;
- one-shot real New-Available and In-Progress → Ready-to-Claim notifications with no startup/backlog duplicate;
- Problems notification behavior when explicitly testing that path, without misrepresenting automated coverage as live evidence;
- Event Log persistence/search/source/level/category/sort/day grouping/detail/report/open/clear flows and scrollbar behavior;
- large Event Log pagination/windowing on a 10k+ persisted history when that path changes;
- Event Log account switching and legacy-row visibility;
- Orion structured-event fallback/reconciliation and scheduler metadata when supported;
- `mm:ss` elapsed/target formatting with current-only progress color;
- Accept → `Processing…` → confirmed enrollment;
- per-card Claim flow plus Claim all sequential progress, duplicate/race locking, and stop-on-verification behavior;
- global Start/Pause/Resume/Stop state transitions;
- per-Quest RUNNING/QUEUE ↔ PAUSED exact-ID transitions;
- concurrency queue pressure;
- all-Quest-finished disabled state;
- Reload whole-rotation behavior and new Quest appearance without Ctrl+R;
- Orion absent/disabled/replaced/reloaded safety and fallback compatibility;
- dark/light/custom theme readability.

Never describe CI/build output as proof of a live Discord mutation, farming session, or notification path that was not actually exercised.

## Release channels

Stable source: `main`.

The old `feat/quest-actions-orion-controls` beta branch and the old `Herzchens/discord-quest-completer:feat/per-quest-pause-resume` pairing are historical only. Current Orion integration targets upstream `nyxxbit/discord-quest-completer` **v4.10.7+**, and the maintained coexistence CI gate tracks upstream `main`. Structured-event and scheduler capabilities are optional and must not silently raise the minimum supported core-control version.

Keep QuestUI and Orion packages/repositories/licenses separate. See `docs/RELEASES.md` before publication.

## Documentation and changelog

Update README and release notes when behavior, compatibility, installation, or release expectations change. Keep screenshots documentation-only.

Do not invent a successful build, CI run, tag, release, or manual test. If a release action/tool is unavailable or publication is intentionally maintainer-controlled, prepare the release artifacts/commands and state that publication still requires the maintainer to execute them.

## Commits, issues, and PRs

Use clear focused commit messages such as `feat:`, `fix:`, `docs:`, `ci:`, or `chore:`. Avoid noisy fixup history when it can be cleaned.

Do not create an issue or PR unless explicitly requested. Follow the repository's current `AGENTS.md` PR-creation rules at the point a PR is actually being created; ordinary branch preparation is not PR creation.

Never claim human review unless it was explicitly confirmed.
