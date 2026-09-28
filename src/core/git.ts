import { run, type RunResult, which } from "./proc.ts"
import { exists } from "./paths.ts"
import { newestTag } from "./version.ts"

// Services start with a minimal PATH, so look in the usual places too.
const fallbackDirs = ["/usr/bin", "/opt/homebrew/bin", "/usr/local/bin", "/run/current-system/sw/bin"]
let gitPath: string | null = null

async function findGit(): Promise<string> {
    if (gitPath) {
        return gitPath
    }
    gitPath = await which("git") ?? fallbackDirs.map((dir) => `${dir}/git`).find(exists) ?? null
    if (!gitPath) {
        throw new Error("git isn't installed (looked on PATH and in " + fallbackDirs.join(", ") + ")")
    }
    return gitPath
}

export async function git(args: string[], cwd?: string): Promise<RunResult> {
    // GIT_LFS_SKIP_SMUDGE: dimos keeps GBs of recordings in LFS; nothing here needs them
    return run(await findGit(), args, { cwd, env: { GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" } })
}

export async function gitOrThrow(args: string[], cwd?: string): Promise<string> {
    const result = await git(args, cwd)
    if (result.code != 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`)
    }
    return result.stdout
}

export async function remoteTags(url: string): Promise<string[]> {
    const out = await gitOrThrow(["ls-remote", "--tags", "--refs", url])
    return out.split("\n").map((line) => line.split("refs/tags/")[1]).filter(Boolean)
}

export async function localTags(dir: string): Promise<string[]> {
    return (await gitOrThrow(["tag", "--list"], dir)).split("\n").filter(Boolean)
}

/** The newest tag on HEAD, else the branch, else the short sha. */
export async function currentRef(dir: string): Promise<string> {
    const tags = await git(["tag", "--points-at", "HEAD"], dir)
    const tag = newestTag(tags.stdout.split("\n").filter(Boolean)) ?? tags.stdout.split("\n").find(Boolean)
    if (tag) {
        return tag
    }
    for (const args of [["symbolic-ref", "--short", "HEAD"], ["rev-parse", "--short", "HEAD"]]) {
        const result = await git(args, dir)
        if (result.code == 0 && result.stdout.trim()) {
            return result.stdout.trim()
        }
    }
    return "unknown"
}
