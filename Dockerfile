# Build and runtime for the Cloud Run API.
#
# Lives at the repository root because `gcloud run deploy --source .` looks
# for it here, and the build needs the whole workspace anyway: the API is
# compiled against packages/shared from source.
#
# The app is bundled by tsup into a single file, so the runtime image needs
# almost no node_modules -- only packages with native binaries, which cannot be
# bundled. That keeps the image small and the cold start short, and cold start
# is what a guest waits on when they scan the QR.

FROM node:22-slim AS build
WORKDIR /app

# Manifests first so the dependency layer caches across source changes.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui-tokens/package.json ./packages/ui-tokens/
COPY services/api/package.json ./services/api/
RUN npm ci --ignore-scripts

COPY packages ./packages
COPY services/api ./services/api
RUN npm run build --workspace @photobooth/api


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# A minimal manifest, written here rather than copied from the workspace.
# The workspace package.json lists sibling packages like @photobooth/shared,
# which npm would try to fetch from the public registry and fail on -- they
# are already inside dist/index.js. "type": "module" because tsup emits ESM.
#
# Two packages are not bundled: sharp ships platform-specific binaries, and
# @google-cloud/storage resolves auth plugins at runtime. Everything else is
# inside dist/index.js.
RUN printf '{"name":"photolu-api","private":true,"type":"module"}' > package.json \
 && npm install sharp@^0.33.5 @google-cloud/storage@^8.2.0 \
      --omit=dev --no-package-lock --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /app/services/api/dist ./dist

# Cloud Run supplies PORT; the default matches local development.
ENV PORT=8080
EXPOSE 8080

# Run as a non-root user. node:22-slim ships one.
USER node

CMD ["node", "dist/index.js"]
