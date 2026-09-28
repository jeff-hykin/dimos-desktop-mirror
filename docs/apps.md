# Apps

An app is a git repository that Desktop clones and shows in its side rail. Desktop gives it a URL, an optional backend
process, and its HTTP API. Nothing else.

## Layout

```
my-app/
  dimos.yaml       # manifest + compatibility (required)
  icon.svg         # rail icon (required)
  dist/index.html  # prebuilt frontend (required; the directory is `frontend:` in dimos.yaml)
  backend/...      # optional, see `backend:` below
  flake.nix        # optional, gives the backend its dependencies
```

The frontend is committed prebuilt. Desktop never runs npm, vite or any other build step, so an app installs in the time
it takes to clone it.

## dimos.yaml

The same file format is used by Desktop itself and by dimos: `provides:` says what a repo offers, `requires:` says what
it needs from others.

```yaml
name: dimos-controller # id; defaults to the repo name
title: Controller # rail label; defaults to the name
frontend: dist # directory holding index.html; default "dist"
backend: # optional
    command: [deno, run, -A, backend/main.ts]
requires:
    dimos-desktop:
        version: ">=0.1.0"
        apis: { app.frontend: 1, api.relay: 1 }
    dimos:
        version: ">=0.0.14"
provides:
    apis: {}
```

- `requires.<provider>.version` is a range: comparators (`>=`, `>`, `<=`, `<`, `==`) joined by spaces or commas, e.g.
  `">=0.0.14 <0.1"`.
- `requires.<provider>.apis` maps an API name to the major version needed. A provider satisfies it when its
  `provides.apis.<name>` includes that number (a number or a list of numbers).
- A provider with no `dimos.yaml` (dimos up to 0.0.14) only has a version, read from its `pyproject.toml`. Its APIs are
  "unknown": a version check still applies, API checks are skipped with a warning.
- A failed check is shown before install and on launch, with "continue anyway". It never silently blocks.

## Frontend

Served at `/app/<name>/` from the `frontend:` directory, and shown in an iframe on the same origin as Desktop. Use
relative asset paths (vite: `base: "./"`). The app can call Desktop's API with plain `fetch("/api/...")`.

## Backend

If `backend.command` is set, Desktop runs it with the app directory as cwd whenever Desktop is up, restarting it if it
exits. The backend must serve HTTP on the unix socket in `DIMOS_APP_SOCKET`. Desktop forwards `/app/<name>/api/*` to it
(the `/app/<name>` prefix is stripped, so the backend sees `/api/*`).

Environment given to the backend:

| Variable            | Value                                   |
| ------------------- | --------------------------------------- |
| `DIMOS_APP_SOCKET`  | unix socket path to listen on           |
| `DIMOS_APP_NAME`    | the app's name                          |
| `DIMOS_DESKTOP_URL` | Desktop's base URL, for calling its API |
| `DIMOS_DIR`         | the dimos checkout                      |
| `DIMOS_PYTHON`      | `<DIMOS_DIR>/.venv/bin/python`          |

If the app has a `flake.nix` and `nix` is installed, the command runs inside `nix develop <app> -c`.

## Versions

Versions are git tags matching `vX.Y.Z` (or `X.Y.Z`). Install checks out the newest tag, or the default branch if the
repo has no tags. Update fetches tags and moves to the newest one. Any tag can be pinned from the app menu.

## Desktop APIs apps can declare

| API            | Version | What                                                               |
| -------------- | ------- | ------------------------------------------------------------------ |
| `app.frontend` | 1       | frontend served at `/app/<name>/` in a same-origin iframe          |
| `app.backend`  | 1       | backend on a unix socket, forwarded at `/app/<name>/api/*`         |
| `api.runs`     | 1       | `GET /api/runs`, `POST /api/runs`, `POST /api/runs/stop`           |
| `api.relay`    | 1       | `GET /api/relay` → `{ url, up }` for the running blueprint's relay |
| `api.logs`     | 1       | `GET /api/logs?run=&q=&level=&after=`                              |
