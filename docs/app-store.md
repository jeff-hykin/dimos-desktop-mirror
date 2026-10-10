# The App Store

The App Store (`/?view=appstore`, ui/src/views/AppStore.tsx) is how anything beyond Desktop's built-ins gets onto a
robot computer, so it is the app people (and agents) use most when something isn't there yet. This note says who it is
for, what they come to do, what each of those needs to show, and the layout that follows.

## Who uses it

- **A robotics developer or operator** setting up a machine: wants the apps for this robot, now, and to know they work.
  Often on a laptop; often on a phone next to the robot.
- **The same person a week later**: is my Controller current? which branch is Map Editor on? why is this one broken?
- **An app author** installing their own repo, a branch of it, or a second copy beside the released one.
- **An agent** doing any of the above for them over HTTP (no UI): every action is an endpoint in the OpenAPI document.

## Jobs to be done, and what each needs

| Job                             | What it needs to show                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Discover → install in one click | name, icon, one-line description, source; one Install button; no form                                 |
| …and watch it happen            | on that app: queued → fetching → building N of M → done, a real progress bar, the current step        |
| …then open it                   | Open right where it was installed                                                                     |
| See what's installed            | installed apps first: version (branch/tag · commit), running state, update available                  |
| Update                          | that an update exists (installed commit vs origin, or a newer stable tag), one Update, **Update all** |
| Switch version / branch         | the app's tags, betas and branches; Switch rebuilds (in a menu: occasional)                           |
| Several installs of one app     | each install is its own row (`dim-controller-v2`, "copy of dim-controller"), its own version          |
| Uninstall                       | in the menu with a confirmation, never a big red button beside Open                                   |
| Install from a URL or folder    | advanced, collapsed: URL/path, optional name (a copy), optional version                               |
| Understand and fix a failure    | what went wrong in words, the few lines that show it, Try again / the fix; the raw log on demand      |
| Know why installs are slow      | an app's binary cache isn't trusted in nix.conf: say so once, give the exact command to trust it      |

## Layout (direction A, "Library")

1. **Head**: title, search (filters installed and catalog), and **Update all (n)** when any update exists, else **Check
   for updates**.
2. **Speed up installs** (only when `nix-trust` says a cache isn't trusted, or a job has the `untrusted-cache` notice;
   dismissable once): why it matters, the exact command (those caches' `extra-trusted-substituters` /
   `extra-trusted-public-keys` into nix.conf, restart the daemon; NixOS: the `nix.settings` lines), Copy, "I ran it,
   check again". Desktop never runs sudo, and never makes the user a nix trusted user.
3. **Installed**: one row per install, in a hairline list. Icon · title (+ `update` chip, + `copy` chip) and install
   name · version (`main · ebb84fb`, then `→ 4609386` / `up to date`) · status (running, ready, stopped, server down,
   not built, incompatible) · **Update** (when available) · **Open** · ⋯ (Update / rebuild, Change version…, Install
   another copy…, Stop/Start its server, Show last log, Source, Uninstall…). A running job turns the row into its
   progress: the step in words, a percentage and a bar, "Show log"; when nix ignored that app's binary cache, a line
   under the bar says it's building from source (minutes, not seconds) and points at "Speed up installs". A failed job
   puts a failure box under the row; when the app's dimos.yaml asks for what isn't here (an endpoint, an app, a dimos
   version: [apps.md](apps.md)), the box lists it and offers **Install anyway** / **Update anyway**. An install from a
   URL that isn't installed yet shows as a row of its own while it runs (or failed).
4. **Discover**: catalog cards for apps not installed (icon, title, source, description, Install). Installing shows the
   progress on the card; a failure stays on the card with Try again.
5. **Install from a URL or folder**: a collapsed panel; URL/path, name, version, Install.
6. **The raw log** is a side sheet (bottom sheet on a phone): at most ~100 columns, monospace, scrolls and follows the
   end, Copy, Close. Never a full-width drawer.

