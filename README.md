# QuestUI

QuestUI is a standalone Vencord userplugin for quick access to Discord Quests and a compact, live view of their state.

QuestUI is UI-focused rather than a Quest-completion engine. It can perform two narrowly scoped Discord Quest mutations only when **you click them yourself** — **Accept Quest** and **Claim Reward**. It does not generate Quest progress, spoof games/streams, auto-claim, or bypass Discord challenges.

## Release status

> [!IMPORTANT]
> **v1.4.1** is in release preparation. **v1.4.0** remains the current Stable release until the signed v1.4.1 tag is published. v1.4.1 adds **New Quest Available** notifications, Expired-Ignore cleanup, Nitro/Xbox+ Orb-boost source handling, and the Dashboard/Settings Update Center.
>
> Ignoring never changes Discord enrollment, progress, completion, or claim state. When a compatible OrionQuests companion explicitly reports that exact Quest as active, QuestUI pauses only that Quest before saving Ignore so hidden work does not continue farming invisibly. Unignore never auto-resumes or starts Orion.
>
> Orion companion controls still require upstream `nyxxbit/discord-quest-completer` **v4.10.7 or newer**. Structured Event Log events and scheduler metadata remain additive capabilities; compatible builds without them keep the sanitized Event Log console fallback and simply omit unavailable scheduler metadata rather than losing the core integration.
>
> v1.4.0 release preparation included maintainer live Discord validation of Ignore against an active Orion Quest and a real Ready-to-Claim Vencord/Desktop notification. The Problems notification path is covered by automated logic/CI but was not separately forced in live Discord. Automated checks are not presented as proof of untested runtime behavior.

## Screenshots

<p align="center">

  <img src="docs/images/dashboard-active.webp" width="48%" alt="QuestUI Dashboard with an active Quest, live progress, claimable Quests, and header controls" />

  <img src="docs/images/dashboard-claimed.webp" width="48%" alt="QuestUI Dashboard showing claimed Quests and the Nitro header tag" />

</p>

The captures above are real Discord runtime screenshots supplied by the maintainer. They remain documentation assets; newer Stable releases add the metadata, diagnostics, Ignore, and notification surfaces described below.

## Features

- Optional Quest shortcut in Discord's top bar

- Optional Quest shortcut next to mute, deafen, and settings

- **Dashboard Mode** with a wider live Quest dashboard, enabled by default

- Seven always-visible summary totals: Available, Ready, In Progress, Claimed, Expired, Ignored, and Hidden

- Account-scoped **Ignore / Unignore** with a dedicated Ignored catalogue

- Configurable Vencord notifications for **New Quest Available**, **Ready to Claim**, and actionable runtime problems; all three categories are enabled by default

- Persistent Dashboard sorting, expired-history age filtering, and a compact Home action

- Native current Orb balance plus Orion Quest / QuestUI runtime version metadata

- Persistent **Event Log** with account-aware searchable/filterable diagnostics, per-event details, sanitized one-click bug reports, complete pagination, and large-log windowed rendering

- Discord Quest artwork, task-type badges, reward display, native progress ring, and expiry display

- Explicit **Accept Quest** and **Claim Reward** actions

- Account-scoped duplicate-submission guards and Vencord-native toast feedback

- Floating filters for status, reward category, Quest type, expired history, and the separate Ignored catalogue

- **Recommended** and **Clear all** filter shortcuts

- Optional numeric **Detailed Status** badge and basic attention dot

- Color-coded counters on Discord's own Quest Home links

- Native **Reload** that asks Discord to refetch the current Quest list without Ctrl+R

- Account-aware Orb rewards from Discord's own base/boosted fields plus Discord's native multiplier eligibility, with Nitro and Xbox+ source badges

- Optional Orion integration, enabled by default when a compatible OrionQuests plugin is installed:

  - Smart **Start / Pause / Resume** global control

  - Separate **Stop** engine control

  - Compact exact-ID per-Quest **Pause / Resume** control after enrollment

  - Engine-wide Start when Orion is stopped

  - Exact-ID Orion Pause before Ignore when that Quest is explicitly active

  - Structured Orion diagnostics when the companion exposes `subscribeEvents()`

  - Live scheduler metadata when the companion exposes `getSchedulerSnapshot()` and `subscribeSchedulerState()`

QuestUI does not turn Stop into Pause, does not reset Quest progress, and does not implement a targeted `startQuest`. Orion's own scheduler and concurrency limits decide which enrolled Quests run or wait.

