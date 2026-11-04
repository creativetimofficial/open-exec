# Open Exec: the app (UI, tool layer, lite runtime). Hermes runs as its own
# container; see docker-compose.yml.
FROM node:24.22.0-bookworm-slim AS deps
WORKDIR /repo
RUN npm install --global pnpm@10.34.7
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kit/package.json packages/kit/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM node:24.22.0-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/app/data
COPY --from=build /repo/.next/standalone ./
COPY --from=build /repo/.next/static ./.next/static
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
