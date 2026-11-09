import type { IpcMainInvokeEvent } from "electron";
import { execFile as execFileCallback } from "child_process";
import { join } from "path";
import { promisify } from "util";

import {
    createOrionUpdateEngine,
    type OrionUpdateDecisionRequest,
    type OrionUpdateResult,
    type OrionUpdateStatus
} from "./orionUpdateNativeEngine";

export type { OrionUpdateDecisionRequest, OrionUpdateResult, OrionUpdateStatus };

const execFile = promisify(execFileCallback);
const VENCORD_SRC_DIR = join(__dirname, "..");
const USERPLUGINS_DIR = join(VENCORD_SRC_DIR, "src", "userplugins");
const OFFICIAL_REPO = "https://github.com/nyxxbit/discord-quest-completer";
const MAX_BUFFER = 16 * 1024 * 1024;

async function run(command: string, args: string[], cwd: string): Promise<void> {
    await execFile(command, args, {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8"
    });
}

const BUILD_ARGS = ["scripts/build/build.mjs", ...(IS_DEV ? ["--dev"] : [])];
const IS_FLATPAK = process.platform === "linux" && Boolean(process.env.FLATPAK_ID);
const BUILD_COMMAND = IS_FLATPAK
    ? "flatpak-spawn --host node " + BUILD_ARGS.join(" ")
    : "node " + BUILD_ARGS.join(" ");

async function buildVencord(): Promise<void> {
    if (IS_FLATPAK) await run("flatpak-spawn", ["--host", "node", ...BUILD_ARGS], VENCORD_SRC_DIR);
    else await run("node", BUILD_ARGS, VENCORD_SRC_DIR);
}

const updater = createOrionUpdateEngine({
    userpluginsDir: USERPLUGINS_DIR,
    vencordSrcDir: VENCORD_SRC_DIR,
    officialRepo: OFFICIAL_REPO,
    buildVencord,
    buildCommand: BUILD_COMMAND
});

export async function updateOrionRelease(
    _: IpcMainInvokeEvent,
    runningVersionInput: string,
    targetVersionInput: string,
    decision?: OrionUpdateDecisionRequest
): Promise<OrionUpdateResult> {
    return updater.updateRelease(runningVersionInput, targetVersionInput, decision);
}
