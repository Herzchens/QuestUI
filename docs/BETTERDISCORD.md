# BetterDiscord experimental preview

This is a development-only read-only preview, not a Stable release or a parity claim.

## Build

From the Vencord checkout containing QuestUI under `src/userplugins/QuestUI`, after installing Vencord dependencies:

```sh
node src/userplugins/QuestUI/scripts/buildBetterDiscord.mjs dist/QuestUI.plugin.js
```

Copy the generated `QuestUI.plugin.js` into BetterDiscord's Plugins folder, enable QuestUI and open its settings. Open Discord's native Quest Home first if the catalogue has not hydrated.

The panel uses the official [BdApi Webpack API](https://docs.betterdiscord.app/api/Webpack) and [plugin settings panel contract](https://docs.betterdiscord.app/plugins/introduction/structure). Quest status, stored progress, reward labels, search, sorting and history share the platform-independent model with Vencord.

The preview reads only. It does not enroll, claim, update, resume, spoof progress, access credentials, run Orion or inject native UI patches. Six Vencord themes, Ultra, notifications, event logs, Ignore, native Quest actions and updater integration are not yet ported. Progress may lag the native client. No account identifier or Quest catalogue is persisted by this preview.

The CI build verifies the CommonJS package and adapter against simulated stores. Actual BetterDiscord desktop installation and runtime acceptance are required before public preview publication.
