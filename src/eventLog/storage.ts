import { lstat, mkdtemp, readFile, rename, rm, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";

/** Existing links/special files are never valid log storage. */
export async function assertRegularLogPath(path: string): Promise<boolean> {
    try {
        if (!(await lstat(dirname(path))).isDirectory()) throw new Error("Event Log directory is not a real directory.");
        if (!(await lstat(path)).isFile()) throw new Error("Event Log is not a regular file.");
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
        throw error;
    }
}

export async function readLogText(path: string, read: typeof readFile = readFile): Promise<string> {
    try {
        if (!await assertRegularLogPath(path)) return "";
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
    await assertRegularLogPath(path);
    const temporaryDir = await mkdtemp(join(dirname(path), ".questui-events-"));
    const temporaryFile = join(temporaryDir, basename(path));
    try {
        await writeFile(temporaryFile, content, { mode: 0o600 });
        await move(temporaryFile, path);
    } finally {
        await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
