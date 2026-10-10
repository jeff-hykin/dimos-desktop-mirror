# The agent

Desktop has one agent that sees every app: the user talks to it on Desktop's home screen (or docked beside an app, or in
a popup over one), and it acts through Desktop's HTTP endpoints and every installed app's. The agent is
[dimcode](https://github.com/dimensionalOS/dimcode): one binary that serves its own chat page and runs the agent. It is
the user's own dimcode: the gateway the terminal (`dimcode`) uses also serves the chat page on the same unix socket, so
the terminal and Desktop share one gateway, the same sessions and the same settings. Desktop installs the binary, makes
sure the gateway runs, shows its page in an iframe, gives it one MCP server, and describes everything else as endpoints.
The agent keeps its own settings (provider keys, model, a local model server); Desktop holds none of them.

```
browser windows ──POST /api/windows/<id>┐   (which app each shows, which one was used last)
agent iframe ─────/agent/* (HTTP, ws)─┤──▶ dimcode's gateway socket ($XDG_RUNTIME_DIR/dimcode.sock) ◀── dimcode (terminal)
                                      ▼                                       │
                              Desktop (Rust)  ── /mcp ◀───────────────────────┘
                                │    │
         built-in endpoints ◀───┘    └──▶ /apps/<app>/agent.json + the endpoints it lists   (proxied to each app)
         /dimos, /recordings, /api/open-app, /api/topics, /api/launcher, /api/logs
```

## The process: dimcode's own gateway, on demand

`config.yaml`:

```yaml
agent:
    binary: "" # empty = ~/.dimos/desktop/bin/dimcode (under DIMOS_HOME when set)
    socket: "" # empty = ask the binary: `<binary> desktop --print-socket` (dimcode's gateway socket), cached
```

The agent is not a boot service (Desktop is). On the first `/agent/*` request (and again after `agent.binary`, the port
or the dimos checkout change in config.yaml, or when the socket doesn't answer `GET /healthz`
`{ok, version, postMessage: 1}`), Desktop runs (`src/agent/mod.rs`):

```sh
<binary> desktop --mcp-url http://127.0.0.1:<port>/mcp --append-system-prompt-file ~/.dimos/desktop/agent-prompt.md --workspace <dimos checkout>
```

which records Desktop's MCP server (`desktop`), its prompt (below) and the workspace for the page's new sessions in
dimcode's config, starts the gateway if it isn't running (detached, as the terminal does) and returns once the page
answers. Concurrent requests wait for that one run; its output goes to `~/.dimos/desktop/logs/agent.log`. The binary
runs with the user's own environment, so it uses their dimcode home (`~/.dimcode`), minus every `*_API_KEY` variable of
Desktop's own environment, plus `DIMCODE_INSTALL_DIMOS=0` (Desktop installs dimos itself). A changed MCP url reaches
sessions opened after it (dimcode reads MCP servers when a session opens or reloads).

Desktop never stops the gateway on its own (it serves the terminal's sessions too): not on a config change, not after an
install (a new binary is used from the gateway's next start). `POST /api/agent/restart` and `dimos-desktop agent stop`
run `<binary> stop`, which stops it for the terminal too; the next `/agent/` request starts it again.

## The page: `/agent/` in one iframe

`/agent/<path>` (HTTP and websocket upgrades) is forwarded to the socket as `/<path>`, after starting the agent if
needed; if it can't start (not installed, or it exits) the answer is a 503 with the reason and the install hint: for a
browser loading a page, Desktop's themed status page (`src/server/pages.rs`, rendered by `ui/src/views/StatusPage.tsx`
with Install / Try again / Settings → Agent), JSON otherwise. The agent's `/ws` has no origin check of its own, so
Desktop forwards a websocket upgrade only when its `Origin` is Desktop's own host.

**When the agent isn't there, Desktop shows its own portal.** The Desktop page asks `GET /api/agent` (every 5 s and on
each `{type:"agent"}` event) and shows the agent's `/agent/portal` frame only while the agent answers. Otherwise
(`ui/src/shell/agentPortal.ts`): an installed agent that isn't answering is started once (`POST /api/agent/start`, what
the first `/agent/` request does; also after it stopped or crashed), and while it starts, after a failed start and when
it isn't installed, `ui/src/shell/FallbackPortal.tsx` stands in: the mockup's portal markup in Desktop's own page (so
`/shell/theme.css` styles it in every skin): the same box at the bottom left as the agent's chat, with its search line
(`GET /api/search`) and, where the conversation would be, one line on the agent (why, plus Install / Retry / Settings →
Agent). The dock is the Shell's own either way (`ui/src/shell/Dock.tsx`). It speaks the agent portal's messages with the
Shell, so notifications, Cmd+K, typing from the desktop and the phone's chat sheet work unchanged. It swaps back to the
agent's portal once the agent answers and the fallback is closed. `GET /api/agent`'s `error` is why the last start
failed (null once it answers).

