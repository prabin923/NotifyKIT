FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/workers/package.json apps/workers/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build -w @notification-platform/workers
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/workers/src/main.ts"]
