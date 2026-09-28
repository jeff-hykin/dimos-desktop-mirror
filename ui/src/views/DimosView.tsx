import { useState } from "react"
import { api, type Info } from "../api.ts"

export function DimosView({ info, refresh }: { info: Info | null; refresh: () => void }) {
    const [dir, setDir] = useState<string | null>(null)
    if (!info) {
        return (
            <section className="view">
                <p className="faint">Loading…</p>
            </section>
        )
    }
    const { dimos, config } = info
    const save = async (changes: Partial<Info["config"]>) => {
        await api.setConfig(changes)
        setDir(null)
        refresh()
    }
    return (
        <section className="view" data-testid="view-dimos">
            <h1>dimOS</h1>
            <div className="card">
                <dl className="facts">
                    <dt>Checkout</dt>
                    <dd className="mono">{dimos.dir}</dd>
                    <dt>Installed</dt>
                    <dd>{dimos.installed ? "yes" : dimos.exists ? "cloned, but its venv is missing" : "no"}</dd>
                    <dt>Version</dt>
                    <dd>{dimos.provider.version ?? "unknown"}{dimos.ref ? ` (${dimos.ref})` : ""}</dd>
                    <dt>Live data relay</dt>
                    <dd>{dimos.relayAvailable ? "available" : "not available (install the dimos web extra)"}</dd>
                </dl>
            </div>

            {!dimos.installed && (
                <div className="card warn-card">
                    <p>
                        dimos isn't installed at this path. Install it from a terminal (sudo may ask for your password):
                    </p>
                    <pre className="mono">~/.dimos/desktop/bin/dimos-desktop install</pre>
                    <p className="faint">Or point Desktop at a checkout you already have, below.</p>
                </div>
            )}

            {(dimos.compat.problems.length > 0 || dimos.compat.warnings.length > 0) && (
                <div className={`card ${dimos.compat.ok ? "" : "warn-card"}`} data-testid="compat">
                    <h2>Compatibility</h2>
                    <ul>
                        {dimos.compat.problems.map((problem) => <li key={problem} className="warn">{problem}</li>)}
                        {dimos.compat.warnings.map((warning) => <li key={warning} className="faint">{warning}</li>)}
                    </ul>
                    {!dimos.compat.ok && (
                        <label className="row">
                            <input
                                type="checkbox"
                                checked={config.ignoreCompat}
                                onChange={(event) => save({ ignoreCompat: event.target.checked })}
                            />
                            Continue anyway (launch blueprints despite the mismatch)
                        </label>
                    )}
                </div>
            )}

            <div className="card">
                <h2>Settings</h2>
                <label className="field">
                    <span>dimos checkout</span>
                    <span className="row">
                        <input
                            className="mono grow"
                            value={dir ?? config.dimosDir}
                            onChange={(event) => setDir(event.target.value)}
                        />
                        <button
                            type="button"
                            disabled={dir == null || dir == config.dimosDir}
                            onClick={() => save({ dimosDir: dir! })}
                        >
                            Save
                        </button>
                    </span>
                </label>
                <label className="row">
                    <input
                        type="checkbox"
                        checked={config.localRelay}
                        onChange={(event) => save({ localRelay: event.target.checked })}
                    />
                    Start blueprints with a local relay (live data for apps like Controller)
                </label>
            </div>
        </section>
    )
}
