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
ARG NEXT_PUBLIC_API_URL=/api/proxy
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build -w @notification-platform/dashboard
RUN mkdir -p apps/dashboard/.next/standalone/apps/dashboard/.next \
  && cp -R apps/dashboard/.next/static apps/dashboard/.next/standalone/apps/dashboard/.next/static
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/dashboard/.next/standalone/apps/dashboard/server.js"]
