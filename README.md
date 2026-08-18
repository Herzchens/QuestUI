# QuestUI

QuestUI is a standalone Vencord userplugin for quick access to Discord Quests and a compact, live view of where they stand.

QuestUI is UI-focused rather than a Quest-completion engine. It can perform two narrowly scoped Quest mutations only when **you click them yourself** — **Accept Quest** and **Claim Reward**. It does not generate Quest progress, spoof games/streams, auto-enroll, auto-claim, or bypass Discord challenges.

Use it on its own or alongside [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest plugins. Optional Orion controls use a narrow companion state/control surface exposed by a compatible OrionQuests build; QuestUI does not import Orion farming internals or implement Orion's farming engine.

## Features

- Optional Quest shortcut in Discord's top bar
- Optional Quest shortcut next to mute, deafen, and settings
- Optional **Dashboard Mode**, which opens a live mini Quest dashboard instead of jumping straight to Quest Home
- Quest cards with Discord's own artwork, task-type badges, status, reward, native progress, and time remaining
- Explicit **Accept Quest** action on Available cards
- Explicit **Claim Reward** action on Ready-to-Claim cards
- Account-scoped duplicate-submission guards and visible action feedback
- Floating dashboard filters for status, reward category, and task type, with **Recommended** and **Clear all** shortcuts
- Optional numeric **Detailed Status** badge with its own filtering
- A basic status dot for quests needing attention when Detailed Status is off
- Optional color-coded counters on Discord's own Quest Home links, independent of the shortcut buttons
- Direct navigation to Discord's Quest Home page, always available
- Live QuestStore sync via Discord's native Quest-card progress selectors — no separate QuestUI progress clock
- Nitro Orb rewards shown with Discord's 1.2x multiplier where eligible, while the underlying base reward data stays unchanged
- Optional smart Orion global control in Dashboard Mode:
  - **▶ Start All** while Orion is stopped
  - **■ Stop All** while Orion is running

The current QuestUI bridge only exposes Orion's existing global start/stop behavior. It does **not** implement pause, resume, or per-Quest controls, and `stop` is not treated as a pause operation.

## Installation

### UserpluginInstaller

Install via UserpluginInstaller using the repo URL:

```text
https://github.com/Herzchens/QuestUI
```

### Manual Vencord source installation

```bash
cd Vencord/src/userplugins
git clone https://github.com/Herzchens/QuestUI.git
cd ../..
pnpm build
pnpm inject
```

To update:

```bash
git -C Vencord/src/userplugins/QuestUI pull
cd Vencord
pnpm build
pnpm inject
```

Restart Discord, open Vencord settings, and enable **QuestUI**.

The Quest Home Counter patch ships disabled by default, since Discord's UI matchers can shift between client builds. You can turn it on independently of either shortcut button — just restart Discord afterward for it to take effect.

### Using QuestUI with OrionQuests

QuestUI and [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) can be installed side by side. The compatibility workflow also builds current upstream OrionQuests beside QuestUI so command-surface/build drift is caught automatically. Both projects still rely on Discord/Vencord internals, so a future update may require compatibility work.

The smart Dashboard Start/Stop control requires OrionQuests to expose the narrow companion methods QuestUI consumes: real engine-running state, a state-change subscription, and watcher-aware global Start/Stop delegation. If those methods are absent, QuestUI keeps its normal Quest UI/actions but does not expose a callable Orion control. The current `Herzchens/discord-quest-completer` fork includes that companion surface as a single patch over its tracked Orion base.

**Orion prebuilt bundle**: this is a pre-compiled distribution, so QuestUI can't just be dropped into it as source. If you want both, use the Orion devbuild installer or a Vencord source build instead.

**Orion devbuild installer** — the Orion devbuild checkout lives at `%LOCALAPPDATA%\OrionVencord`. To add QuestUI:

Command Prompt:

```cmd
git clone https://github.com/Herzchens/QuestUI.git "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI"
```

PowerShell:

```powershell
git clone https://github.com/Herzchens/QuestUI.git "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI"
```

Then run `UPDATE.cmd` to rebuild.

To update QuestUI later:

Command Prompt:

```cmd
git -C "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI" pull
```

PowerShell:

```powershell
git -C "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI" pull
```

Then run `UPDATE.cmd` again. Orion's updater does not update QuestUI for you; the two projects remain separately maintained and there is no combined bundle.

### Compatibility matrix

| Installation method | QuestUI support | Method |
|---|---|---|
| UserpluginInstaller | Yes | Install using the repository URL |
| Vencord source/dev build | Yes | Clone into `src/userplugins` |
| Orion devbuild installer | Yes | Clone into OrionVencord and run `UPDATE.cmd` |
| Orion prebuilt bundle | Not directly | Move to the devbuild installer |

## Settings

### Shortcuts and Quest Home Counters

- **Top Bar Button** — adds the Quest shortcut to Discord's top bar. Needs a restart.
- **Settings Bar Button** — adds the shortcut beside mute, deafen, and settings. Needs a restart.
- **Quest Home Counters** — adds numeric counters to Discord's own Quest Home links. Needs a restart, and works whether or not either shortcut button is enabled.

If you turn off both shortcut buttons, Dashboard Mode and Detailed Status stay visible in settings but get locked, since there's no shortcut left for them to attach to. Quest Home Counters keep working regardless.

### Dashboard Mode

**Dashboard • Mode** changes what clicking a QuestUI shortcut does:

- Off — goes straight to `/quest-home`.
- On — opens QuestUI's mini dashboard instead.

Either way, **Open Quest Home** stays visible in the dashboard, so Discord's full Quest interface is always one click away.

The Filter button opens a floating popout, and filters apply immediately — no restart needed:

- Status: Available, In Progress, Ready to Claim, Claimed, Expired
- Reward: All rewards, Orbs only, Non-Orb rewards
- Quest type: Play, Stream, Video, Activity, Other / Unknown
- Quests with unknown reward formats can still show up under a specific reward filter

The popout also has:

- **Recommended** — the default attention-focused view: Available, In Progress, and Ready to Claim shown; Claimed and Expired hidden
- **Clear all** — drops all restrictions and shows every status, reward category, and Quest type

A small count on the Filter button shows when restrictions are active. Claimed and expired quests stay hidden by default, while unknown Quest task types stay visible by default, so a new Discord task type doesn't quietly disappear after a client update.

### Manual Accept and Claim

Dashboard cards expose a mutation only when the normalized card state calls for it:

- **Available** → **Accept Quest**
- **Ready to Claim** → **Claim Reward**

These actions never fire from opening the Dashboard, filtering, progress updates, or status transitions. Every mutation requires an explicit click.

Immediately before mutation, QuestUI re-reads the Quest from Discord's current QuestStore and requires complete current Quest configuration. Duplicate guards are scoped to Discord account + Quest. Account identity is checked on QuestStore updates and again at the confirmation timeout boundary, so switching accounts cannot be reported as success for the wrong account.

A successful or transport-ambiguous action not yet reflected in QuestStore stays guarded for a short bounded period. This prevents immediate duplicate submission without permanently locking an already-open Dashboard.

#### Enrollment

Enrollment reuses Discord's native Quest enrollment action. QuestUI passes the user-selected Quest ID and Discord's `QUEST_HOME_DESKTOP` content location; Discord's own action then owns its in-client duplicate guard, attribution/sealed metadata construction, Flux begin/success/failure events, CAPTCHA path, and QuestStore update.

QuestUI still performs conservative preflight checks before invoking that action:

- refuses preview/not-yet-started/expired/already-enrolled states;
- respects Discord's `questEnrollmentBlockedUntil` safety state;
- fails closed on malformed present start/expiry/block timestamps;
- never creates a retry/background queue.

The native enrollment result is also validated. `success`, `captcha_failed`, `previous_in_flight_request`, and `unknown_error` are handled explicitly; an unfamiliar result fails closed and tells you to verify the Quest in Quest Home.

#### Reward claim

Reward claim likewise reuses Discord's native Quest claim action, located by its verified begin/success/failure plus sealed-traffic-metadata code fragments. This keeps the click on Discord's normal client claim/challenge path.

In-game rewards are claimed only when Discord supplies **exactly one unambiguous configured platform**. Verified reward-code/collectible/virtual-currency/fractional-premium families use their cross-platform target. Unknown, malformed, or ambiguous reward configuration fails closed and directs you to Quest Home instead of guessing.

If Discord requires CAPTCHA or another verification challenge, QuestUI does not solve/bypass it and does not auto-retry.

QuestUI never optimistically marks a Quest accepted or claimed. It waits for Discord QuestStore confirmation.

### Orion Integration

**Dashboard • Orion Integration** is shown only when Vencord detects an installed `OrionQuests` plugin and is usable only with Dashboard Mode plus an enabled/lifecycle-started Orion whose registered command identity and companion control surface match what QuestUI expects.

QuestUI verifies that the detected Orion build:

- owns the exact registered Vencord `orion` command with the expected required `action` option and `start`/`stop` choices;
- exposes real engine-running state instead of requiring QuestUI to maintain a mirror flag;
- exposes a state-change subscription backed by Orion's own runtime updates;
- exposes watcher-aware global Start/Stop delegation.

The Dashboard shows **one** icon-only control immediately to the left of Filter:

- Orion stopped → **▶ Start All**
- Orion running → **■ Stop All**

The button changes from Orion's real runtime state. Auto Start, enrollment-watcher starts, `/orion start|stop`, natural queue drain, and explicit QuestUI Start/Stop all feed the same source of truth, so QuestUI does not fabricate a second running flag.

QuestUI calls Orion's companion Start/Stop method, which delegates to the same `ensureStart`/`ensureStop` paths as Orion's slash command. That preserves Orion-owned enrollment-watcher and cleanup semantics while removing the slash command's unrelated need for a selected text channel just to emit a Clyde response. The Dashboard control therefore works from non-chat Discord views as well.

There is no Resume action in this integration, and QuestUI does not reinterpret `start` as Resume or `stop` as Pause. Pause/resume and per-Quest control remain separate, unimplemented capabilities.

QuestUI does not import Orion source modules, manipulate Orion settings, enable/disable the Orion plugin, or reach into TaskRunner/Traffic/Patcher/farming internals.

### Detailed Status

**Detailed Status • Enabled** swaps the basic attention dot for a compact numeric badge. It shows one state at a time, in priority order:

1. **Yellow** — In Progress
2. **Green** — Ready to Claim
3. **Red** — Available

The number reflects only the displayed state, not every quest — one Available, two In Progress, and one Ready to Claim would show a yellow **2**.

The tooltip breaks down the full picture: each status with its own color, the attention total, and the nearest expiry.

Detailed Status can either follow the same persisted filter scope as the Dashboard, or use its own separate scope for status, reward category, and Quest type — so you could, say, set an Orbs-only badge and stop an available Avatar Decoration quest from turning the button red.

Dashboard Mode, Detailed Status, Dashboard filters, manual actions, and Orion controls are runtime behavior. Patch-controlled shortcut/counter settings still need a restart.

## Dashboard reward display

Orb rewards use Discord's own themed Orb component. QuestUI keeps Discord's base reward value in its normalized data untouched, and only adjusts what's *displayed* on Dashboard cards when the current account qualifies for Discord's Nitro Orb multiplier.

For eligible full Nitro accounts on qualifying Orb Quests, QuestUI shows the 1.2x amount:

- `200 Orbs` → `240 Orbs`
- `700 Orbs` → `840 Orbs`

Nitro Basic and Discord's fractional/credit-only Nitro state don't qualify. The multiplier only applies to quests from the current Discord multiplier period — older quests keep their base Orb amount.

## Live progress behavior

QuestUI doesn't take a one-time snapshot when Dashboard Mode opens, and it doesn't run its own progress engine.

The dashboard's progress ring uses the same native completion selector Discord calls right before rendering its own Quest-card ring. QuestUI reads Discord's `completedRatio` for the ring and `completedRatioDisplay` for the text, so Discord's optimistic progress, active desktop progress, achievement handling, and rounding stay the source of truth.

The current/target line underneath follows Discord's native task selection too. For multi-option or multi-platform quests, Discord picks the live task based on its progress event name and heartbeat/update timestamps, and `taskConfigV2` is used over the legacy config rather than merging the two.

QuestUI still listens for QuestStore changes so it can react to state transitions right away. A short local interval only forces an already-open Dashboard to re-check the same native selectors — it never increments progress or sends progress/farming requests. The only Quest mutations QuestUI triggers are the explicit native Accept/Claim actions described above.

This progress behavior is the same whether OrionQuests is installed or not: Orion may change Discord's Quest state, but QuestUI just reads the resulting QuestStore/selector output rather than tracking a separate Orion counter.

## Status colors

### Quest Home Counters

- **Red** — Available, can be enrolled in
- **Yellow** — Enrolled, still in progress
- **Green** — Completed, reward ready to claim
- **Blurple** — Claimed

### Basic shortcut status dot

With Detailed Status off, the shortcut shows a single dot using the same priority order:

1. **Yellow** — at least one quest in progress
2. **Green** — nothing in progress, but a reward's ready to claim
3. **Red** — nothing higher-priority, but a quest is available
4. **No dot** — nothing needs attention

## Compatibility and recovery

QuestUI depends on Discord UI components and Vencord patches, so a Discord update can occasionally break a matcher or native lookup.

The compatibility workflow runs:

- pure native-enroll result and manual claim-decision tests;
- pure manual mutation timestamp/account/listener safety tests;
- pure Orion command/companion-surface tests;
- a clean Vencord build/type-check and QuestUI bundle assertions;
- a second Vencord build/type-check with current upstream `nyxxbit/discord-quest-completer` installed beside QuestUI;
- reporter parser validation;
- Discord Stable and Canary patch reporters.

Reporter coverage includes the native progress, artwork, Orb-component, QuestStore, task-selection, native Enroll, and native Claim lookups. Orion discovery/control uses Vencord PluginManager/Commands API plus Orion's explicit companion surface rather than a Discord webpack finder.

Automated checks do not prove a live Discord Accept/Claim or a real Orion farming session. Those paths should still be exercised in a real client when suitable Quests are available, and build/reporter success must not be presented as live runtime evidence.

If Discord won't start after an update, close it, move the `QuestUI` folder out of `Vencord/src/userplugins`, then rebuild and inject Vencord again. When reporting a compatibility issue, include your Discord channel and Vencord version.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope, dev setup, testing, and PR guidance.

Use the repo's issue forms for bugs, feature requests, or questions.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

It's a standalone extraction and refactor of the Quest interface originally built for [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The original quest-completion engine was stripped out. Later QuestUI work added narrowly scoped manual Accept/Claim actions and optional global Orion companion controls without moving farming/progress generation back into QuestUI.

Credit to **nicola02nb** for the original Quest UI implementation, and to the Vencord project and its contributors for the plugin framework underneath it all.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full list of contributors and acknowledgements.

QuestUI is maintained independently and isn't affiliated with or endorsed by `completeDiscordQuest`, [OrionQuests](https://github.com/nyxxbit/discord-quest-completer), Discord, or Vencord.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE) for the full text.