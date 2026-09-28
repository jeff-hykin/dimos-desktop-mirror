// Everything Desktop owns lives under ~/.dimos/desktop; the dimos checkout sits beside it.
// DIMOS_HOME moves the whole tree (tests and CI install into a temp dir with it).
import { join } from "jsr:@std/path@1"

export function home(): string {
    const dir = Deno.env.get("HOME")
    if (!dir) {
        throw new Error("HOME is not set")
    }
    return dir
}

export const paths = {
    get dimosHome() {
        return Deno.env.get("DIMOS_HOME") ?? join(home(), ".dimos")
    },
    get root() {
        return join(this.dimosHome, "desktop")
    },
    get binary() {
        return join(this.root, "bin", "dimos-desktop")
    },
    get config() {
        return join(this.root, "config.json")
    },
    get apps() {
        return join(this.root, "apps")
    },
    get sockets() {
        return join(this.root, "sockets")
    },
    get logs() {
        return join(this.root, "logs")
    },
    get serviceLog() {
        return join(this.logs, "service.log")
    },
    get defaultDimosDir() {
        return join(this.dimosHome, "dimos")
    },
    /** dimos's run registry: $XDG_STATE_HOME/dimos/runs (dimos/constants.py), on macOS too. */
    get dimosState() {
        return join(Deno.env.get("XDG_STATE_HOME") ?? join(home(), ".local", "state"), "dimos")
    },
}

export function exists(path: string): boolean {
    try {
        Deno.statSync(path)
        return true
    } catch {
        return false
    }
}

export function readTextOrNull(path: string): string | null {
    try {
        return Deno.readTextFileSync(path)
    } catch {
        return null
    }
}

/** Deno resolves the caller's cwd on every spawn; a deleted cwd breaks them all, so park in $HOME. */
export function ensureCwd() {
    try {
        Deno.cwd()
    } catch {
        Deno.chdir(home())
    }
}
