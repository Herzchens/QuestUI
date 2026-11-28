import { lstat, readdir, realpath } from "fs/promises";
import { join } from "path";

type Git = (...args: string[]) => Promise<string>;
const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;

/** Reject a parent repository, symlink checkout, and local object substitution. */
export async function assertManagedCheckoutRoot(path: string, git: Git): Promise<void> {
    if (!(await lstat(path)).isDirectory()) throw new Error("Managed checkout must be a real directory.");
    const root = await git("rev-parse", "--show-toplevel");
    if (canonical(await realpath(root.trim())) !== canonical(await realpath(path))) {
        throw new Error("Managed checkout is not the Git repository root.");
    }
    if ((await git("replace", "-l")).trim()) throw new Error("Git replacement refs are not supported by managed updates.");
}

/** reset --hard can overwrite ignored data that ordinary status cannot see. */
export async function assertNoIgnoredTargetCollision(git: Git, target: string): Promise<void> {
    const paths = (await git("ls-tree", "-r", "--name-only", "-z", target)).split("\0").filter(Boolean).map(canonical).sort();
    const targets = new Set(paths);
    const parents = new Set<string>();
    for (const path of paths) {
        for (let i = path.indexOf("/"); i >= 0; i = path.indexOf("/", i + 1)) parents.add(path.slice(0, i));
    }
    for (const entry of (await git("ls-files", "--others", "--ignored", "--exclude-standard", "-z")).split("\0").filter(Boolean)) {
        const path = canonical(entry.replace(/\/$/, ""));
        if (targets.has(path) || parents.has(path)) throw new Error("Target collides with ignored local work.");
        for (let i = path.indexOf("/"); i >= 0; i = path.indexOf("/", i + 1)) {
            if (targets.has(path.slice(0, i))) throw new Error("Target collides with ignored local work.");
        }
    }
}

/** Rollback snapshots must contain their own bytes, not links to mutable files. */
export async function assertRegularRuntimeTree(path: string): Promise<void> {
    if (!(await lstat(path)).isDirectory()) throw new Error("Vencord runtime directory is not a real directory.");
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await assertRegularRuntimeTree(join(path, entry.name));
        else if (!entry.isFile()) throw new Error("Vencord runtime contains an unsupported filesystem entry.");
    }
}
