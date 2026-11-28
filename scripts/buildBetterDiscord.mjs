import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(process.argv[2] ?? "dist/QuestUI.plugin.js");
mkdirSync(dirname(output), { recursive: true });
await build({
    entryPoints: [resolve(root, "src/platform/betterdiscord/index.ts")],
    bundle: true, platform: "node", target: "es2022", format: "cjs", outfile: output,
    banner: { js: "/**\n * @name QuestUI\n * @author Herzchens\n * @description Experimental read-only Quest catalogue for BetterDiscord.\n * @version 1.6.0-preview.1\n * @source https://github.com/Herzchens/QuestUI\n */" },
    footer: { js: "module.exports = module.exports.default;" },
    logLevel: "info",
    legalComments: "inline"
});
const source = readFileSync(output, "utf8");
assert.match(source, /@name QuestUI/);
assert.doesNotMatch(source, /require\(["']@(?:api|webpack|utils|components)\//);
const Plugin = createRequire(import.meta.url)(output);
assert.equal(typeof Plugin, "function");
const instance = new Plugin();
assert.equal(typeof instance.start, "function");
assert.equal(typeof instance.stop, "function");
assert.equal(typeof instance.getSettingsPanel, "function");
instance.stop();
console.log("BetterDiscord CommonJS plugin packaging PASS:", output);
