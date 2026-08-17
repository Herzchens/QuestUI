# QuestUI

QuestUI is a standalone Vencord userplugin for quick access to Discord Quests and a compact, live view of where they stand.

It won't complete, enroll in, claim, or otherwise touch quest progress — it just adds UI and reads status info Discord already exposes. Use it on its own or alongside [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest plugins; since QuestUI never modifies quest state, it's built to coexist with them, though compatibility isn't guaranteed if another plugin patches the same Discord components.

## Features

- Optional Quest shortcut in Discord's top bar
- Optional Quest shortcut next to mute, deafen, and settings
- Optional **Dashboard Mode**, which opens a live mini Quest dashboard instead of jumping straight to Quest Home
- Quest cards with Discord's own artwork, task-type badges, status, reward, native progress, and time remaining
- Floating dashboard filters for status, reward category, and task type, with **Recommended** and **Clear all** shortcuts
- Optional numeric **Detailed Status** badge with its own filtering
- A basic status dot for quests needing attention when Detailed Status is off
- Optional color-coded counters on Discord's own Quest Home links, independent of the shortcut buttons
- Direct navigation to Discord's Quest Home page, always available
- Live QuestStore sync via Discord's native Quest-card progress selectors — no separate QuestUI progress clock
- Nitro Orb rewards shown with Discord's 1.2x multiplier where eligible, while the underlying base reward data stays unchanged

## Installation

### UserpluginInstaller

Install via UserpluginInstaller using the repo URL:

```
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

QuestUI and [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) have been tested together and work fine on current Vencord and Discord builds. Both rely on Discord internals, though, so a future Discord update could require fixes on either side.

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

Then run `UPDATE.cmd` again. Note that Orion's updater won't delete sibling folders like QuestUI, but it also won't pull QuestUI's updates for you — the two are updated separately, and there's no combined bundle.

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

A small count on the Filter button shows when restrictions are active. Claimed and expired quests stay hidden by default, while unknown Quest task types stay visible by default, so a new Discord task type doesn't just quietly disappear after a client update.

### Detailed Status

**Detailed Status • Enabled** swaps the basic attention dot for a compact numeric badge. It shows one state at a time, in priority order:

1. **Yellow** — In Progress
2. **Green** — Ready to Claim
3. **Red** — Available

The number reflects only the displayed state, not every quest — one Available, two In Progress, and one Ready to Claim would show a yellow **2**.

The tooltip breaks down the full picture: each status with its own color, the attention total, and the nearest expiry.

Detailed Status can either follow the same persisted filter scope as the Dashboard, or use its own separate scope for status, reward category, and Quest type — so you could, say, set an Orbs-only badge and stop an available Avatar Decoration quest from turning the button red.

Dashboard Mode, Detailed Status, and Dashboard filters are all runtime settings — none of them need a Discord restart.

## Dashboard reward display

Orb rewards use Discord's own themed Orb component. QuestUI keeps Discord's base reward value in its normalized data untouched, and only adjusts what's *displayed* on Dashboard cards when the current account qualifies for Discord's Nitro Orb multiplier.

For eligible full Nitro accounts on qualifying Orb Quests, QuestUI shows the 1.2x amount:

- `200 Orbs` → `240 Orbs`
- `700 Orbs` → `840 Orbs`

Nitro Basic and Discord's fractional/credit-only Nitro state don't qualify. The multiplier only applies to quests from the current Discord multiplier period — older quests keep their base Orb amount.

## Live progress behavior

QuestUI doesn't take a one-time snapshot when Dashboard Mode opens, and it doesn't run its own progress engine.

The dashboard's progress ring uses the same native completion selector Discord calls right before rendering its own Quest-card ring. QuestUI reads Discord's `completedRatio` for the ring and `completedRatioDisplay` for the text, so Discord's optimistic progress, active desktop progress, achievement handling, and rounding all stay the source of truth.

The current/target line underneath follows Discord's native task selection too. For multi-option or multi-platform quests, Discord picks the live task based on its progress event name and heartbeat/update timestamps, and `taskConfigV2` is used over the legacy config rather than merging the two.

QuestUI still listens for QuestStore changes so it can react to state transitions right away. A short local interval just forces an already-open dashboard to re-check the same native selectors — it never increments progress on its own and never sends quest-related network requests.

This behavior is the same whether OrionQuests is installed or not: Orion may change Discord's Quest state, but QuestUI just reads the resulting QuestStore/selector output rather than tracking a separate Orion counter.

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

QuestUI depends on Discord's UI components and Vencord patches, so a Discord update can occasionally break a matcher or native lookup.

The repo's compatibility workflow runs a clean Vencord build/type-check plus Discord Stable and Canary patch-reporter output, covering the native progress, artwork, and Orb-component lookups the Dashboard relies on.

If Discord won't start after an update, close it, move the `QuestUI` folder out of `Vencord/src/userplugins`, then rebuild and inject Vencord again. When reporting a compatibility issue, include your Discord channel and Vencord version.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope, dev setup, testing, and PR guidance.

Use the repo's issue forms for bugs, feature requests, or questions.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

It's a standalone extraction and refactor of the Quest interface originally built for [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The quest-completion logic was stripped out, and the interface was rebuilt as its own plugin with additional compatibility fixes, safer status handling, updated navigation, and ongoing maintenance.

Credit to **nicola02nb** for the original Quest UI implementation, and to the Vencord project and its contributors for the plugin framework underneath it all.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full list of contributors and acknowledgements.

QuestUI is maintained independently and isn't affiliated with or endorsed by `completeDiscordQuest`, [OrionQuests](https://github.com/nyxxbit/discord-quest-completer), Discord, or Vencord.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE) for the full text.
