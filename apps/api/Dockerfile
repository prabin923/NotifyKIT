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
RUN npm run build -w @notification-platform/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The api CMD is overridden by docker-compose with `prisma db push` / the
# `migrate` service runs `prisma migrate deploy` against this same image, so
# the runtime image must keep the prisma CLI, schema, and migrations.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