## Installation

### QuestUI

Install the default `main` branch.

#### UserpluginInstaller

Use the repository URL:

```text
https://github.com/Herzchens/QuestUI
```

#### Manual Vencord source install

```bash
cd Vencord/src/userplugins
git clone --branch main https://github.com/Herzchens/QuestUI.git QuestUI
cd ../..
pnpm build
pnpm inject
```

#### Updating QuestUI

If QuestUI is already installed in a normal Vencord source checkout, you do not need to clone it again.

From the Vencord source root:

```bash
git -C src/userplugins/QuestUI pull --ff-only
pnpm build
pnpm inject
```

If the existing `src/userplugins/QuestUI` directory is not a Git checkout, check the installation before deleting or replacing it.

### QuestUI + OrionQuests

QuestUI and OrionQuests remain separate Vencord userplugins. For Orion controls, use upstream **OrionQuests v4.10.7 or newer**.

If you already have a normal Vencord source checkout, install both repositories as sibling userplugins:

```bash
cd Vencord/src/userplugins

git clone https://github.com/Herzchens/QuestUI.git QuestUI

git clone https://github.com/nyxxbit/discord-quest-completer.git OrionQuests

cd ../..
pnpm build
pnpm testTsc
pnpm inject
```

### With Orion's devbuild installer

For the first installation:

```powershell
git clone https://github.com/Herzchens/QuestUI.git "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI"
```

Then run Orion's `UPDATE.cmd` from the devbuild installer folder you originally extracted. This rebuilds Vencord with QuestUI included.

#### Updating an existing QuestUI installation

You do not need to delete and clone QuestUI again when a new version is released. `git clone` is only required for the initial installation.

Newer Orion devbuild installer versions can update sibling Git userplugins automatically. If `UPDATE.cmd` prints:

```text
Updating other userplugins in this checkout...
```

just run `UPDATE.cmd` from the extracted devbuild installer folder. Orion updates the companion checkout before rebuilding Vencord while preserving its updater safety rules.

If your extracted Orion devbuild installer does not include that companion-update step, update QuestUI manually first:

```powershell
git -C "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI" pull --ff-only
```

Then run Orion's `UPDATE.cmd` again from the extracted devbuild installer folder so Vencord is rebuilt with the updated QuestUI.

If the existing `QuestUI` directory is not a Git checkout, do not delete or replace it blindly. Check how it was installed first.

## Dashboard

The visible heading is **Quest Dashboard** followed by Discord's native Quest icon.

> [!NOTE]
> **Dashboard Mode** defaults to enabled for fresh settings. Vencord preserves stored settings, so users who previously toggled `Dashboard • Mode` off keep that stored `false` value after upgrading and may need to enable it manually. This is expected persisted-setting behavior, not a regression.

QuestUI mirrors Discord's native Quest Orb multiplier identity in the Dashboard header. Native `NITRO` eligibility keeps the existing colored **Nitro** badge and badge artwork. `XBOX_GAME_PASS` eligibility shows a green **Xbox+** badge with the Xbox brand mark. When an account has both eligible sources, Discord's own source classifier prioritizes Nitro, so QuestUI shows **Nitro** rather than two badges. Nitro tiers that are not multiplier-eligible keep the legacy Nitro identity badge, but they still receive the base Quest reward.

The title uses a seamless right-to-left color sweep. `prefers-reduced-motion` disables the motion and keeps the title readable.

The summary row always renders all seven counters, including zero values:

- **Red** — Available
- **Green** — Ready
- **Yellow** — In Progress
- **Blue / Blurple** — Claimed
- **Gray** — Expired
- **Magenta / Purple** — Ignored
- **Muted gray** — Hidden

The five Discord-status counts come from the full non-ignored live Quest snapshot. **Ignored** is a separate account-scoped local-presentation count. **Hidden** counts only non-ignored cards removed by normal Dashboard filters, including expired-age filtering, so Ignore never inflates Hidden.

### Filters and sorting

The Filter popout supports:

- Status: Available, Ready, In Progress, Claimed, Expired
- Ignored catalogue: show locally ignored Quests separately from normal status filtering
- Expired age (when Expired is enabled): 7d, 15d, 30d, 90d, All, or a custom number of days
- Reward: All rewards, Orbs only, Non-Orb rewards
- Quest type: Play, Stream, Video, Activity, Other / Unknown

**Recommended** shows Available, In Progress, and Ready while hiding Claimed and Expired cards and restores the 15-day expired-history default. **Clear all** enables every supported normal status/category and removes the expired-history age limit; Ignored remains a separate explicit catalogue rather than a Discord Quest status.

