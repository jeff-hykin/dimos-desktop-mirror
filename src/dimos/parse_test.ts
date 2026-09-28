import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1"
import { matchesFilter, parseBlueprintList, parseLogLine } from "./parse.ts"

Deno.test("dimos list output", () => {
    const stdout = "Built-in blueprints:\n  unitree-go2\n  coordinator-mock\n\nExternal blueprints:\n  my-bot\n"
    assertEquals(parseBlueprintList(stdout), { builtin: ["unitree-go2", "coordinator-mock"], external: ["my-bot"] })
    assertEquals(parseBlueprintList(""), { builtin: [], external: [] })
})

Deno.test("structlog lines and filters", () => {
    const record = parseLogLine(
        `{"timestamp":"2026-09-28T12:00:00Z","level":"error","logger":"dimos.nav","event":"planner died","lineno":3}`,
    )!
    assertEquals(record.level, "error")
    assertEquals(record.extra, { lineno: 3 })
    assert(matchesFilter(record, { minLevel: "warning" }))
    assertFalse(matchesFilter(record, { minLevel: "critical" }))
    assert(matchesFilter(record, { query: "PLANNER" }))
    assertFalse(matchesFilter(record, { logger: "dimos.other" }))
    assertEquals(parseLogLine("Traceback (most recent call last):")?.level, "raw")
    assertEquals(parseLogLine("   "), null)
})
