# Local development

Copy `.env.example` to `.env`, set long unique values for `JWT_SECRET` and
`API_KEY_PEPPER`, then start PostgreSQL, Redis, and Mailpit. If the default
ports are occupied, change `POSTGRES_PORT`, `REDIS_PORT`, and the matching host
parts of `DATABASE_URL`/`REDIS_URL` together:

```bash
docker compose up -d postgres redis mailpit
npm install
npm run prisma:generate
npx prisma db push --schema prisma/schema.prisma
npm run prisma:seed
npm run dev
```

The API runs at `http://localhost:3000`, with its API reference at `/docs`, the dashboard at
`http://localhost:3001`, and Mailpit at `http://localhost:8025`. The dashboard sends browser
traffic to its same-origin `/api/proxy/*` route; that route uses `API_INTERNAL_URL` to reach the API.

For a container-only startup, run `cp .env.example .env`, replace the secrets,
then use `docker compose up --build`.
