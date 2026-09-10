# QuestUI

QuestUI is a standalone Vencord userplugin for quick access to Discord Quests and a compact, live view of their state.

QuestUI is UI-focused rather than a Quest-completion engine. It can perform two narrowly scoped Quest mutations only when **you click them yourself** — **Accept Quest** and **Claim Reward**. It does not generate Quest progress, spoof games/streams, auto-claim, or bypass Discord challenges.

## Release status

> [!IMPORTANT]
> **v1.2.1** is the current Stable release. It fixes Orion-owned timed Quest cards continuing to show Discord's optimistic active-desktop progress after Orion has paused or stopped that Quest, and makes connected Orion status distinguish **Running** from **Idle**. It otherwise preserves the v1.2.0 Dashboard/Event Log feature set and QuestUI's explicit-click/manual-action boundary.
>
> Orion companion controls require upstream `nyxxbit/discord-quest-completer` **v4.10.7 or newer**. Known versions below v4.10.7 are incompatible. Future optional Orion capabilities are detected independently: compatible builds that do not expose a newer structured-event API keep the Event Log console-preview fallback instead of losing existing integration.
>
> v1.2.0 received maintainer live UI/runtime review for the Dashboard, filters/sorting, runtime metadata and Event Log surfaces. The most recent separately documented full Orion farming/integration pass remains the v1.1.0 implementation checkpoint `5f11470` with **OrionQuests v4.10.8** on Discord Canary; automated CI is not presented as a replacement for that historical live session.

## Preview

<p align="center">

  <img src="docs/images/dashboard-active.webp" width="48%" alt="QuestUI Dashboard with an active Quest, live progress, claimable Quests, and header controls" />

  <img src="docs/images/dashboard-claimed.webp" width="48%" alt="QuestUI Dashboard showing claimed Quests and the Nitro header tag" />

</p>

The captures above are real Discord runtime screenshots supplied by the maintainer. They document the earlier Dashboard surface and remain documentation assets only; v1.2.0 adds the wider metadata/toolbar layout and Event Log described below.

## Features

- Optional Quest shortcut in Discord's top bar

- Optional Quest shortcut next to mute, deafen, and settings

- **Dashboard Mode** with a wider live Quest dashboard, enabled by default

- Six always-visible status totals: Available, Ready, In Progress, Claimed, Expired, and Hidden

- Persistent Dashboard sorting, expired-history age filtering, and a compact Home action

- Native current Orb balance plus Orion Quest / QuestUI runtime version metadata

- Persistent **Event Log — Preview Feature** with searchable/filterable diagnostics, per-event details, and sanitized one-click bug reports

- Discord Quest artwork, task-type badges, reward display, native progress ring, and expiry display

- Explicit **Accept Quest** and **Claim Reward** actions

- Account-scoped duplicate-submission guards and Vencord-native toast feedback

- Floating filters for status, reward category, and Quest type

- **Recommended** and **Clear all** filter shortcuts

- Optional numeric **Detailed Status** badge and basic attention dot

- Color-coded counters on Discord's own Quest Home links

- Native **Reload** that asks Discord to refetch the current Quest list without Ctrl+R

- Nitro Orb reward display using Discord's current 1.2x multiplier rules where eligible

- Optional Orion integration, enabled by default when a compatible OrionQuests plugin is installed:

  - Smart **Start / Pause / Resume** global control

  - Separate **Stop** engine control

  - Compact exact-ID per-Quest **Pause / Resume** control after enrollment

  - Engine-wide Start when Orion is stopped

QuestUI does not turn Stop into Pause, does not reset Quest progress, and does not implement a targeted `startQuest`. Orion's own scheduler and concurrency limits decide which enrolled Quests run or queue.

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

just run `UPDATE.cmd` from the extracted devbuild installer folder. Orion fast-forwards QuestUI with `git pull --ff-only` before rebuilding Vencord.

If your extracted Orion devbuild installer does not include that companion-update step, update QuestUI manually first:

```powershell
git -C "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI" pull --ff-only
```

Then run Orion's `UPDATE.cmd` again from the extracted devbuild installer folder so Vencord is rebuilt with the updated QuestUI.

The companion updater is fast-forward only. If QuestUI has local commits, diverged history, or cannot fast-forward, Orion reports the problem and leaves the checkout unchanged instead of resetting or deleting it.

If the existing `QuestUI` directory is not a Git checkout, do not delete or replace it blindly. Check how it was installed first.

## Dashboard

The visible heading is **Quest Dashboard** followed by Discord's native Quest icon.

> [!NOTE]
> **Dashboard Mode** defaults to enabled for fresh settings. Vencord preserves stored settings, so users who previously toggled `Dashboard • Mode` off keep that stored `false` value after upgrading and may need to enable it manually. This is expected persisted-setting behavior, not a regression.

If the current Discord user has an active Nitro `premiumType`, QuestUI shows a colored **Nitro** tag. Discord profile badge artwork is used when available; if the artwork has not been hydrated, the tag stays visible with QuestUI's fallback glyph rather than incorrectly hiding Nitro status.

The title uses a seamless right-to-left color sweep. `prefers-reduced-motion` disables the motion and keeps the title readable.

The summary row always renders all six counters, including zero values:

- **Red** — Available

- **Green** — Ready

- **Yellow** — In Progress

- **Blue / Blurple** — Claimed

- **Gray** — Expired

- **Purple** — Hidden

The five Quest-status counts come from the full live Discord Quest snapshot. **Hidden** is the number of Quest cards currently removed by Dashboard filters, including expired-age filtering.

### Filters and sorting

The Filter popout supports:

- Status: Available, Ready, In Progress, Claimed, Expired

- Expired age (when Expired is enabled): 7d, 15d, 30d, 90d, All, or a custom number of days

