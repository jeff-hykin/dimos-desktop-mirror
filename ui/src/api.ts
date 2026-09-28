// Types mirror src/server/api.ts responses.

export type CompatReport = { ok: boolean; problems: string[]; warnings: string[] }

export type Info = {
    version: string
    config: { host: string; port: number; dimosDir: string; localRelay: boolean; ignoreCompat: boolean }
    dimos: {
        dir: string
        exists: boolean
        installed: boolean
        ref: string | null
        provider: { version: string | null }
        compat: CompatReport
        relayAvailable: boolean
    }
}

export type Launch = {
    blueprint: string
    phase: "starting" | "running" | "failed" | "stopped"
    startedAt: string
    output: string
    runId: string | null
    relay: boolean
    error: string | null
}

export type RegistryRun = { run_id: string; pid: number; blueprint: string; started_at: string; log_dir: string }

export type LogRecord = {
    timestamp: string
    level: string
    logger: string
    event: string
    extra: Record<string, unknown>
    raw: string
}

export type LogPage = { runId: string | null; records: LogRecord[]; offset: number; loggers: string[] }

export type App = {
    name: string
    title: string
    ref: string
    error: string | null
    compat: CompatReport
    hasBackend: boolean
    url: string
    backend: { running: boolean; restarts: number; log: string } | null
}

export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
        super(message)
    }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new ApiError(data.error ?? `${method} ${path} failed (${response.status})`, response.status, data)
    }
    return data as T
}

export const api = {
    info: () => request<Info>("GET", "/api/info"),
    setConfig: (changes: Partial<Info["config"]>) => request<Info["config"]>("POST", "/api/config", changes),
    blueprints: () => request<{ builtin: string[]; external: string[] }>("GET", "/api/blueprints"),
    runs: () => request<{ live: RegistryRun[]; launch: Launch | null }>("GET", "/api/runs"),
    start: (blueprint: string, options: { force?: boolean; replay?: boolean } = {}) =>
        request<Launch>("POST", "/api/runs", { blueprint, ...options }),
    stop: () => request<{ output: string }>("POST", "/api/runs/stop"),
    logRuns: () => request<{ runId: string; size: number; modified: string | null }[]>("GET", "/api/logs/runs"),
    logs: (params: Record<string, string | number | undefined>) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== "") {
                query.set(key, String(value))
            }
        }
        return request<LogPage>("GET", `/api/logs?${query}`)
    },
    apps: () => request<App[]>("GET", "/api/apps"),
    installApp: (source: string) => request<App>("POST", "/api/apps", { source }),
    updateApp: (name: string) => request<{ ref: string }>("POST", `/api/apps/${name}/update`),
    appVersions: (name: string) => request<{ current: string; tags: string[] }>("GET", `/api/apps/${name}/versions`),
    checkoutApp: (name: string, ref: string) => request<{ ref: string }>("POST", `/api/apps/${name}/checkout`, { ref }),
    removeApp: (name: string) => request<{ removed: string }>("DELETE", `/api/apps/${name}`),
}
