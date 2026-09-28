// Blueprint runs, through the dimos CLI only: `dimos list`, `dimos run --daemon`, `dimos stop`,
// plus dimos's run registry ($XDG_STATE_HOME/dimos/runs/*.json) for machine-readable status.
import { join } from "jsr:@std/path@1"
import { ensureCwd, paths } from "../core/paths.ts"
import { run } from "../core/proc.ts"
import { dimosBin, hasRelay } from "./checkout.ts"
import { type BlueprintList, parseBlueprintList } from "./parse.ts"

export type RegistryRun = {
    run_id: string
    pid: number
    blueprint: string
    started_at: string
    log_dir: string
}

export type Launch = {
    blueprint: string
    phase: "starting" | "running" | "failed" | "stopped"
    startedAt: string
    pid: number
    output: string
    runId: string | null
    logDir: string | null
    relay: boolean
    error: string | null
}

type LaunchRecord = Omit<Launch, "phase" | "output" | "runId" | "logDir" | "error"> & { everRan: boolean }

let blueprintCache: { dir: string; at: number; list: BlueprintList } | null = null

export async function listBlueprints(dimosDir: string): Promise<BlueprintList> {
    if (blueprintCache && blueprintCache.dir == dimosDir && Date.now() - blueprintCache.at < 60_000) {
        return blueprintCache.list
    }
    const result = await run(dimosBin(dimosDir), ["list"], { cwd: dimosDir, timeoutMs: 120_000 })
    if (result.code != 0) {
        throw new Error(`dimos list failed: ${(result.stderr || result.stdout).trim().slice(-2000)}`)
    }
    const list = parseBlueprintList(result.stdout)
    blueprintCache = { dir: dimosDir, at: Date.now(), list }
    return list
}

function alive(pid: number): boolean {
    try {
        Deno.kill(pid, "SIGCONT")
        return true
    } catch {
        return false
    }
}

/** Live runs from dimos's registry, newest first. Covers runs started from a terminal too. */
export function registryRuns(): RegistryRun[] {
    const dir = join(paths.dimosState, "runs")
    const runs: RegistryRun[] = []
    try {
        for (const entry of Deno.readDirSync(dir)) {
            if (!entry.name.endsWith(".json")) {
                continue
            }
            try {
                const record = JSON.parse(Deno.readTextFileSync(join(dir, entry.name)))
                if (alive(record.pid)) {
                    runs.push(record)
                }
            } catch {
                // half-written or foreign file
            }
        }
    } catch {
        // no registry yet
    }
    return runs.sort((a, b) => b.run_id.localeCompare(a.run_id))
}

const launchFile = () => join(paths.root, "launch.json")
const launchLog = () => join(paths.logs, "launch.log")

function readLaunchRecord(): LaunchRecord | null {
    try {
        return JSON.parse(Deno.readTextFileSync(launchFile()))
    } catch {
        return null
    }
}

function tail(path: string, bytes: number): string {
    try {
        const text = Deno.readTextFileSync(path)
        return text.length > bytes ? text.slice(-bytes) : text
    } catch {
        return ""
    }
}

/**
 * The last blueprint Desktop launched. It runs as its own session (not a child Desktop waits on),
 * so a Desktop restart doesn't take the robot down, and state is re-derived from disk each call:
 * dimos saves its registry entry only once every module is built, which is the "running" signal.
 */
export function currentLaunch(): Launch | null {
    const record = readLaunchRecord()
    if (!record) {
        return null
    }
    const entry = registryRuns().find((run) => run.pid == record.pid)
    if (entry && !record.everRan) {
        record.everRan = true
        Deno.writeTextFileSync(launchFile(), JSON.stringify(record))
    }
    const output = tail(launchLog(), 200_000)
    const phase: Launch["phase"] = entry
        ? "running"
        : alive(record.pid)
        ? "starting"
        : record.everRan
        ? "stopped"
        : "failed"
    const error = phase != "failed"
        ? null
        : output.match(/^Error: .*$/m)?.[0] ?? output.trim().split("\n").at(-1) ?? "dimos exited during startup"
    return { ...record, phase, output, runId: entry?.run_id ?? null, logDir: entry?.log_dir ?? null, error }
}

/**
 * `dimos run <bp>` in the foreground, detached from Desktop. Not `--daemon`: on macOS the daemon's
 * post-fork build segfaults inside CoreFoundation (dimos 0.0.14b1), and a foreground run is
 * tracked by dimos's registry and stopped by `dimos stop` all the same.
 */
export async function startBlueprint(
    dimosDir: string,
    blueprint: string,
    options: { localRelay: boolean; replay?: boolean },
) {
    const previous = currentLaunch()
    if (previous?.phase == "starting") {
        throw new Error(`${previous.blueprint} is still starting`)
    }
    if (registryRuns().length > 0) {
        throw new Error("a blueprint is already running; stop it first")
    }
    const relay = options.localRelay && await hasRelay(dimosDir)
    // --replay is a global option, so it goes before `run`: plays a recording instead of talking to hardware
    const args = [...(options.replay ? ["--replay"] : []), "run", blueprint]
    if (relay) {
        // the relay would otherwise open its own cockpit tab; the Controller app replaces it
        args.push("--local-relay", "--open-browser", "false")
    }
    Deno.mkdirSync(paths.logs, { recursive: true })
    Deno.writeTextFileSync(launchLog(), `$ dimos ${args.join(" ")}\n`)
    ensureCwd()
    // setsid: its own session, so stopping Desktop leaves the robot running
    const setsid = (await run("sh", ["-c", "command -v setsid"])).stdout.trim()
    const shell = ["sh", "-c", 'exec "$@" >> "$DIMOS_LAUNCH_LOG" 2>&1', "sh", dimosBin(dimosDir), ...args]
    const [program, ...rest] = setsid ? [setsid, ...shell] : shell
    const child = new Deno.Command(program, {
        args: rest,
        cwd: dimosDir,
        env: { PYTHONUNBUFFERED: "1", NO_COLOR: "1", DIMOS_LAUNCH_LOG: launchLog() },
        stdin: "null",
        stdout: "null",
        stderr: "null",
    }).spawn()
    child.unref()
    // reap it so a finished run doesn't linger as a zombie that still looks alive
    child.status.catch(() => {})
    const record: LaunchRecord = {
        blueprint,
        startedAt: new Date().toISOString(),
        pid: child.pid,
        relay,
        everRan: false,
    }
    Deno.writeTextFileSync(launchFile(), JSON.stringify(record))
    return currentLaunch()!
}

export async function stopBlueprint(dimosDir: string): Promise<string> {
    const result = await run(dimosBin(dimosDir), ["stop"], { cwd: dimosDir, timeoutMs: 60_000 })
    if (result.code != 0) {
        throw new Error((result.stderr || result.stdout).trim() || "dimos stop failed")
    }
    return result.stdout.trim()
}
