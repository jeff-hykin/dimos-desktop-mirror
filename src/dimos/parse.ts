// Parsers for what the current dimos prints. dimos 0.0.14 has no JSON output for list/status,
// so this is the only place its text formats are assumed.

export type BlueprintList = { builtin: string[]; external: string[] }

/** `dimos list`: section headers ending in ":" followed by "  <name>" lines. */
export function parseBlueprintList(stdout: string): BlueprintList {
    const result: BlueprintList = { builtin: [], external: [] }
    let section: string[] | null = null
    for (const line of stdout.split("\n")) {
        if (/^\S.*:\s*$/.test(line)) {
            section = /external/i.test(line) ? result.external : result.builtin
            continue
        }
        const name = line.match(/^\s{2,}(\S+)\s*$/)?.[1]
        if (name && section) {
            section.push(name)
        }
    }
    return result
}

export type LogRecord = {
    timestamp: string
    level: string
    logger: string
    event: string
    extra: Record<string, unknown>
    raw: string
}

const known = new Set(["timestamp", "level", "logger", "event"])

/** One line of main.jsonl (structlog JSON). Non-JSON lines become level "raw" records. */
export function parseLogLine(line: string): LogRecord | null {
    if (!line.trim()) {
        return null
    }
    try {
        const data = JSON.parse(line)
        const extra: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(data)) {
            if (!known.has(key)) {
                extra[key] = value
            }
        }
        return {
            timestamp: String(data.timestamp ?? ""),
            level: String(data.level ?? "info").toLowerCase(),
            logger: String(data.logger ?? ""),
            event: String(data.event ?? ""),
            extra,
            raw: line,
        }
    } catch {
        return { timestamp: "", level: "raw", logger: "", event: line, extra: {}, raw: line }
    }
}

const levelRank: Record<string, number> = {
    debug: 10,
    info: 20,
    warning: 30,
    warn: 30,
    error: 40,
    critical: 50,
    raw: 20,
}

export type LogFilter = { query?: string; minLevel?: string; logger?: string }

export function matchesFilter(record: LogRecord, filter: LogFilter): boolean {
    if (filter.minLevel && (levelRank[record.level] ?? 20) < (levelRank[filter.minLevel] ?? 0)) {
        return false
    }
    if (filter.logger && record.logger != filter.logger) {
        return false
    }
    if (filter.query) {
        return record.raw.toLowerCase().includes(filter.query.toLowerCase())
    }
    return true
}
