# Build and runtime for the Cloud Run API.
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

# sharp ships platform-specific binaries, so it is installed here rather than
# bundled. Everything else the API needs is inside dist/index.js.
COPY services/api/package.json ./
RUN npm install sharp@^0.33.5 --omit=dev --no-package-lock --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /app/services/api/dist ./dist

# Cloud Run supplies PORT; the default matches local development.
ENV PORT=8080
EXPOSE 8080

# Run as a non-root user. node:22-slim ships one.
USER node

CMD ["node", "dist/index.js"]
