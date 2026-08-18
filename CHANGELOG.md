# Changelog

## Unreleased

- Added explicit manual **Accept Quest** and **Claim Reward** actions to Dashboard cards, with fresh QuestStore validation, account-scoped duplicate guards, enrollment-block handling, and visible success/failure feedback.
- Added Discord-native enrollment through the client's verified Quest enroll action. The native path owns Discord's duplicate guard, attribution/sealed metadata, Flux/QuestStore updates, and CAPTCHA result instead of QuestUI rebuilding the enroll request.
- Added Discord-native reward claiming through the client's verified claim action and defensive reward-modal target rules. In-game rewards fail closed unless Discord supplies exactly one unambiguous configured platform; malformed/unknown/ambiguous reward data is never guessed.
- Hardened manual actions against account-switch races by checking account identity on QuestStore updates and at the confirmation timeout boundary, and by scoping submitted UI state to the account that made the request.
- Added fail-closed handling for malformed present Quest start/expiry/reward-expiry/enrollment-block timestamps plus bounded duplicate protection for successful or transport-ambiguous submissions not yet reflected in QuestStore.
- Added challenge-safe action handling: QuestUI does not bypass Discord verification, CAPTCHA, age checks, or account safety and never auto-retries failed manual actions.
- Added optional **Dashboard • Orion Integration** for a compatible OrionQuests companion surface. QuestUI verifies the installed/enabled Orion plugin and its registered command identity, reads Orion's real engine-running state, subscribes to Orion state changes, and delegates Start/Stop back to Orion's watcher-aware control path without importing farming internals.
- Added one smart icon-only Orion control immediately left of Filter: **▶ Start All** while Orion is stopped and **■ Stop All** while Orion is running. The control updates from Orion's real state and does not require a selected chat channel. Pause, resume, and per-Quest controls are not implemented.
- Reduced the Detailed Status numeric badge to a compact 12px indicator and removed its dark frame so it stays visually subordinate to the 20px Quest icon on custom backgrounds.
- Added pure tests for native enroll result classification, manual-action runtime/listener safety, Orion command identity, and Orion companion-surface validation, plus CI build/type-check coverage with OrionQuests installed beside QuestUI.
- Added Stable/Canary reporter coverage for both verified native Enroll and Claim finders; the Claim finder remains the narrow four-fragment lookup instead of a broadened matcher.
- Updated project boundaries, contributor guidance, and user documentation for the manual Quest actions and narrow Orion companion-control bridge.

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
