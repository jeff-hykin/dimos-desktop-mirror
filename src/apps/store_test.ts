import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1"
import { join } from "jsr:@std/path@1"
import { gitOrThrow } from "../core/git.ts"
import { appVersions, installApp, listApps, nameFromSource, removeApp, updateApp } from "./store.ts"

async function makeAppRepo(root: string, name: string, files: Record<string, string>) {
    const dir = join(root, "src", name)
    for (const [path, content] of Object.entries(files)) {
        Deno.mkdirSync(join(dir, path, ".."), { recursive: true })
        Deno.writeTextFileSync(join(dir, path), content)
    }
    const commit = async (message: string) => {
        await gitOrThrow(["add", "-A"], dir)
        await gitOrThrow(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message], dir)
    }
    await gitOrThrow(["init", "-q", "-b", "main"], dir)
    await commit("init")
    return { dir, commit }
}

const appFiles = {
    "dimos.yaml": "title: Demo\nrequires:\n  dimos-desktop: '>=0.1.0'\n  dimos: '>=0.0.14'\n",
    "icon.svg": "<svg/>",
    "dist/index.html": "<h1>v1</h1>",
}

Deno.test("names come from the repo url", () => {
    assertEquals(nameFromSource("https://github.com/jeff-hykin/dimos-controller.git"), "dimos-controller")
    assertEquals(nameFromSource("https://github.com/jeff-hykin/dimos-controller/"), "dimos-controller")
    assertEquals(nameFromSource("/tmp/some/app"), "app")
    assertThrows(() => nameFromSource(""))
})

Deno.test("install picks the newest release tag, update follows new tags, bad repos are refused", async () => {
    const root = await Deno.makeTempDir()
    Deno.env.set("DIMOS_HOME", join(root, "home"))
    const { dir, commit } = await makeAppRepo(root, "demo", appFiles)
    for (const tag of ["v0.1.0", "v0.2.0"]) {
        await gitOrThrow(["tag", tag], dir)
    }
    Deno.writeTextFileSync(join(dir, "dist/index.html"), "<h1>beta</h1>")
    await commit("beta")
    await gitOrThrow(["tag", "v0.3.0b1"], dir)

    assertEquals(await installApp(dir), "demo")
    const providers = { "dimos-desktop": { version: "0.1.0", apis: {} }, dimos: { version: "0.0.13", apis: null } }
    const [app] = await listApps(providers)
    assertEquals(app.ref, "v0.2.0")
    assertEquals(app.title, "Demo")
    assertEquals(app.compat.problems, ["needs dimos >=0.0.14, found 0.0.13"])
    assertEquals((await appVersions("demo")).tags, ["v0.3.0b1", "v0.2.0", "v0.1.0"])
    await assertRejects(() => installApp(dir), Error, "already installed")

    Deno.writeTextFileSync(join(dir, "dist/index.html"), "<h1>v0.4</h1>")
    await commit("v0.4")
    await gitOrThrow(["tag", "v0.4.0"], dir)
    assertEquals(await updateApp("demo"), "v0.4.0")

    await removeApp("demo")
    assertEquals(await listApps(providers), [])

    const { dir: broken } = await makeAppRepo(root, "broken", { "dimos.yaml": "title: x\n", "dist/index.html": "" })
    await assertRejects(() => installApp(broken), Error, "no icon.svg")
    assertEquals(await listApps(providers), [])
    await Deno.remove(root, { recursive: true })
})
