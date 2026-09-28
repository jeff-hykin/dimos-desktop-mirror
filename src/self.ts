// Desktop's own version and dimos.yaml (embedded in the compiled binary with --include).
import { type Manifest, parseManifest, type Provider } from "./core/manifest.ts"

export const version = "0.1.0"

let manifest: Manifest | null = null

export function desktopManifest(): Manifest {
    manifest ??= parseManifest(Deno.readTextFileSync(new URL("../dimos.yaml", import.meta.url)))
    return manifest
}

export function desktopProvider(): Provider {
    return { version, apis: desktopManifest().provides.apis }
}
