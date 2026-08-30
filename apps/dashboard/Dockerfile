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
ARG NEXT_PUBLIC_API_URL=/api/proxy
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build -w @notification-platform/dashboard
RUN mkdir -p apps/dashboard/.next/standalone/apps/dashboard/.next \
  && cp -R apps/dashboard/.next/static apps/dashboard/.next/standalone/apps/dashboard/.next/static

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Next.js standalone output already prunes node_modules to production-only,
# so the runtime image only needs that self-contained tree. Keep it at the
# same nested path the build produced it at, since server.js and its
# node_modules resolve relative to that layout.
COPY --chown=node:node --from=build /app/apps/dashboard/.next/standalone ./apps/dashboard/.next/standalone
USER node
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/dashboard/.next/standalone/apps/dashboard/server.js"]
