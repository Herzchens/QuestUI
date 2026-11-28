import { mkdtemp, readFile, rename, rm, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";

export async function readLogText(path: string, read: typeof readFile = readFile): Promise<string> {
    try {
        return await read(path, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return "";
        throw error;
    }
}

// The temporary file is on the same filesystem. Never unlink the existing
// destination as a fallback: a failed replacement must leave it intact.
export async function replaceLogFile(
    path: string,
    content: string | Uint8Array,
    move: typeof rename = rename
): Promise<void> {
    const temporaryDir = await mkdtemp(join(dirname(path), ".questui-events-"));
    const temporaryFile = join(temporaryDir, basename(path));
    try {
        await writeFile(temporaryFile, content);
        await move(temporaryFile, path);
    } finally {
        await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
