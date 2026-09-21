#!/usr/bin/env bash
#
# Push the print agent to the Pi and restart it.
#
#   infra/pi-deploy.sh [user@host]
#
# Defaults to $PI_HOST, or photobooth@photobooth.local.
#
# Sends built output, not source: the Pi runs one bundled file and needs no
# toolchain, no npm install and no workspace. A deploy is a copy and a
# restart, which is what makes iterating on it bearable.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-${PI_HOST:-photobooth@photobooth.local}}"
REMOTE_DIR="/opt/photobooth"

echo "==> Building the agent"
npm run build --workspace @photobooth/print-agent

echo "==> Copying to $TARGET:$REMOTE_DIR"
ssh "$TARGET" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(whoami) $REMOTE_DIR"
rsync -az --delete "$ROOT/services/print-agent/dist/" "$TARGET:$REMOTE_DIR/dist/"

# The env file is deployed only if the Pi has none: it holds the printer name
# and the API URL, which are the Pi's own settings, not the repository's.
if ! ssh "$TARGET" "test -f $REMOTE_DIR/.env"; then
  echo "==> No .env on the Pi; installing the example for you to edit"
  scp "$ROOT/services/print-agent/.env.example" "$TARGET:$REMOTE_DIR/.env"
  echo "    Edit it:  ssh $TARGET 'nano $REMOTE_DIR/.env'"
fi

echo "==> Restarting"
# Not yet installed on a fresh Pi; infra/pi-setup.sh puts the unit in place.
ssh "$TARGET" "sudo systemctl restart photobooth-agent 2>/dev/null || echo '    (service not installed yet — run infra/pi-setup.sh)'"

echo
echo "Done. Follow it with:"
echo "  ssh $TARGET 'journalctl -u photobooth-agent -f'"
echo
echo "Not paired yet? Get a code from the event, then:"
echo "  ssh $TARGET 'cd $REMOTE_DIR && node --env-file=.env dist/pair.js <CODE>'"
