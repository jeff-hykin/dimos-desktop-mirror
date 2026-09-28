# Development

```sh
deno task dev        # the server on :7077, restarting on edits (serves the last ui build)
deno task ui:dev     # the UI with hot reload on :5173, forwarding /api and /app to :7077
deno task test       # unit tests
deno task check      # type-check the server and the UI
deno task compile    # build/dimos-desktop: one binary with the UI and dimos.yaml inside
```

Set `DIMOS_HOME=/some/dir` to keep a development instance out of `~/.dimos`.

## Layout

| Path          | What                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `install.sh`  | what the README's one-liner runs: downloads this machine's binary, runs `dimos-desktop install` |
| `dimos.yaml`  | what Desktop requires from dimos and provides to apps ([apps.md](apps.md))                      |
| `src/main.ts` | the CLI: `install`, `uninstall`, `serve`, `status`                                              |
| `src/cli/`    | install/uninstall, the OS service (launchd, systemd --user), installing dimos                   |
| `src/server/` | the HTTP server and its JSON API                                                                |
| `src/dimos/`  | everything that talks to dimos: its CLI, its run registry, its log files                        |
| `src/apps/`   | installing apps and running their backends                                                      |
| `src/core/`   | versions, dimos.yaml, paths, config, git, subprocesses                                          |
| `ui/`         | the React + Vite UI, embedded into the binary                                                   |
| `.github/`    | CI: checks, cross-compiling, installing on every GitHub runner; release on a `v*` tag           |

## How Desktop drives dimos (milestone 0)

Only through what dimos 0.0.14 already has, so it needs no dimos changes:

- `dimos list` (text) for blueprints.
- `dimos run <blueprint>` in the foreground, detached from Desktop, for launching. Not `--daemon`: on macOS the daemon's
  forked build segfaults inside CoreFoundation. A foreground run is still recorded in dimos's run registry and stopped
  by `dimos stop`.
- `$XDG_STATE_HOME/dimos/runs/*.json` (the run registry) for status. dimos writes the entry once every module is built,
  which is how Desktop knows a launch finished starting.
- `<checkout>/logs/<run_id>/main.jsonl` and `$XDG_STATE_HOME/dimos/logs/<run_id>/main.jsonl` for logs.
- `scripts/install.sh --mode dev --project-dir <dir> --non-interactive --branch <version>` to install.

## Releasing

Bump `version` in `src/self.ts`, commit, then tag `v<version>` and push the tag. The release workflow builds all four
binaries and attaches them and `install.sh` to a GitHub release.
