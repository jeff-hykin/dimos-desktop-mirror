// Run `dimos-desktop serve` as a per-user service: launchd on macOS, systemd --user on Linux.
// No sudo. Where neither works (containers, CI without a user bus) it runs detached instead,
// which survives the terminal closing but not a reboot.
import { dirname, join } from "jsr:@std/path@1"
import { exists, home, paths, readTextOrNull } from "../core/paths.ts"
import { run } from "../core/proc.ts"

export const serviceName = Deno.env.get("DIMOS_DESKTOP_SERVICE") ?? "org.dimensional.dimos-desktop"
const systemdUnit = `${serviceName.split(".").pop()}.service`
const pidFile = () => join(paths.root, "service.pid")

export type ServiceKind = "launchd" | "systemd" | "detached"

function launchdPlist(): string {
    return join(home(), "Library", "LaunchAgents", `${serviceName}.plist`)
}

function systemdPath(): string {
    const configHome = Deno.env.get("XDG_CONFIG_HOME") ?? join(home(), ".config")
    return join(configHome, "systemd", "user", systemdUnit)
}

/** The service gets the installing shell's PATH plus the usual dirs, so git/nix/uv resolve the same. */
function serviceEnv(): Record<string, string> {
    const dirs = [
        ...(Deno.env.get("PATH") ?? "").split(":"),
        join(home(), ".local", "bin"),
        join(home(), ".nix-profile", "bin"),
        "/nix/var/nix/profiles/default/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    const env: Record<string, string> = { PATH: [...new Set(dirs.filter(Boolean))].join(":"), HOME: home() }
    for (const key of ["DIMOS_HOME", "XDG_STATE_HOME", "XDG_CONFIG_HOME"]) {
        const value = Deno.env.get(key)
        if (value) {
            env[key] = value
        }
    }
    return env
}

function xmlEscape(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function renderPlist(command: string[]): string {
    const strings = (items: string[]) => items.map((item) => `        <string>${xmlEscape(item)}</string>`).join("\n")
    const env = Object.entries(serviceEnv())
        .map(([key, value]) => `        <key>${key}</key>\n        <string>${xmlEscape(value)}</string>`)
        .join("\n")
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${serviceName}</string>
    <key>ProgramArguments</key>
    <array>
${strings(command)}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${env}
    </dict>
    <key>WorkingDirectory</key>
    <string>${xmlEscape(home())}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>AbandonProcessGroup</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xmlEscape(paths.serviceLog)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(paths.serviceLog)}</string>
</dict>
</plist>
`
}

function renderUnit(command: string[]): string {
    const quote = (part: string) =>
        /^[\w@%+=:,./-]+$/.test(part) ? part : `"${part.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    const env = Object.entries(serviceEnv()).map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`).join("\n")
    return `[Unit]
Description=dimOS Desktop
After=network-online.target

[Service]
ExecStart=${command.map(quote).join(" ")}
WorkingDirectory=${home()}
${env}
Restart=always
RestartSec=2
KillMode=process
StandardOutput=append:${paths.serviceLog}
StandardError=append:${paths.serviceLog}

[Install]
WantedBy=default.target
`
}

async function systemdUsable(): Promise<boolean> {
    const result = await run("systemctl", ["--user", "is-system-running"], { timeoutMs: 10_000 })
    // "degraded" still runs units; only a missing user bus is fatal
    return result.code != 127 && !/Failed to connect|No medium|not been booted/i.test(result.stderr)
}

async function startDetached(command: string[]) {
    // setsid so closing the terminal doesn't take it down; sh for the log redirect
    const setsid = (await run("sh", ["-c", "command -v setsid"])).stdout.trim()
    const shell = ["sh", "-c", 'exec "$@" >> "$DIMOS_DESKTOP_LOG" 2>&1', "sh", ...command]
    const [program, ...args] = setsid ? [setsid, ...shell] : shell
    const child = new Deno.Command(program, {
        args,
        stdin: "null",
        stdout: "null",
        stderr: "null",
        env: { ...serviceEnv(), DIMOS_DESKTOP_LOG: paths.serviceLog },
        cwd: home(),
    }).spawn()
    Deno.writeTextFileSync(pidFile(), String(child.pid))
    child.unref()
}

export async function installService(command: string[]): Promise<ServiceKind> {
    Deno.mkdirSync(paths.logs, { recursive: true })
    if (Deno.build.os == "darwin") {
        const plist = launchdPlist()
        Deno.mkdirSync(dirname(plist), { recursive: true })
        const uid = String(Deno.uid())
        await run("launchctl", ["bootout", `gui/${uid}/${serviceName}`])
        Deno.writeTextFileSync(plist, renderPlist(command))
        const result = await run("launchctl", ["bootstrap", `gui/${uid}`, plist])
        if (result.code != 0) {
            throw new Error(`launchctl bootstrap failed: ${result.stderr.trim()}`)
        }
        return "launchd"
    }
    if (await systemdUsable()) {
        const unit = systemdPath()
        Deno.mkdirSync(dirname(unit), { recursive: true })
        Deno.writeTextFileSync(unit, renderUnit(command))
        await run("systemctl", ["--user", "daemon-reload"])
        const result = await run("systemctl", ["--user", "enable", "--now", systemdUnit])
        if (result.code != 0) {
            throw new Error(`systemctl --user enable failed: ${result.stderr.trim()}`)
        }
        await run("systemctl", ["--user", "restart", systemdUnit])
        // without linger the user manager (and Desktop) stops at logout; allowed without sudo on most distros
        await run("loginctl", ["enable-linger", Deno.env.get("USER") ?? ""])
        return "systemd"
    }
    await stopDetached()
    await startDetached(command)
    return "detached"
}

async function stopDetached() {
    const pid = Number(readTextOrNull(pidFile()))
    if (pid) {
        try {
            Deno.kill(pid, "SIGTERM")
        } catch {
            // already gone
        }
        await Deno.remove(pidFile()).catch(() => {})
    }
}

export async function uninstallService(): Promise<void> {
    if (Deno.build.os == "darwin") {
        await run("launchctl", ["bootout", `gui/${Deno.uid()}/${serviceName}`])
        await Deno.remove(launchdPlist()).catch(() => {})
    } else if (exists(systemdPath())) {
        await run("systemctl", ["--user", "disable", "--now", systemdUnit])
        await Deno.remove(systemdPath()).catch(() => {})
        await run("systemctl", ["--user", "daemon-reload"])
    }
    await stopDetached()
}

export function serviceInstalled(): boolean {
    return Deno.build.os == "darwin" ? exists(launchdPlist()) : exists(systemdPath()) || exists(pidFile())
}

export async function waitForHealth(url: string, timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) })
            await response.body?.cancel()
            if (response.ok) {
                return true
            }
        } catch {
            // not up yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
}
