# Contributing to QuestUI

Thanks for helping improve QuestUI. Keep changes focused, evidence-backed, and within the project boundaries below.

Read `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `docs/RELEASES.md` before changing behavior, compatibility contracts, or release metadata.

## Scope

QuestUI is a standalone Vencord userplugin. It may improve Discord Quest UI, perform explicit user-clicked native Accept/Claim actions, request Discord's native Quest-list refresh, and optionally delegate controls to a separately installed compatible OrionQuests companion.

Do not turn QuestUI into a Quest farming engine. Do not add automatic enrollment/claim, progress spoofing, heartbeats, targeted quest execution, challenge bypasses, or private Orion farming imports.

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
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionCommandLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testOrionControlLogic.ts
pnpm exec tsx src/userplugins/QuestUI/scripts/testQuestReloadLogic.ts
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

- Mutation requires an explicit QuestUI click.
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

Global UI order:

```text
Smart Start/Pause/Resume → Stop → Reload → Filter
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

## Dashboard presentation

Keep the current presentation contracts unless a change explicitly targets them:

- visible title: **Quest Dashboard** + Discord native Quest icon;
- eligible Nitro accounts are determined from the current user's `premiumType`;
- use Discord Nitro profile-badge artwork when hydrated, otherwise keep the Nitro tag with the existing fallback glyph;
- title color sweep is a seamless linear right-to-left loop with no reset frame;
- summary remains one line below tools;
- In Progress / Ready to Claim / Available follow the current card scope;
- **Claimed is always shown** and counts the full live Quest snapshot even when Claimed cards are filtered out;
- timed progress displays `mm:ss / mm:ss` and only the current elapsed value receives completion-stage color;
- Dashboard expiry copy appears only inside the 15-day presentation window; underlying Quest status/expiry is never altered.

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

Current beta manual coverage should include:

- title/native Quest icon/Nitro tag without overlap;
- always-visible Claimed summary count;
- `mm:ss` elapsed/target formatting with current-only progress color;
- 15-day expiry presentation boundary;
- Accept → `Processing…` → confirmed enrollment;
- Claim flow;
- global Start/Pause/Resume/Stop state transitions;
- per-Quest RUNNING/QUEUE ↔ PAUSED exact-ID transitions;
- concurrency queue pressure;
- all-Quest-finished disabled state;
- Reload whole-rotation behavior and new Quest appearance without Ctrl+R;
- Orion absent/disabled/replaced/reloaded safety;
- dark/light/custom theme readability.

Never describe CI/build output as proof of a live Discord mutation or farming session.

## Release channels

Stable source: `main`.

Beta source: `feat/quest-actions-orion-controls`.

The beta Orion-control feature set is supported with:

```text
Herzchens/discord-quest-completer
branch: feat/per-quest-pause-resume
known companion commit: a190386071f91af348068f3044ccd0ddb0fa52ab
```

Do not present current upstream `nyxxbit/discord-quest-completer` as exposing that pause/resume companion API until it actually does.

Keep QuestUI and Orion packages/repositories/licenses separate. See `docs/RELEASES.md` before publication.

## Documentation and changelog

Update README and release notes when behavior, compatibility, installation, or release expectations change. Keep screenshots documentation-only.

Do not invent a successful build, CI run, tag, release, or manual test. If a release action/tool is unavailable, prepare the release artifacts/commands and state that publication still requires the maintainer to execute them.

## Commits, issues, and PRs

Use clear focused commit messages such as `feat:`, `fix:`, `docs:`, `ci:`, or `chore:`. Avoid noisy fixup history when it can be cleaned.

Do not create an issue or PR unless explicitly requested.

Before opening a PR, ask whether the final diff was reviewed by a human. If proceeding without confirmed human review, add `AI_REVIEW_REQUIRED.txt` containing exactly:

`This pull request was generated automatically by AI and has not been reviewed by a human.`

Never claim human review unless explicitly confirmed.