import { dirname } from "jsr:@std/path@1"
import { paths, readTextOrNull } from "./paths.ts"

export type Config = {
    host: string
    port: number
    /** The dimos checkout Desktop drives. */
    dimosDir: string
    /** Start blueprints with --local-relay so apps like the Controller get live data. */
    localRelay: boolean
    /** Launch even when a compatibility check fails ("continue anyway"). */
    ignoreCompat: boolean
}

export const defaultPort = 7077

export function defaults(): Config {
    return {
        host: "127.0.0.1",
        port: defaultPort,
        dimosDir: paths.defaultDimosDir,
        localRelay: true,
        ignoreCompat: false,
    }
}

export function loadConfig(): Config {
    const text = readTextOrNull(paths.config)
    if (!text) {
        return defaults()
    }
    try {
        return { ...defaults(), ...JSON.parse(text) }
    } catch {
        return defaults()
    }
}

export function saveConfig(changes: Partial<Config>): Config {
    const config = { ...loadConfig(), ...changes }
    Deno.mkdirSync(dirname(paths.config), { recursive: true })
    Deno.writeTextFileSync(paths.config, JSON.stringify(config, null, 4) + "\n")
    return config
}

export function desktopUrl(config = loadConfig()): string {
    return `http://${config.host == "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`
}
