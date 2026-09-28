import { assertEquals } from "jsr:@std/assert@1"
import { join } from "jsr:@std/path@1"
import { listLogRuns, readLog } from "./logs.ts"

const line = (level: string, event: string) =>
    JSON.stringify({ timestamp: "t", level, logger: "dimos.x", event }) + "\n"

Deno.test("reads, filters and tails main.jsonl", async () => {
    const dimosDir = await Deno.makeTempDir()
    Deno.env.set("XDG_STATE_HOME", join(dimosDir, "state"))
    const runDir = join(dimosDir, "logs", "20260928-120000-demo")
    Deno.mkdirSync(runDir, { recursive: true })
    const file = join(runDir, "main.jsonl")
    Deno.writeTextFileSync(file, line("info", "hello") + line("error", "boom") + '{"partial":')

    assertEquals(listLogRuns(dimosDir).map((run) => run.runId), ["20260928-120000-demo"])

    const first = await readLog(dimosDir, {})
    assertEquals(first.records.map((record) => record.event), ["hello", "boom"])
    assertEquals(first.loggers, ["dimos.x"])

    const errors = await readLog(dimosDir, { minLevel: "error" })
    assertEquals(errors.records.map((record) => record.event), ["boom"])

    // the partial line is held back until it is finished
    Deno.writeTextFileSync(file, `"yes","level":"info","event":"later"}\n`, { append: true })
    const next = await readLog(dimosDir, { after: first.offset })
    assertEquals(next.records.map((record) => record.event), ["later"])

    const none = await readLog(dimosDir, { runId: "missing" })
    assertEquals(none.records, [])
    await Deno.remove(dimosDir, { recursive: true })
})
