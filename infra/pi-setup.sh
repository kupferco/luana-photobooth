#!/usr/bin/env bash
#
# One-time setup for a new Raspberry Pi.
#
#   infra/pi-setup.sh [user@host]
#
# Installs Node, CUPS and the systemd unit. Everything after this is
# infra/pi-deploy.sh, which is just a copy and a restart.

set -euo pipefail

TARGET="${1:-${PI_HOST:-photobooth@photobooth.local}}"
REMOTE_DIR="/opt/photobooth"

echo "==> Checking what is already there"
ssh "$TARGET" 'bash -s' <<'REMOTE'
set -e
echo "    arch:  $(uname -m)"
echo "    os:    $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "    node:  $(node -v 2>/dev/null || echo 'not installed')"
echo "    cups:  $(lpstat -r 2>/dev/null || echo 'not running')"
REMOTE

echo
echo "==> Installing Node 22 and CUPS if missing"
ssh "$TARGET" 'bash -s' <<'REMOTE'
set -e
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
# cups-client gives lp and lpstat; cups itself runs the queue.
sudo apt-get install -y cups cups-client
# So the agent can submit jobs without sudo.
sudo usermod -aG lpadmin "$(whoami)" || true
REMOTE

echo
echo "==> Installing the service"
ssh "$TARGET" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(whoami) $REMOTE_DIR"
ssh "$TARGET" "cat | sudo tee /etc/systemd/system/photobooth-agent.service >/dev/null" <<REMOTE
[Unit]
Description=Photo Booth print agent
After=network-online.target cups.service
Wants=network-online.target

[Service]
Type=simple
User=$(ssh "$TARGET" whoami)
WorkingDirectory=$REMOTE_DIR
EnvironmentFile=$REMOTE_DIR/.env
ExecStart=/usr/bin/node $REMOTE_DIR/dist/index.js
# A party is six hours long and nobody is watching the Pi. Anything that
# stops it should bring it straight back.
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
REMOTE

ssh "$TARGET" "sudo systemctl daemon-reload && sudo systemctl enable photobooth-agent"

echo
echo "Set up. Next:"
echo "  1. Plug in the printer and check it appears:  ssh $TARGET 'lpstat -p'"
echo "  2. Deploy the agent:                          infra/pi-deploy.sh $TARGET"
echo "  3. Edit the settings:                         ssh $TARGET 'nano $REMOTE_DIR/.env'"
echo "  4. Pair it with an event:"
echo "       ssh $TARGET 'cd $REMOTE_DIR && node --env-file=.env dist/pair.js <CODE>'"
