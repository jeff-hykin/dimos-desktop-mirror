import { useEffect, useState } from "react"
import { api } from "./api.ts"
import { usePoll } from "./usePoll.ts"
import { DimosView } from "./views/DimosView.tsx"
import { BlueprintsView } from "./views/BlueprintsView.tsx"
import { LogsView } from "./views/LogsView.tsx"
import { AppsView } from "./views/AppsView.tsx"

type View = "dimos" | "blueprints" | "logs" | "apps" | `app:${string}`

const builtins: { id: View; label: string; glyph: string }[] = [
    { id: "dimos", label: "dimOS", glyph: "◎" },
    { id: "blueprints", label: "Blueprints", glyph: "▶" },
    { id: "logs", label: "Logs", glyph: "≡" },
    { id: "apps", label: "Apps", glyph: "＋" },
]

function viewFromHash(): View {
    const hash = decodeURIComponent(location.hash.slice(1))
    return (hash || "blueprints") as View
}

export function App() {
    const [view, setView] = useState<View>(viewFromHash)
    // app iframes stay mounted once opened so switching views doesn't reset them
    const [opened, setOpened] = useState<string[]>([])
    const apps = usePoll(api.apps, 5000)
    const info = usePoll(api.info, 5000)
    const runs = usePoll(api.runs, 1500)

    useEffect(() => {
        const onHash = () => setView(viewFromHash())
        addEventListener("hashchange", onHash)
        return () => removeEventListener("hashchange", onHash)
    }, [])
    useEffect(() => {
        if (view.startsWith("app:")) {
            const name = view.slice(4)
            setOpened((current) => current.includes(name) ? current : [...current, name])
        }
    }, [view])

    const go = (next: View) => {
        location.hash = next
    }
    const launch = runs.data?.launch
    const live = runs.data?.live[0]

    return (
        <div className="shell">
            <nav className="rail">
                {builtins.map((item) => (
                    <button
                        type="button"
                        key={item.id}
                        className="rail-item"
                        aria-current={view == item.id}
                        title={item.label}
                        onClick={() => go(item.id)}
                        data-testid={`nav-${item.id}`}
                    >
                        <span className="glyph">{item.glyph}</span>
                        <span className="rail-label">{item.label}</span>
                    </button>
                ))}
                <div className="rail-divider" />
                {(apps.data ?? []).filter((app) => !app.error).map((app) => (
                    <button
                        type="button"
                        key={app.name}
                        className="rail-item"
                        aria-current={view == `app:${app.name}`}
                        title={app.title}
                        onClick={() => go(`app:${app.name}`)}
                        data-testid={`nav-app-${app.name}`}
                    >
                        <img className="app-icon" src={`/app/${app.name}/icon.svg`} alt="" />
                        <span className="rail-label">{app.title}</span>
                    </button>
                ))}
            </nav>
            <main className="main">
                {view == "dimos" && <DimosView info={info.data} refresh={info.refresh} />}
                {view == "blueprints" && (
                    <BlueprintsView
                        info={info.data}
                        runs={runs.data}
                        refreshRuns={runs.refresh}
                    />
                )}
                {view == "logs" && <LogsView />}
                {view == "apps" && (
                    <AppsView
                        apps={apps.data}
                        refresh={apps.refresh}
                        open={(name) => go(`app:${name}`)}
                    />
                )}
                {opened.map((name) => (
                    <iframe
                        key={name}
                        className="app-frame"
                        hidden={view != `app:${name}`}
                        src={`/app/${name}/`}
                        title={name}
                        allow="microphone; camera; fullscreen; clipboard-read; clipboard-write"
                    />
                ))}
            </main>
            <footer className="statusbar">
                <span className={`dot ${live ? "ok" : launch?.phase == "starting" ? "warn" : ""}`} />
                <span>
                    {live
                        ? `running ${live.blueprint}`
                        : launch?.phase == "starting"
                        ? `starting ${launch.blueprint}…`
                        : launch?.phase == "failed"
                        ? `${launch.blueprint} failed`
                        : "no blueprint running"}
                </span>
                <span className="spacer" />
                {info.data && !info.data.dimos.compat.ok && (
                    <button
                        type="button"
                        className="link warn"
                        onClick={() => go("dimos")}
                    >
                        dimos version mismatch
                    </button>
                )}
                {info.data && !info.data.dimos.installed && (
                    <button
                        type="button"
                        className="link warn"
                        onClick={() => go("dimos")}
                    >
                        dimos not installed
                    </button>
                )}
                <span className="faint">
                    {info.data ? `Desktop ${info.data.version} · dimos ${info.data.dimos.provider.version ?? "?"}` : ""}
                </span>
                {info.error && <span className="danger">Desktop isn't answering</span>}
            </footer>
        </div>
    )
}
