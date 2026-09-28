import { useEffect, useRef, useState } from "react"
import { api, type LogRecord } from "../api.ts"
import { usePoll } from "../usePoll.ts"

const levels = ["debug", "info", "warning", "error"]

function time(timestamp: string): string {
    const parsed = Date.parse(timestamp)
    return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleTimeString()
}

/** dimos loggers are file paths ("dimos/core/coordination/module_coordinator.py"): show the file */
function shortLogger(logger: string): string {
    return logger.split("/").pop()!.replace(/\.py$/, "")
}

function Record({ record }: { record: LogRecord }) {
    const [open, setOpen] = useState(false)
    const { exception, ...rest } = record.extra as { exception?: string }
    const details = Object.entries(rest).filter(([key]) => !["func_name", "lineno", "filename", "module"].includes(key))
    const expandable = exception != null || details.length > 0
    return (
        <li className={`log-row level-${record.level}`} onClick={() => expandable && setOpen(!open)}>
            <span className="log-time">{time(record.timestamp)}</span>
            <span className="log-level">{record.level}</span>
            <span className="log-logger" title={record.logger}>{shortLogger(record.logger)}</span>
            <span className="log-event">
                {record.event}
                {expandable && !open && <span className="faint">{exception ? "▸ traceback" : "▸"}</span>}
                {open && details.length > 0 && (
                    <span className="log-details">
                        {details.map(([key, value]) => (
                            <span key={key}>
                                <span className="faint">{key}=</span>
                                {typeof value == "string" ? value : JSON.stringify(value)}
                                {" "}
                            </span>
                        ))}
                    </span>
                )}
                {open && exception && <pre className="traceback">{exception}</pre>}
            </span>
        </li>
    )
}

export function LogsView() {
    const runs = usePoll(api.logRuns, 5000)
    const [runId, setRunId] = useState("")
    const [query, setQuery] = useState("")
    const [level, setLevel] = useState("info")
    const [logger, setLogger] = useState("")
    const [follow, setFollow] = useState(true)
    const [records, setRecords] = useState<LogRecord[]>([])
    const [loggers, setLoggers] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const offset = useRef<number | null>(null)

    const selected = runId || runs.data?.[0]?.runId || ""

    // reload from scratch when the filter changes, then poll for new lines
    useEffect(() => {
        if (!selected) {
            return
        }
        let cancelled = false
        const filter = { run: selected, q: query, level, logger }
        offset.current = null
        const load = async () => {
            try {
                const page = await api.logs({ ...filter, after: offset.current ?? undefined })
                if (cancelled) {
                    return
                }
                const fresh = offset.current == null
                setRecords((current) => fresh ? page.records : [...current, ...page.records].slice(-5000))
                setLoggers((current) => [...new Set([...current, ...page.loggers])].sort())
                offset.current = page.offset
                setError(null)
            } catch (caught) {
                setError((caught as Error).message)
            }
        }
        const timer = setTimeout(load, query ? 250 : 0)
        const interval = setInterval(load, 1000)
        return () => {
            cancelled = true
            clearTimeout(timer)
            clearInterval(interval)
        }
    }, [selected, query, level, logger])

    useEffect(() => {
        if (follow && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
        }
    }, [records, follow])

    return (
        <section className="view logs" data-testid="view-logs">
            <div className="toolbar">
                <h1>Logs</h1>
                <select
                    className="run-select"
                    value={selected}
                    onChange={(event) => setRunId(event.target.value)}
                    data-testid="log-run"
                >
                    {(runs.data ?? []).map((run) => <option key={run.runId} value={run.runId}>{run.runId}</option>)}
                </select>
                <select value={level} onChange={(event) => setLevel(event.target.value)} data-testid="log-level">
                    {levels.map((name) => <option key={name} value={name}>{name}+</option>)}
                </select>
                <select className="logger-select" value={logger} onChange={(event) => setLogger(event.target.value)}>
                    <option value="">all modules</option>
                    {loggers.map((name) => <option key={name} value={name}>{shortLogger(name)}</option>)}
                </select>
                <input
                    className="search grow"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    data-testid="log-search"
                />
                <label className="row">
                    <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
                    Follow
                </label>
            </div>
            {error && <p className="danger">{error}</p>}
            {runs.data?.length == 0 && <p className="faint">No logs yet. Run a blueprint and its log shows up here.</p>}
            <ul className="log-list mono" ref={listRef} data-testid="log-list">
                {records.map((record, index) => <Record key={index} record={record} />)}
            </ul>
        </section>
    )
}
