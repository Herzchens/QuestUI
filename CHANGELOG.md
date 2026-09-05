# Changelog

## Unreleased

- Hardened Quest shortcut button resolution against the September 2026 Discord header-bar regression reported in #9 by replacing the broad `badgePosition` / `icon` component lookup with the same `HEADER_BAR_BADGE_BOTTOM` + `position:"bottom"` header-button identity currently used by Vencord Toolbox, and synchronized reporter coverage with the new finder.

## v1.1.0 - 2026-09-01

- Added explicit manual **Accept Quest** and **Claim Reward** actions to Dashboard cards, with fresh QuestStore validation, account-scoped duplicate guards, enrollment-block handling, and visible success/failure feedback.
- Added Discord-native enrollment through the client's verified Quest enroll action. The native path owns Discord's duplicate guard, attribution/sealed metadata, Flux/QuestStore updates, and CAPTCHA result instead of QuestUI rebuilding the enroll request.
- Added Discord-native reward claiming through the client's verified claim action and defensive reward-modal target rules. In-game rewards fail closed unless Discord supplies exactly one unambiguous configured platform; malformed/unknown/ambiguous reward data is never guessed.
- Hardened manual actions against account-switch races by checking account identity on QuestStore updates and at the confirmation timeout boundary, and by scoping submitted UI state to the account that made the request.
- Added fail-closed handling for malformed present Quest start/expiry/reward-expiry/enrollment-block timestamps plus bounded duplicate protection for successful or transport-ambiguous submissions not yet reflected in QuestStore.
- Added challenge-safe action handling: QuestUI does not bypass Discord verification, CAPTCHA, age checks, or account safety and never auto-retries failed manual actions.
- Expanded **Dashboard • Orion Integration** for the upstream Orion pause/resume companion surface. QuestUI validates the exact registered Orion command and companion object, re-reads Orion's live engine/task snapshot instead of maintaining a mirror, and delegates engine/global/per-Quest mutations back to Orion's own lifecycle-safe paths.
- Added fixed global header controls in the order **Smart Start/Pause/Resume → Stop → Reload → Filter**. Start and Resume share the exact Play icon, Pause uses a real yellow pause glyph, Stop remains engine shutdown, and both engine controls are disabled once Discord has no Available or In-Progress Quest left.
- Added compact per-Quest Orion controls in the former Accept action slot after enrollment: engine-wide Start while Orion is stopped, exact-ID Pause for RUNNING/QUEUE tasks, and exact-ID Resume for PAUSED tasks. Completion removes the control and exposes Claim Reward normally.
- Changed manual action pending copy from **Working…** to **Processing…** and auto-start Orion only after Discord confirms an explicit QuestUI enrollment in QuestStore.
- Refined the Dashboard heading to **Quest Dashboard** with Discord's native Quest icon, a premium-aware colored Nitro tag, a stronger seamless right-to-left title sweep, and a lower single-line status summary. The summary now always includes a blue **Claimed** count even when Claimed cards are filtered out.
- Refined timed Quest progress copy to `mm:ss / mm:ss`; only the current elapsed value receives completion-stage color while the task label, separator, and target stay neutral. Dashboard expiry copy is hidden when the expiry is more than 15 days away (or more than 15 days in the past).
- Refined the Nitro tag surface to remove the stray colored edge while preserving native Nitro badge artwork when Discord profile data provides it.
- Refined Reload to reuse the Filter button's theme-safe visual skin while keeping its glyph explicitly readable on dark/light themes and during the disabled pending state. Its native request starts immediately, the icon completes at least three full rotations, and it always stops on a rotation boundary instead of snapping from a partial turn.
- Kept Accept/Claim, Orion-control, auto-start failure, and Reload results on Vencord's native toast API rather than a Dashboard-owned feedback surface.
- Reduced the Detailed Status numeric badge to a compact 12px indicator and removed its dark frame so it stays visually subordinate to the 20px Quest icon on custom backgrounds.
- Added pure tests for native enroll result classification, manual-action runtime/listener safety, Orion command/companion validation, Orion global/per-Quest state derivation, and Reload rotation boundaries, plus combined Vencord build/type-check coverage with upstream Orion.
- Added Stable/Canary reporter coverage for the verified native Enroll, Claim, and current-Quest Reload finders.
- Updated project boundaries, contributor guidance, and user documentation for manual Quest actions, Orion Pause/Resume/per-Quest controls, native Quest-list refresh, Dashboard/Nitro/Reload polish, and Vencord-native action feedback.
- Promoted the upstream Orion companion integration to Stable after a live pass with QuestUI `5f11470` + OrionQuests `v4.10.8` on Discord Canary: both plugins built and type-checked cleanly, an already-open Dashboard tracked external `/orion` Start/Pause/Resume/Stop transitions and scheduler growth, and a real video Quest progressed from 0% to 26% with no QuestUI or Orion errors.
- Documented the upgrade caveat that **Dashboard • Mode** defaults to enabled only when no persisted setting overrides it; users who previously stored `false` keep that value and may need to enable Dashboard Mode manually after upgrading.

