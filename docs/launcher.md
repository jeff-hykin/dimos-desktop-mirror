# The Launcher

The Launcher (`/?view=launcher`, ui/src/views/Launcher.tsx; data in src/server/launcher_api.rs from dimos's own
`dimos/gateway/robots.json`, and the dimos gateway's `/dimos/runs`) is the first app in the dock: Controller and most
other apps need a running blueprint, so this is where a session starts. This note says who it is for, what they come to
do, what each of those needs to show, and the layout that follows.

## Who uses it

- **Someone with a robot** (a Go2 on the desk, a G1 on a stand, an arm on a bench) who wants it running and drivable in
  a minute. Knows the robot, not dimos's 150 blueprint names.
- **Someone without one**, trying dimos with a recording (replay) or a simulator.
- **A developer iterating**: launches the same blueprint ten times a day, reads its logs, restarts it after an edit.
- **An agent** doing any of the above over HTTP (no UI): every action is an endpoint in the OpenAPI document.

Often on a laptop; often on a phone beside the robot.

## Jobs to be done, and what each needs

| Job                            | What it needs to show                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick the right blueprint, fast | robots first (Go2, G1, R1 Pro, Spot, drone, arms, sensor rigs, demos); "start here" picks per robot; robots grouped by type (Dogs, Humanoids, Wheeled bases, Arms, Drones, Other); search that ranks names and plain descriptions                                                                                                                                                              |
| …without 409 raw names         | blueprints only (modules and skills live inside a blueprint's detail, or behind "parts"); internal / test / mock / benchmark blueprints hidden behind a "show all (n)" switch                                                                                                                                                                                                                  |
| Understand what one does       | a plain one-line description; the robot / hardware it needs; the topics it provides (cmd_vel, camera, lidar, map…) as chips; its modules on demand                                                                                                                                                                                                                                             |
| Get the robot ready            | a "How do I find this?" link beside each recommended setting robots.json gives `docs` (the Go2's IP)                                                                                                                                                                                                                                                                                           |
| Set the few args that matter   | its recommended settings: e.g. Run it on **Robot** (then its IP) · **Replay** (then a recording picker: the samples plus the shared recordings folder, each marked usable or not, and why) · **Simulator**                                                                                                                                                                                     |
| Launch                         | one Launch button; the exact `dimos` command it runs, quietly                                                                                                                                                                                                                                                                                                                                  |
| Watch it start                 | steps (starting dimos → building → starting modules n/N → running), warnings and errors in plain words with the fix ("the robot's IP is missing: fill in Robot IP"), the raw output on demand                                                                                                                                                                                                  |
| Jump to the right app          | once it runs: **Open** an installed app that uses it                                                                                                                                                                                                                                                                                                                                           |
| See and manage what's running  | the bottom bar's blueprint chip: name, Details (Relaunch, Logs), Stop; on a phone, under the top bar. Runs on this computer that Desktop didn't launch (a terminal, an agent, another DIMOS_HOME) are listed above the Launcher's list with Logs and Stop, and take the chip when Desktop's own launch isn't live; a run heard only on the bus (another computer) is listed with Stop disabled |
| Read the logs                  | a readable column (≤ 110 characters), level filter, search, follow                                                                                                                                                                                                                                                                                                                             |
| Come in from another app       | deep links that pre-filter: `?app=launcher&needs=cmd_vel` ("blueprints that can drive"), `&robot=go2`, `&q=`, `&blueprint=`                                                                                                                                                                                                                                                                    |

## Two directions

Mockups: `~/.local/share/cbg/long-tasks/NosyPuma/shots/launcher/` (`a_*` and `b_*`, desktop 1440×900 and phone 390×844,
Portal and Research).

- **A, "Catalog + inspector"**: a running strip at the top; under it a list (search, robot row, "start here" then "all
  for this robot") on the left and an inspector on the right (what it is, recommended settings, Launch, then the
  launch's progress, problems and Open buttons in the same place). Phone: the list, and the inspector as a full-screen
  page with Launch pinned at the bottom.
- **B, "Robot shelf"**: a first screen of big robot tiles; picking one shows a grid of blueprint cards for it; picking a
  card opens a sheet with args and Launch; Running is its own tab.

**Picked: A.** The person usually already knows the robot and comes back many times: A keeps every robot one click away
(a row of chips, not a screen), shows ~15 rows at once instead of ~6 cards, and keeps the run's progress next to the
button that started it (B moves it to another tab exactly when the user wants to watch it). Search and deep links land
on a filtered list, which A shows as is; B would have to skip its shelf. On a phone A collapses to list → page, the
pattern every phone app uses. B's tiles are friendlier on a first visit, so A borrows that: with no robot picked, the
picks show one per robot.

## Layout (A)

1. **Head**: `LAUNCHER` (display face), the search box, and a "show all (n hidden)" switch.
2. **Running**: nothing here. The Desktop shows the blueprint running (or the last one run) as one chip with Details
   (Relaunch, config, Logs: views/LogSheet.tsx's LogModal) and Stop: in the bottom bar on a wide screen; on a phone,
   centered in a row under the top bar (under an open app's ✕ – row, whose right end is the notifications; on the
   desktop under the clock, the HUD below it). The inspector has the launch's progress and Open <app>.
3. **Above the list**: whose blueprints it shows, as quiet text ("Unitree G1 blueprints", "Every robot's blueprints", a
   deep link's robot with "back to <your robot>"), a `needs cmd_vel ✕` when a deep link asked for a topic, and what it
   lists as a segmented control (Blueprints · Modules · Skills). There are no robot filter rows: the robot comes from
   your profile robot (top left), whose menu widens the list to every robot's blueprints.
4. **List**: the picks first (robots.json's starter picks for the robot, or one per robot), unlabelled: cards with an
   accent edge on the list column's faintly accent-tinted stage, the side rails quieter; then "All <robot>" grouped by
   robot. A search or a `needs=` filter keeps the picks that match as the cards on top (same rule), then the rest as
   "Results", best match first (ui/src/views/launcherList.ts). Each row: title (Inter), one-line description, a chip per
   module (one line, then "+N"; a red "Doesn't load (yet)" when its import failed); the blueprint name in mono, quiet.
   Selected row: the accent's selected fill and a 2px accent edge (no yellow rules, no rounded cards).
5. **Inspector**: title, name, description; Needs (robot / hardware) · Provides (topic chips); its recommended settings
   (e.g. Run it on: Robot / Replay / Simulator, then Robot IP, a module's field, or the recording picker), each with a
   "How do I find this?" link when robots.json gives it `docs` (opens a new tab); Launch (square, accent: the one
   primary action); the command line in mono. After Launch the same panel shows the steps, problems with fixes, Open
   <app>, Logs, Stop. "What's inside" (modules and their streams) is collapsed.
6. **Logs**: a sheet over the inspector (desktop) or a page (phone), text capped at 110ch.

Square corners, hairlines, one accent, ok/warn for status (Portal has no red: failure is warn amber plus words).
Research gets the same structure with its paper, rounded cards and serif heads (dim-app's theme tokens).

## Where the facts come from: robots.json

What a blueprint _is_ is written once, in dimos, beside the code it describes: `dimos/gateway/robots.json` (schema
`robots.schema.json`, named by dimos.yaml's `robots:`). Desktop adds no robot knowledge of its own, so it can't fall out
of step with the blueprints or their config. dimos's CI (`test_robots_json_is_current`, next to the all_blueprints.py
check; dimos/gateway/robots.py) fails when a robot directory or a blueprint isn't in it, when it lists a blueprint that
doesn't exist, or when an arg isn't a real GlobalConfig or module config field, and says exactly what to add.

- **types**: the robot types in the order the Launcher groups robots by (Dogs, Humanoids, Wheeled bases, Arms, Drones);
  robots without a type (sensors, Habitat, demos, coordinators) come last under Other.
- **robots**: every robot (Unitree Go2, G1, R1 Pro, Spot, drone, M20, Alfred, each arm, sensors, Habitat, demos), in
  display order, with its name, `type` and the settings its blueprints decide first (`defaults.recommended_config`).
- **blueprints** per robot: title, plain description, `starter` (its "start here" rank), `hidden` (tests, benchmarks,
  mocks, building blocks: listed only with "show all") and, when it differs from its robot's, `recommended_config`.

robots.json is generated from robots.yaml (hand-written, with comments) by `python -m dimos.gateway.robots --write`,
which also fills in each GlobalConfig setting's type, default and choices by reflection and keeps robots.yaml's
blueprint list in step with the registry. There are no tags, modes, groups or recommended apps any more: where a
blueprint runs (Robot / Replay / Simulator) is a recommended setting like any other.

Desktop reads it resolved (defaults applied, args inlined) from the dimos gateway's `GET /dimos/robots` when dimos's own
(Python) server runs, else from the checkout's file (src/dimos/robots.rs, the same resolution; Desktop's built-in dimos
server answers `/dimos/robots` with it), re-read when robots.json or all_blueprints.py changes. A blueprint robots.json
doesn't describe (one outside the robot directories, or an older dimos without the file) is still listed, under "Other",
with its name and docstring.

From the introspect.py scan (the code itself) the Launcher takes each blueprint's modules, skills and streams: the
**topics** it provides (and `needs=cmd_vel` deep links), and "What's inside".

**search ranking**: exact name, then name prefix, then every word in the title/name, then its robot type, then
description, modules and topics; ties go to starter picks, then robot order, then name.

## Config

Two kinds of config, both from dimos's own schemas (LauncherConfig.tsx):

- **Global**: dimos's `GlobalConfig` (`GET /dimos/global-config`: JSON Schema, defaults, Desktop's saved values), passed
  as `dimos --key value run …`. Lists and objects are left out: `dimos` has no flag for them.
- **Module**: each module's pydantic `config` in a blueprint (`GET /dimos/blueprints/{name}/config`), passed as
  `dimos run <bp> --<module>.<field>=<value>`, which is how `dimos run` addresses a module's config (by the module's
  name in that blueprint, so it's saved per blueprint). Fields that can't go to or from JSON
  (`json_compatible:
  false`: callables, objects) and the fields every module inherits from `ModuleConfig`
  (`frame_id`…) aren't shown (the API still takes the latter).

**Saved config** is the Config column on the left (as v1's config rail; at rest a quiet cover reading "Config" hides it,
and it shows while the pointer or keyboard focus is in it, or after a tap on touch screens): the selected blueprint's
modules first, most relevant module first (until the dimos gateway ranks them per robot, by how many of the robot's
blueprints use it, weighted down for modules every blueprint uses), each under its name; then the global config grouped
by first word (`zenoh_*`, `rerun_*`, …), with one search over both. Inputs follow the schema: a switch for a boolean, a
select for an enum, a number field, a text field (mono for paths and JSON); a value that differs from dimOS's default is
marked and has a reset. A change is saved at once (config.yaml `dimos.global_config` /
`dimos.module_config.<blueprint>`, both checked against the schema) and applies to every later launch. On a phone the
column is a page behind the Config button.

**Customize** (next to Launch) opens a sheet with the blueprint's config prefilled with what a launch would use now
(dimOS default → saved value → the recommended settings' values). The fields robots.json calls essential for the
blueprint come first (`essential` on its card: the key of each of its recommended settings); the rest are under All
settings. Changes are marked "this launch", and **Launch with these** sends them as the launch's own
`overrides: {global, modules}`: the dimos gateway checks them and puts them on the `dimos run` command line; nothing is
written to a file and the saved config doesn't change. The Running row shows the run's config as `key=value` chips, the
launch's own ones in the accent color.

**Secrets** (a robot's AES key, API keys, tokens: any field named `*_key` or with `secret`/`token`/`password` in it) are
masked inputs with show/hide. Desktop passes them to `dimos run` as environment variables, never on the command line,
and shows `•••` for them everywhere (the run's chips, its output, the config answers, records); `•••` sent back keeps
the saved value.

Layouts tried (`shots/launcher_config_layouts/`): the config as a column far left (picked: v1's place, always there, so
global config can be set with nothing selected), between the list and the inspector, or as a drawer over the list.

## API (agent-friendly: everything the page does)

| Endpoint                                  | What                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/launcher/catalog`               | search: `q`, `kind`, `robot` (a robot or type: go2, arm…), `needs` (= `stream`), `all`, `limit`; blueprints carry `title, description, robot, robotName, group (its robot's type), topics, moduleClasses, recommendedConfig, essential, featured (starter), internal (hidden)`; plus `groups` and `hidden` |
| `GET /api/launcher/blueprints/{name}`     | one blueprint's card, its modules with inputs/outputs, and its recommended settings (`key`, `scope` global or module, `choices`, `when`)                                                                                                                                                                   |
| `GET /dimos/robots`                       | robots.json resolved, from the dimos gateway                                                                                                                                                                                                                                                               |
| `GET/PUT /dimos/global-config`            | dimos's GlobalConfig schema + defaults; Desktop's saved values (`PUT {overrides}`)                                                                                                                                                                                                                         |
| `GET/PUT /dimos/blueprints/{name}/config` | a blueprint's module fields; Desktop's saved module config for it (`PUT {overrides: {module: {field: value}}}`)                                                                                                                                                                                            |
| `GET /api/launcher/replays?blueprint=`    | recordings it can replay: the samples + the recordings folder, each `{usable, why, default}`, against its recording setting's streams                                                                                                                                                                      |
| `GET/PUT /api/launcher/state`             | what every open Launcher shows: `query, kind, robot, stream, all, selected`                                                                                                                                                                                                                                |
| `POST /dimos/runs`                        | launch: `{blueprint, replay?, overrides?}`: the mode's `set` plus its args, flat GlobalConfig keys or `{global?, modules?}` (a module's field; this launch only, see Config)                                                                                                                               |
| `GET /dimos/runs`                         | live runs + Desktop's launch: phase, `steps` (`{code, state, data}`), `problems` (`{code, message, data}`; the Launcher's ui/src/launchText.ts has each code's words and fix), `overrides`, `modules`, `oneOff`                                                                                            |
| `POST /dimos/runs/restart`                | stop Desktop's launch and start it again: its own values on top of the config saved now                                                                                                                                                                                                                    |
| `POST /dimos/runs/stop`                   | `{runId?}`: Desktop's launch, or any live run                                                                                                                                                                                                                                                              |
| `GET /dimos/runs/{runId}/log`             | the run's log records (`level`, `q`, `after`)                                                                                                                                                                                                                                                              |

## Deep links

`/?app=launcher&needs=cmd_vel` opens Desktop on the Launcher showing blueprints that have a module with a `cmd_vel`
input or output, for your profile robot (every robot's when there is none). Also: `robot=go2` (`robot=all`: every
robot's), `q=<search>`, `blueprint=<name>` (selects it), `all=1` (hidden test and internal blueprints too). The shell
turns them into `PUT /api/launcher/state` (so every open Launcher follows) and drops them from the URL. dim-app's
`openApp("launcher", {stream: "cmd_vel"})` sets the same state.

## First run

With no default robot (config.yaml `ui.default_robot`) and nothing running, the Launcher asks **"What robot do you want
to use?"** (ui/src/views/LauncherFirstRun.tsx; data in src/server/firstrun_api.rs). Skipping it ("show every blueprint")
lasts for the browser session. Each step:

1. **Pick**: a search field and big cards — "Custom / new robot" first, then every robot from the dimos gateway's
   `GET /dimos/robots` (robots.json, in its order). A server without it gets a list read from the checkout's robot
   folders (`dimos/[experimental/]robot/[<maker>/]<robot>/blueprints`), never one written in Desktop. Each robot's icon
   is one of five drawings by its `type` (dog, wheeled, humanoid, arm, drone; a plain robot when the server doesn't
   say), in a Portal and a Research version (ui/src/assets/robot_icons/; sources and licenses in docs/CREDITS.md).
2. **Custom / new robot** renders the server's `GET /dimos/docs/custom-robot` (its HTML, scripts and handlers removed,
   links opening outside Desktop).
3. **Any other robot** becomes the default robot with no question (`PUT /api/launcher/default-robot`, which also points
   every open Launcher's robot filter at it) and the first run closes onto that robot's blueprints in the Launcher's
   list (no screen in between). From then on its icon sits top left of the Launcher like a profile picture, and the list
   shows its blueprints. Its menu: "Show every robot's blueprints" (and back), Change robot, Clear default robot. With
   no default, a dashed "Choose your robot" button there opens the picker and the list shows every robot's. Where to
   find an arg's value is a link beside that arg (robots.json `docs`).

A dimos gateway without one of these endpoints (404) gets a sentence saying which, not an error.

| Endpoint                                      | What                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/launcher/robots`                    | `{source, defaultRobot, robots: [{id, name, manufacturer, type}]}`                                         |
| `GET /api/launcher/robots/{robot}/blueprints` | `{source, scanning, progress: {done, total}, blueprints: [{name, importable, errors}]}`                    |
| `GET /api/launcher/import-problems`           | `{source, scanning, key, blueprints: {name: {error, missingModule, optionalDependency, suggestedExtras}}}` |
| `GET/PUT /api/launcher/default-robot`         | `{robot}`; null clears it (also `defaultRobot` in `/api/ui-settings`)                                      |

## Blueprints that don't import

`GET /api/launcher/import-problems` lists the blueprints that don't import and why: from the dimos gateway's discovery
(`import_error`, `missing_module`, `optional_dependency`, and `suggested_extras`: the extras that would install the
missing module, by its package's name or as a dependency in uv.lock), else from the Launcher catalog's errors (the
module read from "No module named", no extras). The Launcher (ui/src/views/LauncherExtras.tsx) marks each in its list:
"needs extras" when a package is missing (hover: which extras, which module), "doesn't load" for anything else (a
blueprint that needs a robot IP to import), and says the same in the inspector. It refetches when the catalog rescans,
every 2 s while discovery scans.

Launch (or Customize) on one that lacks a package opens "Additional extras are needed for this blueprint, please choose
what to install:": the extras not installed (`GET /dimos/extras`), the suggested ones first and ticked, the others below
unticked, each with its download size; the missing module and the import error above. Install sends
`POST /dimos/extras/install {extras, app: "launcher"}`: the dimos gateway sends Desktop's shell tool
([shell.md](shell.md)) one command per ticked extra (`uv sync --locked --inexact --extra <x>` in a checkout; nix's
CycloneDDS first when cyclonedds builds from source), shown over the Launcher, run one at a time once the user presses
Run. When the session succeeds the Launcher asks for a rescan (`POST /dimos/discovery/refresh`), bumps its catalog (its
stamp includes the venv's site-packages, so the catalog rescans too) and waits for discovery's key to change; if the
blueprint now imports, it's launched with the args it was launched with; if not, the dialog says so with its new error
and extras. A dimos gateway without `/dimos/extras` gets the missing module and a `uv sync --inexact --extra <name>`
hint.

A robot's `recommended` list in robots.json (its blueprints to suggest first, best first) ranks its picks: each card's
`featured` is its place in that list (else its blueprint's `starter` rank) and `recommended: true` puts a "Recommended"
mark on it.

## Recommended settings

A blueprint's `recommended_config` in robots.json (its own, else its robot's defaults'; resolved by the dimos gateway,
or by src/dimos/robots.rs from the checkout) is on its card as `recommendedConfig`: the settings to decide first. Each
is one config value (`key`: a GlobalConfig field or `<module>.<field>`, with `label`, `docs`, `placeholder`, `required`,
`kind`) or a pick (`kind` pick, no key) whose `choices` each `set` several values at once (Run it on: Robot / Replay /
Simulator). Either can be an enum (`choices`) and can show only `when` some config values hold (the robot's IP only for
Robot, the recording picker only for Replay). One component draws them everywhere (RecommendedSettings.tsx, and the
dimos gateway's Configure modal the same way): an enum or a pick is buttons for up to 4 choices, else a select; a free
value is a text field (a recording: the replay picker). The Launcher's box beside Launch holds them (a launch takes
every shown value); the Config panel shows them on top as saved config, in a highlighted "Recommended settings" section,
then "Module config" and "Global config".
