#!/usr/bin/env bash
#
# One-time setup for a new Raspberry Pi.
#
#   infra/pi-setup.sh [user@host]
#
# Installs Node, CUPS and the systemd unit. Everything after this is
# infra/pi-deploy.sh, which is just a copy and a restart.
#
# You will be asked for the Pi's password: this uses sudo, and an
# Imager-created user on Debian 13 does not get the passwordless drop-in that
# Raspberry Pi OS used to give the `pi` user. It is asked once, here. Deploys
# afterwards never prompt, because this grants passwordless sudo for exactly
# one command -- restarting the agent -- and nothing else.

set -euo pipefail

TARGET="${1:-${PI_HOST:-photolu@photolu.local}}"
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
echo "==> Installing Node 22 and CUPS if missing (you will be asked for the Pi password)"
ssh -t "$TARGET" 'bash -s' <<'REMOTE'
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

# Owned by the login user, so deploys need no sudo to write into it.
ssh -t "$TARGET" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(whoami) $REMOTE_DIR"

ssh -t "$TARGET" "cat | sudo tee /etc/systemd/system/photobooth-agent.service >/dev/null" <<REMOTE
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

# Onboarding runs before the agent and exits at once when there is nothing
# to do. It needs root: it changes network configuration and binds port 80.
ssh -t "$TARGET" "cat | sudo tee /etc/systemd/system/photobooth-onboarding.service >/dev/null" <<REMOTE
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
# Exits immediately when already set up, so a restart loop would be pointless.
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
REMOTE

ssh -t "$TARGET" "sudo systemctl daemon-reload && sudo systemctl enable photobooth-agent photobooth-onboarding"

# Narrow passwordless sudo: restarting this one unit, nothing else. Deploys
# then never prompt, without handing the login user blanket root.
echo
echo "==> Allowing passwordless restart of the agent, so deploys do not prompt"
# Both units, and journalctl to read their logs. Scoped to these services --
# not blanket root -- so deploying and testing never prompt but nothing else
# is handed over.
ssh -t "$TARGET" 'cat | sudo tee /etc/sudoers.d/020_photobooth >/dev/null && sudo chmod 440 /etc/sudoers.d/020_photobooth' <<SUDOERS
$(ssh "$TARGET" whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl start photobooth-agent, /usr/bin/systemctl stop photobooth-agent, /usr/bin/systemctl restart photobooth-agent, /usr/bin/systemctl status photobooth-agent
$(ssh "$TARGET" whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl start photobooth-onboarding, /usr/bin/systemctl stop photobooth-onboarding, /usr/bin/systemctl restart photobooth-onboarding, /usr/bin/systemctl status photobooth-onboarding
$(ssh "$TARGET" whoami) ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u photobooth-agent *, /usr/bin/journalctl -u photobooth-onboarding *
SUDOERS

echo
echo "Set up. Next:"
echo "  1. Plug in the printer and check it appears:  ssh $TARGET 'lpstat -p'"
echo "  2. Deploy the agent:                          infra/pi-deploy.sh $TARGET"
echo "  3. Edit the settings:                         ssh $TARGET 'nano $REMOTE_DIR/.env'"
echo "  4. Pair it with an event (or let onboarding do it from a phone):"
echo "       ssh $TARGET 'cd $REMOTE_DIR && node --env-file=.env dist/pair.js <CODE>'"