The shell (`ui/src/views/Agent.tsx`) shows `/agent/?theme=dark|light` in ONE iframe that is never moved in the DOM
(moving an iframe reloads it): its host element switches between the full page (home, or the Agent rail item), docked
beside the open app, and the popup (footer Agent button, ⌘K / Ctrl+K), so the conversation and scroll survive. The page
and the shell talk with postMessage v1 (dimcode `docs/desktop-embed.md`); every message is
`{ dimosAgent: 1, type, ... }` and the shell only accepts messages from that iframe's window on its own origin:

| Direction    | Message                                              | What the shell does / sends                                         |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| page → shell | `ready {version}`                                    | sends the current `mode`, `theme` and `background`                  |
| page → shell | `state {working, unread}`                            | the working / new-reply dot on the Agent button                     |
| page → shell | `request {action: expand \| dock \| popup \| close}` | switches how the agent is shown                                     |
| page → shell | `open_app {app, path?}`                              | opens the app (name or title) in this window                        |
| shell → page | `mode {mode: full \| dock \| popup}`                 | on every change                                                     |
| shell → page | `focus`                                              | when the full page or popup opens                                   |
| shell → page | `theme {theme}`                                      | when the theme is toggled                                           |
| shell → page | `background {tasks}`                                 | the blueprint launch and every Desktop job, with their output tails |

## Installing it

