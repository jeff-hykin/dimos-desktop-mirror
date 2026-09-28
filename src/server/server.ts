// The HTTP server the service runs: Desktop's UI, its JSON API, and installed apps.
import { serveDir } from "jsr:@std/http@1/file-server"
import { join } from "jsr:@std/path@1"
import { ensureCwd, exists, paths } from "../core/paths.ts"
import { loadConfig } from "../core/config.ts"
import { version } from "../self.ts"
import { appDir, listApps, readAppManifest } from "../apps/store.ts"
import { forwardToBackend, startBackend, stopAllBackends } from "../apps/backends.ts"
import { apiRoutes, backendEnv, providers } from "./api.ts"

const uiRoot = new URL("../../ui/dist", import.meta.url).pathname

function serveApp(request: Request, name: string, rest: string): Promise<Response> | Response {
    let dir: string
    try {
        dir = appDir(name)
    } catch {
        return new Response("not found", { status: 404 })
    }
    if (rest.startsWith("/api/") || rest == "/api") {
        return forwardToBackend(name, request, rest)
    }
    if (!exists(dir)) {
        return new Response(`${name} isn't installed`, { status: 404 })
    }
    if (rest == "/icon.svg") {
        return serveDir(request, { fsRoot: dir, urlRoot: `app/${name}`, quiet: true })
    }
    let frontend = "dist"
    try {
        frontend = readAppManifest(dir).frontend
    } catch {
        // still serve whatever is there
    }
    return serveDir(request, { fsRoot: join(dir, frontend), urlRoot: `app/${name}`, quiet: true })
}

/** Hashed vite assets never change; everything else revalidates (etag) so updates show up at once. */
function withCaching(response: Response, path: string): Response {
    if (response.ok) {
        const immutable = path.startsWith("/assets/")
        response.headers.set("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache")
    }
    return response
}

async function handler(request: Request): Promise<Response> {
    ensureCwd()
    const url = new URL(request.url)
    const path = url.pathname
    if (path == "/healthz") {
        return Response.json({ ok: true, version })
    }
    if (path.startsWith("/api/")) {
        for (const route of apiRoutes) {
            const match = route.pattern.exec({ pathname: path })
            if (match && route.method == request.method) {
                try {
                    return await route.handle(request, match.pathname.groups as Record<string, string>, url)
                } catch (error) {
                    return Response.json({ error: (error as Error).message }, { status: 400 })
                }
            }
        }
        return Response.json({ error: `no route for ${request.method} ${path}` }, { status: 404 })
    }
    const appMatch = path.match(/^\/app\/([^/]+)(\/.*)?$/)
    if (appMatch) {
        if (!appMatch[2]) {
            return Response.redirect(new URL(`/app/${appMatch[1]}/`, url), 302)
        }
        const response = await serveApp(request, appMatch[1], appMatch[2])
        // app assets aren't necessarily hashed, so they always revalidate
        return appMatch[2].startsWith("/api") ? response : withCaching(response, "")
    }
    const response = await serveDir(request, { fsRoot: uiRoot, quiet: true })
    if (response.status == 404 && !path.includes(".")) {
        // client-side routes all load the single page
        return withCaching(await serveDir(new Request(new URL("/", url)), { fsRoot: uiRoot, quiet: true }), "/")
    }
    return withCaching(response, path)
}

export async function startBackends() {
    for (const app of await listApps(providers())) {
        if (app.manifest?.backend) {
            startBackend(app.name, app.dir, app.manifest, backendEnv())
        }
    }
}

export async function serve(options: { host?: string; port?: number } = {}) {
    const config = loadConfig()
    const host = options.host ?? config.host
    const port = options.port ?? config.port
    Deno.mkdirSync(paths.apps, { recursive: true })
    await startBackends()
    const server = Deno.serve({
        hostname: host,
        port,
        onListen: () => console.log(`dimos-desktop ${version} listening on http://${host}:${port}`),
    }, handler)
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        Deno.addSignalListener(signal, async () => {
            await stopAllBackends()
            await server.shutdown()
            Deno.exit(0)
        })
    }
    await server.finished
}
