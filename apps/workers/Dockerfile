FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/workers/package.json apps/workers/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build -w @notification-platform/workers

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Workers are not compiled (their build script only typechecks), so the
# runtime image ships tsx plus the TypeScript source directly.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/apps/workers/package.json ./apps/workers/package.json
COPY --chown=node:node --from=build /app/apps/workers/tsconfig.json ./apps/workers/tsconfig.json
COPY --chown=node:node --from=build /app/apps/workers/src ./apps/workers/src
USER node
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/workers/src/main.ts"]
