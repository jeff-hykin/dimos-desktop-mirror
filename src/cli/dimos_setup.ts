// The terminal half of install: pick a dimos version, clone it, run its own scripts/install.sh.
// Runs in the terminal on purpose, so install.sh's sudo prompts just work.
import { Select } from "jsr:@cliffy/prompt@1.0.0-rc.7/select"
import { join } from "jsr:@std/path@1"
import { exists } from "../core/paths.ts"
import { currentRef, gitOrThrow, remoteTags } from "../core/git.ts"
import { runInteractive } from "../core/proc.ts"
import { compareVersions, newestTag, parseVersion, satisfies } from "../core/version.ts"
import { desktopManifest } from "../self.ts"
import { checkDimos, dimosBin, dimosProvider, dimosRepoUrl } from "../dimos/checkout.ts"

export type DimosSetupOptions = {
    dir: string
    version?: string
    interactive: boolean
    installArgs: string[]
}

/** Tags Desktop can drive, newest first, then "main". */
export async function compatibleVersions(): Promise<string[]> {
    const range = desktopManifest().requires.dimos?.version
    const tags = (await remoteTags(dimosRepoUrl))
        .filter((tag) => parseVersion(tag) && (!range || satisfies(tag, range)))
        .sort((a, b) => compareVersions(parseVersion(b)!, parseVersion(a)!))
    return [...tags, "main"]
}

async function pickVersion(options: DimosSetupOptions): Promise<string> {
    if (options.version) {
        return options.version
    }
    const versions = await compatibleVersions()
    const fallback = newestTag(versions) ?? "main"
    if (!options.interactive) {
        return fallback
    }
    return await Select.prompt({
        message: "Which dimos version?",
        options: versions.slice(0, 12).map((value) => ({
            name: value == fallback ? `${value} (latest)` : value,
            value,
        })),
        default: fallback,
    })
}

export async function setupDimos(options: DimosSetupOptions): Promise<void> {
    const { dir } = options
    if (exists(dimosBin(dir))) {
        const compat = checkDimos(dimosProvider(dir))
        console.log(`dimos is already installed at ${dir} (${dimosProvider(dir)?.version ?? "unknown version"})`)
        for (const problem of compat.problems) {
            console.log(`  warning: ${problem} — Desktop may not work with it; continue anyway or reinstall`)
        }
        return
    }
    let version: string
    if (!exists(join(dir, ".git"))) {
        version = await pickVersion(options)
        console.log(`Cloning dimos ${version} into ${dir}`)
        // blobless: full history for switching versions later, without downloading every old file
        await gitOrThrow(["clone", "--filter=blob:none", "--branch", version, dimosRepoUrl, dir])
    } else {
        // an earlier install was interrupted after cloning; install.sh picks up from here
        version = await currentRef(dir)
        console.log(`Resuming the dimos install in ${dir} (${version})`)
    }
    const args = [
        "scripts/install.sh",
        "--mode",
        "dev",
        "--project-dir",
        dir,
        "--non-interactive",
        // install.sh <=0.0.14 runs `git pull --rebase origin <branch>` on an existing clone and defaults
        // the branch to `dev`, which would silently move a tag checkout onto dev
        "--branch",
        version,
        // the 0.0.14 smoke test runs a blueprint with no time limit, so an unattended install never ends;
        // running blueprints is Desktop's job anyway
        "--skip-tests",
        ...options.installArgs,
    ]
    console.log(`Running dimos's installer: ${args.join(" ")}`)
    const code = await runInteractive("bash", args, { cwd: dir, env: { GIT_LFS_SKIP_SMUDGE: "1" } })
    if (code != 0 || !exists(dimosBin(dir))) {
        throw new Error(
            `dimos's installer failed (exit ${code}). Fix the error above and run \`dimos-desktop install\` again; it resumes.`,
        )
    }
}
