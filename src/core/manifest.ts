// dimos.yaml: one file per repo saying what it provides and what it requires. See docs/apps.md.
import { parse as parseYaml } from "jsr:@std/yaml@1"
import { satisfies } from "./version.ts"

export type Requirement = { version?: string; apis: Record<string, number> }

export type Manifest = {
    name?: string
    title?: string
    frontend: string
    backend?: { command: string[] }
    requires: Record<string, Requirement>
    provides: { apis: Record<string, number[]> }
}

/** What a provider actually offers. `apis: null` = it predates dimos.yaml, so APIs are unknown. */
export type Provider = { version: string | null; apis: Record<string, number[]> | null }

export type CompatReport = { ok: boolean; problems: string[]; warnings: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value == "object" && value != null && !Array.isArray(value)
}

function numberList(value: unknown, where: string): number[] {
    const list = Array.isArray(value) ? value : [value]
    if (!list.every((each) => Number.isInteger(each))) {
        throw new Error(`${where} must be an integer or a list of integers`)
    }
    return list as number[]
}

/** Throws with a readable message on anything malformed. */
export function parseManifest(text: string): Manifest {
    let raw: unknown
    try {
        raw = parseYaml(text) ?? {}
    } catch (error) {
        throw new Error(`dimos.yaml is not valid YAML: ${(error as Error).message}`)
    }
    if (!isRecord(raw)) {
        throw new Error("dimos.yaml must be a mapping")
    }
    const requires: Record<string, Requirement> = {}
    const rawRequires = raw.requires ?? {}
    if (!isRecord(rawRequires)) {
        throw new Error("requires: must be a mapping of provider name to requirement")
    }
    for (const [provider, requirement] of Object.entries(rawRequires)) {
        // `dimos: ">=0.0.14"` is shorthand for `dimos: { version: ">=0.0.14" }`
        const full = typeof requirement == "string" ? { version: requirement } : requirement
        if (!isRecord(full)) {
            throw new Error(`requires.${provider} must be a version range or a mapping`)
        }
        if (full.version != null && typeof full.version != "string") {
            throw new Error(`requires.${provider}.version must be a string like ">=0.0.14"`)
        }
        const apis: Record<string, number> = {}
        for (const [api, major] of Object.entries(isRecord(full.apis) ? full.apis : {})) {
            if (!Number.isInteger(major)) {
                throw new Error(`requires.${provider}.apis.${api} must be an integer`)
            }
            apis[api] = major as number
        }
        requires[provider] = { version: full.version as string | undefined, apis }
    }
    const provides: Record<string, number[]> = {}
    const rawProvides = isRecord(raw.provides) && isRecord(raw.provides.apis) ? raw.provides.apis : {}
    for (const [api, majors] of Object.entries(rawProvides)) {
        provides[api] = numberList(majors, `provides.apis.${api}`)
    }
    let backend
    if (raw.backend != null) {
        const command = isRecord(raw.backend) ? raw.backend.command : null
        if (!Array.isArray(command) || command.length == 0 || !command.every((part) => typeof part == "string")) {
            throw new Error("backend.command must be a non-empty list of strings")
        }
        backend = { command: command as string[] }
    }
    const optionalString = (key: string) => {
        if (raw[key] != null && typeof raw[key] != "string") {
            throw new Error(`${key} must be a string`)
        }
        return raw[key] as string | undefined
    }
    return {
        name: optionalString("name"),
        title: optionalString("title"),
        frontend: optionalString("frontend") ?? "dist",
        backend,
        requires,
        provides: { apis: provides },
    }
}

export function checkRequires(
    requires: Record<string, Requirement>,
    providers: Record<string, Provider>,
): CompatReport {
    const problems: string[] = []
    const warnings: string[] = []
    for (const [name, requirement] of Object.entries(requires)) {
        const provider = providers[name]
        if (!provider) {
            problems.push(`needs ${name}, which isn't installed`)
            continue
        }
        if (requirement.version) {
            if (provider.version == null) {
                warnings.push(`couldn't tell which version of ${name} is installed`)
            } else if (!satisfies(provider.version, requirement.version)) {
                problems.push(`needs ${name} ${requirement.version}, found ${provider.version}`)
            }
        }
        for (const [api, major] of Object.entries(requirement.apis)) {
            if (provider.apis == null) {
                warnings.push(
                    `${name} ${provider.version ?? ""} doesn't declare its APIs; assuming ${api} v${major} works`,
                )
            } else if (!(provider.apis[api] ?? []).includes(major)) {
                problems.push(`needs ${name} API ${api} v${major}, which this ${name} doesn't provide`)
            }
        }
    }
    return { ok: problems.length == 0, problems, warnings }
}

/** dimos up to 0.0.14 has no dimos.yaml: its version comes from pyproject.toml and its APIs are unknown. */
export function providerFromCheckout(dimosYaml: string | null, pyproject: string | null): Provider {
    let version: string | null = null
    if (pyproject) {
        version = pyproject.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1] ?? null
    }
    if (dimosYaml != null) {
        try {
            return { version, apis: parseManifest(dimosYaml).provides.apis }
        } catch {
            // a broken dimos.yaml in dimos tells us nothing more than a missing one
        }
    }
    return { version, apis: null }
}
