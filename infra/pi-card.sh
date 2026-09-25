#!/usr/bin/env bash
#
# Open the setup card for printing.
#
#   infra/pi-card.sh [user@host]
#
# If the Pi is reachable and has been paired, its name is printed on the
# card, so the sticker on the box matches what the app calls it. That is the
# whole point of the name: knowing which of two identical black cases the
# dashboard is talking about.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-${PI_HOST:-photolu@photolu.local}}"
CARD="$ROOT/infra/printer-card.html"
OUT="$ROOT/infra/printer-card.generated.html"

NAME="$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$TARGET" \
  'cat /var/lib/photobooth/device-name 2>/dev/null' 2>/dev/null || true)"

if [ -n "$NAME" ]; then
  echo "==> This printer is called: $NAME"
  # Substituted rather than fetched at print time: the card has to work on a
  # laptop with no Pi in front of it.
  sed "s|<!--NAME-->|<p class=\"name\">$NAME</p>|" "$CARD" > "$OUT"
else
  echo "==> Pi not reachable, or not paired yet — printing a card with no name"
  echo "    (set it up first, then run this again to get a named card)"
  cp "$CARD" "$OUT"
fi

echo "==> Opening for printing"
open "$OUT" 2>/dev/null || xdg-open "$OUT" 2>/dev/null || echo "    open $OUT"
