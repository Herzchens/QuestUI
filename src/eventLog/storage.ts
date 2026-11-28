import { constants } from "fs";
import { lstat, mkdtemp, open, readFile, rename, rm, writeFile, type FileHandle } from "fs/promises";
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

// One append batch can transiently exceed the 10 MiB persisted limit.
// Reject externally enlarged logs without allocating their entire contents.
const MAX_LOG_READ_BYTES = 14 * 1024 * 1024;

async function openRegularLog(path: string): Promise<FileHandle | null> {
    if (!await assertRegularLogPath(path)) return null;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        if (!(await file.stat()).isFile()) throw new Error("Event Log is not a regular file.");
        return file;
    } catch (error) {
        await file.close();
        throw error;
    }
}

async function readRange(file: FileHandle, position: number, length: number): Promise<Buffer> {
    const result = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
        const { bytesRead } = await file.read(result, offset, length - offset, position + offset);
        if (!bytesRead) throw new Error("Event Log changed during read; retry.");
        offset += bytesRead;
    }
    return result;
}

export async function readLogText(path: string, read?: typeof readFile): Promise<string> {
    try {
        // Retain the injected reader used by storage fault tests.
        if (read) return await assertRegularLogPath(path) ? await read(path, "utf8") : "";
        const file = await openRegularLog(path);
        if (!file) return "";
        try {
            const { size } = await file.stat();
            if (size > MAX_LOG_READ_BYTES) throw new Error("Event Log exceeds read capacity; append to compact it.");
            return (await readRange(file, 0, size)).toString("utf8");
        } finally { await file.close(); }
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return "";
        throw error;
    }
}

/** Read only the retained tail, even if an external process enlarged the log. */
export async function readLogCompactionTail(path: string, maxBytes: number, keepBytes: number): Promise<Buffer | null> {
    try {
        const file = await openRegularLog(path);
        if (!file) return null;
        try {
            const { size } = await file.stat();
            if (size <= maxBytes) return null;
            const start = Math.max(0, size - keepBytes);
            const position = Math.max(0, start - 1);
            const buffer = await readRange(file, position, size - position);
            if (start === 0) return buffer;
            // If the preceding byte is a newline, the first retained row is complete.
            const newline = buffer.indexOf(0x0a);
            return buffer.subarray(newline >= 0 ? newline + 1 : buffer.length);
        } finally { await file.close(); }
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
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
