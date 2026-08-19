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
- A native **Reload** button that asks Discord itself to fetch and dispatch the current Quest list, with visible success/failure feedback
- Optional Orion controls in Dashboard Mode when a compatible OrionQuests build is installed:
  - Smart **Start / Pause / Resume** global control
  - Separate **Stop** control
  - Compact per-Quest **Start / Pause / Resume** control for enrolled Quests
  - Start and Resume deliberately use the same Play icon; Pause uses a real yellow pause glyph

QuestUI does not turn Stop into Pause, does not reset Quest progress, and does not implement a targeted `startQuest`. Start remains an engine-wide Orion action; Orion's own scheduler and concurrency limits decide which enrolled Quests run or queue.

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

QuestUI and [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) can be installed side by side. The compatibility workflow builds both current upstream OrionQuests and the compatible pause/resume companion fork beside QuestUI so command-surface/build drift is caught automatically. Both projects still rely on Discord/Vencord internals, so a future update may require compatibility work.

The smart Dashboard controls require OrionQuests to expose the narrow companion methods QuestUI consumes: source-of-truth engine/task state, a state-change subscription, watcher-aware engine Start/Stop, global Pause/Resume, and exact-ID per-Quest Pause/Resume. If those methods are absent, QuestUI keeps its normal Quest UI/actions and Reload button but does not expose a callable Orion control. The compatible `Herzchens/discord-quest-completer` pause/resume branch exposes that surface without moving farming logic into QuestUI.

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

The Dashboard header keeps the action order stable: **Smart Orion control → Stop → Reload → Filter**. Reload works even when Orion integration is unavailable.

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

While the enrollment request is pending the card shows **Processing…**. After Discord confirms `enrolledAt`, the large Accept button disappears. If compatible Orion integration is enabled, the same action slot becomes a compact Orion control and QuestUI starts Orion when the engine is idle. This auto-start happens only after Discord store confirmation; a merely submitted or uncertain enrollment does not start the engine.

#### Reward claim

Reward claim likewise reuses Discord's native Quest claim action, located by its verified begin/success/failure plus sealed-traffic-metadata code fragments. This keeps the click on Discord's normal client claim/challenge path.

In-game rewards are claimed only when Discord supplies **exactly one unambiguous configured platform**. Verified reward-code/collectible/virtual-currency/fractional-premium families use their cross-platform target. Unknown, malformed, or ambiguous reward configuration fails closed and directs you to Quest Home instead of guessing.

If Discord requires CAPTCHA or another verification challenge, QuestUI does not solve/bypass it and does not auto-retry.

QuestUI never optimistically marks a Quest accepted or claimed. It waits for Discord QuestStore confirmation.

### Orion Integration

**Dashboard • Orion Integration** is shown only when Vencord detects an installed `OrionQuests` plugin and is usable only with Dashboard Mode plus an enabled/lifecycle-started Orion whose registered command identity and companion control surface match what QuestUI expects.

QuestUI verifies that the detected Orion build:

- owns the exact registered Vencord `orion` command with the expected required `action` option and `start`, `stop`, `pause`, and `resume` choices;
- exposes source-of-truth engine/task state instead of requiring QuestUI to maintain a mirror;
- exposes a state-change subscription backed by Orion's own dashboard/runtime updates;
- exposes engine Start/Stop, global Pause/Resume, and exact-ID per-Quest Pause/Resume delegation.

The Dashboard header renders two Orion buttons when integration is compatible:

- **Smart** button — Start, Pause, or Resume depending on live state
- **Stop** button — engine shutdown only

Start and Resume use the **same Play icon**. Pause uses a real two-bar Pause SVG and the warning/yellow color. Stop uses a square Stop glyph.

The global state rules are deliberately conservative:

- no Available or In-Progress Discord Quests → Smart and Stop are both disabled;
- engine stopped with unfinished work → Start enabled, Stop disabled;
- engine stopped with an explicit paused Quest → Resume enabled, Stop disabled;
- engine running with RUNNING/QUEUE work → Pause enabled, Stop enabled;
- engine running with only paused controllable work → Resume enabled, Stop enabled;
- engine running during a short scan/startup window with no published controllable row yet → Smart disabled, Stop enabled.

QuestUI re-reads Orion's companion snapshot on render; React state is used only to schedule renders, not as a second engine/task-state mirror. Auto Start, enrollment-watcher starts, slash-command controls, natural queue drain, and QuestUI controls therefore converge on Orion's own state.

