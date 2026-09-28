import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1"
import { checkRequires, parseManifest, providerFromCheckout } from "./manifest.ts"

const controller = `
name: dimos-controller
title: Controller
requires:
  dimos-desktop:
    version: ">=0.1.0"
    apis: { app.frontend: 1, api.relay: 1 }
  dimos: ">=0.0.14"
`

Deno.test("parses an app manifest", () => {
    const manifest = parseManifest(controller)
    assertEquals(manifest.name, "dimos-controller")
    assertEquals(manifest.frontend, "dist")
    assertEquals(manifest.requires.dimos, { version: ">=0.0.14", apis: {} })
    assertEquals(manifest.requires["dimos-desktop"].apis, { "app.frontend": 1, "api.relay": 1 })
    assertEquals(manifest.backend, undefined)
})

Deno.test("parses provides and a backend", () => {
    const manifest = parseManifest(`
provides:
  apis: { api.runs: 1, api.logs: [1, 2] }
backend:
  command: [deno, run, -A, backend/main.ts]
`)
    assertEquals(manifest.provides.apis, { "api.runs": [1], "api.logs": [1, 2] })
    assertEquals(manifest.backend?.command[0], "deno")
})

Deno.test("malformed manifests fail loudly", () => {
    assertThrows(() => parseManifest("requires: [dimos]"), Error, "requires:")
    assertThrows(() => parseManifest("requires: { dimos: { version: 14 } }"), Error, "version must be a string")
    assertThrows(() => parseManifest("requires: { dimos: { apis: { x: one } } }"), Error, "must be an integer")
    assertThrows(() => parseManifest("backend: { command: deno }"), Error, "backend.command")
    assertThrows(() => parseManifest("title: [a"), Error, "not valid YAML")
    assertThrows(() => parseManifest("- a\n- b"), Error, "mapping")
    assertEquals(parseManifest("").requires, {})
})

Deno.test("version satisfied / too old / missing provider", () => {
    const { requires } = parseManifest(controller)
    const desktop = { version: "0.1.0", apis: { "app.frontend": [1], "api.relay": [1] } }
    assert(checkRequires(requires, { "dimos-desktop": desktop, dimos: { version: "0.0.14", apis: null } }).ok)

    const old = checkRequires(requires, { "dimos-desktop": desktop, dimos: { version: "0.0.13", apis: null } })
    assertFalse(old.ok)
    assertEquals(old.problems, ["needs dimos >=0.0.14, found 0.0.13"])

    const missing = checkRequires(requires, { "dimos-desktop": desktop })
    assertEquals(missing.problems, ["needs dimos, which isn't installed"])
})

Deno.test("API checks: declared, absent, unknown", () => {
    const requires = { dimos: { apis: { "cli.list": 1 } } }
    assert(checkRequires(requires, { dimos: { version: "0.0.15", apis: { "cli.list": [1, 2] } } }).ok)
    assertFalse(checkRequires(requires, { dimos: { version: "0.0.15", apis: { "cli.list": [2] } } }).ok)
    const unknown = checkRequires(requires, { dimos: { version: "0.0.14", apis: null } })
    assert(unknown.ok)
    assertEquals(unknown.warnings.length, 1)
})

Deno.test("dimos without dimos.yaml falls back to pyproject", () => {
    const pyproject = `[project]\nname = "dimos"\nversion = "0.0.14"\n`
    assertEquals(providerFromCheckout(null, pyproject), { version: "0.0.14", apis: null })
    assertEquals(providerFromCheckout("provides: { apis: { cli.list: 1 } }", pyproject), {
        version: "0.0.14",
        apis: { "cli.list": [1] },
    })
    assertEquals(providerFromCheckout("provides: [a", pyproject).apis, null)
    assertEquals(providerFromCheckout(null, null).version, null)
})
