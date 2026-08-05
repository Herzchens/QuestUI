# Changelog

## Unreleased

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
