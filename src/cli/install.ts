import { Confirm } from "jsr:@cliffy/prompt@1.0.0-rc.7/confirm"
import { basename, dirname, fromFileUrl } from "jsr:@std/path@1"
import { exists, paths } from "../core/paths.ts"
import { desktopUrl, loadConfig, saveConfig } from "../core/config.ts"
import { run } from "../core/proc.ts"
import { installService, serviceInstalled, uninstallService, waitForHealth } from "./service.ts"
import { setupDimos } from "./dimos_setup.ts"

export type InstallOptions = {
    yes: boolean
    open: boolean
    port?: number
    dimosDir?: string
    dimosVersion?: string
    skipDimos: boolean
    dimosInstallArgs: string[]
}

const compiled = basename(Deno.execPath()) != "deno"

/** What the service runs: the installed binary, or `deno run` of this checkout when developing. */
function serveCommand(): string[] {
    if (compiled) {
        return [paths.binary, "serve"]
    }
    return [Deno.execPath(), "run", "-A", fromFileUrl(new URL("../main.ts", import.meta.url)), "serve"]
}

function interactive(options: { yes: boolean }): boolean {
    return !options.yes && Deno.stdin.isTerminal()
}

export async function openBrowser(url: string) {
    const opener = Deno.build.os == "darwin" ? "open" : "xdg-open"
    if (Deno.build.os == "linux" && !Deno.env.get("DISPLAY") && !Deno.env.get("WAYLAND_DISPLAY")) {
        return
    }
    await run(opener, [url], { timeoutMs: 10_000 })
}

export async function install(options: InstallOptions) {
    if (interactive(options)) {
        const ok = await Confirm.prompt({ message: `Install dimOS Desktop to ${paths.root}?`, default: true })
        if (!ok) {
            return
        }
    }
    Deno.mkdirSync(dirname(paths.binary), { recursive: true })
    if (compiled && Deno.execPath() != paths.binary) {
        // copy to a temp name then rename: overwriting a running binary in place can get it killed (macOS)
        const staging = `${paths.binary}.new`
        Deno.copyFileSync(Deno.execPath(), staging)
        Deno.chmodSync(staging, 0o755)
        Deno.renameSync(staging, paths.binary)
    }
    const config = saveConfig({
        ...(options.port ? { port: options.port } : {}),
        ...(options.dimosDir ? { dimosDir: options.dimosDir } : {}),
    })
    const kind = await installService(serveCommand())
    const url = desktopUrl(config)
    if (!await waitForHealth(url)) {
        throw new Error(`Desktop didn't come up at ${url}; see ${paths.serviceLog}`)
    }
    console.log(`Desktop is running at ${url} (${kind}${kind == "detached" ? ": won't restart after a reboot" : ""})`)

    if (!options.skipDimos) {
        await setupDimos({
            dir: config.dimosDir,
            version: options.dimosVersion,
            interactive: interactive(options),
            installArgs: options.dimosInstallArgs,
        })
    }
    if (options.open) {
        await openBrowser(url)
    }
    console.log(`\nDone. Open ${url}\nUninstall with: ${paths.binary} uninstall`)
}

export async function uninstall(options: { yes: boolean; removeDimos?: boolean }) {
    const config = loadConfig()
    let removeDimos = options.removeDimos ?? false
    if (options.removeDimos == null && interactive(options) && exists(config.dimosDir)) {
        removeDimos = await Confirm.prompt({ message: `Also remove dimos at ${config.dimosDir}?`, default: false })
    }
    if (serviceInstalled()) {
        await uninstallService()
    }
    if (removeDimos && exists(config.dimosDir)) {
        // stop anything it's running first
        await run(`${config.dimosDir}/.venv/bin/dimos`, ["stop"], { cwd: config.dimosDir, timeoutMs: 30_000 })
        await Deno.remove(config.dimosDir, { recursive: true })
        console.log(`Removed ${config.dimosDir}`)
    }
    await Deno.remove(paths.root, { recursive: true }).catch(() => {})
    console.log(`Removed dimOS Desktop (${paths.root})`)
}
