// Versions as dimos tags them: v0.0.14, 0.0.14b1, v0.0.13.post1, 0.1.0-rc.2

export type Version = {
    major: number
    minor: number
    patch: number
    // negative = pre-release (a < b < rc), 0 = final, positive = post-release
    stage: number
    stageNumber: number
}

const pattern = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.]?(a|alpha|b|beta|rc|post)[-.]?(\d*))?$/i
const stageRank: Record<string, number> = { a: -3, alpha: -3, b: -2, beta: -2, rc: -1, post: 1 }

export function parseVersion(text: string): Version | null {
    const match = text.trim().match(pattern)
    if (!match) {
        return null
    }
    const [, major, minor, patch, stage, stageNumber] = match
    return {
        major: Number(major),
        minor: Number(minor ?? 0),
        patch: Number(patch ?? 0),
        stage: stage ? stageRank[stage.toLowerCase()] : 0,
        stageNumber: Number(stageNumber || 0),
    }
}

export function compareVersions(a: Version, b: Version): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch || a.stage - b.stage ||
        a.stageNumber - b.stageNumber
}

export function formatVersion(version: Version): string {
    return `${version.major}.${version.minor}.${version.patch}`
}

const comparators: Record<string, (order: number) => boolean> = {
    ">=": (order) => order >= 0,
    ">": (order) => order > 0,
    "<=": (order) => order <= 0,
    "<": (order) => order < 0,
    "==": (order) => order == 0,
    "=": (order) => order == 0,
}

/** A range is comparators joined by spaces or commas: ">=0.0.14 <0.1". A bare version means "==". */
export function satisfies(versionText: string, range: string): boolean {
    const version = parseVersion(versionText)
    if (!version) {
        return false
    }
    const clauses = range.split(/[\s,]+/).filter(Boolean)
    if (clauses.length == 0) {
        throw new Error(`empty version range`)
    }
    return clauses.every((clause) => {
        const [, operator, target] = clause.match(/^(>=|<=|==|=|>|<)?(.+)$/)!
        const bound = parseVersion(target)
        if (!bound) {
            throw new Error(`bad version in range: ${clause}`)
        }
        return comparators[operator ?? "=="](compareVersions(version, bound))
    })
}

/** The newest release tag, skipping pre-releases unless nothing else matches. */
export function newestTag(tags: string[], range?: string): string | null {
    const candidates = tags
        .map((tag) => ({ tag, version: parseVersion(tag) }))
        .filter((entry): entry is { tag: string; version: Version } => entry.version != null)
        .filter((entry) => !range || satisfies(entry.tag, range))
        .sort((a, b) => compareVersions(b.version, a.version))
    const final = candidates.find((entry) => entry.version.stage >= 0)
    return (final ?? candidates[0])?.tag ?? null
}
