FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .

# Clarity's project id is compiled into the bundle (Vite inlines VITE_* at build time), so it has
# to arrive as a build arg — a Fly *secret* would only exist at runtime, long after this ran. It is
# not secret in any case: the browser fetches clarity.ms/tag/<id>, so it is visible to anyone who
# opens devtools. Empty by default, which leaves analytics switched off (see utils/analytics.ts).
ARG VITE_CLARITY_ID=""
ENV VITE_CLARITY_ID=$VITE_CLARITY_ID
RUN npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=server --include-workspace-root

COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist

EXPOSE 8080
ENV PORT=8080
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
