#!/usr/bin/env bash
# CI: the full flow, Desktop then dimos: clone a dimos release and run its own scripts/install.sh.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

# dimos 0.0.14 installs every extra (~430 packages); make room on the runner
sudo rm -rf /usr/local/lib/android /usr/share/dotnet /opt/ghc /opt/hostedtoolcache/CodeQL
df -h "$HOME"

bash install.sh --no-open --dimos-version v0.0.14
wait_healthy
"$desktop" status

test -x "$HOME/.dimos/dimos/.venv/bin/dimos"
git -C "$HOME/.dimos/dimos" describe --tags --exact-match | grep -qx v0.0.14

echo "--- Desktop sees a compatible dimos"
curl -fsS "$url/api/info" | python3 -c '
import json, sys
info = json.load(sys.stdin)["dimos"]
print(info)
assert info["installed"] and info["compat"]["ok"], info
'
echo "--- and can list its blueprints through the dimos CLI"
curl -fsS "$url/api/blueprints" | python3 -c '
import json, sys
names = json.load(sys.stdin)["builtin"]
print(len(names), "blueprints, e.g.", names[:5])
assert len(names) > 10
'
echo "ok"
