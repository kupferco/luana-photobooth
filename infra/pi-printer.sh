#!/usr/bin/env bash
#
# Make the Pi able to drive a Canon SELPHY CP1500.
#
#   infra/pi-printer.sh [user@host]
#
# Safe to run before the printer is plugged in: it installs the driver and
# gets out of CUPS's way, then adds the printer if it can see one. Run it
# again once the cable is in.
#
# Two things stand between a stock Raspberry Pi OS and a working SELPHY, and
# neither is obvious from the error you get.
#
# 1. Debian 13 ships Gutenprint 5.3.4 built from a 2022-06-24 snapshot. The
#    newest SELPHY it knows is the CP910, from 2014 -- the CP1000, CP1200,
#    CP1300 and CP1500 are all absent, because CP1500 support landed upstream
#    on 2022-10-10, four months after that snapshot. There is no trixie
#    backport. The symptom is a printer CUPS can see but has no driver for.
#
#    Debian testing has a 2026-02-01 build which does know it, and its
#    dependencies are all satisfied on trixie already, so three .debs are
#    enough. No compiling on a Pi 3.
#
# 2. ipp-usb is installed and udev-activated. The moment a printer appears it
#    claims the USB interface, and Gutenprint then cannot talk to it at all.
#    Masking it is the fix. It is only wanted for driverless AirPrint-over-USB,
#    which we are deliberately not using: the packaged ipp-usb is 0.9.23 and
#    the CP1500 needs 0.9.24 or newer, and that path reportedly wants the
#    printer's wifi working, which is a thing to go wrong at a party.

set -euo pipefail

TARGET="${1:-${PI_HOST:-photolu@photolu.local}}"
PRINTER_NAME="${PRINTER_NAME:-Canon_SELPHY_CP1500}"

STAGE="$(mktemp)"
trap 'rm -f "$STAGE"' EXIT

cat > "$STAGE" <<REMOTE
#!/usr/bin/env bash
set -euo pipefail

# lpinfo and lpadmin live in /usr/sbin, which is not on a login user's PATH.
# Without this they are simply "command not found", every probe returns
# nothing, the greps below match nothing, and pipefail aborts the script
# before it can report its own failure. It looked exactly like a printer CUPS
# could not see; the printer was fine and CUPS knew about it perfectly.
export PATH="/usr/sbin:/usr/local/sbin:\$PATH"

PRINTER_NAME="$PRINTER_NAME"
POOL=http://deb.debian.org/debian/pool/main/g/gutenprint
WORK=\$(mktemp -d)
trap 'rm -rf "\$WORK"' EXIT
cd "\$WORK"

have_cp1500() {
  # Does the installed driver actually know this model? This is the question,
  # not whether Gutenprint is installed -- the stock one is, and does not.
  lpinfo -m 2>/dev/null | grep -qi 'CP1500'
}

echo "==> Checking the current driver"
if have_cp1500; then
  echo "    CP1500 already known to CUPS; leaving the driver alone"
else
  echo "    not known -- fetching the newer Gutenprint from Debian testing"

  ARCH=\$(dpkg --print-architecture)
  INDEX=\$(curl -fsS "\$POOL/")

  pick() {
    echo "\$INDEX" | grep -o "href=\"\$1\"" | sed 's/href="//;s/"//' | sort -V | tail -1
  }

  COMMON=\$(pick "libgutenprint-common_5\.3\.[6-9][^\"]*_all\.deb")
  LIB=\$(pick "libgutenprint9_5\.3\.[6-9][^\"]*_\${ARCH}\.deb")
  DRV=\$(pick "printer-driver-gutenprint_5\.3\.[6-9][^\"]*_\${ARCH}\.deb")

  if [ -z "\$COMMON" ] || [ -z "\$LIB" ] || [ -z "\$DRV" ]; then
    echo "    Could not find all three packages in the Debian pool." >&2
    echo "    common=\$COMMON lib=\$LIB drv=\$DRV" >&2
    exit 1
  fi

  for f in "\$COMMON" "\$LIB" "\$DRV"; do
    echo "    \$f"
    curl -fsSO "\$POOL/\$f"
  done

  # Verify before installing rather than after. A build that does not mention
  # the CP1500 is the exact failure this script exists to avoid, and finding
  # out from a broken print queue is worse than finding out here.
  mkdir -p probe
  dpkg-deb -x "\$DRV" probe
  if ! grep -rqi 'CP1500' probe/; then
    echo "    That build does not mention the CP1500 either. Stopping." >&2
    exit 1
  fi
  echo "    verified: this build knows the CP1500"

  sudo dpkg -i "\$COMMON" "\$LIB" "\$DRV"
fi

echo
echo "==> Getting ipp-usb out of the way"
# Masked, not removed: reversible with 'systemctl unmask', and removing it
# would drag cups-daemon's recommendations around.
if systemctl list-unit-files ipp-usb.service >/dev/null 2>&1; then
  sudo systemctl mask --now ipp-usb.service 2>/dev/null || true
  echo "    ipp-usb masked"
else
  echo "    ipp-usb not present; nothing to do"
fi

echo
echo "==> Looking for the printer"
if ! lsusb | grep -qi canon; then
  echo "    No Canon device on USB."
  echo "    Plug the SELPHY into a Pi USB-A port with a USB-A to USB-C cable,"
  echo "    turn it on, and run this again."
  exit 0
fi
lsusb | grep -i canon | sed 's/^/    /'

# `|| true` on both: a grep that matches nothing must reach the diagnostic
# below, not kill the script through pipefail before it can report anything.
URI=\$(lpinfo -v 2>&1 | grep -i 'selphy\|canon' | grep -i usb | head -1 | awk '{print \$2}' || true)
MODEL=\$(lpinfo -m 2>&1 | grep -i 'CP1500' | head -1 | awk '{print \$1}' || true)

if [ -z "\$URI" ] || [ -z "\$MODEL" ]; then
  echo "    Found the printer on USB but could not match a CUPS driver."
  echo "    uri=\${URI:-none} model=\${MODEL:-none}"
  echo "    Candidates:"
  lpinfo -v 2>/dev/null | sed 's/^/      /'
  exit 1
fi

echo "    uri:   \$URI"
echo "    model: \$MODEL"

echo
echo "==> Adding it to CUPS as \$PRINTER_NAME"
# -E enables it and accepts jobs; without it the queue exists but holds
# everything, which looks exactly like a printer that is ignoring you.
sudo lpadmin -p "\$PRINTER_NAME" -v "\$URI" -m "\$MODEL" -E
sudo lpadmin -d "\$PRINTER_NAME"

echo
lpstat -p "\$PRINTER_NAME" -l 2>/dev/null | head -5
echo
echo "==> Done. Test it with:"
echo "     lp -d \$PRINTER_NAME /usr/share/cups/data/testprint"
echo "   (that spends one sheet and one ribbon panel set)"
REMOTE

echo "==> Copying the printer setup script over"
scp -q "$STAGE" "$TARGET:/tmp/photobooth-printer.sh"

echo "==> Running it (you will be asked for the Pi password)"
echo
# -t gives sudo a terminal; stdin stays free because the script is a file.
ssh -t "$TARGET" "chmod +x /tmp/photobooth-printer.sh && /tmp/photobooth-printer.sh; rm -f /tmp/photobooth-printer.sh"
