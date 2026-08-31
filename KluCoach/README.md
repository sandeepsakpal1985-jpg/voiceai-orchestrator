# KluCoach

**Student 360 for coaching institutes.**

KluCoach is the first commercial product on the **KluNex Education Platform** — a reusable core for coaching, school, and college later. This repository is greenfield; it does not copy KluCare or KluChat.

## Stack

- TypeScript, React (Vite), Fastify
- PostgreSQL + Prisma
- Zod, Argon2, session cookies
- Vitest, Playwright
- Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose up postgres -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3100

Demo logins (password `DemoPassw0rd!`):

| Role | Email |
|------|--------|
| Admin | admin@example.test |
| Teacher | teacher@example.test |
| Parent | parent@example.test |
| Student | student@example.test |

Never use real personal data in seed.

## Docs

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Privacy](docs/PRIVACY.md)
- [Progress](docs/PROGRESS.md)
