import { useEffect, useRef, useState } from "react"
import { api, ApiError, type Info, type Launch, type RegistryRun } from "../api.ts"
import { usePoll } from "../usePoll.ts"

function uptime(startedAt: string): string {
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

export function BlueprintsView({ info, runs, refreshRuns }: {
    info: Info | null
    runs: { live: RegistryRun[]; launch: Launch | null } | null
    refreshRuns: () => void
}) {
    const installed = info?.dimos.installed ?? false
    const blueprints = usePoll(() => installed ? api.blueprints() : Promise.resolve(null), 60_000)
    const [query, setQuery] = useState("")
    const [replay, setReplay] = useState(false)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const outputRef = useRef<HTMLPreElement>(null)
    const launch = runs?.launch
    const live = runs?.live ?? []

    useEffect(() => {
        const output = outputRef.current
        if (output) {
            output.scrollTop = output.scrollHeight
        }
    }, [launch?.output])
    useEffect(() => {
        if (installed) {
            blueprints.refresh()
        }
    }, [installed])

    const start = async (name: string, force = false) => {
        setBusy(name)
        setError(null)
        try {
            await api.start(name, { force, replay })
        } catch (caught) {
            if (caught instanceof ApiError && caught.status == 409) {
                const problems = (caught.data.problems as string[]).join("\n")
                if (confirm(`This dimos may not work with Desktop:\n${problems}\n\nContinue anyway?`)) {
                    await start(name, true)
                }
            } else {
                setError((caught as Error).message)
            }
        } finally {
            setBusy(null)
            refreshRuns()
        }
    }
    const stop = async () => {
        setBusy("stop")
        try {
            await api.stop()
        } catch (caught) {
            setError((caught as Error).message)
        } finally {
            setBusy(null)
            refreshRuns()
        }
    }

    const all = blueprints.data ? [...blueprints.data.builtin, ...blueprints.data.external] : []
    const filtered = all.filter((name) => name.includes(query.trim().toLowerCase()))
    const starting = launch?.phase == "starting"

    return (
        <section className="view split" data-testid="view-blueprints">
            <div className="column">
                <h1>Blueprints</h1>
                {!installed && <p className="warn">dimos isn't installed yet; see the dimOS page.</p>}
                <input
                    className="search"
                    placeholder={`Search ${all.length} blueprints`}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    data-testid="blueprint-search"
                />
                <label className="row">
                    <input
                        type="checkbox"
                        checked={replay}
                        onChange={(event) => setReplay(event.target.checked)}
                        data-testid="replay"
                    />
                    Replay a recording (no robot needed; blueprints with replay data only)
                </label>
                {blueprints.error && <p className="danger">{blueprints.error}</p>}
                {installed && !blueprints.data && !blueprints.error && (
                    <p className="faint">Asking dimos for its blueprints…</p>
                )}
                <ul className="list">
                    {filtered.map((name) => (
                        <li key={name} className="list-row">
                            <span className="mono grow">{name}</span>
                            <button
                                type="button"
                                disabled={starting || busy != null || live.length > 0}
                                onClick={() => start(name)}
                                data-testid={`run-${name}`}
                            >
                                {busy == name ? "Starting…" : "Run"}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="column">
                <h2>Running</h2>
                {error && <p className="danger">{error}</p>}
                {live.length == 0 && <p className="faint">Nothing running.</p>}
                {live.map((run) => (
                    <div key={run.run_id} className="card" data-testid="live-run">
                        <div className="row">
                            <span className="dot ok" />
                            <strong className="grow">{run.blueprint}</strong>
                            <button type="button" className="danger-button" disabled={busy == "stop"} onClick={stop}>
                                {busy == "stop" ? "Stopping…" : "Stop"}
                            </button>
                        </div>
                        <dl className="facts">
                            <dt>Run</dt>
                            <dd className="mono">{run.run_id}</dd>
                            <dt>PID</dt>
                            <dd>{run.pid}</dd>
                            <dt>Uptime</dt>
                            <dd>{uptime(run.started_at)}</dd>
                            <dt>Logs</dt>
                            <dd>
                                <a href="#logs">open</a>
                            </dd>
                        </dl>
                    </div>
                ))}
                {launch && (
                    <div className="card">
                        <div className="row">
                            <span
                                className={`dot ${
                                    launch.phase == "failed" ? "bad" : launch.phase == "starting" ? "warn" : "ok"
                                }`}
                            />
                            <strong className="grow">
                                {launch.blueprint}: {launch.phase}
                                {launch.relay ? " (with relay)" : ""}
                            </strong>
                        </div>
                        {launch.error && <p className="danger">{launch.error}</p>}
                        <pre className="console" ref={outputRef} data-testid="launch-output">{launch.output}</pre>
                    </div>
                )}
            </div>
        </section>
    )
}
