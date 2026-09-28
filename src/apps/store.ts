// Installed apps: git clones under ~/.dimos/desktop/apps/<name>. See docs/apps.md.
import { basename, join } from "jsr:@std/path@1"
import { exists, paths, readTextOrNull } from "../core/paths.ts"
import { checkRequires, type CompatReport, type Manifest, parseManifest, type Provider } from "../core/manifest.ts"
import { currentRef, git, gitOrThrow, localTags } from "../core/git.ts"
import { compareVersions, newestTag, parseVersion } from "../core/version.ts"

export type App = {
    name: string
    title: string
    dir: string
    ref: string
    manifest: Manifest | null
    error: string | null
    compat: CompatReport
    hasBackend: boolean
    url: string
}

const namePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function appDir(name: string): string {
    if (!namePattern.test(name)) {
        throw new Error(`bad app name: ${name}`)
    }
    return join(paths.apps, name)
}

/** Reads dimos.yaml and checks the files the format requires. Throws with what's wrong. */
export function readAppManifest(dir: string): Manifest {
    const text = readTextOrNull(join(dir, "dimos.yaml"))
    if (text == null) {
        throw new Error("not a Desktop app: no dimos.yaml at the repo root")
    }
    const manifest = parseManifest(text)
    if (!exists(join(dir, "icon.svg"))) {
        throw new Error("not a Desktop app: no icon.svg at the repo root")
    }
    if (!exists(join(dir, manifest.frontend, "index.html"))) {
        throw new Error(`not a Desktop app: no ${manifest.frontend}/index.html (the prebuilt frontend)`)
    }
    return manifest
}

export async function describeApp(name: string, providers: Record<string, Provider>): Promise<App> {
    const dir = appDir(name)
    let manifest: Manifest | null = null
    let error: string | null = null
    try {
        manifest = readAppManifest(dir)
    } catch (caught) {
        error = (caught as Error).message
    }
    return {
        name,
        title: manifest?.title ?? name,
        dir,
        ref: exists(join(dir, ".git")) ? await currentRef(dir) : "local",
        manifest,
        error,
        compat: manifest ? checkRequires(manifest.requires, providers) : { ok: false, problems: [], warnings: [] },
        hasBackend: manifest?.backend != null,
        url: `/app/${name}/`,
    }
}

export function listApps(providers: Record<string, Provider>): Promise<App[]> {
    const names: string[] = []
    try {
        for (const entry of Deno.readDirSync(paths.apps)) {
            if (entry.isDirectory && namePattern.test(entry.name) && !entry.name.startsWith(".")) {
                names.push(entry.name)
            }
        }
    } catch {
        // no apps yet
    }
    names.sort()
    return Promise.all(names.map((name) => describeApp(name, providers)))
}

/** "https://github.com/jeff-hykin/dimos-controller.git" → "dimos-controller" */
export function nameFromSource(source: string): string {
    const name = basename(source.replace(/[#?].*$/, "").replace(/\/+$/, "")).replace(/\.git$/, "")
    if (!namePattern.test(name)) {
        throw new Error(`can't tell the app's name from ${source}`)
    }
    return name
}

/** Newest version tag, else leave the default branch checked out. */
async function checkoutNewest(dir: string) {
    const tag = newestTag(await localTags(dir))
    if (tag) {
        await gitOrThrow(["-c", "advice.detachedHead=false", "checkout", "--quiet", tag], dir)
    }
}

export async function installApp(source: string): Promise<string> {
    const name = nameFromSource(source)
    const dir = appDir(name)
    if (exists(dir)) {
        throw new Error(`${name} is already installed`)
    }
    Deno.mkdirSync(paths.apps, { recursive: true })
    const staging = join(paths.apps, `.installing-${name}-${Date.now()}`)
    try {
        await gitOrThrow(["clone", "--quiet", source, staging])
        await checkoutNewest(staging)
        readAppManifest(staging)
        Deno.renameSync(staging, dir)
    } catch (error) {
        await Deno.remove(staging, { recursive: true }).catch(() => {})
        throw error
    }
    return name
}

export async function updateApp(name: string): Promise<string> {
    const dir = appDir(name)
    await gitOrThrow(["fetch", "--quiet", "--tags", "--force", "origin"], dir)
    const tag = newestTag(await localTags(dir))
    if (tag) {
        await gitOrThrow(["-c", "advice.detachedHead=false", "checkout", "--quiet", tag], dir)
    } else {
        await gitOrThrow(["pull", "--quiet", "--ff-only"], dir)
    }
    readAppManifest(dir)
    return await currentRef(dir)
}

export async function appVersions(name: string): Promise<{ current: string; tags: string[] }> {
    const dir = appDir(name)
    await git(["fetch", "--quiet", "--tags", "--force", "origin"], dir)
    const tags = (await localTags(dir))
        .filter((tag) => parseVersion(tag) != null)
        .sort((a, b) => compareVersions(parseVersion(b)!, parseVersion(a)!))
    return { current: await currentRef(dir), tags }
}

export async function checkoutApp(name: string, ref: string): Promise<string> {
    const dir = appDir(name)
    await gitOrThrow(["-c", "advice.detachedHead=false", "checkout", "--quiet", ref], dir)
    readAppManifest(dir)
    return await currentRef(dir)
}

export async function removeApp(name: string) {
    await Deno.remove(appDir(name), { recursive: true })
}
