# Changelog

## Unreleased

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
- Clarified settings dependencies: Quest Home Counters remain fully independent, while Dashboard Mode and Detailed Status are visibly locked when both QuestUI shortcut buttons are disabled.
- Refined Dashboard card layout with two-line Quest titles, expiry urgency colors below the progress ring, Orb reward tiers, and more reliable scrollbar-arrow suppression.
- Reorganized plugin settings so Dashboard filters live in the Dashboard filter panel, Detailed Status children are indented and conditional, and disabled feature groups no longer flood the settings modal.
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
