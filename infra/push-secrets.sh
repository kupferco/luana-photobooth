#!/usr/bin/env bash
#
# Push local secrets into Secret Manager for one environment.
#
#   infra/push-secrets.sh <staging|prod> [path-to-env-file]
#
# Cloud Run mounts these as environment variables, so nothing sensitive is
# baked into an image, passed on a command line, or visible in a build log.
#
# Values are piped straight from the file into gcloud and never echoed. The
# script prints names and versions only.

set -euo pipefail

ENV_NAME="${1:-}"
ENV_FILE="${2:-services/api/.env}"
PROJECT="photolu"

case "$ENV_NAME" in
  staging|prod) ;;
  *) echo "Usage: infra/push-secrets.sh <staging|prod> [env-file]" >&2; exit 2 ;;
esac

[[ -f "$ENV_FILE" ]] || { echo "No env file at $ENV_FILE" >&2; exit 1; }

# Secret name in Secret Manager <- variable name in the env file.
declare -a PAIRS=(
  "photolu-database-url-$ENV_NAME:DATABASE_URL"
  "photolu-jwt-secret-$ENV_NAME:JWT_SECRET"
  "photolu-resend-key-$ENV_NAME:RESEND_API_KEY"
)

read_var() {
  # Last assignment wins, quotes stripped, everything after '=' kept so a
  # connection string containing '=' survives intact.
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//'
}

for pair in "${PAIRS[@]}"; do
  secret="${pair%%:*}"
  var="${pair##*:}"
  value="$(read_var "$var")"

  if [[ -z "$value" ]]; then
    echo "  skip  $secret  ($var not set in $ENV_FILE)"
    continue
  fi

  if ! gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --project "$PROJECT" --replication-policy=automatic >/dev/null
    echo "  created  $secret"
  fi

  version=$(printf '%s' "$value" \
    | gcloud secrets versions add "$secret" --project "$PROJECT" --data-file=- \
      --format='value(name)')
  echo "  updated  $secret  -> version ${version##*/}"
done

echo
echo "Granting the Cloud Run runtime service account access..."
SA="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for pair in "${PAIRS[@]}"; do
  secret="${pair%%:*}"
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT" \
    --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor \
    >/dev/null 2>&1 || true
done
echo "  done for $SA"