`dimos-desktop agent install [--tag T]`, `dimos-desktop setup` (offers it; `--skip-agent` skips) and
`POST /api/agent/install` (a job; Settings → Agent and the agent's "not ready" screen) download the
`dimcode-<os>-<arch>` asset (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`) of a dimensionalOS/dimcode GitHub
release (the latest, or a tag) through the GitHub API, authenticated with `GITHUB_TOKEN` or else `gh auth token` (the
repo is private), to `agent.binary` (written beside it, then renamed in; mode 755) (`src/agent/install.rs`).
`GET /api/agent`: `{installed, running, binary, socket, version (from /healthz), reason, installHint, log, mcp}`.

## `GET /llms.txt`

A plain-text guide for any AI agent (the llms.txt convention, `src/server/llms.rs`): what Desktop is, the MCP endpoint
with `tools/list` / `tools/call` curl examples, the key tools, the OpenAPI document, the CLI (`install logs --follow`,
`install status --wait`, `terminal …`), the log paths and the installed apps with how to open each, from live state. No
login on this machine (like the rest); other devices log in first. `setup` points agents at it.

## One MCP server: `POST /mcp`

Streamable HTTP with JSON responses (`src/server/mcp.rs`). A fixed, small toolset; everything app-specific is an
endpoint the agent searches for, so apps never run an MCP server of their own, and an app that is installed, updated or
rebuilt changes what search finds without the agent reconnecting.

| Tool                                                                                               | What it does                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop_context`                                                                                  | What the user is looking at and what is running: the last active window, the app it shows and that app's own state (its `context` endpoint), every window, the installed apps and what each is for, running blueprints with their robot and `main.jsonl`, Desktop's log paths |
| `search_endpoints(query, app?)`                                                                    | Ranked endpoint ids with one-line descriptions, across Desktop's built-ins and every app's manifest; the app the user is looking at wins ties                                                                                                                                 |
| `describe_endpoint(id)`                                                                            | The endpoint's description and JSON Schema parameters                                                                                                                                                                                                                         |
| `call_endpoint(id, params)`                                                                        | Calls it through Desktop's own HTTP server (apps through their `/apps/<name>/` proxy)                                                                                                                                                                                         |
| `open_app(app, path?, focus?)`                                                                     | `POST /api/open-app`: open or switch to an app in the window the user used last                                                                                                                                                                                               |
| `screenshot(app?)`                                                                                 | What the user sees of the app (default: the one they're looking at): the browser window showing it draws its frame into one image (below); an error when no window shows it                                                                                                   |
| `grab_page(app?)`                                                                                  | Calls the app's `view` endpoint: its own capture (raw camera frames, the 3D camera's pose); works with no window open                                                                                                                                                         |
| `recent_errors(since?, all?, limit?)`                                                              | What went wrong in Desktop and its apps (below); unseen ones by default, which it then marks seen                                                                                                                                                                             |
| `list_topics` / `sample_topic(topic)`                                                              | The live robot's zenoh topics, and the next message on one: an image as an image, a point cloud as count, bounds, centroid and a sample                                                                                                                                       |
| `shell_read(id?, after?)` / `shell_type(id?, text, enter?, ctrlC?)` / `shell_resolve(id?, action)` | A shell session Desktop shows the user (an app's commands, the installer's `install`): read it, type into the same shell, then `retry` / `done` / `skip` the failed command. Never at a password prompt ([shell.md](shell.md))                                                |

`run_blueprint(blueprint, overrides?, replay?, show?)` launches like the Launcher (`POST /dimos/runs`); first, unless
`show` is false, it opens the Launcher, selects the blueprint there (filtered to its robot, scrolled to, detail panel
open) and holds about three seconds, so the user sees which one starts. In a reply, a markdown link `/?app=<app id>`
opens that app in Desktop when clicked (the portal closes and the app's frame takes the keyboard).

Narration: `POST /api/desktop/narration {text}` (and the MCP tool `narrate(text)`) shows one or two short plain-text
lines top center over everything for about 4 s, replaced by the next one; it is a `{type: "narration", text}` event on
the Desktop bus, not a notification (nothing is kept). `open_app`, `close_app`, `run_blueprint`, `stop_blueprint` and
`call_endpoint` take an optional `narration` that Desktop shows right before acting; `run_blueprint` narrates its own
steps (opening the Launcher, selecting the blueprint, launching it).

Endpoint ids are `<app>:<METHOD> <path>`, e.g. `desktop:GET /dimos/runs/{runId}/log`,
`dim-controller:POST api/annotations`. A call's `params` fill `{name}` path parts first, then go in the query string
(GET, DELETE) or the JSON body. A JSON result comes back as text; any `{ "mimeType": "image/...", "data": <base64> }`
object inside it is lifted out and handed to the model as an image (a raw `image/*` response is an image too), so
screenshots and camera frames reach a vision model without each app knowing about MCP.

`screenshot` is what the user sees: Desktop asks the browser window showing the app (`{type:"capture-app"}` on its key,
[events.md](events.md)) to draw the app's frame into one JPEG at the screen's pixel density: its page with each video's
current frame, each canvas (WebGL too) and each same-origin iframe drawn in where they are, overlays on top
(`ui/src/shell/frameCapture.ts`, [apps.md](apps.md)). Only a window can take it, so with none open, or the app not on
screen, it errors and names `grab_page`, which asks the app itself (its `role: view` endpoint).

## How apps describe their endpoints

An app lists the HTTP endpoints the agent may call, in `dimos.yaml` and/or served by the app at `GET <app>/agent.json`
(`src/server/endpoints.rs`):

```yaml
# dimos.yaml
provides:
    description: Live 3D view of the running robot, with live 3D annotations
    endpoints:
        - method: POST
          path: api/annotations # relative to the app: /apps/<name>/api/annotations
          description: Add a live 3D box annotation with a label
          params:
              label: { type: string, required: true }
              center: { type: array, items: { type: number }, description: "[x, y, z] meters" }
        - { method: GET, path: api/view, role: view, description: What the user sees, as an image }
```

Either one may instead be an OpenAPI 3 document (anything with an `openapi:` key): each operation's path and query
parameters plus its JSON body's properties become its params (local `$ref`s inlined), `summary` and `description` become
its description, and `x-dimos-role` its role. When an app serves no `agent.json`, Desktop tries `<app>/openapi.json`, so
a FastAPI (or utoipa/aide) backend is described with no extra work; every operation in it is then visible to the agent.
`agent.json` has the same shape as `provides:` (`{ description, endpoints: [...] }`, without `private`). `params` is
either that shorthand (`name: schema`, with `required: true`) or a full JSON Schema object. `role: view` marks what
`grab_page` calls; `role: context` what `desktop_context` adds while the app is the one the user looks at. Desktop
merges the two sources (a served endpoint replaces a declared one with the same method and path; the served description
wins) and re-reads `agent.json` when it is more than 3 s old, so a rebuilt or hot-reloaded app's changes show up on the
next search. Paths must be relative (an app only describes its own endpoints). A server app serves `agent.json` from the
same code that implements the endpoints, which keeps them in step; the Controller and the Map Editor do.

Desktop's own endpoints are built in (`endpoints::builtins`): `/dimos/info`, `/dimos/cloud/account`,
`/dimos/cloud/login`, `/dimos/uploads` (list, add, cancel, retry), `/api/errors`, `/dimos/blueprints[/{name}]`,
`/dimos/runs` (list and launch), `/dimos/runs/stop`, `/dimos/runs/{runId}/log`, `/dimos/global-config`,
`/recordings[/{id}]`, `/api/apps`, `/api/open-app`, `/api/windows`, `/api/topics`, `/api/topics/sample`, `/api/logs`,
Desktop describing itself (`/api/desktop/openapi`, `/api/desktop/dimos.yaml`, `/api/endpoints`, `/api/endpoints/stats`;
docs/api.md), and the Launcher's `/api/launcher/catalog` and `/api/launcher/state` (GET, PUT).

## Errors: what went wrong, for the agent

Desktop keeps one error feed (`src/errors.rs`): the last 200, each
`{ id, seq, source, level, message, detail, count,
firstTime, time, acknowledged }`; an identical repeat (same source,
level, message and detail) bumps `count` and `time` and makes it unseen again instead of adding a row. Everything is
also appended to `<DIMOS_HOME>/desktop/logs/errors.jsonl` (repeats only at counts 1, 2, 4, 8, ...), and each one is sent
on zenoh at `<ns>/desktop/events/error` as `{ type: "error", error }`.

What goes in:

- Desktop's own failures, as `source: "desktop"` (or the app's name): an app's server exiting (with its log's tail;
  Desktop restarts it), a failed job (install, update, checkout), a failed install step, the dimos gateway not starting,
  and failed uploads (`source: "uploads"`, from the dimos gateway's events).
- Apps: `POST /api/errors { source, message, detail?, level?: "error" | "warning" }`. The dim-app SDK (v0.7.0+,
  `errors.js`) does it: `reportError(message, detail)`, and `captureErrors()` sends uncaught errors and unhandled
  rejections (throttled); `DimAppFrontend` turns that on by itself.

What the agent sees: `desktop_context` includes `errors`, the newest 5 no agent has seen, and `recent_errors` lists them
(`all: true` for seen ones too, `since: <seq>` for what changed after an earlier answer's `latest`) and marks them seen.
`GET /api/errors` and `POST /api/errors/ack` are the same over HTTP.

## What the user is looking at: windows and focus

Every Desktop window (browser tab) reports itself over HTTP and hears commands on zenoh (`src/server/windows.rs`,
[events.md](events.md), "Windows"); apps and agents use `GET /api/windows` and `POST /api/open-app`:

- it has an id kept in sessionStorage (a reload stays the same window) and sends
  `POST /api/windows/<id> {focused, visible, app, path, title, open}` whenever what it shows changes and every 10 s (one
  silent for 30 s is dropped), `POST /api/windows/<id>/active` when the user clicks or types in it, including inside an
  app's (same-origin) iframe, and `POST /api/windows/<id>/close` on pagehide;
- Desktop keeps each window's state and `lastActive`; the window with the newest `lastActive` is the one the user is in;
- `POST /api/open-app {app, path?, focus = true, window?}` (agents and apps alike) publishes `{type: "open-app"}` on
  that window's key, `<ns>/desktop/windows/<id>`, which opens or switches to the app (at `path` inside it);
  `focus: false` loads it in the background. `app` is a name or title (`launcher`, `Controller`, `dim-map-builder`).
  With no window open it answers 409 instead of pretending. `GET /api/windows` lists them.

`desktop_context` reports the last active window, its app and path, and (when that app has a `role: context` endpoint)
the app's own state, e.g. the Launcher's filters or the Map Editor's open map.

## Built-in: the Launcher

The Launcher ([launcher.md](launcher.md)) lists dimos blueprints as cards (title, plain description, robot group,
topics, modules, recommended settings), with modules and skills behind "List". Its data comes from
`introspect.py catalog` (imports every blueprint once, re-run when the checkout's `all_blueprints.py` changes): each
blueprint's robot comes from its module path (`dimos.robot.unitree.go2…` → `go2`), each module's robots are those of the
blueprints that use it, and a skill inherits its module's. Its state (`query`, `kind`, `robot`, `all`, `selected`, and
`stream`: only what has a module with an input or output whose name contains it, e.g. `cmd_vel` finds `tele_cmd_vel`)
lives in Desktop: `PUT /api/launcher/state` changes it and every open Launcher follows (an `{type: "launcher"}` event on
`<ns>/desktop/events/launcher`); the page writes the user's own changes back.
`GET /api/launcher/catalog?q&kind&robot&needs&all` is the same filter the page shows, for the agent to read;
`GET /api/launcher/blueprints/{name}` one card with its sources' args, and `GET /api/launcher/replays?blueprint=` the
recordings it can replay.

## Live annotations (Controller)

The Controller keeps ephemeral 3D annotations in its server (not zenoh topics): boxes with an id, label, optional note,
center, size, yaw, frame and color. `POST/PATCH/DELETE api/annotations[/{id}]` change them (PATCH with `newId` renames)
and every open viewer gets the change pushed on `api/events` and draws it on its next frame. Because only a page has the
rendered view, the decoded clouds and the TF tree, the server asks the page the user looked at last (pages report
activity) over the same event stream and waits for its answer:

- `GET api/view`: the rendered 3D view with annotation labels drawn in, the 3D camera's pose and intrinsics, the robot
  camera's latest frame (at CameraInfo's resolution, with a labelled pixel grid), its CameraInfo and its pose, and the
  annotations;
- `POST api/locate {bbox, label?, add?}`: an object's 3D box and height from a box around it in that camera frame: the
  lidar points that project inside the box, the connected object at the front of the nearest depth band, standing on the
  floor; with no lidar on it, where the box's bottom meets the floor.

## Topics

`/api/topics` lists the live zenoh keys (`dimos/<topic>/<type>`, from liveliness tokens and a short listen) through the
session of Desktop's embedded zenoh-gateway; `/api/topics/sample?topic=` waits for the next message and decodes
`sensor_msgs.Image` (to JPEG), `CompressedImage` and `PointCloud2` (to a summary).

## The system prompt

dimcode's own prompt, plus this (`src/agent/system_prompt.md`, passed as `--append-system-prompt-file`):

```text
You are the agent inside dimOS Desktop, the browser home screen of a robot that runs dimos. The user sees Desktop's apps
in a side rail (Launcher, Controller, Map Editor, App Store, Settings, ...) and talks to you in its chat.

Desktop gives you one MCP server, `desktop`, with a few tools:

- desktop_context: start here. The window and app the user is looking at (and that app's state), the open apps, the
  running blueprint, the robot, and log file paths.
- search_endpoints(query) → describe_endpoint(id) → call_endpoint(id, params): every action of Desktop and of each
  installed app is an HTTP endpoint the app describes itself. Apps change as they are installed and updated, so search
  instead of guessing paths. Results that carry images come back as images.
- open_app(app, path): open or switch to an app in the window the user used last, so they see what you do.
- screenshot(app): what the user sees of an app right now, as one image (its page, camera video, 3D, overlays).
- grab_page(app): the app's own capture: raw camera frames and its 3D camera's pose, to measure with.
- list_topics / sample_topic(topic): the live robot's topics and a recent message (camera image, point cloud summary).
- recent_errors: what went wrong in Desktop and its apps (desktop_context shows the newest unseen ones). When the user
  says something is broken, look there first.
- shell_read / shell_type / shell_resolve: when a command an app (or the installer) runs in the terminal Desktop shows
  fails, read it, fix the cause by typing into that same shell, then retry the command (or mark it done, or skip it). If
  it asks for a password, ask the user to type it there; never type one yourself.

Work through these tools and the apps, not bash: the user sees the apps, not your tool output. When an app can show the
answer, show it there (open it, set its search and filters, add annotations) and say briefly what they are looking at.
For which blueprints, modules or skills exist or fit the robot, that is the Launcher (its catalog and state endpoints).
"This", "here" and "that" mean the app the user is looking at. Measure with endpoints, not by eyeballing screenshots,
and write a measurement onto the object's annotation (its note) so the user sees it there too. Keep replies short. Use
bash in the dimos checkout only for what no endpoint does.

Narrate what you do on screen: every tool that changes what the user sees (open_app, close_app, run_blueprint,
stop_blueprint, call_endpoint on an app) takes `narration`, one short line shown top center right before it happens,
e.g. "Opening the Controller…". Always pass it; for anything else on screen, call narrate(text) first.

Common asks, done the same way every time:

- "Start / launch / run <a blueprint or robot>" (a simulation too): call run_blueprint once, right away, without
  searching or asking first; it opens the Launcher, selects the blueprint there so the user sees it, and launches it,
  narrating each step itself (pass `narration` e.g. "Opening the Launcher for the Go2 simulation…"). The Go2 simulation
  is blueprint `unitree-go2-basic` with overrides `{"global": {"simulation": "mujoco"}}` (any robot's simulation: its
  blueprint with that override). If a launch is already starting or running, say so instead.
- "Show me the camera / what the robot sees": narrate("Showing the robot's camera in the chat…"), then dimcode_live_view
  with topic `color_image` right away, even if list_topics doesn't show it yet (the view starts when frames arrive).
  Don't sample it first.
- Then offer the Controller to drive it, as a markdown link the user clicks:
  `[Open the Controller](/?app=dim-controller)`. A link `/?app=<app id>` opens that app in Desktop; use it whenever you
  offer to open an app instead of opening it.
```

## Gaps

- The agent is started with Desktop's environment otherwise, so it runs as the user with the user's files: it is not
  sandboxed.
- Each browser window loads its own copy of the agent's page; whether they show one conversation is dimcode's doing.
- A window's focus comes from focus, click and key events; a cross-origin app iframe's clicks only count as the window's
  focus.
- `locate` assumes the object stands on the floor and takes the floor from the lidar's lowest points nearby.
