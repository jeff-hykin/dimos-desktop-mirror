# Shared by the CI install tests: pick this runner's binary and make sure a user service manager is up.
set -euo pipefail

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) target=x86_64-unknown-linux-gnu ;;
    Linux-aarch64) target=aarch64-unknown-linux-gnu ;;
    Darwin-x86_64) target=x86_64-apple-darwin ;;
    Darwin-arm64) target=aarch64-apple-darwin ;;
    *) echo "no binary for $(uname -s)-$(uname -m)" >&2 && exit 1 ;;
esac
export DIMOS_DESKTOP_BINARY="$PWD/build/dimos-desktop-$target"
chmod +x "$DIMOS_DESKTOP_BINARY"
desktop="$HOME/.dimos/desktop/bin/dimos-desktop"
url="http://127.0.0.1:7077"

if [ "$(uname -s)" = "Linux" ]; then
    # CI runners have no login session, so start the user's systemd manager the way a login would
    sudo loginctl enable-linger "$USER"
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
    for _ in $(seq 1 30); do
        systemctl --user is-system-running >/dev/null 2>&1 && break
        [ "$(systemctl --user is-system-running 2>/dev/null)" = "degraded" ] && break
        sleep 1
    done
fi

healthy() {
    curl -fsS --max-time 2 "$url/healthz" >/dev/null 2>&1
}

wait_healthy() {
    for _ in $(seq 1 60); do
        healthy && return 0
        sleep 1
    done
    echo "Desktop never answered at $url" >&2
    cat "$HOME/.dimos/desktop/logs/service.log" >&2 || true
    return 1
}
