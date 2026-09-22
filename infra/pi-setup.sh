#!/usr/bin/env bash
#
# One-time setup for a new Raspberry Pi.
#
#   infra/pi-setup.sh [user@host]
#
# Installs Node, CUPS and the two systemd units. Everything after this is
# infra/pi-deploy.sh, which is just a copy and a restart.
#
# You will be asked for the Pi's password once. An Imager-created user on
# Debian 13 does not get the passwordless sudo that Raspberry Pi OS used to
# give the `pi` user, so sudo has to ask -- and this asks once, here. Deploys
# and service restarts afterwards never prompt, because the last step grants
# passwordless sudo for exactly these two services and their logs.
#
# The script is copied to the Pi and run there rather than piped over stdin:
# piping leaves no terminal for sudo to read a password from, which is
# precisely the failure this replaced.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-${PI_HOST:-photolu@photolu.local}}"
REMOTE_DIR="/opt/photobooth"
REMOTE_USER="$(ssh "$TARGET" whoami)"

echo "==> What is already there"
ssh "$TARGET" "
  echo \"    arch:  \$(uname -m)\"
  echo \"    os:    \$(. /etc/os-release && echo \\\"\$PRETTY_NAME\\\")\"
  echo \"    node:  \$(node -v 2>/dev/null || echo 'not installed')\"
  echo \"    cups:  \$(lpstat -r 2>/dev/null || echo 'not installed')\"
"

# Everything needing root goes in one script, so sudo asks once and caches.
STAGE="$(mktemp)"
trap 'rm -f "$STAGE"' EXIT

cat > "$STAGE" <<REMOTE
#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Node 22 and CUPS"
if ! command -v node >/dev/null || [ "\$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "    node \$(node -v) already installed"
fi

# cups runs the queue; cups-client provides lp and lpstat.
sudo apt-get install -y cups cups-client
sudo usermod -aG lpadmin "$REMOTE_USER" || true

echo
echo "==> Creating $REMOTE_DIR"
# Owned by the login user, so deploys need no root to write into it.
sudo mkdir -p "$REMOTE_DIR"
sudo chown "$REMOTE_USER" "$REMOTE_DIR"

echo
echo "==> Installing the services"

sudo tee /etc/systemd/system/photobooth-agent.service >/dev/null <<'UNIT'
[Unit]
Description=Photo Booth print agent
After=network-online.target cups.service
Wants=network-online.target

[Service]
Type=simple
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR
EnvironmentFile=-$REMOTE_DIR/.env
ExecStart=/usr/bin/node $REMOTE_DIR/dist/index.js
# A party is six hours long and nobody is watching the Pi. Anything that
# stops it should bring it straight back.
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

# Onboarding runs before the agent and exits at once when there is nothing to
# do. It needs root: it changes network configuration and binds port 80.
sudo tee /etc/systemd/system/photobooth-onboarding.service >/dev/null <<'UNIT'
[Unit]
Description=Photo Booth first-run onboarding
After=NetworkManager.service
Wants=NetworkManager.service
Before=photobooth-agent.service

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
EnvironmentFile=-$REMOTE_DIR/.env
ExecStart=/usr/bin/node $REMOTE_DIR/dist/onboard.js
# Exits immediately when already set up, so restarting it would be pointless.
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable photobooth-agent photobooth-onboarding

echo
echo "==> Granting passwordless sudo for these two services only"
# Scoped to these units and their logs rather than blanket root, so deploying
# and testing never prompt while nothing else is handed over.
sudo tee /etc/sudoers.d/020_photobooth >/dev/null <<'SUDOERS'
$REMOTE_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start photobooth-agent, /usr/bin/systemctl stop photobooth-agent, /usr/bin/systemctl restart photobooth-agent, /usr/bin/systemctl status photobooth-agent
$REMOTE_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start photobooth-onboarding, /usr/bin/systemctl stop photobooth-onboarding, /usr/bin/systemctl restart photobooth-onboarding, /usr/bin/systemctl status photobooth-onboarding
$REMOTE_USER ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u photobooth-agent *, /usr/bin/journalctl -u photobooth-onboarding *
SUDOERS
sudo chmod 440 /etc/sudoers.d/020_photobooth
# A malformed sudoers file locks out sudo entirely, so check it and remove it
# rather than leave a broken one in place.
sudo visudo -c -f /etc/sudoers.d/020_photobooth || sudo rm -f /etc/sudoers.d/020_photobooth

echo
echo "==> Done on the Pi"
REMOTE

echo
echo "==> Copying the setup script over"
scp -q "$STAGE" "$TARGET:/tmp/photobooth-setup.sh"

echo "==> Running it (you will be asked for the Pi password)"
echo
# -t gives sudo a terminal; stdin stays free because the script is a file.
ssh -t "$TARGET" "chmod +x /tmp/photobooth-setup.sh && /tmp/photobooth-setup.sh; rm -f /tmp/photobooth-setup.sh"

echo
echo "Set up. Next:"
echo "  1. Deploy the agent:      npm run pi:deploy"
echo "  2. Settings:              ssh $TARGET 'nano $REMOTE_DIR/.env'"
echo "  3. Plug in the printer:   ssh $TARGET 'lpstat -p'"
echo "  4. Pair it with an event, either over SSH:"
echo "       ssh $TARGET 'cd $REMOTE_DIR && node --env-file=.env dist/pair.js <CODE>'"
echo "     or from a phone, by starting onboarding:"
echo "       ssh $TARGET 'sudo systemctl start photobooth-onboarding'"
