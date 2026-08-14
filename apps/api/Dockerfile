FROM node:22-alpine AS base
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
RUN npm run build -w @notification-platform/api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