## v1.0.1

- Added optional Dashboard Mode with a live mini Quest dashboard, progress rings, rewards, expiry information, filtering, and an always-visible link to Discord Quest Home.
- Added Dashboard filters for Quest status, Orb/non-Orb rewards, and Play/Stream/Video/Activity/unknown task types.
- Added optional Detailed Status numeric badges with configurable filtering and priority: In Progress, Ready to Claim, then Available.
- Added shared live QuestStore synchronization so buttons, tooltips, Quest Home counters, and an already-open Dashboard update together from Discord's local Quest state.
- Changed Dashboard progress rings to use Discord's native Quest-card `completedRatio` and `completedRatioDisplay` selector, including Discord's own optimistic/desktop progress state and percent rounding, instead of maintaining a separate QuestUI progress clock.
- Changed multi-option Quest task selection to use Discord's native task-details selector before the local compatibility fallback, keeping the secondary current/target text aligned with the task Discord selected.
- Added Discord-provided Quest artwork with task-type micro badges to Dashboard cards, and reused Discord's own themed Orb component for Orb rewards.
- Fixed Quest artwork loading by resolving Discord Quest asset keys through Discord's native themed Quest asset helper instead of treating asset keys as direct image URLs.
- Changed Dashboard filters into a floating Discord/Vencord popout with a persistent active-state badge, Recommended preset, and Clear all action.
- Replaced the custom Dashboard empty-state drawing with Discord's native Quest icon.
- Refined the Dashboard Filter button with theme-safe brand-tinted borders/shadows and strengthened native scrollbar-arrow suppression.
- Fixed Windows/Electron Dashboard scrollbar arrows by leaving `scrollbar-width`/`scrollbar-color` on their automatic path and letting QuestUI's WebKit scrollbar styling own the controls.
- Fixed the Dashboard scrollbar thumb becoming visually transparent while hovered or dragged by owning normal, hover, and active thumb states in the final scrollbar stylesheet.
- Displayed the eligible Nitro 1.2x Orb Quest multiplier directly in Dashboard reward amounts while keeping Nitro Basic, fractional/credit-only Nitro, and older pre-multiplier Quests at their base Orb reward.
- Fixed eligible full Nitro accounts being missed when `premiumState.subscriptionId` was not hydrated in `UserStore`; Nitro eligibility no longer depends on that optional field.
- Clarified settings dependencies: Quest Home Counters remain fully independent, while Dashboard Mode and Detailed Status are visibly locked when both QuestUI shortcut buttons are disabled.
- Clarified settings hierarchy with explicit parent-prefixed labels for Dashboard and Detailed Status options.
- Refined Dashboard card layout with two-line Quest titles, expiry urgency colors below the progress ring, Orb reward tiers, and more reliable scrollbar-arrow suppression.
- Reorganized plugin settings so Dashboard filters live in the Dashboard filter panel, Detailed Status children are conditional, and disabled feature groups no longer flood the settings modal.
- Refined Dashboard Quest cards, progress state rings, custom scrolling, opaque surfaces, rich status tooltip, arrow alignment, Detailed Status badge placement, and the filtered empty state.
- Added defensive normalization for legacy and `taskConfigV2` Quest task/progress shapes, including Map-backed progress and Orb reward metadata.
- Added filtered empty states, hidden-Quest visibility, expiry urgency, and status/expiry sorting in Dashboard Mode.
- Changed the shortcut attention priority to In Progress, then Ready to Claim, then Available.
- Fixed the settings-bar Quest button losing its class, tooltip, and accessible name.
- Removed the unnecessary settings-bar wrapper and its fragile Discord webpack lookup.
- Documented the webpack lookup coverage requirement in the compatibility reporter.
- Replaced the ambiguous quest store lookup with the exact Discord Flux store lookup.
- Removed the hardcoded settings-panel CSS module key.
- Added periodic quest status refresh for time-based expiry changes.
- Added scheduled Vencord build, type-check, and patch-reporter checks.
- Added UserpluginInstaller and Orion devbuild installation instructions.

## 1.0.0

- Fixed the top-bar button not navigating to Quest Home.
- Switched navigation to Vencord `NavigationRouter.transitionTo("/quest-home")`.
- Broadened status-dot CSS selectors for current Discord builds.
- Tooltip now reports all attention states rather than only the highest-priority one.
