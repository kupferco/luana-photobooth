#!/usr/bin/env bash
#
# Deploy the API, the web client, or both, to staging, prod, or both.
#
#   infra/deploy.sh <front|back|both> <staging|prod|both>
#
# Reached through the npm scripts rather than run directly:
#
#   npm run deploy                  both -> staging   (the safe default)
#   npm run deploy:staging          both -> staging
#   npm run deploy:prod             both -> prod
#   npm run deploy:both             both -> staging, then prod
#   npm run deploy:front:prod       client only -> prod
#   npm run deploy:back:staging     API only -> staging
#
# Deploying to prod asks for confirmation, unless CONFIRM=yes is set. There is
# a real party running on prod; an accidental deploy mid-event is a bad way to
# find out the difference between the two.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/infra/environments.json"

TARGET="${1:-both}"
ENVS="${2:-staging}"

PROJECT=$(node -p "require('$CONFIG').project")
REGION=$(node -p "require('$CONFIG').region")

cfg() { node -p "require('$CONFIG').environments['$1']['$2']"; }

case "$TARGET" in
  front|back|both) ;;
  *) echo "Target must be front, back or both — got '$TARGET'." >&2; exit 2 ;;
esac

case "$ENVS" in
  staging) ENV_LIST=(staging) ;;
  prod)    ENV_LIST=(prod) ;;
  both)    ENV_LIST=(staging prod) ;;
  *) echo "Environment must be staging, prod or both — got '$ENVS'." >&2; exit 2 ;;
esac

confirm_prod() {
  [[ "${CONFIRM:-}" == "yes" ]] && return 0
  echo
  echo "  About to deploy $TARGET to PRODUCTION ($(cfg prod webUrl))."
  read -r -p "  Type 'prod' to continue: " answer
  [[ "$answer" == "prod" ]] || { echo "  Cancelled."; exit 1; }
}

deploy_back() {
  local env="$1"
  local service; service=$(cfg "$env" service)
  local min; min=$(cfg "$env" minInstances)
  local suffix; suffix=$(cfg "$env" secretSuffix)

  echo "==> API -> $service ($env)"

  # Secrets stay in Secret Manager and are mounted as env vars; they are never
  # baked into the image and never passed on the command line, where they would
  # land in shell history and in the Cloud Build log.
  gcloud run deploy "$service" \
    --source "$ROOT" \
    --project "$PROJECT" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --service-account "photolu-api@$PROJECT.iam.gserviceaccount.com" \
    --min-instances "$min" \
    --max-instances 10 \
    --cpu 1 \
    --memory 1Gi \
    --timeout 120 \
    --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=$PROJECT,GCS_BUCKET=photolu-media,RESEND_FROM=Photo Booth <noreply@kupfer.co>" \
    --set-secrets "DATABASE_URL=photolu-database-url-$suffix:latest,JWT_SECRET=photolu-jwt-secret-$suffix:latest,RESEND_API_KEY=photolu-resend-key-$suffix:latest"
}

deploy_front() {
  local env="$1"
  local target; target=$(cfg "$env" hostingTarget)
  local api; api=$(cfg "$env" apiUrl)

  echo "==> Client -> $(cfg "$env" hostingSite) ($env)"

  # Baked in at build time, so each environment gets its own bundle rather
  # than discovering the backend at runtime -- a staging build cannot talk to
  # production.
  #
  # Deployed builds always use the real API. Fixtures are a local development
  # convenience for designing screens, not something to ship to a URL someone
  # might mistake for the product.
  EXPO_PUBLIC_API_URL="$api" \
  EXPO_PUBLIC_API_MODE="live" \
  EXPO_PUBLIC_GUEST_URL="$(cfg "$env" guestUrl)" \
    npm run build:web --workspace @photobooth/mobile

  # The guest page is its own bundle and its own site: it is the only thing a
  # stranger loads, and keeping it out of the Expo export is what keeps it
  # 66 KB rather than 305 KB.
  local guestTarget; guestTarget=$(cfg "$env" guestTarget)
  echo "==> Guest -> $(cfg "$env" guestUrl) ($env)"
  VITE_API_URL="$api" npm run build --workspace @photobooth/guest

  firebase deploy --only "hosting:$target,hosting:$guestTarget" --project "$PROJECT"
}

for env in "${ENV_LIST[@]}"; do
  [[ "$env" == "prod" ]] && confirm_prod

  case "$TARGET" in
    back)  deploy_back "$env" ;;
    front) deploy_front "$env" ;;
    both)  deploy_back "$env"; deploy_front "$env" ;;
  esac
done

echo
echo "Done."
for env in "${ENV_LIST[@]}"; do
  echo "  $env  web: $(cfg "$env" webUrl)"
  echo "        api: $(cfg "$env" apiUrl)"
done
