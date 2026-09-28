#!/usr/bin/env bash
# CI: install Desktop through the real install.sh, prove the OS service owns it, crash it, uninstall.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

bash install.sh --skip-dimos --no-open
wait_healthy
"$desktop" status

echo "--- the UI and API come out of the single binary"
curl -fsS "$url/" | grep -q '<div id="root">'
curl -fsS "$url/api/info"
echo

echo "--- the service manager owns it"
if [ "$(uname -s)" = "Darwin" ]; then
    launchctl print "gui/$(id -u)/org.dimensional.dimos-desktop" | grep -E "state = running"
else
    systemctl --user is-active dimos-desktop.service
fi

echo "--- killed, it comes back"
old_pid="$(pgrep -f "[d]imos-desktop serve")"
kill -9 "$old_pid"
sleep 3
wait_healthy
new_pid="$(pgrep -f "[d]imos-desktop serve")"
echo "pid $old_pid -> $new_pid"
[ "$old_pid" != "$new_pid" ]

echo "--- uninstall removes the service and the files"
"$desktop" uninstall --yes --keep-dimos
sleep 2
if healthy; then
    echo "still answering after uninstall" >&2
    exit 1
fi
[ ! -e "$HOME/.dimos/desktop" ]
if [ "$(uname -s)" = "Darwin" ]; then
    [ ! -e "$HOME/Library/LaunchAgents/org.dimensional.dimos-desktop.plist" ]
else
    [ ! -e "$HOME/.config/systemd/user/dimos-desktop.service" ]
fi
echo "ok"
