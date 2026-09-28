// Desktop's JSON API. Everything the UI does goes through here, so apps and agents can do it too.
import { join } from "jsr:@std/path@1"
import { loadConfig, saveConfig } from "../core/config.ts"
import type { Provider } from "../core/manifest.ts"
import { desktopProvider, version } from "../self.ts"
import { dimosProvider, inspectCheckout } from "../dimos/checkout.ts"
import { currentLaunch, listBlueprints, registryRuns, startBlueprint, stopBlueprint } from "../dimos/runs.ts"
import { listLogRuns, readLog } from "../dimos/logs.ts"
import { appVersions, checkoutApp, describeApp, installApp, listApps, removeApp, updateApp } from "../apps/store.ts"
import { backendState, startBackend, stopBackend } from "../apps/backends.ts"

type Route = {
    method: string
    pattern: URLPattern
    handle: (request: Request, params: Record<string, string>, url: URL) => Response | Promise<Response>
}

export const relayUrl = "http://127.0.0.1:7780"

export function providers(): Record<string, Provider> {
    const result: Record<string, Provider> = { "dimos-desktop": desktopProvider() }
    const dimos = dimosProvider(loadConfig().dimosDir)
    if (dimos) {
        result.dimos = dimos
    }
    return result
}

export function backendEnv() {
    const config = loadConfig()
    return {
        DIMOS_DESKTOP_URL: `http://127.0.0.1:${config.port}`,
        DIMOS_DIR: config.dimosDir,
        DIMOS_PYTHON: join(config.dimosDir, ".venv", "bin", "python"),
    }
}

async function body(request: Request): Promise<Record<string, unknown>> {
    try {
        return await request.json()
    } catch {
        return {}
    }
}

async function restartBackend(name: string) {
    await stopBackend(name)
    const app = await describeApp(name, providers())
    if (app.manifest?.backend) {
        startBackend(name, app.dir, app.manifest, backendEnv())
    }
}

const route = (method: string, pathname: string, handle: Route["handle"]): Route => ({
    method,
    pattern: new URLPattern({ pathname }),
    handle,
})

export const apiRoutes: Route[] = [
    route("GET", "/api/info", async () => {
        const config = loadConfig()
        return Response.json({ version, config, dimos: await inspectCheckout(config.dimosDir) })
    }),
    route("POST", "/api/config", async (request) => {
        const changes = await body(request)
        const allowed = ["dimosDir", "localRelay", "ignoreCompat"]
        const picked = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)))
        return Response.json(saveConfig(picked))
    }),

    route("GET", "/api/blueprints", async () => Response.json(await listBlueprints(loadConfig().dimosDir))),
    route("GET", "/api/runs", () => Response.json({ live: registryRuns(), launch: currentLaunch() })),
    route("POST", "/api/runs", async (request) => {
        const { blueprint, force, replay } = await body(request)
        if (typeof blueprint != "string" || !/^[\w.:-]+$/.test(blueprint)) {
            throw new Error("blueprint must be a blueprint name")
        }
        const config = loadConfig()
        const checkout = await inspectCheckout(config.dimosDir)
        if (!checkout.installed) {
            throw new Error(`dimos isn't installed at ${config.dimosDir}`)
        }
        if (!checkout.compat.ok && !force && !config.ignoreCompat) {
            return Response.json({ error: "incompatible", problems: checkout.compat.problems }, { status: 409 })
        }
        return Response.json(
            await startBlueprint(config.dimosDir, blueprint, { localRelay: config.localRelay, replay: replay == true }),
        )
    }),
    route("POST", "/api/runs/stop", async () => Response.json({ output: await stopBlueprint(loadConfig().dimosDir) })),
    route("GET", "/api/relay", async () => {
        let up = false
        try {
            const response = await fetch(`${relayUrl}/api/info`, { signal: AbortSignal.timeout(1500) })
            up = response.ok
            await response.body?.cancel()
        } catch {
            // no relay running
        }
        return Response.json({ url: relayUrl, up })
    }),

    route("GET", "/api/logs/runs", () => Response.json(listLogRuns(loadConfig().dimosDir))),
    route("GET", "/api/logs", async (_request, _params, url) => {
        const query = url.searchParams
        const after = query.get("after")
        return Response.json(
            await readLog(loadConfig().dimosDir, {
                runId: query.get("run") || undefined,
                after: after ? Number(after) : undefined,
                query: query.get("q") || undefined,
                minLevel: query.get("level") || undefined,
                logger: query.get("logger") || undefined,
            }),
        )
    }),

    route("GET", "/api/apps", async () => {
        const apps = await listApps(providers())
        return Response.json(apps.map((app) => ({ ...app, backend: backendState(app.name) })))
    }),
    route("POST", "/api/apps", async (request) => {
        const { source } = await body(request)
        if (typeof source != "string" || !source.trim()) {
            throw new Error("source must be a git URL")
        }
        const name = await installApp(source.trim())
        await restartBackend(name)
        return Response.json(await describeApp(name, providers()))
    }),
    route("POST", "/api/apps/:name/update", async (_request, { name }) => {
        const ref = await updateApp(name)
        await restartBackend(name)
        return Response.json({ ref })
    }),
    route("GET", "/api/apps/:name/versions", async (_request, { name }) => Response.json(await appVersions(name))),
    route("POST", "/api/apps/:name/checkout", async (request, { name }) => {
        const { ref } = await body(request)
        if (typeof ref != "string") {
            throw new Error("ref must be a tag or branch")
        }
        const current = await checkoutApp(name, ref)
        await restartBackend(name)
        return Response.json({ ref: current })
    }),
    route("DELETE", "/api/apps/:name", async (_request, { name }) => {
        await stopBackend(name)
        await removeApp(name)
        return Response.json({ removed: name })
    }),
]
