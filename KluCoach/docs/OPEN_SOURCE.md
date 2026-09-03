# Open-source dependencies

Governance for KluCoach. Prefer MIT / Apache-2.0 / BSD / ISC. Do not clone third-party apps. Domain logic (tenancy, Student 360, import authorization, partner pricing) stays in-repo.

**Update strategy:** `pnpm` lockfile; review major upgrades; run Vitest isolation + Playwright smoke after dependency bumps.

Versions below are the ranges currently declared in workspace `package.json` files (2026-09-01). Pin exact builds via the lockfile.

---

## Selected

| Dependency | Version | Purpose | License | Why used | Risk | Removal difficulty |
| ---------- | ------- | ------- | ------- | -------- | ---- | ------------------ |
| zod | ^3.25.76 | API + form validation | MIT | Single schema language | Low | Medium (wired everywhere) |
| @fastify/helmet | ^13.0.2 | Security headers | MIT | Official Fastify plugin | Low | Low |
| @fastify/rate-limit | ^10.3.0 | Abuse protection | MIT | Official Fastify plugin | Low | Low |
| argon2 | ^0.41.1 | Password hashing | MIT / dual native | Spec requirement | Native build | Medium |
| nodemailer | ^7.0.6 | SMTP transport | MIT | Production `EmailTransport` when `SMTP_HOST` is set; tests use memory | Misconfigured SMTP | Low |
| @tanstack/react-table | ^9.2.4 | Headless tables | MIT | Sorting/pagination without owning grid code | v9 API differs from v8 | Medium (one DataTable wrapper) |
| @tanstack/react-query | ^5.102.8 | Server-state cache | MIT | Students list; later dashboards | Misuse as auth | Low–medium |
| react-hook-form | ^7.87.0 | Form state | MIT | Login + future admin/parent forms | Low | Medium |
| @hookform/resolvers | ^5.9.1 | RHF + Zod | MIT | Shared `loginSchema` | Low | Low |
| lucide-react | ^1.37.0 | Icons | ISC | Nav icons; keep visible text | Low | Low |
| date-fns | ^4.4.0 | Dates/times | MIT | Timetable `hhmm` | Low | Low |
| recharts | ^3.10.1 | Charts | MIT | Parent attendance mix only | Bundle size | Low (route-level import) |
| papaparse | ^5.7.0 | CSV parse | MIT | Parse port only | Parse-only | Low |
| exceljs | ^4.4.0 | XLSX parse | MIT | Import without SheetJS | Heavy; **API-only**; stale transitives | Low (parse port) |
| class-variance-authority | ^0.7.1 | shadcn variants | Apache-2.0 | Primitive styling | Low | Low |
| clsx / tailwind-merge | ^2.1.1 / ^3.6.0 | `cn()` | MIT | Class composition | Low | Low |
| @radix-ui/react-slot | ^1.3.3 | Button asChild | MIT | shadcn primitive | Low | Low |
| @radix-ui/react-label | ^2.1.15 | Label primitive | MIT | shadcn primitive | Low | Low |
| tailwindcss + @tailwindcss/vite | ^4.3.3 | Utility CSS | MIT | shadcn utilities **without preflight** | Medium if preflight enabled | Medium |

shadcn/ui itself is **copied source** (MIT), not an npm runtime. Primitives live in `apps/web/src/ui/`. Theme tokens stay KluCoach (ink `#0f2a24` / saffron `#d97706` / paper `#f4efe6`).

Canonical table: `apps/web/src/ui/DataTable.tsx` (TanStack Table v9 `createTableHook` / `useAppTable` / `table.FlexRender`).

Admin lists (Students, Parents, Teachers, Batches) configure that one component. Server-side `page`, `q`, `sort`, `dir`, and filters are authoritative. Frontend filtering is not a security boundary.

Canonical form pattern: `apps/web/src/ui/form.tsx` + domain Zod schemas in `@klunex-edu/shared` (example: login via `loginSchema`).

Import parse port: `apps/api/src/platform/import/parseSpreadsheet.ts`. Validation: `validateStudentImport.ts`. Authorization remains in `ops-routes.ts`.

---

## Rejected or deferred

| Candidate | Decision | Why |
|-----------|----------|-----|
| Next.js shadcn SaaS dashboard starter | **Rejected** | Would import someone else's auth/tenancy/billing. Study patterns only. |
| AG Grid | Rejected | Heavier; community license constraints vs MIT headless table |
| Clerk / Auth.js / Supabase Auth | **Rejected** | Would replace tenant-aware session model |
| BullMQ + Redis | **Rejected for Phase 6** | PostgreSQL `job_runs` + worker process is enough; no Redis cost |
| Razorpay Node SDK | **Rejected** | HTTPS + HMAC in `RazorpayPaymentProvider`; domain must not import SDK types |
| TipTap | **Not yet** | Notices are plain text in MVP |
| SheetJS `xlsx` | Rejected | ExcelJS is MIT and sufficient |
| Redux / Zustand as source of truth | Rejected | Server + TanStack Query |
| Kubernetes / Kafka / Elasticsearch | Rejected | Cost and ops vs ₹500/student |

---

## Security notes

- Helmet is registered (CSP disabled for cookie SPA; revisit at HTTPS deploy).
- Rate limit: global 300/min in production; **stricter** on login (10), register (5), invite accept (10), invite create (20), password reset (5), payment start (10), import preview (20). `/health`, `/ready`, and `/webhooks/*` are allow-listed. Vitest uses a 10_000 ceiling so isolation suites do not 429. HTTP 429 was executed in `rateLimits.test.ts`.
- Papa Parse / ExcelJS never authorize; jobs are `institutionId`-scoped. Commit is a transaction and **does not silently skip** invalid rows.
- Do not put ExcelJS in the parent PWA bundle.

---

## Transitive (watch)

| Package | Why it matters |
|---------|----------------|
| argon2 native bindings | Must rebuild on Node upgrades (`onlyBuiltDependencies`) |
| prisma engines | Same |
| recharts → d3 | Size; imported only on parent dashboard |
| exceljs → fstream / glob@7 / uuid@8 | Deprecated transitives; keep ExcelJS API-only and review on upgrade |

---

## TanStack Table (v9)

Do **not** use v8 `useReactTable` + `getCoreRowModel` examples. Current API:

- `tableFeatures({ ... })`
- `useTable` / `createTableHook` → `useAppTable`
- `table.FlexRender`
- Explicit feature registration (`rowSortingFeature`, `rowPaginationFeature`, sorted/paginated row models)

Agent guidance is version-matched in `apps/web/node_modules/@tanstack/react-table/skills/`.
