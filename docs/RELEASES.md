# Release channels

QuestUI publishes Stable from `main`. Historical beta/fork pairings are documented only for old release context and are not current installation targets.

## Stable — v1.3.0

- Source: `Herzchens/QuestUI` branch `main`.
- Release target: **v1.3.0** (2026-09-11).
- v1.3.0 promotes **Event Log** to a supported Stable surface and removes the old preview badge/wording from current UI and documentation.
- Event Log history is account-aware for newly captured records. Pre-account records remain recoverable as visibly marked **LEGACY** rows because their original account cannot be proven; they are never silently migrated to the current account.
- Desktop Event Log persistence remains one sanitized `events.jsonl` file. The hard limit is 10 MiB; when exceeded, complete oldest records are discarded until the file is reduced toward about 5 MiB.
- Large histories use stable snapshot/cursor pagination in pages of 250 events and an Event-Log-owned windowed renderer. Pagination/query changes do not fall back to the former 5,000-row desktop cap, and malformed persisted records are rejected at the native boundary rather than crashing the Viewer.
- Event Log supports Source / Level / Category filtering, search, Newest / Oldest / Errors-first sorting, day grouping, whole-row semantic color, account-change emphasis, storage/matching indicators, **View details**, sanitized report copy, Open file, and the confirmation-gated **Clear log** flow.
- When Orion exposes `subscribeEvents()`, QuestUI consumes Orion's structured event code/category/level/failure fields as authoritative. Recognized console output remains a sanitized fallback and is briefly reconciled against structured twins to avoid duplicate persistence.
- When Orion exposes `getSchedulerSnapshot()` plus `subscribeSchedulerState()`, QuestUI shows live game/video lane limits, running/waiting counts, and current per-Quest running/waiting state. The panel is explicitly **unordered** and does not infer queue position or future execution order.
- Runtime Orion controls still target **OrionQuests v4.10.7 or newer**. Structured Event Log and scheduler capabilities are additive, independently feature-detected capabilities and do not silently raise the hard core-control minimum.
- The maintained Orion coexistence build/type-check tracks upstream `nyxxbit/discord-quest-completer` `main`.
- During v1.3.0 release preparation, the maintainer confirmed the corrected Event Log renderer against a 10k+ persisted history after the blank-list regression was fixed. Automated compatibility checks remain separate evidence and are not presented as proof of Discord mutations or a real Orion farming session.
- QuestUI and OrionQuests remain separate Vencord userplugins and separate repositories.

### Upgrade note

`Dashboard • Mode` defaults to enabled for fresh settings. Vencord correctly preserves an existing stored value, so users who previously toggled Dashboard Mode off may keep `false` after upgrading and will need to enable Dashboard Mode manually. This is expected persisted-setting behavior, not a regression.

Existing `events.jsonl` history is retained. Rows written before account-aware persistence can still appear as **LEGACY** because the old schema did not record enough ownership information to assign them safely.

## Previous releases

### v1.2.1 — previous hotfix

Fixed Orion-owned timed Quest cards retaining Discord's optimistic active-desktop projection after Orion paused/stopped them, and distinguished connected Orion **Running** from **Idle**.

### v1.2.0 — previous feature release

Expanded the Dashboard with persistent sorting/expired-history controls, native Orb/runtime metadata, and the initial persistent Event Log diagnostic surface.

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

1. Merge/promote the reviewed release-prep commit to `main`; Stable tags must target the final `main` commit, not a feature-branch-only SHA.
2. Confirm the intended release tag does not already exist locally or on the remote, and confirm the local `main` SHA exactly matches `origin/main`.
3. Confirm `version.ts`, README, changelog, and this document all name the same release version.
4. Confirm the latest QuestUI Compatibility workflow for the exact release target is green, including build/type-check, Stable/Canary reporters, and the maintained upstream Orion `main` coexistence job.
5. Distinguish automated compatibility evidence from live Discord runtime evidence. State exactly what was and was not manually tested.
6. Create a **signed annotated tag**, verify that its peeled commit is the intended `main` SHA, and verify the signature locally before pushing the tag.
7. Push only the tag after the target/signature checks pass; publishing the GitHub Release is a separate action.
8. Publish a normal release unless the target is intentionally designated as a prerelease.
9. When describing Orion compatibility, distinguish the minimum supported companion baseline (**v4.10.7+**) from the exact Orion version/commit used in any live test.
10. Keep QuestUI and Orion source/license boundaries separate.

Release notes must describe only behavior actually present in the target and testing that was actually performed.