Per-Quest controls are shown only for Discord **In Progress** cards while the companion surface is valid:

- engine stopped → **Start** (engine-wide, not targeted)
- Orion RUNNING/QUEUE for that Quest → **Pause**
- Orion PAUSED for that Quest → **Resume**
- engine running before Orion has published that Quest's task row → compact control remains disabled instead of guessing.

Pause/Resume target the exact Discord Quest ID. Start remains engine-wide, so Orion's own scheduler and `gameConcurrency` / `videoConcurrency` limits decide which accepted Quests run immediately and which remain queued.

QuestUI calls Orion's companion methods rather than the slash-command callback, so Dashboard controls work from non-chat Discord views without fabricating a channel or emitting a Clyde command response. QuestUI does not import Orion source modules, manipulate Orion settings, enable/disable the Orion plugin, or reach into TaskRunner/Traffic/Patcher/farming internals.

### Quest list Reload

Reload uses Discord's own current-Quest fetch-and-dispatch action located by `QUESTS_FETCH_CURRENT_QUESTS_BEGIN`. QuestUI does not reload the whole client, call a handcrafted Quest REST endpoint, or mutate QuestStore by hand.

The request starts immediately. The circular-arrow icon spins for at least two seconds, but the visual minimum never delays the network request itself: a fast request keeps the spinner visible until two seconds have elapsed, while a slower request simply keeps spinning until the actual request finishes. Overlapping reload calls share the same in-flight native request. Success and failure are surfaced with toasts.

Because QuestUI already subscribes to Discord's QuestStore, a successful native fetch causes the existing Dashboard snapshot to update naturally. A successful refresh with no new Quest is still reported as success.

### Detailed Status

**Detailed Status • Enabled** swaps the basic attention dot for a compact numeric badge. It shows one state at a time, in priority order:

1. **Yellow** — In Progress
2. **Green** — Ready to Claim
3. **Red** — Available

The number reflects only the displayed state, not every quest — one Available, two In Progress, and one Ready to Claim would show a yellow **2**.

The tooltip breaks down the full picture: each status with its own color, the attention total, and the nearest expiry.

Detailed Status can either follow the same persisted filter scope as the Dashboard, or use its own separate scope for status, reward category, and Quest type — so you could, say, set an Orbs-only badge and stop an available Avatar Decoration quest from turning the button red.

Dashboard Mode, Detailed Status, Dashboard filters, manual actions, Orion controls, and Reload are runtime behavior. Patch-controlled shortcut/counter settings still need a restart.

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

This progress behavior is the same whether OrionQuests is installed or not: Orion may change Discord's Quest state, but QuestUI just reads the resulting QuestStore/selector output rather than tracking a separate progress counter.

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
- pure Orion control-state matrix tests;
- pure Reload minimum-spin timing tests;
- a clean Vencord build/type-check and QuestUI bundle assertions;
- a combined build/type-check with current upstream `nyxxbit/discord-quest-completer`;
- a combined build/type-check with the compatible `Herzchens/discord-quest-completer` pause/resume companion branch;
- reporter parser validation;
- Discord Stable and Canary patch reporters.

Reporter coverage includes the native progress, artwork, Orb-component, QuestStore, task-selection, native Enroll, native Claim, and native current-Quest Reload lookups. Orion discovery/control uses Vencord PluginManager/Commands API plus Orion's explicit companion surface rather than a Discord webpack finder.

Automated checks do not prove a live Discord Accept/Claim, native Reload, or a real Orion farming session. Those paths should still be exercised in a real client when suitable Quests are available, and build/reporter success must not be presented as live runtime evidence.

If Discord won't start after an update, close it, move the `QuestUI` folder out of `Vencord/src/userplugins`, then rebuild and inject Vencord again. When reporting a compatibility issue, include your Discord channel and Vencord version.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope, dev setup, testing, and PR guidance.

Use the repo's issue forms for bugs, feature requests, or questions.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

It's a standalone extraction and refactor of the Quest interface originally built for [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The original quest-completion engine was stripped out. Later QuestUI work added narrowly scoped manual Accept/Claim actions plus optional Orion companion controls without moving farming/progress generation back into QuestUI.

Credit to **nicola02nb** for the original Quest UI implementation, and to the Vencord project and its contributors for the plugin framework underneath it all.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full list of contributors and acknowledgements.

QuestUI is maintained independently and isn't affiliated with or endorsed by `completeDiscordQuest`, [OrionQuests](https://github.com/nyxxbit/discord-quest-completer), Discord, or Vencord.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE) for the full text.