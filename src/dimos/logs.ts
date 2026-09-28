// dimos writes structured logs to <checkout>/logs/<run_id>/main.jsonl (a checkout install) or
// $XDG_STATE_HOME/dimos/logs/<run_id>/main.jsonl (a library install). Read them straight off disk.
import { join } from "jsr:@std/path@1"
import { exists, paths } from "../core/paths.ts"
import { type LogFilter, type LogRecord, matchesFilter, parseLogLine } from "./parse.ts"

export type LogRun = { runId: string; file: string; size: number; modified: string | null }

function logRoots(dimosDir: string): string[] {
    return [join(dimosDir, "logs"), join(paths.dimosState, "logs")]
}

export function listLogRuns(dimosDir: string): LogRun[] {
    const runs: LogRun[] = []
    for (const root of logRoots(dimosDir)) {
        try {
            for (const entry of Deno.readDirSync(root)) {
                const file = join(root, entry.name, "main.jsonl")
                if (entry.isDirectory && exists(file)) {
                    const info = Deno.statSync(file)
                    runs.push({ runId: entry.name, file, size: info.size, modified: info.mtime?.toISOString() ?? null })
                }
            }
        } catch {
            // this root doesn't exist
        }
    }
    return runs.sort((a, b) => b.runId.localeCompare(a.runId))
}

export type LogPage = { runId: string | null; records: LogRecord[]; offset: number; loggers: string[] }

const maxRead = 4 * 1024 * 1024

/**
 * Records after byte `after` (for live tailing), or the last `limit` records when `after` is
 * omitted. `offset` is where the next poll should continue from.
 */
export async function readLog(
    dimosDir: string,
    options: { runId?: string; after?: number; limit?: number } & LogFilter,
): Promise<LogPage> {
    const runs = listLogRuns(dimosDir)
    const target = options.runId ? runs.find((each) => each.runId == options.runId) : runs[0]
    if (!target) {
        return { runId: options.runId ?? null, records: [], offset: 0, loggers: [] }
    }
    const file = await Deno.open(target.file)
    try {
        const size = (await file.stat()).size
        // a smaller file than the caller's offset means dimos rotated it; start over
        let start = options.after != null && options.after <= size ? options.after : Math.max(0, size - maxRead)
        start = Math.max(start, size - maxRead)
        await file.seek(start, Deno.SeekMode.Start)
        const buffer = new Uint8Array(size - start)
        let read = 0
        while (read < buffer.length) {
            const count = await file.read(buffer.subarray(read))
            if (count == null) {
                break
            }
            read += count
        }
        let text = new TextDecoder().decode(buffer.subarray(0, read))
        // hold back a trailing partial line for the next poll
        const lastNewline = text.lastIndexOf("\n")
        const consumed = lastNewline == -1 ? 0 : new TextEncoder().encode(text.slice(0, lastNewline + 1)).length
        text = lastNewline == -1 ? "" : text.slice(0, lastNewline)
        const lines = text.split("\n")
        // when starting mid-file the first line is probably cut
        if (start > 0 && options.after == null) {
            lines.shift()
        }
        const all = lines.map(parseLogLine).filter((record): record is LogRecord => record != null)
        const loggers = [...new Set(all.map((record) => record.logger).filter(Boolean))].sort()
        const records = all.filter((record) => matchesFilter(record, options))
        return {
            runId: target.runId,
            records: options.after == null ? records.slice(-(options.limit ?? 1000)) : records,
            offset: start + consumed,
            loggers,
        }
    } finally {
        file.close()
    }
}
