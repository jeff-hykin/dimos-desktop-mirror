# The Desktop app (.app / AppImage)

`bundle/` builds dimOS Desktop as an app that shows Desktop in a window of its own instead of a browser tab: **dimOS
Desktop.app** for macOS and **dimOS-Desktop-x86_64.AppImage** for Linux (Steam Deck included). It is a thin launcher
kept apart from the rest of the repo (its own crate, `bundle/Cargo.toml`, not a workspace member; nothing in Desktop
depends on it).

## What it does

The app carries a normal `dimos-desktop` binary and only ever drives it through its CLI:

1. **Nothing installed** in `DIMOS_HOME` (default `~/.dimos`): `dimos-desktop setup --no-open` from the bundled binary,
   the same install `install.sh` does (binary into `~/.dimos/desktop/bin`, config, boot service). The window then shows
   Desktop's own installer (nix, dimcode, dimos), as the browser would.
2. **Installed and at least as new** as the bundled one: used as is.
3. **Installed but older**: the app asks (macOS: in the window; Linux: zenity or kdialog, else it keeps the installed
   one). Replace runs `dimos-desktop setup --yes --no-open --no-install` from the bundled binary: only the binary is
   swapped, config, apps and dimos stay.
4. Then `dimos-desktop status`; if Desktop isn't answering, `dimos-desktop service install` starts it. The window opens
   the URL `status` reports.

Closing the window quits the app and leaves the Desktop service running, like closing the browser tab. The app's own log
is `$DIMOS_HOME/logs/desktop-app.log`.

### Updates

Desktop keeps updating itself as it does today (Settings → Updates replaces `~/.dimos/desktop/bin/dimos-desktop`), and
the app always shows whatever is installed, so a self-updated Desktop needs no new app. The bundled binary is only the
seed for a first install (or the offer in 3. when someone downloads a newer app). The app itself (window shell,
Chromium) changes rarely and has no auto-update: a new download replaces it.

## Rendering

| Platform | Window                                 | Why                                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | WKWebView (wry + tao)                  | The system's WebKit: ~42 MB app instead of ~400 MB. WebGL2, WebRTC (the zenoh-gateway's data channels and video), the Gamepad API, element full screen and Cmd shortcuts work in it. It has no Notification API: the app provides one that shows native notifications. |
| Linux    | Chromium (Chrome for Testing), `--app` | WebKitGTK's WebRTC can't carry the zenoh-gateway's video. Pinned version and sha256 in `bundle/scripts/build_appimage.sh`; own profile in `$DIMOS_HOME/desktop/app-chromium`.                                                                                          |

macOS details: the menus are the standard ones (Edit's items are what make Cmd+C/V work in a WKWebView); only Cmd+R
(reload), Cmd+Opt+I (Web Inspector), Cmd+W, Cmd+M, Cmd+H and Cmd+Q are taken by the app, everything else (Cmd+K, Alt
shortcuts) reaches Desktop. Verified on a go2 replay: Controller's WebRTC camera (1280x720, live) and WebGL map. Links
that open a new window go to the default browser; downloads go to `~/Downloads`. `DIMOS_BUNDLE_PROBE=<file>` writes what
the webview supports (WebGL renderer, WebRTC loopback, gamepads, full screen, notifications, then the videos playing in
an open app) to `<file>` once Desktop has loaded; a `?query` or `/path` argument is appended to Desktop's URL
(`dimos-desktop-app ?app=dim-controller`).

Linux details: the AppImage carries Chromium's libraries from Debian bookworm (glibc 2.36) and links in only the ones
the system lacks (`$DIMOS_HOME/desktop/app-chromium-libs`; mixing an older pango or atk with the system's GTK crashes
Chromium). The launcher is static (musl), and the Desktop binary needs glibc 2.34. Where unprivileged user namespaces
are blocked (Ubuntu 23.10+ AppArmor), Chromium runs with `--no-sandbox` because a setuid sandbox can't live in an
AppImage. Arguments given to the AppImage go to Chromium (`--start-fullscreen`, `--kiosk`).

## Building

```sh
bundle/scripts/build_mac_app.sh        # on a Mac: bundle/dist/dimOS Desktop.app + dimOS-Desktop-macos-<arch>.zip
bundle/scripts/build_appimage.sh       # on x86_64 Linux with docker: bundle/dist/dimOS-Desktop-x86_64.AppImage
```

Both take the Desktop release matching `Cargo.toml`'s version (checked against its `SHA256SUMS`), or
`--desktop-binary <path>`. Every release (`release.yml`, a `v*` tag) attaches both, built from that release's own
binaries, in jobs after the release is published (a failure there never holds back the binaries):
`dimOS-Desktop-x86_64.AppImage`, `dimOS-Desktop-macos-aarch64.zip` and `dimOS-Desktop-macos-x86_64.zip`, each added to
the release's `SHA256SUMS` (`bundle/scripts/attach_to_release.sh`). The self-updater and `install.sh` pick their assets
by exact name and ignore these. `.github/workflows/bundle.yml` builds both by hand (workflow artifacts only).

**Trying a change as an AppImage, fast** (minutes, no release): on an x86_64 Linux box with the checkout,
`bundle/scripts/fast_appimage_on_linux.sh appimage-test-N` builds the UI and the release binary from the working tree,
wraps them, and uploads the AppImage to a pre-release `appimage-test-N` on the mirror (not a `v` tag, so `release.yml`
doesn't run; not Latest, so self-updates ignore it), printing its download URL. Without a tag it only builds. Set
`CARGO_TARGET_DIR` to a shared dir to keep rebuilds incremental.

The .app is ad-hoc signed: on another Mac it opens after right-click → Open (or `xattr -dr com.apple.quarantine`).
Notarizing needs a Developer ID certificate and an Apple account (not set up). aarch64 Linux isn't built: Chrome for
Testing has no linux-arm64 build.
