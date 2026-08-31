# Release channels

QuestUI publishes Stable from `main`. The old v1.1.0 beta branch remains historical only; the full companion feature set has since landed on `main` and now targets upstream OrionQuests.

## Stable — v1.1.0

- Source: `Herzchens/QuestUI` branch `main`
- Live-tested implementation checkpoint: `5f114702aefaa8cce3a8c654fa1c97c5c278725c`
- Includes the full Dashboard, explicit manual Accept/Claim, native Quest-list Reload, and Orion companion controls.
- Orion integration targets upstream `nyxxbit/discord-quest-completer` **v4.10.7 or newer**.
- The final live integration pass was completed against **OrionQuests v4.10.8** on Discord Canary with QuestUI `5f11470`; build and `testTsc` were clean, external `/orion` state transitions propagated into an already-open Dashboard, and a real Quest progressed while the Dashboard remained open.
- QuestUI and OrionQuests remain separate Vencord userplugins and separate repositories.

### Upgrade note

`Dashboard • Mode` defaults to enabled for fresh settings. Vencord correctly preserves an existing stored value, so users who previously toggled Dashboard Mode off may keep `false` after upgrading and will need to enable it manually. This is expected persisted-setting behavior, not a regression.

## Previous releases

### v1.1.0-beta.1 — historical prerelease

The old beta paired QuestUI's experimental Orion controls with `Herzchens/discord-quest-completer:feat/per-quest-pause-resume`. That pairing is no longer required for Stable v1.1.0 because the companion contract is now available upstream.

### v1.0.1 — previous Stable

The previous Stable release contained the established Dashboard/read-only feature set before manual Accept/Claim, native Reload, and upstream Orion companion controls were promoted to Stable.

## Publishing checklist

1. Confirm tag `v1.1.0` does not already exist.
2. Confirm `main` contains the intended release-prep metadata and no runtime changes beyond the live-tested QuestUI `5f11470` implementation checkpoint.
3. Confirm the latest QuestUI Compatibility workflow for the release target is green.
4. Confirm release notes mention the persisted `Dashboard • Mode` upgrade caveat.
5. Publish `v1.1.0` as a normal GitHub release, not a pre-release.
6. State upstream Orion compatibility as **v4.10.7+**, with the live integration pass performed against **v4.10.8**.
7. Keep QuestUI and Orion source/license boundaries separate.

The Stable release notes should describe only behavior actually present in `main` and testing that was actually performed.