The Sort popout supports **Recommended**, **Expiring Soon**, **Highest Orb Reward**, **Shortest Required Time**, **Longest Required Time**, **Name A → Z**, and **Name Z → A**. In Progress and Ready Quests are an active accepted bucket and stay above Available, Claimed, and Expired history under every sort mode. Required-time sorting compares normalized timed-task seconds; achievement/count objectives are not misread as durations.

### Ignore / Unignore

Ignore is account-scoped and persisted locally by QuestUI. It does not change Discord enrollment, progress, completion, reward, or claim state.

A normal **In Progress** Quest can be ignored. Ignored Quests are removed from the normal Dashboard list and from QuestUI attention surfaces, including the shortcut attention dot, Detailed Status, Quest Home counters, and QuestUI notifications. They remain visible through the explicit **Ignored** catalogue with their real Discord status and progress until Discord reports them **Expired**. Expiration immediately ends Ignore, and QuestUI prunes the stale account-scoped ignored ID best-effort.

When a compatible Orion integration is enabled and Orion explicitly publishes that exact Quest as active (`RUNNING` / `QUEUE`, or scheduler `running` / `waiting`), QuestUI sends Orion an exact-ID **Pause** before it saves Ignore. This prevents a hidden Quest from continuing to farm in the background.

If Orion still reports the Quest as active after a failed Pause attempt, Ignore fails closed and the Quest stays visible. QuestUI never converts Ignore into a global Stop. If the Orion Pause succeeds but local Ignore persistence later fails, the Quest remains visible and paused rather than being auto-resumed as a rollback.

**Unignore never auto-resumes or starts Orion.** It only restores the Quest to normal QuestUI presentation so the user can explicitly decide whether to resume it.

### Live progress

QuestUI reads Discord's native Quest selectors and QuestStore rather than running a separate progress engine.

For timed tasks, the secondary progress copy uses fixed `mm:ss / mm:ss` formatting, for example:

```text
Play · 03:02 / 15:00
```

Only the **current elapsed value** (`03:02`) receives completion-stage color. The task label, separator, slash, and target remain neutral so progress color does not leak across the whole row.

The color progression is semantic progress, not urgency: muted at the beginning, then Discord brand tones, then positive green as completion approaches.

Dashboard expiry copy is shown whenever Discord provides a valid Quest expiry. The separate **Expired Age** filter controls how much expired history is visible; the recommended/default history window is 15 days and **All** removes that limit.

### Runtime metadata and Orb balance

The metadata row shows Orion integration health/version, the current QuestUI version, and the current native Orb balance. Stable releases, prerelease/dev builds, and unknown version strings use different version-chip treatments so build channel and integration health are not conflated.

Orb balance comes from Discord's `VirtualCurrencyStore`; QuestUI does not derive the balance from Quest rewards, poll a custom endpoint, or optimistically increment it. A real zero balance remains visible as `0`.

### Rewards

Orb rewards reuse Discord's themed Orb component. QuestUI reads both Discord's base `orbQuantity` and explicit `premiumOrbQuantity`, then asks Discord's own Quest multiplier classifier whether the current account is `NITRO`, `XBOX_GAME_PASS`, `UPSELL`, or `INELIGIBLE`. It does **not** manufacture a local `×1.2` value.

If the native classifier says the account receives the multiplier, the card displays Discord's `premiumOrbQuantity` (for example `240 Orbs` instead of the `200 Orbs` base). Otherwise it displays the base amount. Xbox Game Pass is therefore identified from Discord's native classifier or, when that webpack surface is unavailable, directly from Discord's `MORE_QUEST_ORBS` perk source. It is never guessed from `!Nitro` or from the existence of a boosted reward field.

## Notifications

QuestUI has three separately configurable notification categories in the QuestUI plugin settings, and all three default to enabled:

- **Notifications • New Quest Available** — one notification when a previously unseen same-account Quest is first observed as real Discord **Available** after the initial QuestStore baseline.
- **Notifications • Ready to Claim** — one notification when an observed same-account Quest transitions from real Discord **In Progress** to **Ready to Claim**.
- **Notifications • Problems** — actionable QuestUI/Orion runtime problems from the sanitized Event Log. `error` is actionable; `warning` is actionable only when structured detail marks it terminal.

