#!/usr/bin/env bash
#
# What the Pi is doing right now.
#
#   infra/pi-status.sh [user@host]
#
# Everything here reads state, so nothing needs root: `systemctl status` is
# unprivileged, and the login user is in `adm`, which grants the journal.
# Adding sudo would only make this prompt for a password.

set -euo pipefail

TARGET="${1:-${PI_HOST:-photolu@photolu.local}}"

if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$TARGET" true 2>/dev/null; then
  echo "Cannot reach $TARGET."
  echo
  echo "  - Is it powered up? A steady red light means power, green means the card."
  echo "  - On the same network as this Mac?"
  echo "  - If it was mid-onboarding it may be advertising PhotoLu-Setup-XXXX instead."
  exit 1
fi

ssh "$TARGET" 'bash -s' <<'REMOTE'
set -uo pipefail

hr() { printf '\n\033[1m%s\033[0m\n' "$1"; }

hr "Power"
# The single most misleading fault on a Pi: under-voltage looks like bad
# software -- slow, random restarts, USB dropping out -- so it is checked
# first and in plain words.
throttled="$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)"
if [ -z "$throttled" ]; then
  echo "  unknown (vcgencmd unavailable)"
elif [ "$throttled" = "0x0" ]; then
  echo "  healthy ($throttled)"
else
  # The low bits are what is happening now; the bits from 16 up are what has
  # happened since boot and never clear. Reporting them as one alarm reads as
  # a fault when the supply has already recovered -- which is exactly the
  # state a Pi is in after a dip at plug-in -- so they are split.
  now=$(( throttled & 0xF ))
  if (( now )); then
    echo "  UNDER-VOLTAGE RIGHT NOW ($throttled)"
    (( (throttled & 0x1) )) && echo "    - supply below 4.63V"
    (( (throttled & 0x4) )) && echo "    - CPU throttled back"
    echo "    Printing over USB will make this worse. Change the supply."
  else
    echo "  healthy now ($throttled)"
    (( (throttled & 0x10000) )) && echo "    - but the supply dipped earlier, most likely at plug-in"
    (( (throttled & 0x40000) )) && echo "    - and throttled at some point"
    echo "    These flags never clear; reboot to see whether it happens again."
  fi
fi
# Shown with the ceiling and the governor next to it, because a Pi 3 idles at
# 600MHz by design and that bare number reads as throttling when it is not.
cur=$(( $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 0) / 1000 ))
max=$(( $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null || echo 0) / 1000 ))
gov="$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo '?')"
printf '  cpu:  %s of %s MHz (%s — idling low is normal)\n' "$cur" "$max" "$gov"
printf '  temp: %s\n' "$(vcgencmd measure_temp 2>/dev/null | cut -d= -f2 || echo unknown)"

hr "Network"
printf '  wifi:  %s\n' "$(nmcli -t -f ACTIVE,SSID device wifi list --rescan no 2>/dev/null | grep '^yes:' | cut -d: -f2- || echo 'not connected')"
printf '  ip:    %s\n' "$(hostname -I | awk '{print $1}')"
printf '  state: %s\n' "$(nmcli -t -f STATE general 2>/dev/null)"

hr "Agent"
systemctl is-active --quiet photobooth-agent \
  && echo "  running since $(systemctl show photobooth-agent -p ActiveEnterTimestamp --value)" \
  || echo "  NOT RUNNING"

# The shared path, not a home directory: onboarding writes this as root and
# the agent reads it as the login user, so it cannot live under either home.
TOKEN="${PHOTOBOOTH_TOKEN_PATH:-/var/lib/photobooth/device-token}"
if [ -f "$TOKEN" ]; then
  echo "  paired: yes ($(stat -c %y "$TOKEN" | cut -d. -f1))"
elif [ -f "$HOME/.photobooth/device-token" ] || sudo -n test -f /root/.photobooth/device-token 2>/dev/null; then
  echo "  paired: token is in an OLD location — run npm run pi:setup to migrate it"
else
  echo "  paired: no — run onboarding, or pair over SSH with a code from the app"
fi

hr "Printer"
lpstat -p 2>/dev/null || echo "  no printer configured in CUPS"
usb="$(lsusb 2>/dev/null | grep -i canon || true)"
[ -n "$usb" ] && echo "  usb: $usb" || echo "  usb: no Canon device seen"

hr "Last 15 log lines"
journalctl -u photobooth-agent -n 15 --no-pager -o short 2>/dev/null | sed 's/^/  /'
REMOTE
