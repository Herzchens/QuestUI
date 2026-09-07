# Release channels

QuestUI publishes Stable from `main`. Historical beta/fork pairings are documented only for old release context and are not current installation targets.

## Stable — v1.2.0

- Source: `Herzchens/QuestUI` branch `main`.
- Latest published release: **v1.2.0** (2026-09-07).
- v1.2.0 expands the Dashboard, adds persistent sorting and expired-history age controls, native Orb balance/runtime metadata, and the Event Log **Preview Feature** with persistent sanitized diagnostics.
- The Dashboard always shows Available, Ready, In Progress, Claimed, Expired, and Hidden counts, including zeros. Accepted active Quests remain pinned above available/history cards under every sort mode.
- Valid expiry copy is no longer limited to a 15-day presentation window; the separate expired-age filter defaults to 15 days and can be set to 7/30/90/custom/All.
- Event Log persists one `events.jsonl` file up to 10 MiB and compacts oldest complete records back to about 5 MiB. It captures QuestUI and recognized Orion output only, supports Source/Level/Category/search/sort/day grouping, detail views, and sanitized diagnostic-report copy.
- Runtime Orion integration still targets **OrionQuests v4.10.7 or newer**. Known versions below v4.10.7 are hard-incompatible; future optional capabilities are feature-detected so compatible older builds keep fallback behavior.
- The maintained Orion coexistence build/type-check tracks upstream `nyxxbit/discord-quest-completer` `main`.
- v1.2.0 received maintainer live UI/runtime review for the Dashboard, filters/sorting, metadata and Event Log surfaces. The most recent separately documented full Orion farming/integration pass remains v1.1.0 checkpoint `5f114702aefaa8cce3a8c654fa1c97c5c278725c` with OrionQuests v4.10.8 on Discord Canary.
- QuestUI and OrionQuests remain separate Vencord userplugins and separate repositories.

### Upgrade note

`Dashboard • Mode` defaults to enabled for fresh settings. Vencord correctly preserves an existing stored value, so users who previously toggled Dashboard Mode off may keep `false` after upgrading and will need to enable Dashboard Mode manually. This is expected persisted-setting behavior, not a regression.

## Previous releases

### v1.1.2 — previous hotfix

Fixed the remaining intermittent shortcut activation issue reported in #11 and removed the deprecated duplicate OrionQuests v4.10.7 CI leg while retaining upstream-main coexistence coverage.


### v1.1.1 — previous hotfix

Restored Quest shortcut compatibility after Discord changed the shared Header Bar component identity.

### v1.1.0 — previous feature release

Promoted the full Dashboard, explicit manual Accept/Claim, native Quest-list Reload, and upstream Orion companion controls to Stable.

### v1.1.0-beta.1 — historical prerelease

The old beta paired QuestUI's experimental Orion controls with `Herzchens/discord-quest-completer:feat/per-quest-pause-resume`. That pairing is historical; the companion contract is available upstream.

### v1.0.1 — historical Stable

The earlier Stable release contained the Dashboard/read-only-era feature set before manual Accept/Claim, native Reload, and upstream Orion companion controls were promoted.

## Publishing checklist

1. Confirm the intended release tag does not already exist and points to the intended `main` target.
2. Confirm release-prep metadata matches the implementation being published and does not claim behavior absent from the target commit.
3. Confirm the latest QuestUI Compatibility workflow for the release target is green, including Stable/Canary reporter results and the maintained upstream Orion `main` coexistence job.
4. Distinguish automated compatibility evidence from live Discord runtime evidence. State exactly what was and was not manually tested.
5. Publish a normal release unless the target is intentionally designated as a prerelease.
6. When describing Orion compatibility, distinguish the minimum supported companion baseline (**v4.10.7+**) from the exact Orion version/commit used in any live test.
7. Keep QuestUI and Orion source/license boundaries separate.

Release notes must describe only behavior actually present in the target and testing that was actually performed.
