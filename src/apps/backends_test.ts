import { assertEquals } from "jsr:@std/assert@1"
import { join } from "jsr:@std/path@1"
import { parseManifest } from "../core/manifest.ts"
import { backendState, forwardToBackend, startBackend, stopBackend } from "./backends.ts"

Deno.test("a backend serves on its unix socket and requests reach it with the /app/<name> prefix stripped", async () => {
    const root = await Deno.makeTempDir({ dir: "/tmp" })
    Deno.env.set("DIMOS_HOME", join(root, "home"))
    const appDir = join(root, "echo")
    Deno.mkdirSync(appDir)
    Deno.writeTextFileSync(
        join(appDir, "main.ts"),
        `Deno.serve({ path: Deno.env.get("DIMOS_APP_SOCKET")!, onListen() {} }, async (request) =>
            Response.json({ path: new URL(request.url).pathname, app: Deno.env.get("DIMOS_APP_NAME"), body: await request.text() }))`,
    )
    const manifest = parseManifest(`backend: { command: ["${Deno.execPath()}", run, -A, main.ts] }`)
    startBackend("echo", appDir, manifest, {})
    try {
        let response: Response | null = null
        for (let attempt = 0; attempt < 50; attempt++) {
            response = await forwardToBackend(
                "echo",
                new Request("http://desktop/app/echo/api/ping?x=1", { method: "POST", body: "hi" }),
                "/api/ping",
            )
            if (response.status != 502) {
                break
            }
            await response.body?.cancel()
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
        assertEquals(await response!.json(), { path: "/api/ping", app: "echo", body: "hi" })
        assertEquals(backendState("echo")?.running, true)
        assertEquals((await forwardToBackend("missing", new Request("http://desktop/"), "/api")).status, 404)
    } finally {
        await stopBackend("echo")
        await Deno.remove(root, { recursive: true })
    }
})