QuestUI uses Vencord's Notifications API instead of a companion bot, backend, DM relay, or parallel OS-notification system. Delivery therefore follows Vencord's notification configuration: Vencord in-app notification, native desktop notification when Discord is unfocused, or native desktop notification always. Vencord also persists normal notifications into its Notification Log according to the user's global log settings.

New-Quest notifications establish the initial QuestStore/account contents as a baseline, so startup, account hydration, and Ignore/Unignore do not create a synthetic "new Quest" alert. Ready-to-Claim notifications likewise do not replay existing completed Quests on startup, account switch, Ignore/Unignore hydration, or setting enablement. Progress ticks and unchanged re-renders do not notify. Clicking either Quest notification opens Discord Quest Home.

Problem notifications ignore normal retry/fallback/recovery warnings, establish existing Event Log history as a baseline rather than a notification backlog, and deduplicate the same short-lived actionable problem. Ignored Quests do not produce QuestUI completion/problem attention while ignored.

## Manual Accept and Claim

Dashboard cards expose a Discord Quest mutation only when the normalized Quest state calls for it:

- **Available** → **Accept Quest**
- **Ready to Claim** → **Claim Reward**

Every mutation requires an explicit click. QuestUI re-reads the current Quest from Discord's QuestStore immediately before acting and does not optimistically mark the Quest accepted or claimed.

Enrollment reuses Discord's native Quest enrollment action. While pending, the card shows **Processing…**. A compatible enabled OrionQuests plugin can be auto-started only after Discord confirms `enrolledAt` in QuestStore.

Reward claim likewise reuses Discord's native claim path. Unknown, malformed, or ambiguous reward targets fail closed instead of being guessed. QuestUI does not solve/bypass CAPTCHA or other Discord verification challenges and does not auto-retry them.

## Orion integration

The integration is intentionally narrow. QuestUI validates the registered `orion` command and the upstream companion surface before showing callable controls.

OrionQuests **v4.10.7+** exposes the core source-of-truth engine/task control state expected by QuestUI. QuestUI consumes the companion snapshot/subscription surface rather than maintaining a mirrored engine/task state. Farming logic, queueing, concurrency, progress generation, task lifecycle, and engine lifecycle remain Orion-owned.

Global header order:

```text
Smart Start/Pause/Resume → Stop → Reload → Update → Event Log → Sort → Filter → Home
```

State rules:

- no Available/In-Progress Quest → Start and Stop disabled
- engine stopped + unfinished work → Start enabled, Stop disabled
- engine stopped + explicit paused work → Resume enabled, Stop disabled
- engine running + RUNNING/QUEUE → Pause enabled, Stop enabled
- engine running + only PAUSED controllable work → Resume enabled, Stop enabled
- short startup/scanning window without a published controllable row → Smart disabled, Stop enabled

Start and Resume deliberately use the **same Play icon**. Pause uses a real two-bar yellow Pause SVG. Stop remains engine shutdown/cleanup.

Per-Quest UI after confirmed enrollment:

- engine stopped → Start the global engine
- RUNNING/QUEUE → exact-ID Pause
- PAUSED → exact-ID Resume
- unknown/scanning while engine runs → disabled control rather than guessed state
- completed → Orion control disappears and Claim Reward becomes available

Ignore may reuse the same approved exact-ID Pause path only when Orion explicitly publishes the exact Quest as active. Unignore does not call Resume, and Ignore never calls global Stop.

QuestUI does not import Orion farming internals and does not fabricate a Discord channel to invoke slash-command callbacks.

### Orion Scheduler metadata

When the installed Orion build exposes `getSchedulerSnapshot()` and `subscribeSchedulerState()`, QuestUI uses the published scheduler state to refine per-Quest **STARTED / WAITING** visibility.

QuestUI treats Orion's published live batch as unordered. It does not infer queue position, execution order, ETA, or a scheduler decision Orion did not publish.

## Event Log

Event Log is a supported diagnostic surface for **QuestUI and Orion only**; it does not ingest Discord's general console spam. Events are grouped by day and can be searched, filtered by Source / Level / Category, and sorted by newest, oldest, or errors first. Every row has **View details**, while warning/error rows also expose the bug-report shortcut.

On desktop Vencord builds, QuestUI persists one sanitized `QuestUI/events.jsonl` file in Vencord's data directory. The file may grow to 10 MiB; after crossing that threshold QuestUI discards the oldest complete records and compacts the file back toward 5 MiB. **Open file** reveals it and **Clear log** clears rows owned by the current Discord account while preserving unscoped legacy history whose original owner cannot be proven.

