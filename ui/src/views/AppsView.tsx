import { useState } from "react"
import { api, type App } from "../api.ts"

function AppCard({ app, refresh, open }: { app: App; refresh: () => void; open: () => void }) {
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [versions, setVersions] = useState<string[] | null>(null)

    const act = async (label: string, action: () => Promise<unknown>) => {
        setBusy(label)
        setError(null)
        try {
            await action()
        } catch (caught) {
            setError((caught as Error).message)
        } finally {
            setBusy(null)
            refresh()
        }
    }
    return (
        <li className="card app-card" data-testid={`app-${app.name}`}>
            <div className="row">
                <img className="app-icon big" src={`/app/${app.name}/icon.svg`} alt="" />
                <div className="grow">
                    <strong>{app.title}</strong>
                    <div className="faint mono">{app.name} · {app.ref}{app.hasBackend ? " · backend" : ""}</div>
                </div>
                <button type="button" disabled={app.error != null} onClick={open} data-testid={`open-${app.name}`}>
                    Open
                </button>
                <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => act("update", () => api.updateApp(app.name))}
                >
                    {busy == "update" ? "Updating…" : "Update"}
                </button>
                <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => act("versions", async () => setVersions((await api.appVersions(app.name)).tags))}
                >
                    Versions
                </button>
                <button
                    type="button"
                    className="danger-button"
                    disabled={busy != null}
                    onClick={() => confirm(`Remove ${app.title}?`) && act("remove", () => api.removeApp(app.name))}
                >
                    Remove
                </button>
            </div>
            {versions && (
                <div className="row wrap">
                    {versions.length == 0 && (
                        <span className="faint">No version tags; this app follows its default branch.</span>
                    )}
                    {versions.map((tag) => (
                        <button
                            type="button"
                            key={tag}
                            className={tag == app.ref ? "chip current" : "chip"}
                            onClick={() => act("checkout", () => api.checkoutApp(app.name, tag))}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
            {app.error && <p className="danger">{app.error}</p>}
            {app.compat.problems.map((problem) => <p key={problem} className="warn">Incompatible: {problem}</p>)}
            {app.backend && !app.backend.running && (
                <p className="warn">Backend isn't running ({app.backend.restarts} restarts)</p>
            )}
            {error && <p className="danger">{error}</p>}
        </li>
    )
}

export function AppsView(
    { apps, refresh, open }: { apps: App[] | null; refresh: () => void; open: (name: string) => void },
) {
    const [source, setSource] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const install = async () => {
        setBusy(true)
        setError(null)
        try {
            const app = await api.installApp(source)
            setSource("")
            if (app.compat.problems.length > 0) {
                setError(`Installed, but: ${app.compat.problems.join("; ")}`)
            }
        } catch (caught) {
            setError((caught as Error).message)
        } finally {
            setBusy(false)
            refresh()
        }
    }
    return (
        <section className="view" data-testid="view-apps">
            <h1>Apps</h1>
            <form
                className="row card"
                onSubmit={(event) => {
                    event.preventDefault()
                    install()
                }}
            >
                <input
                    className="mono grow"
                    placeholder="https://github.com/jeff-hykin/dimos-controller"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    data-testid="app-source"
                />
                <button type="submit" disabled={busy || !source.trim()} data-testid="app-install">
                    {busy ? "Installing…" : "Install"}
                </button>
            </form>
            {error && <p className="danger" data-testid="app-error">{error}</p>}
            {apps?.length == 0 && <p className="faint">No apps installed. Paste a git URL above.</p>}
            <ul className="list">
                {(apps ?? []).map((app) => (
                    <AppCard
                        key={app.name}
                        app={app}
                        refresh={refresh}
                        open={() => open(app.name)}
                    />
                ))}
            </ul>
        </section>
    )
}
