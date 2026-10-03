#!/usr/bin/env bash
#
# Finding the Pi, and saying something useful when it cannot be found.
#
# Sourced by pi-status.sh, pi-deploy.sh and pi-setup.sh. Not run directly.
#
# The scripts used to hard-default to one name. That was fine until the
# rename: the default became lumina@lumina.local while the Pi on the shelf
# had been set up before it and still answered to photolu.local. Every
# script then reported "cannot reach", which is true of that name and quite
# wrong about the Pi, and sent whoever read it looking for a hardware fault
# that did not exist.
#
# So: try the names a Pi might have, and when none of them work, say which
# part failed. "The Pi is up and your key is not on it" and "nothing
# answered" are different problems with different fixes, and a script that
# prints the same line for both is wasting somebody's evening.

# Names a Pi set up by this repo might answer to, newest first.
PI_HOST_CANDIDATES="${PI_HOST_CANDIDATES:-lumina.local photolu.local raspberrypi.local}"
PI_USER_CANDIDATES="${PI_USER_CANDIDATES:-lumina photolu pi}"

# One SSH attempt, classified. Echoes: ok | auth | refused | unreachable
pi_probe() {
  local target="$1" err
  err="$(ssh -o BatchMode=yes -o ConnectTimeout=6 \
             -o StrictHostKeyChecking=accept-new \
             "$target" true 2>&1)" && { echo ok; return; }

  case "$err" in
    # The host is there and talking SSH; it just will not let us in. That is
    # a key problem, not a Pi problem, and worth saying differently.
    *"Permission denied"*|*"Too many authentication failures"*) echo auth ;;
    *"Connection refused"*)                                      echo refused ;;
    *)                                                           echo unreachable ;;
  esac
}

# Prints "user@host" on stdout. Returns 1 with a diagnosis on stderr.
#
# An explicit argument or $PI_HOST wins and is never probed: if somebody
# names a host, guessing a different one behind their back is worse than
# failing at the one they asked for.
resolve_pi_host() {
  local explicit="${1:-${PI_HOST:-}}"
  if [ -n "$explicit" ]; then
    echo "$explicit"
    return 0
  fi

  local host user result
  # Remembered across the host loop so the failure can distinguish "nothing
  # answered" from "something answered and refused us".
  local saw_auth=""

  for host in $PI_HOST_CANDIDATES; do
    for user in $PI_USER_CANDIDATES; do
      result="$(pi_probe "$user@$host")"
      case "$result" in
        ok)
          echo "$user@$host"
          # Said on stderr so it cannot end up inside the value callers
          # capture, and only when it is not the name they would expect.
          [ "$user@$host" = "lumina@lumina.local" ] ||
            echo "Found the Pi at $user@$host." >&2
          return 0
          ;;
        auth|refused) saw_auth="$user@$host" ;;
      esac
    done
  done

  {
    if [ -n "$saw_auth" ]; then
      echo "The Pi is up at ${saw_auth#*@}, but no login worked."
      echo
      echo "  It answered on SSH and refused the key, so this is not a Pi fault."
      echo "  - Log in once with a password:  ssh ${saw_auth}"
      echo "  - Then put your key on it:      ssh-copy-id ${saw_auth}"
      echo "  - Or name the right user:       PI_HOST=<user>@${saw_auth#*@} <command>"
    else
      echo "Nothing answered on any of: $PI_HOST_CANDIDATES"
      echo
      echo "  - Is it powered up? A steady red light means power, green means the card."
      echo "  - On the same network as this Mac? .local names do not cross networks."
      echo "  - If it was mid-onboarding it advertises its own wifi network instead,"
      echo "    named as three words from the printer's card."
      echo "  - Known the address? PI_HOST=user@192.168.1.50 <command>"
    fi
  } >&2
  return 1
}
