import type { IpcMainInvokeEvent } from "electron";
import { execFile as execFileCallback } from "child_process";
import { join } from "path";
import { promisify } from "util";

import {
    createQuestUIUpdateEngine,
    type QuestUIUpdateResult,
    type QuestUIUpdateStatus
} from "./updateNativeEngine";

export type { QuestUIUpdateResult, QuestUIUpdateStatus };

const execFile = promisify(execFileCallback);
const VENCORD_SRC_DIR = join(__dirname, "..");
const QUESTUI_DIR = join(VENCORD_SRC_DIR, "src", "userplugins", "QuestUI");
const OFFICIAL_REPO = "https://github.com/herzchens/questui";
const SIGNER_PRINCIPAL = "166841132+Herzchens@users.noreply.github.com";
const SIGNER_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMwKdHjkKqlWReNnF5Hz6GmWWCkZqx9sNklZuAeMPiRD";
const MAX_BUFFER = 16 * 1024 * 1024;

async function run(command: string, args: string[], cwd: string): Promise<void> {
    await execFile(command, args, {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8"
    });
}

async function buildVencord(): Promise<void> {
    const args = ["scripts/build/build.mjs"];
    if (IS_DEV) args.push("--dev");

    const isFlatpak = process.platform === "linux" && Boolean(process.env.FLATPAK_ID);
    if (isFlatpak) await run("flatpak-spawn", ["--host", "node", ...args], VENCORD_SRC_DIR);
    else await run("node", args, VENCORD_SRC_DIR);
}

const updater = createQuestUIUpdateEngine({
    questUIDir: QUESTUI_DIR,
    vencordSrcDir: VENCORD_SRC_DIR,
    officialRepo: OFFICIAL_REPO,
    signerPrincipal: SIGNER_PRINCIPAL,
    signerPublicKey: SIGNER_PUBLIC_KEY,
    buildVencord
});

export async function inspectQuestUICheckout(_: IpcMainInvokeEvent): Promise<QuestUIUpdateResult> {
    return updater.inspectCheckout();
}

export async function updateQuestUIRelease(
    _: IpcMainInvokeEvent,
    installedVersionInput: string,
    targetVersionInput: string
): Promise<QuestUIUpdateResult> {
    return updater.updateRelease(installedVersionInput, targetVersionInput);
}
