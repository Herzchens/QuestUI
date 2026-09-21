# Release channels

QuestUI publishes Stable from `main`. Historical beta/fork pairings are documented only for old release context and are not current installation targets.

## Stable — v1.4.1

- Source: `Herzchens/QuestUI` branch `main`.
- Release target: **v1.4.1** (2026-09-21).
- Adds an always-visible header **Claim All N** control for non-ignored Ready rewards, disabled at `N = 0` and actionable from one Ready reward onward. The click captures a fixed same-account snapshot; each native claim must be store-confirmed before the next, and verification/CAPTCHA or any uncertain state stops the batch without retry.

- Adds **New Quest Available** notifications with startup/account hydration treated as baseline rather than backlog.
- Ends Ignore automatically when Discord reports the Quest **Expired** and prunes stale ignored IDs best-effort without changing Discord Quest state.
- Reads Discord's explicit base/boosted Orb fields and native Quest multiplier eligibility instead of locally multiplying Nitro rewards. The Dashboard shows the existing **Nitro** badge for the Nitro source or **Xbox+** with the Xbox brand mark for the Xbox Game Pass source; native Nitro precedence is preserved if both sources are present.
- Adds the Dashboard/Settings Update Center for manual checks, configurable release-check cadence, prerelease policy, optional Orion checks, and managed fail-closed update execution.
- Release preparation included maintainer live Discord Stable validation of the final Dashboard/header presentation, including the title/Quest-icon layout, Claim All placement/count badge, and Orb balance styling. The sequential Claim All mutation path itself was not separately exercised in that final UI pass; automated regression/CI coverage must not be described as live mutation evidence.

## Previous Stable — v1.4.0

- Source: `Herzchens/QuestUI` branch `main`.
- Release target: **v1.4.0** (2026-09-15).
- v1.4.0 adds account-scoped **Ignore / Unignore** for enrolled In-Progress Quests. Ignored IDs are persisted per Discord account, remain a QuestUI-local presentation preference rather than a Discord Quest status, and are recoverable through the explicit **Ignored** catalogue.
- The Dashboard summary now always renders seven values: Available, Ready, In Progress, Claimed, Expired, Ignored, and Hidden. Ignored is counted separately and does not inflate Hidden.
- Ignored Quests are excluded from the normal Dashboard list, shortcut attention, Detailed Status, Quest Home counters, and QuestUI notification attention paths while retaining their real Discord status/progress in the Ignored catalogue.
- When compatible Orion explicitly reports the exact Quest as active (`running` / `queued`, or scheduler `running` / `waiting`), Ignore delegates an exact-ID **Pause** before local persistence. If the Pause fails and Orion still reports that Quest active, Ignore fails closed and the card stays visible. Ignore never becomes a global Stop, and **Unignore never auto-resumes or starts Orion**.
- Ignore persistence remains account-scoped across account switches and recovers from failed writes without leaving false optimistic state. Defensive bounds retain the newest requested Ignore while evicting the oldest stored Quest/account entry when necessary.
- The Ignore/Unignore action uses compact eye-off / eye controls with accessible labels; the Ignored summary/card treatment is visually distinct from muted Hidden.
- v1.4.0 adds **Notifications • Ready to Claim** and **Notifications • Problems**. Both are separately configurable and both default to enabled.
- Ready-to-Claim notifications require an observed same-account Discord **In Progress → Ready to Claim** transition. Initial hydration, plugin restart, account switch, Ignore/Unignore hydration, or enabling the setting after completion does not synthesize a completion notification.
- Problems notifications consume sanitized Event Log rows. `error` is actionable; `warning` is actionable only when structured detail explicitly marks it terminal. Normal retries, fallbacks, recoveries, and progress events do not notify.
- QuestUI uses Vencord's Notifications API rather than a companion bot, backend, DM relay, or parallel notification service. Delivery therefore follows Vencord's notification settings, including in-app notifications, native desktop notifications, and the normal Vencord Notification Log.
- Existing Event Log history is a baseline rather than a notification backlog. Problem notifications use short-lived semantic deduplication and delayed desktop Event Log scans/rechecks so asynchronous persistence does not silently lose a newly actionable event.
- Runtime Orion controls still target **OrionQuests v4.10.7 or newer**. Structured Event Log and scheduler capabilities remain additive, independently feature-detected capabilities and do not silently raise the hard core-control minimum.
- The maintained Orion coexistence build/type-check tracks upstream `nyxxbit/discord-quest-completer` `main`.
- During v1.4.0 release preparation, the maintainer confirmed in live Discord that Ignore pauses the intended Orion-controlled Quest and separately confirmed that a real Ready-to-Claim notification was delivered. The Problems notification path was not separately forced in live Discord; its coverage is automated logic/CI evidence only.
- QuestUI and OrionQuests remain separate Vencord userplugins and separate repositories.

### Upgrade note

`Dashboard • Mode` defaults to enabled for fresh settings. Vencord correctly preserves an existing stored value, so users who previously toggled Dashboard Mode off may keep `false` after upgrading and will need to enable Dashboard Mode manually. This is expected persisted-setting behavior, not a regression.

Both new notification categories default to enabled for users without an existing stored override. Notification delivery follows the user's global Vencord notification configuration.

Existing `events.jsonl` history is retained. Rows written before account-aware persistence can still appear as **LEGACY** because the old schema did not record enough ownership information to assign them safely.

Ignored Quest state is stored separately per Discord account. Unignore restores normal QuestUI presentation only; it does not implicitly resume Orion work.

## Previous releases

### v1.3.0 — previous feature release

Promoted **Event Log** to a supported Stable surface, added account-aware persistent history with complete cursor pagination and windowed rendering, consumed optional structured Orion events, and used optional Orion scheduler metadata without raising the v4.10.7 core-control minimum.

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