- Reward: All rewards, Orbs only, Non-Orb rewards

- Quest type: Play, Stream, Video, Activity, Other / Unknown

**Recommended** shows Available, In Progress, and Ready while hiding Claimed and Expired cards and restores the 15-day expired-history default. **Clear all** enables every supported status/category and removes the expired-history age limit.

The Sort popout supports **Recommended**, **Expiring Soon**, **Highest Orb Reward**, **Shortest Required Time**, **Longest Required Time**, **Name A → Z**, and **Name Z → A**. In Progress and Ready Quests are an active accepted bucket and stay above Available, Claimed, and Expired history under every sort mode. Required-time sorting compares normalized timed-task seconds; achievement/count objectives are not misread as durations.

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

Orb rewards reuse Discord's themed Orb component. QuestUI keeps Discord's base reward value unchanged and adjusts only the displayed amount when the current account qualifies for Discord's Nitro Orb multiplier.

Examples:

- `200 Orbs` → `240 Orbs`

- `700 Orbs` → `840 Orbs`

Nitro Basic and fractional/credit-only Nitro states are not treated as eligible for this reward multiplier.

## Manual Accept and Claim

Dashboard cards expose a mutation only when the normalized Quest state calls for it:

- **Available** → **Accept Quest**

- **Ready to Claim** → **Claim Reward**

Every mutation requires an explicit click. QuestUI re-reads the current Quest from Discord's QuestStore immediately before acting and does not optimistically mark the Quest accepted or claimed.

Enrollment reuses Discord's native Quest enrollment action. While pending, the card shows **Processing…**. A compatible enabled OrionQuests plugin can be auto-started only after Discord confirms `enrolledAt` in QuestStore.

Reward claim likewise reuses Discord's native claim path. Unknown, malformed, or ambiguous reward targets fail closed instead of being guessed. QuestUI does not solve/bypass CAPTCHA or other Discord verification challenges and does not auto-retry them.

## Orion integration

The integration is intentionally narrow. QuestUI validates the registered `orion` command and the upstream companion surface before showing callable controls.

OrionQuests **v4.10.7+** exposes source-of-truth engine/task state plus:

- `getControlSnapshot`

- `subscribeControlState`

- `controlEngine`

- `controlAll`

- exact-ID `controlQuest`

QuestUI treats Orion's snapshot/subscription surface as the source of truth rather than maintaining a mirrored engine/task state. Farming logic, queueing, concurrency, progress generation, task lifecycle, and engine lifecycle remain Orion-owned.

Global header order:

```text
Smart Start/Pause/Resume → Stop → Reload → Event Log → Sort → Filter → Home
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

QuestUI does not import Orion farming internals and does not fabricate a Discord channel to invoke slash-command callbacks.

## Event Log — Preview Feature

The flask-labelled Event Log is a diagnostic preview for **QuestUI and Orion only**; it does not ingest Discord's general console spam. Events are grouped by day and can be searched, filtered by Source / Level / Category, and sorted by newest, oldest, or errors first. Every row has **View details**, while warning/error rows also expose the bug-report shortcut.

On desktop Vencord builds, QuestUI persists one sanitized `QuestUI/events.jsonl` file in Vencord's data directory. The file may grow to 10 MiB; after crossing that threshold QuestUI discards the oldest complete records and compacts the file back to about 5 MiB. **Open file** reveals it and **Clear log** deletes its saved history.

The current Orion adapter is best-effort console capture. It recognizes Orion/QuestUI output, preserves the original DevTools console call, sanitizes sensitive values before persistence, and normalizes known Orion families such as Cycle, Task, Enroll, Claim, Network/heartbeat, Achievement/Bypass, Startup/System, and Patcher diagnostics. Transient retry/fallback messages are not automatically presented as terminal failures.

**Copy report** produces a sanitized diagnostic report with the selected event, related context, Quest identifiers when available, QuestUI/Orion versions, Orion health/capture source, Discord release channel/client version, Vencord version/commit, platform, and runtime information. Review a copied report before posting it publicly.

Future Orion structured-event APIs are capability-detected. A compatible Orion build that does not expose those future APIs continues using the console-preview fallback; only known Orion versions below v4.10.7 are hard-incompatible.

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

The numeric badge belongs to the displayed state, not the sum of all statuses.

Quest Home counters use:

- Red — Available

- Yellow — In Progress

- Green — Ready to Claim

- Blurple — Claimed

## Compatibility and verification

QuestUI depends on Discord/Vencord internals, so future Discord updates can require matcher or native-lookup maintenance.

The compatibility workflow covers manual-action logic, Orion companion/control and health/version state, Reload rotation boundaries, shortcut snapshot behavior, Orb balance, Dashboard sorting, Event Log classification/query logic, version-channel classification, clean Vencord build/type-check, the maintained upstream Orion `main` coexistence build/type-check, and Stable/Canary patch reporters.

Automated checks do **not** prove live Discord mutations or a real Orion farming session. Runtime claims should be based on actual client testing.

For the v1.1.0 Stable promotion, the implementation checkpoint `5f11470` was also exercised in a live Discord Canary run with OrionQuests `v4.10.8`: external `/orion` state changes propagated into an already-open Dashboard and a real video Quest progressed while the Dashboard stayed open.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

It is a standalone extraction/refactor of the Quest interface originally built for [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The original completion engine was removed. Later QuestUI work added narrowly scoped manual actions and optional Orion companion controls without moving farming/progress generation back into QuestUI.

Credit to **nicola02nb** for the original Quest UI implementation and to Vencord contributors for the plugin framework.

QuestUI is maintained independently and is not affiliated with or endorsed by `completeDiscordQuest`, OrionQuests, Discord, or Vencord.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for acknowledgements.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE).