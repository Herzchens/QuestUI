# Release channels

QuestUI publishes Stable and Beta as separate source targets.

## Stable — v1.0.1

- Source: `Herzchens/QuestUI` branch `main`
- Stable checkpoint used for this release plan: `08a91d1c49b32d5aaff86fa6ea787b14e297a07b`
- Does not require the experimental Orion pause/resume companion API.
- Recommended for users who want the currently established QuestUI feature set.

## Beta — v1.1.0-beta.1

- Source: `Herzchens/QuestUI` branch `feat/quest-actions-orion-controls`
- Adds manual Accept/Claim, native Quest-list Reload, the polished Quest Dashboard, and optional smart/per-Quest Orion controls.
- For the **beta Orion-control feature set**, pair it with `Herzchens/discord-quest-completer` branch `feat/per-quest-pause-resume`.
- Known compatible Orion companion commit: `a190386071f91af348068f3044ccd0ddb0fa52ab`.
- Upstream `nyxxbit/discord-quest-completer` does not currently expose this pause/resume companion surface.

QuestUI and OrionQuests remain separate Vencord userplugins. Do not merge their source trees into one plugin directory.

## Publishing checklist

1. Confirm the proposed tags do not already exist.
2. Confirm the Stable target still resolves to the intended `main` checkpoint.
3. Confirm the Beta target is the intended feature-branch HEAD and that its CI/manual gates are acceptable.
4. Publish Stable as a normal release.
5. Publish Beta with GitHub's **pre-release** flag.
6. In the Beta release notes, state the required Orion fork branch prominently.
7. Keep both projects' own licenses and repository boundaries intact.

The release notes in the release kit generated for this split are intended to be used verbatim or reviewed before publication.