# Steam Deck / SteamOS

Desktop runs on a Steam Deck like on any Linux machine. The difference is the controls: a browser only sees the Deck's
sticks and buttons as a **gamepad** when Steam launched it. In Desktop Mode without Steam, Steam Input turns them into a
mouse and keyboard.

## What Desktop detects

`GET /api/info` → `platform: { os, arch, steamDeck, steamOs, deckModel }`:

- `steamDeck`: `/sys/devices/virtual/dmi/id/sys_vendor` or `board_vendor` is `Valve` and `product_name` is `Jupiter`
  (`deckModel: "lcd"`) or `Galileo` (`"oled"`).
- `steamOs`: `/etc/os-release` has `ID=steamos` (a Deck, or SteamOS on other hardware).

## The "dimOS" Steam library entry

On a Deck or SteamOS, `dimos-desktop setup`, Desktop itself once per version (after an install or a self-update,
`desktop.steam_shortcut_version`), and Settings → Steam Deck's button (`POST /api/steam-deck/shortcut`) add a non-Steam
game named **dimOS** to every Steam account that has signed in on the machine
(`~/.local/share/Steam/userdata/<id>/config/shortcuts.vdf`). It runs the browser on `<Desktop's URL>/?launch=steam`,
in a normal window with a close button:

| Browser (first found)                                       | Runs                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| Google Chrome, Chromium (Flatpak `com.google.Chrome`, …)    | `flatpak run <id> --new-window --start-maximized "<url>"` |
| Google Chrome, Chromium (`/usr/bin/google-chrome`, …)       | `<browser> --new-window --start-maximized "<url>"`        |
| Firefox (Flatpak `org.mozilla.firefox`, `/usr/bin/firefox`) | `… --new-window --no-remote --profile "<profile>" "<url>"`                                   |

- The file is backed up first (`shortcuts.vdf.dimos-backup-<unix time>`) and written whole (temp file, then rename).
  Every other entry stays byte for byte.
- Running it again changes nothing; when Desktop's URL or the browser changed, the entry is updated in place (its appid,
  and so its artwork and controller settings, stay). A new entry's appid is the standard
  `crc32(Exe + AppName) | 0x80000000`.
- A `shortcuts.vdf` Desktop can't read is left alone (an error, not a rewrite).
- Steam reads the file only when it starts, and may write its own copy back when it quits: **restart Steam** to see the
  entry, and if it's still missing, quit Steam first (Desktop Mode: Steam → Exit) and add it again. Desktop never stops
  Steam itself.
- With no browser installed it adds nothing: install Google Chrome from Discover (Desktop Mode).
- Flatpak browsers receive read-only `/run/udev` access so they can identify gamepad devices.
- Steam uses a separate browser profile so an already-open browser cannot take over its launch.
- When Desktop restarts Steam to load a shortcut, it re-adds the shortcut after Steam quits (Steam may overwrite it on exit).
- The Steam Input template isn't set: Steam's default for a non-Steam game applies (pick "Gamepad" in the entry's
  controller settings if the sticks act as a mouse).

After the once-per-version step Desktop says what it did in a notification ("dimOS was added to your Steam library.
Restart Steam, then open dimOS from Steam…", with **Open dimOS in Steam**), or, when it couldn't, why, linking here.

`GET /api/steam-deck` reports Steam's data dir, whether it runs, the browser, and each account's entry (`missing`,
`present`, `outdated`; `steamShortcut` sums them up, `unknown` with no Steam account) and `runGameUrl`.

## Opening it through Steam

`POST /api/steam-deck/open` (Settings → Steam Deck's **Open dimOS in Steam**, the notification's button, an app's
button) is for when the user asked. It adds the entry if needed, then:

| Steam                                                   | `did`           | What happens                                                                          |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| not running                                             | `started`       | `steam steam://rungameid/<gameId>`                                                    |
| running, started after Desktop last wrote shortcuts.vdf | `launched`      | the same; the running Steam opens it                                                  |
| running without the entry, Desktop Mode                 | `restarted`     | `steam -shutdown`, waits (up to a minute) for it to exit, then starts it with the URL |
| running without the entry, Game Mode (gamescope runs)   | `needs-restart` | nothing: quitting Steam there ends the session; the user restarts it                  |

`gameId` is the shortcut's 64-bit id, `(appid << 32) | 0x02000000`, as a string (past JavaScript's exact integers).
Desktop's last write is `~/.dimos/desktop/steam-shortcut-written`; Steam's start is its process's. `steam` runs detached
in the graphical session's DISPLAY / WAYLAND_DISPLAY. A page can also offer `runGameUrl` as a plain link (the browser
asks to open Steam).

A **fresh install** (`dimos-desktop setup`, so `install.sh` too) on a Deck or SteamOS opens the rest of setup this way
instead of opening the browser directly. When Steam runs without the entry it asks "Steam needs to restart to add dimOS"
(default yes); with no one to answer it restarts Steam only when no game runs (no `reaper` process). Declined, Game
Mode, or anything failing: it opens the browser as before and says why.

## For apps

- Launched from the entry: the shell keeps the URL's `launch=steam` in `sessionStorage["dimos.launch"]` for the tab, and
  an app's page (a same-origin iframe) reads it there: `sessionStorage.getItem("dimos.launch") === "steam"`.
- Everything else: declare and call them, e.g. a banner for a Deck user who opened the page some other way:

```yaml
uses:
    "@desktop-gateway": [GET /api/steam-deck, POST /api/steam-deck/open]
```

`GET /api/steam-deck` → show the banner when `steamDeck || steamOs` and the tab isn't `launch=steam`; its button POSTs
`/api/steam-deck/open` and shows `message`.

## Controls

The Controller app reads gamepads: the sticks drive, **LT + RT = STOP**, **A** confirms.

On a Deck Desktop sends one notification (once, `desktop.steam_deck_notice_sent`) pointing at Settings → Steam Deck,
which has this guide and the button.

If Firefox does not see a controller, close the Steam browser and reopen dimOS from Steam after updating the shortcut. The Flatpak launch must include read-only `/run/udev` access; device access alone does not identify gamepads. In Go2 Ctrl, touch movement is enabled only after **Stand** completes; a connected dog can still be in **Resting** mode.

## Legion Go S

Some SteamOS installs have an empty desktop controller layout and no working Legion gamepad default.
Desktop copies Steam’s dual-stick Steam Deck template, sets its controller type to `controller_legion_go_s`,
and registers it as the saved layout for the dimOS shortcut in each Steam account’s controller configuration.
The hardware-specific `28de-12ff` aliases receive the same layout. Existing dimOS custom layouts, other games,
and the desktop layout are preserved. Steam needs a restart to load a newly installed layout.

The browser opens in a normal window so touchscreen users can tap the window’s × to exit without a keyboard.
