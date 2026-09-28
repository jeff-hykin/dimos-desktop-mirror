#!/usr/bin/env bash
# Downloads the dimos-desktop binary for this machine and runs its installer.
#   curl -fsSL https://raw.githubusercontent.com/dimensionalOS/dimos-desktop/main/install.sh | bash
# Arguments after `bash -s --` go to `dimos-desktop install` (see `dimos-desktop install --help`).
# DIMOS_DESKTOP_REPO    GitHub owner/repo to download from (default dimensionalOS/dimos-desktop)
# DIMOS_DESKTOP_VERSION release tag (default: the latest release)
# DIMOS_DESKTOP_BINARY  use this local binary instead of downloading one
set -euo pipefail

repo="${DIMOS_DESKTOP_REPO:-dimensionalOS/dimos-desktop}"
version="${DIMOS_DESKTOP_VERSION:-latest}"

fail() {
    printf 'dimos-desktop install: %s\n' "$1" >&2
    exit 1
}

case "$(uname -s)" in
    Linux) os="unknown-linux-gnu" ;;
    Darwin) os="apple-darwin" ;;
    *) fail "unsupported OS $(uname -s); Linux and macOS are supported" ;;
esac
case "$(uname -m)" in
    x86_64 | amd64) arch="x86_64" ;;
    arm64 | aarch64) arch="aarch64" ;;
    *) fail "unsupported CPU $(uname -m); x86_64 and arm64 are supported" ;;
esac
asset="dimos-desktop-${arch}-${os}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
binary="$workdir/dimos-desktop"

if [ -n "${DIMOS_DESKTOP_BINARY:-}" ]; then
    cp "$DIMOS_DESKTOP_BINARY" "$binary"
else
    if [ "$version" = "latest" ]; then
        url="https://github.com/$repo/releases/latest/download/$asset"
    else
        url="https://github.com/$repo/releases/download/$version/$asset"
    fi
    printf 'Downloading %s\n' "$url"
    if ! curl -fL --progress-bar -o "$binary" "$url"; then
        # a private repo's release needs auth; gh has it if you're logged in
        if command -v gh >/dev/null 2>&1; then
            tag_args=()
            [ "$version" != "latest" ] && tag_args=("$version")
            gh release download "${tag_args[@]}" --repo "$repo" --pattern "$asset" --output "$binary" --clobber ||
                fail "couldn't download $asset from $repo"
        else
            fail "couldn't download $url"
        fi
    fi
fi
chmod +x "$binary"
# macOS quarantines downloads; the binary isn't notarized
if [ "$(uname -s)" = "Darwin" ]; then
    xattr -d com.apple.quarantine "$binary" 2>/dev/null || true
fi

# `curl | bash` gives this script the pipe as stdin; hand the installer the terminal for its prompts
if [ -t 1 ] && { : </dev/tty; } 2>/dev/null; then
    "$binary" install "$@" </dev/tty
else
    "$binary" install --yes "$@"
fi
