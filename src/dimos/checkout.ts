// A dimos checkout on disk: where it is, which version, and whether Desktop can use it.
import { join } from "jsr:@std/path@1"
import { exists, readTextOrNull } from "../core/paths.ts"
import { currentRef } from "../core/git.ts"
import { checkRequires, type CompatReport, type Provider, providerFromCheckout } from "../core/manifest.ts"
import { run } from "../core/proc.ts"
import { desktopManifest, desktopProvider } from "../self.ts"

export const dimosRepoUrl = "https://github.com/dimensionalOS/dimos"

export type CheckoutInfo = {
    dir: string
    exists: boolean
    installed: boolean
    ref: string | null
    provider: Provider
    compat: CompatReport
    relayAvailable: boolean
}

export function dimosBin(dir: string): string {
    return join(dir, ".venv", "bin", "dimos")
}

export function dimosProvider(dir: string): Provider | null {
    if (!exists(join(dir, "pyproject.toml"))) {
        return null
    }
    return providerFromCheckout(readTextOrNull(join(dir, "dimos.yaml")), readTextOrNull(join(dir, "pyproject.toml")))
}

/** What Desktop's own dimos.yaml requires, checked against a checkout. */
export function checkDimos(provider: Provider | null): CompatReport {
    const providers: Record<string, Provider> = { "dimos-desktop": desktopProvider() }
    if (provider) {
        providers.dimos = provider
    }
    return checkRequires(desktopManifest().requires, providers)
}

// --local-relay needs the dimos `web` extra; importing the bridge module is the same check dimos makes
const relayProbe = new Map<string, boolean>()

export async function hasRelay(dir: string): Promise<boolean> {
    if (!relayProbe.has(dir)) {
        const python = join(dir, ".venv", "bin", "python")
        const result = await run(python, ["-c", "import dimos.web.relay_bridge.relay_bridge_module"], {
            cwd: dir,
            timeoutMs: 60_000,
        })
        relayProbe.set(dir, result.code == 0)
    }
    return relayProbe.get(dir)!
}

export async function inspectCheckout(dir: string): Promise<CheckoutInfo> {
    const provider = dimosProvider(dir)
    const installed = provider != null && exists(dimosBin(dir))
    return {
        dir,
        exists: provider != null,
        installed,
        ref: exists(join(dir, ".git")) ? await currentRef(dir) : null,
        provider: provider ?? { version: null, apis: null },
        compat: checkDimos(provider),
        relayAvailable: installed ? await hasRelay(dir) : false,
    }
}
