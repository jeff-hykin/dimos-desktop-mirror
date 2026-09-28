// App backends: one process per app, serving HTTP on a unix socket, restarted if it exits.
import { join } from "jsr:@std/path@1"
import { ensureCwd, exists, paths } from "../core/paths.ts"
import { which } from "../core/proc.ts"
import type { Manifest } from "../core/manifest.ts"

type Backend = {
    name: string
    socket: string
    process: Deno.ChildProcess | null
    stopped: boolean
    restarts: number
    log: string
}

const backends = new Map<string, Backend>()
const clients = new Map<string, Deno.HttpClient>()

export function socketPath(name: string): string {
    return join(paths.sockets, `${name}.sock`)
}

export function backendState(name: string) {
    const backend = backends.get(name)
    return backend
        ? { running: backend.process != null, restarts: backend.restarts, log: backend.log.slice(-20_000) }
        : null
}

async function spawn(backend: Backend, dir: string, manifest: Manifest, env: Record<string, string>) {
    if (backend.stopped) {
        return
    }
    let [command, ...args] = manifest.backend!.command
    if (exists(join(dir, "flake.nix")) && await which("nix")) {
        args = ["--extra-experimental-features", "nix-command flakes", "develop", dir, "-c", command, ...args]
        command = "nix"
    }
    await Deno.remove(backend.socket).catch(() => {})
    ensureCwd()
    try {
        backend.process = new Deno.Command(command, {
            args,
            cwd: dir,
            env: { ...env, DIMOS_APP_SOCKET: backend.socket, DIMOS_APP_NAME: backend.name },
            stdin: "null",
            stdout: "piped",
            stderr: "piped",
        }).spawn()
    } catch (error) {
        backend.log += `failed to start ${command}: ${(error as Error).message}\n`
        backend.process = null
        setTimeout(() => spawn(backend, dir, manifest, env), 10_000)
        return
    }
    // app output goes to a bounded buffer, never the service log (a chatty app can't fill the disk)
    const pump = async (stream: ReadableStream<Uint8Array>) => {
        for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
            backend.log = (backend.log + chunk).slice(-100_000)
        }
    }
    pump(backend.process.stdout)
    pump(backend.process.stderr)
    const status = await backend.process.status
    backend.process = null
    backend.log += `\n[exited with code ${status.code}]\n`
    if (!backend.stopped) {
        backend.restarts += 1
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(backend.restarts, 5))
        setTimeout(() => spawn(backend, dir, manifest, env), delay)
    }
}

export function startBackend(name: string, dir: string, manifest: Manifest, env: Record<string, string>) {
    if (!manifest.backend || backends.has(name)) {
        return
    }
    Deno.mkdirSync(paths.sockets, { recursive: true })
    const backend: Backend = { name, socket: socketPath(name), process: null, stopped: false, restarts: 0, log: "" }
    backends.set(name, backend)
    spawn(backend, dir, manifest, env)
}

export async function stopBackend(name: string) {
    const backend = backends.get(name)
    if (!backend) {
        return
    }
    backend.stopped = true
    backends.delete(name)
    if (backend.process) {
        try {
            backend.process.kill("SIGTERM")
        } catch {
            // already gone
        }
        await backend.process.status.catch(() => {})
    }
    await Deno.remove(backend.socket).catch(() => {})
    clients.get(backend.socket)?.close()
    clients.delete(backend.socket)
}

export async function stopAllBackends() {
    await Promise.all([...backends.keys()].map(stopBackend))
}

/** Forward a request to the app's backend over its unix socket. */
export async function forwardToBackend(name: string, request: Request, path: string): Promise<Response> {
    const backend = backends.get(name)
    if (!backend) {
        return Response.json({ error: `${name} has no backend` }, { status: 404 })
    }
    let client = clients.get(backend.socket)
    if (!client) {
        client = Deno.createHttpClient(
            { proxy: { transport: "unix", path: backend.socket } } as Deno.CreateHttpClientOptions,
        )
        clients.set(backend.socket, client)
    }
    const url = new URL(request.url)
    try {
        return await fetch(`http://${name}${path}${url.search}`, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            client,
            redirect: "manual",
        })
    } catch (error) {
        return Response.json({ error: `${name}'s backend isn't answering: ${(error as Error).message}` }, {
            status: 502,
        })
    }
}
