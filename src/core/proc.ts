import { ensureCwd } from "./paths.ts"

export type RunResult = { code: number; stdout: string; stderr: string }

export type RunOptions = { cwd?: string; env?: Record<string, string>; timeoutMs?: number }

/** Run a command to completion and capture its output. Never throws for a non-zero exit. */
export async function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
    ensureCwd()
    const controller = new AbortController()
    const timer = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined
    try {
        const output = await new Deno.Command(command, {
            args,
            cwd: options.cwd,
            env: options.env,
            stdin: "null",
            stdout: "piped",
            stderr: "piped",
            signal: controller.signal,
        }).output()
        const decoder = new TextDecoder()
        return { code: output.code, stdout: decoder.decode(output.stdout), stderr: decoder.decode(output.stderr) }
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return { code: 127, stdout: "", stderr: `${command}: not found` }
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}

/** Run with the terminal attached (for sudo prompts and installer progress). Returns the exit code. */
export async function runInteractive(command: string, args: string[], options: RunOptions = {}): Promise<number> {
    ensureCwd()
    const status = await new Deno.Command(command, {
        args,
        cwd: options.cwd,
        env: options.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    }).spawn().status
    return status.code
}

export async function which(command: string): Promise<string | null> {
    for (const dir of (Deno.env.get("PATH") ?? "").split(":").filter(Boolean)) {
        const candidate = `${dir}/${command}`
        try {
            const info = await Deno.stat(candidate)
            if (info.isFile) {
                return candidate
            }
        } catch {
            // not in this dir
        }
    }
    return null
}
