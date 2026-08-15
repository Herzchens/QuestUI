# QuestUI

QuestUI is a standalone Vencord userplugin that adds quick access to Discord Quests and a compact, live overview of their current status.

It does **not** complete, enroll in, claim, or modify quests. QuestUI only adds interface elements and reads quest status information already available in the Discord client. It can be used on its own or alongside [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest-related plugins.

QuestUI is designed to coexist with [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest-related plugins because it does not modify quest progress or completion logic. Compatibility cannot be guaranteed when another plugin patches the same Discord interface components.

## Features

- Optional Quests shortcut in Discord's top bar.
- Optional Quests shortcut beside the mute, deafen, and settings controls.
- Optional **Dashboard Mode** that opens a live mini Quest dashboard instead of navigating immediately to Quest Home.
- Quest cards with Discord-provided game artwork, task-type badges, status, reward, progress, and time remaining.
- Dashboard filters for Quest status, reward category, and task type.
- Optional **Detailed Status** numeric badge with configurable filtering.
- A basic status dot for quests that need attention when Detailed Status is disabled.
- Optional color-coded counters on Discord Quest Home links.
- Direct navigation to Discord's Quest Home page at all times.
- Live QuestStore synchronization using Discord's native Quest-card progress selectors rather than an independent QuestUI progress clock.

## Installation

### UserpluginInstaller

Install QuestUI through UserpluginInstaller using the repository URL:

```
https://github.com/Herzchens/QuestUI
```

### Manual Vencord source installation

Clone QuestUI into your Vencord userplugins directory:

```bash
cd Vencord/src/userplugins
git clone https://github.com/Herzchens/QuestUI.git
cd ../..
pnpm build
pnpm inject
```

To update QuestUI:

```bash
git -C Vencord/src/userplugins/QuestUI pull
cd Vencord
pnpm build
pnpm inject
```

Restart Discord, open Vencord settings, and enable **QuestUI**.

The colored Quest Home counter patch is disabled by default because Discord UI matchers may change between client builds. First confirm that the top-bar button works correctly, then enable **Show colored Quest Home counters** and restart Discord.

### Using QuestUI with OrionQuests

QuestUI and [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) have been tested together successfully on current Vencord and Discord builds. Both projects depend on Discord internals, so future Discord updates may require compatibility fixes.

**Orion prebuilt bundle** is a pre-compiled distribution. QuestUI cannot be installed by copying source files into a prebuilt bundle. Users who want QuestUI alongside OrionQuests should use the Orion devbuild installer or a Vencord source build.

**Orion devbuild installer** — The Orion devbuild checkout is located at `%LOCALAPPDATA%\OrionVencord`. To install QuestUI:

Command Prompt:

```cmd
git clone https://github.com/Herzchens/QuestUI.git "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI"
```

PowerShell:

```powershell
git clone https://github.com/Herzchens/QuestUI.git "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI"
```

Then run `UPDATE.cmd` to rebuild.

To update QuestUI:

Command Prompt:

```cmd
git -C "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI" pull
```

PowerShell:

```powershell
git -C "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI" pull
```

Then run `UPDATE.cmd` again. The Orion updater does not remove sibling folders like QuestUI, but it also does not run `git pull` for QuestUI automatically. QuestUI and OrionQuests are updated independently. There is no combined bundle.

### Compatibility matrix

| Installation method | QuestUI support | Method |
|---|---|---|
| UserpluginInstaller | Yes | Install using the repository URL |
| Vencord source/dev build | Yes | Clone into `src/userplugins` |
| Orion devbuild installer | Yes | Clone into OrionVencord and run `UPDATE.cmd` |
| Orion prebuilt bundle | Not directly | Move to the devbuild installer |

## Settings

### Buttons and Quest Home counters

- **Show Quests button in top bar** — Adds the Quest shortcut to Discord's top bar. Requires a Discord restart.
- **Show Quests button in settings bar** — Adds the Quest shortcut beside mute, deafen, and settings. Requires a Discord restart.
- **Show colored Quest Home counters** — Adds numeric counters to Discord Quest Home links. Requires a Discord restart.

### Dashboard Mode

**Dashboard Mode** changes the Quest button click action at runtime:

- Off — clicking the Quest button navigates directly to `/quest-home`.
- On — clicking the Quest button opens QuestUI's mini dashboard.

The dashboard always keeps **Open Quest Home** visible, so Discord's full Quest interface remains one click away.

Dashboard filters are applied immediately and do not require a restart:

- Status: Available, In Progress, Ready to Claim, Claimed, Expired.
- Reward: All rewards, Orbs only, Non-Orb rewards.
- Quest type: Play, Stream, Video, Activity, Other / Unknown.
- Unknown reward formats can remain visible while using a specific reward filter. This is enabled by default for forward compatibility.

Claimed and expired quests are hidden by default. Unknown Quest task types are shown by default so a new Discord task type is not silently lost after a client update.

### Detailed Status

**Detailed Status** replaces the basic attention dot with a compact numeric badge. The badge shows one state at a time using this priority:

1. **Yellow — In Progress**
2. **Green — Ready to Claim**
3. **Red — Available**

The number belongs to the displayed state, not to all quests. For example, if there is one Available quest, two In Progress quests, and one Ready to Claim quest, the button displays a yellow **2**.

The tooltip reports the full attention breakdown with separate status colors, the attention total, and the nearest expiry.

Detailed Status can either:

- use the same filters as Dashboard Mode; or
- use a separate custom scope for status, reward category, and Quest type.

This allows, for example, an **Orbs only** status badge so an available Avatar Decoration quest does not keep the button red.

Dashboard Mode and Detailed Status settings are runtime UI settings and do **not** require Discord to restart.

## Live progress behavior

QuestUI does not take a one-time progress snapshot when Dashboard Mode opens and does not run an independent progress engine.

The Dashboard progress ring uses the same native completion selector Discord calls immediately before rendering its own Quest-card progress ring. QuestUI reads Discord's `completedRatio` for the ring and `completedRatioDisplay` for the text, so Discord's own optimistic progress, active desktop progress, achievement representation, and percentage rounding remain the source of truth.

The secondary current/target line also follows Discord's native task selection first. For multi-option and multi-platform Quests, Discord selects the live task from its progress event name and heartbeat/update timestamps. `taskConfigV2` is preferred over the legacy task config rather than merging both schemas.

QuestUI still listens to QuestStore changes for immediate state transitions. A short local interval only forces an already-open React dashboard to re-evaluate the same native Discord selectors; it never increments progress itself and never sends Quest network requests.

This path is intentionally identical whether OrionQuests is installed or not: Orion may cause Discord's Quest state to change, but QuestUI reads the resulting Discord QuestStore/native selector output instead of maintaining or consuming a separate Orion progress counter.

## Status colors

### Quest Home counters

- **Red** — Available quests that can be enrolled in.
- **Yellow** — Enrolled quests that are still in progress.
- **Green** — Completed quests with rewards ready to claim.
- **Blurple** — Claimed quests.

### Basic shortcut status dot

When Detailed Status is disabled, the shortcut shows one attention dot using the same priority as Detailed Status:

1. **Yellow** when at least one Quest is in progress.
2. **Green** when no Quest is in progress but at least one reward is ready to claim.
3. **Red** when no higher-priority state exists but at least one Quest is available.
4. **No dot** when nothing currently needs attention.

## Compatibility and recovery

QuestUI relies on Discord UI components and Vencord patches, so a Discord update may occasionally break a matcher.

If Discord fails to start correctly after an update, close Discord, move the `QuestUI` folder out of `Vencord/src/userplugins`, then rebuild and inject Vencord again. When reporting a compatibility problem, include your Discord channel and Vencord version.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for project scope, development setup, testing requirements, and pull request guidance.

Use the repository's issue forms to report bugs, request enhancements, or ask questions.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

The plugin is a standalone extraction and refactor of the Quest interface originally included in [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The quest-completion functionality was removed, while the interface was adapted into a separate plugin and received additional compatibility fixes, safer status handling, updated navigation, and other maintenance changes.

Credit goes to **nicola02nb** for the original Quest UI implementation and to the Vencord project and its contributors for the underlying plugin framework.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for project contributors and acknowledgements.

QuestUI is maintained independently and is not affiliated with or endorsed by `completeDiscordQuest`, [OrionQuests](https://github.com/nyxxbit/discord-quest-completer), Discord, or Vencord.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE) for the full license text.