On a phone (390/412 wide) the head stacks, rows become icon · name with `ref · commit · status` under it · Open · ⋯ (the
`update` chip itself updates), and cards are one column.

Both skins come from the design docs: Portal (dark: void, hairlines, square corners, one blue accent, Michroma section
heads, Inter, Plex Mono for versions and logs) and Research (light: paper, white hairline cards, gently rounded,
Instrument Serif title, mono micro-labels). The fonts are dim-app's, bundled (ui/src/dim-app/fonts), no network.

### Why A over B

Mockups: `~/.local/share/cbg/long-tasks/NosyPuma/shots/appstore/` — `A_library_*` (rows) and `B_shelf_*` (a featured
hero over a tile shelf of installed apps, one floating progress strip). B looks like a consumer store, but its tiles
have room for an icon and a name only: the version, the commit an update moves to, the running state, a failure's
explanation and its fix all have to move into popovers, and its single progress strip can't show two installs or say
which tile it belongs to. The App Store's real work is maintenance (what's installed, is it current, why did it fail),
and a row carries all of that at a glance, with progress and failures inline exactly where the user clicked; it also
degrades cleanly to a phone list. Discovery keeps cards, where description and source matter. So: **A**.

## How progress and failures are made

- **One at a time.** App jobs share a queue; a job started while another runs is `queued` (Update all queues them).
- **Phases** (`progress.phase`): queued → fetching (git, with git's own `Receiving objects 45%` redraws parsed from
  `--progress`) → checking (dimos.yaml, icon, flake) → preparing (nix evaluates) → downloading / building → done or
  failed. Each phase covers part of the bar; the bar never goes backwards.
- **nix** runs with `--log-format internal-json`; `NixTracker` (src/apps/mod.rs) reads its activities: the `Builds`
  activity's progress gives built / to build, `SetExpected` on `Realise` gives the bytes to download and the
  `FileTransfer`s of `.nar` files the bytes downloaded, each `Build` activity's name and `SetPhase` give the step
  ("Building 3 of 12 · python3.12-numpy (buildPhase)"). Messages, build-log lines and started builds/downloads become
  the readable log; the JSON never reaches it.
- **Failures** are `{kind, summary, details, fix, log}`: git's (private / not-found / network / bad-ref / diverged), the
  app check's (not-an-app), nix's (no-build for this system, disk-full, hash-mismatch, network, build-failed with the
  builder's last lines), and the start check's (wont-start: a server app's new build that doesn't listen on its socket
  or exits within 5 s, with what it printed; the app stays on its previous build). The UI shows the summary, up to 8
  detail lines, the fix, and actions that fit the kind.
- **Untrusted cache**: an app whose dimos.yaml `caches:` aren't trusted in nix.conf (url in `substituters` /
  `trusted-substituters` and key in `trusted-public-keys`, per `nix config show`) builds from source; its job gets the
  notice `untrusted-cache` and log lines with the one command that trusts those caches (also on nix's "ignoring
  untrusted substituter"). `GET /api/apps/nix-trust` answers `{trusted, user, caches, explanation, command}` for the
  dimOS caches (install.binary_caches) and every installed app's: `caches` the urls nix would ignore, `command` the sudo
  one-liner that trusts just those (null on NixOS; `explanation` then has the `nix.settings` lines).

## Endpoints (all in `GET /api/desktop/openapi`)

`GET /api/apps`, `GET /api/catalog` (with `installs`), `POST /api/apps {url, name?, ref?}`,
`POST /api/apps/{pkg}/update`, `POST /api/apps/{pkg}/checkout {ref}`, `GET /api/apps/{pkg}/versions`,
`DELETE /api/apps/{pkg}`, `POST /api/apps/{pkg}/stop|start`, `GET /api/apps/updates[?fresh=1]`,
`POST /api/apps/update-all`, `GET /api/apps/nix-trust`, `GET /api/jobs`, `GET /api/jobs/{job}/log`; live job events on
zenoh `<ns>/desktop/jobs/<job>` (`line`, `progress`, `done`; [events.md](events.md)).
