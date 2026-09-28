import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1"
import { newestTag, parseVersion, satisfies } from "./version.ts"

Deno.test("parses dimos tag shapes", () => {
    assertEquals(parseVersion("v0.0.14")?.patch, 14)
    assertEquals(parseVersion("0.0.14b1")?.stage, -2)
    assertEquals(parseVersion("v0.0.13.post1")?.stage, 1)
    assertEquals(parseVersion("1.2")?.patch, 0)
    assertEquals(parseVersion("works_1"), null)
    assertEquals(parseVersion("main"), null)
})

Deno.test("ranges", () => {
    assert(satisfies("0.0.14", ">=0.0.14"))
    assert(satisfies("v0.0.15", ">=0.0.14 <0.1"))
    assertFalse(satisfies("0.0.13.post1", ">=0.0.14"))
    assertFalse(satisfies("0.0.14b1", ">=0.0.14"))
    assert(satisfies("0.0.14.post1", ">=0.0.14"))
    assert(satisfies("0.1.0", "0.1.0"))
    assert(satisfies("0.1.0", ">=0.0.14, <1"))
    assertFalse(satisfies("not-a-version", ">=0.0.1"))
    assertThrows(() => satisfies("0.1.0", ">=banana"))
})

Deno.test("newest tag prefers final releases", () => {
    const tags = ["v0.0.13.post1", "v0.0.14b1", "v0.0.14", "works_1", "wip-fallback", "v0.0.15rc1"]
    assertEquals(newestTag(tags), "v0.0.14")
    assertEquals(newestTag(tags, ">=0.0.15rc1"), "v0.0.15rc1")
    assertEquals(newestTag(tags, ">=0.0.16"), null)
    assertEquals(newestTag([]), null)
})