New records are account-scoped at capture time. Older rows that predate account-aware persistence remain visible as **LEGACY** instead of being guessed as belonging to the current account. Account-change diagnostics receive a distinct surface and can display the current account username beneath their timestamp.

Large histories are queried through stable cursor/snapshot pagination in pages of 250 events and rendered through an Event-Log-owned windowed scroller, so a 10k+ file does not require mounting the entire result set at once. Search/filter/sort changes start a fresh snapshot rather than splicing incompatible pages together. Malformed persisted rows are rejected at the storage boundary instead of crashing the Viewer.

When Orion exposes `subscribeEvents()`, QuestUI treats Orion's structured event code/category/level/failure fields as authoritative and keeps the human message as detail. Recognized console output remains a sanitized fallback. Human console lines are briefly reconciled against structured events so the same Orion event is not persisted twice merely because both transports emitted it.

The fallback classifier recognizes Orion/QuestUI output, preserves the original DevTools console call, sanitizes sensitive values before persistence, and normalizes known Orion families such as Cycle, Quest/Task, Enroll, Claim, Network/heartbeat, Achievement/Bypass, Startup/System, and Patcher diagnostics. Transient retry/fallback messages are not automatically presented as terminal failures.

**Copy report** produces a sanitized diagnostic report with the selected event, related loaded context, Quest identifiers when available, QuestUI/Orion versions, Orion health/capture source, Discord release channel/client version, Vencord version/commit, platform, and runtime information. Review a copied report before posting it publicly.

Structured Orion events and scheduler metadata are capability-detected independently of the core controls. Orion v4.10.7 remains the hard control baseline; compatible builds without those optional capabilities continue with the Event Log console fallback and omit scheduler-derived metadata.

## Native Quest Reload

Reload uses Discord's own current-Quest fetch-and-dispatch action located by `QUESTS_FETCH_CURRENT_QUESTS_BEGIN`.

- The native request starts immediately.
- If the request is still running, the icon keeps spinning.
- Overlapping native reload requests are coalesced.
- A successful refresh with no new Quest is still success.
- Success/failure uses Vencord's native toast API.

## Detailed Status and Quest Home counters

Detailed Status shows one attention state at a time with this priority:

1. Yellow — In Progress
2. Green — Ready to Claim
3. Red — Available

Ignored Quests are excluded before this priority is calculated, so an ignored In Progress Quest cannot mask a newly Available Quest.

The numeric badge belongs to the displayed state, not the sum of all statuses.

Quest Home counters use:

- Red — Available
- Yellow — In Progress
- Green — Ready to Claim
- Blurple — Claimed

Ignored Quests are excluded from these QuestUI-added counters.

## Compatibility and verification

QuestUI depends on Discord/Vencord internals, so future Discord updates can require matcher or native-lookup maintenance.

The compatibility workflow covers manual-action logic, Orion companion/control and health/version state, Reload rotation boundaries, shortcut snapshot behavior, Orb balance, Dashboard sorting, ignored-Quest state/control derivation, notification transition/problem logic, Event Log classification/account scoping/pagination/windowing/persistence validation, Orion structured-event normalization/reconciliation, Orion scheduler metadata, version-channel classification, clean Vencord build/type-check, the maintained upstream Orion `main` coexistence build/type-check, and Stable/Canary patch reporters.

Automated checks do **not** prove live Discord mutations or a real Orion farming session. Runtime claims are based on actual client testing where stated.

For v1.4.0 release preparation, the maintainer confirmed in live Discord that ignoring an Orion-controlled Quest pauses the exact Quest as intended, and separately confirmed a real Ready-to-Claim notification was delivered. The Problems notification path remains automated-test/CI verified rather than separately forced in live Discord.

For the v1.1.0 Stable promotion, the implementation checkpoint `5f11470` was also exercised in a live Discord Canary run with OrionQuests `v4.10.8`: external `/orion` state changes propagated into an already-open Dashboard and a real video Quest progressed while the Dashboard stayed open.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

It is a standalone extraction/refactor of the Quest interface originally built for [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The original completion engine was removed. Later QuestUI work added narrowly scoped manual actions and optional Orion companion controls without moving farming/progress generation back into QuestUI.

Credit to **nicola02nb** for the original Quest UI implementation and to Vencord contributors for the plugin framework.

QuestUI is maintained independently and is not affiliated with or endorsed by `completeDiscordQuest`, OrionQuests, Discord, or Vencord.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for acknowledgements.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE).
