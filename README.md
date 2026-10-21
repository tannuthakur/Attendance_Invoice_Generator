# Payroll & Invoicing API

A NestJS 10 REST API on Supabase (Postgres, Auth, Storage). Admins use it to manage employees, attendance and monthly salaries, and to generate pro-rata salary invoices as PDFs. It is written in plain JavaScript and compiled with Babel.

## Quick start

```bash
npm install
cp .env.example .env            # fill in the Supabase URL and keys

# Database: local
supabase init                   # once; keeps supabase/migrations
supabase start                  # prints the URL, anon key and service_role key
supabase db reset               # applies supabase/migrations

# Database: hosted
supabase link --project-ref <ref> && supabase db push

npm run create-admin -- admin@example.com 'StrongPassword!' "Ada Admin"
npm run start:dev               # http://localhost:3000/api/v1
```

| Script | What it does |
|---|---|
| `npm run start:dev` | Runs from `src/` with babel-node and reloads on change |
| `npm run build && npm start` | Compiles to `dist/` and runs it |
| `npm test` | Unit tests (pay calculator) and HTTP tests against a fake Supabase |
| `npm run test:e2e` | Full flow against a local Supabase; skipped when no keys are set |
| `npm run create-admin` | Creates or promotes the first admin. All user routes are admin-only, so you need this once |
| `npm run web:install` / `web:dev` / `web:build` | Installs, runs (http://localhost:5173) or builds the web UI in `web/` |

## Web UI

`web/` is a React 18 + Vite app in plain JavaScript. Start the API first, then run:

```bash
npm run web:install    # once
npm run web:dev        # http://localhost:5173 (proxies /api to :3000)
```

| Screen | What it does |
|---|---|
| Dashboard | Head counts, project count, invoices issued this month, recent invoices |
| Employees | Search and filter by status or project; add and edit employees; remove from role or put back on role |
| Employee page | Details, current salary and projects; salary history; a monthly attendance calendar (click a day to mark it); the employee's invoices |
| Projects | Billing cycle start day, weekend days and currency; assign employees or end an assignment; project holidays |
| Attendance | A grid of employees × days for a project's billing period. Pick a status, then click or drag across cells. Click a date to mark everyone, or "Fill" to mark one person's unmarked working days. Changes save in one batch |
| Holidays | Holidays by year, for all projects or one project |
| Invoices | Generate: pick employee, project and month, add allowances or deductions, preview, then issue. The list and detail pages download the PDF or void the invoice |
| Users | Invite by email or set a password; set the role; link a login to an employee |
| My profile | What normal users see: their account and their own employee record |

**Password reset links:** in Supabase, open Authentication → URL Configuration and add `http://localhost:5173/reset-password` (and your production URL) to the Redirect URLs. Otherwise the emailed link won't return to the app.

**Production:** run `npm run web:build`, set `VITE_API_URL` to the API's public origin at build time, and serve `web/dist` as a single-page app. Add the web origin to the API's `CORS_ORIGINS`.

## Project layout

```
src/
  main.js, app.module.js, config.js, config.module.js
  supabase/            SupabaseService: service-role client and a per-call anon client
  common/
    permissions.js     PERMISSIONS map: role → actions ('*', 'x', 'x:own')
    decorators.js      @Public, @Permission, @OwnedBy, @CurrentUser
    guards/            JwtAuthGuard → RolesGuard → OwnershipGuard (global, in that order)
    validation.pipe.js validated(Dto): whitelist + forbidNonWhitelisted + transform
    interceptors/      snake_case rows → camelCase JSON
    utils/             UTC date helpers, billing period, DB error mapping
  auth/ users/ employees/ projects/ attendance/ holidays/ salaries/
  invoices/
    pay-calculator.js  Pure pro-rata calculation (decimal.js, half-up rounding at the end)
    invoice-pdf.js     pdfkit renderer
    invoices.service.js
supabase/migrations/   Schema, RLS, triggers, invoice-number and issue_invoice functions, storage bucket
scripts/create-admin.js
test/app.e2e-spec.js
```

### Notes on NestJS in JavaScript

Babel does not emit TypeScript's `design:paramtypes` metadata, and it does not support parameter decorators. So:

- **Dependency injection** uses a class decorator: `@Dependencies(SupabaseService, APP_CONFIG)`.
- **Route params** use `@Bind(...)`, e.g. `@Bind(Param('id', ParseUUIDPipe), Body(validated(CreateEmployeeDto)))`.
- **Validation** passes the DTO class explicitly with `validated(Dto)`, because a global `ValidationPipe` cannot infer it.

## Auth and permissions

- `POST /auth/login` returns `accessToken` and `refreshToken`. Send `Authorization: Bearer <accessToken>` on every other request.
- Tokens are verified with `SUPABASE_JWT_SECRET` (HS256). If that is empty, they are checked by calling Supabase Auth. Leaving it empty supports projects on asymmetric signing keys.
- `POST /auth/forgot-password` always returns 200. The recovery email links to `PASSWORD_RESET_REDIRECT_URL`. The client then posts `{ accessToken | tokenHash, newPassword }` to `/auth/reset-password`.
- Normal users can read their own profile and employee record. Everything else is admin-only.
- To open a capability to normal users, add one entry to `PERMISSIONS`. For example, add `'attendance:write:own'` to let users mark their own attendance. The routes already declare `@OwnedBy(...)`, so the ownership guard limits each user to their own `employeeId`.

## Invoices

`POST /invoices` takes `{ employeeId, projectId, month: "2026-10" }`, or an explicit `periodStart`/`periodEnd`. It also accepts optional `adjustments: [{ type: "allowance" | "deduction", label, amount }]`.

```
gross = Σ over working days d of factor(d) × salary(d) / working days in period
net   = gross + allowances − deductions          (rounded half-up to 2 dp, at the end only)
```

- **Billing period:** taken from the project's `billingCycleStartDay`. With start day 21, month `2026-10` runs from 21 Sep to 20 Oct 2026.
- **Working days:** days that are not the project's weekend days and not holidays. Holidays can be global or project-specific.
- **Attendance factor:** present = 1, paid leave = 1, half day = 0.5, absent = 0. An unmarked day counts as 0 and is listed under `warnings`.
- **Which days can be paid:** only working days inside the employee's project assignment, and also inside the employee's joining and off-role dates.
- **Raises:** `salary(d)` is the row with the latest effective month on or before `d`, so a raise mid-period applies from its month.
- **Re-generating:** issuing another invoice for the same employee, project and period voids the old one. Both steps run in one transaction (the `issue_invoice` SQL function).
- **PDF storage:** PDFs go to the private `invoices` bucket. Responses include a signed URL valid for 10 minutes; `GET /invoices/:id/pdf` returns a fresh one.
- **Preview:** `POST /invoices/preview` runs the same calculation and saves nothing.
- **Errors:** a calculation that cannot be built returns `422`, with `error` set to one of `NOT_ASSIGNED`, `NO_SALARY`, `NO_WORKING_DAYS` or `MIXED_CURRENCY`.

Company details printed on the invoice come from `COMPANY_NAME`, `COMPANY_ADDRESS` and `COMPANY_EMAIL`. The default currency comes from `DEFAULT_CURRENCY`.

## IDs and managed lists

- **Employee IDs** are generated by the database and continue your numbering (01, 02, … → 05, 06, …). They can't be typed or changed.
- **Invoice numbers:** salary invoices are always automatic (`INV-YYYY-MM-NNNNNN`). Client invoices get the next S-number pre-filled; it can be edited.
- **Designations and project roles** come from managed lists, edited under **Roles & designations** (`GET/POST /options`, `PATCH/DELETE /options/:id`). Forms offer them as dropdowns with "+ Add new…".
- **Renaming** an entry can also update the employees or assignments that use it.
- **Deleting** an entry only removes it from the list; existing records keep the text.

## Paid status and deleting invoices

- **Mark as paid:** once payment is received, an issued invoice (client or salary) can be marked paid with the payment date, an optional reference and an optional note (`POST …/:id/pay`). **Mark as unpaid** reverts it (`POST …/:id/unpay`).
- **Protection:** a paid invoice can't be voided, and re-generating the same period is refused until it's marked unpaid.
- **Dashboard:** shows the number and total of unpaid client invoices.
- **Delete:** `DELETE /project-invoices/:id` and `DELETE /invoices/:id` permanently delete the invoice and remove its PDF from storage. The UI asks you to type the invoice number first. Prefer **Void** for invoices already sent; it keeps a record.

## Deleting employees and projects

`DELETE /employees/:id` and `DELETE /projects/:id` delete permanently. The UI first calls `GET …/usage` to show what will be removed, and you type the name to confirm.

- **Employee:** deletes their attendance, salary records, project assignments and void salary invoices, and unlinks any login (the account stays). It is refused while an issued salary invoice references them; void it first. Client invoices keep their frozen line text and amounts.
- **Project:** deletes its assignments, project-specific holidays and void invoices. It is refused while it has issued salary or client invoices.
- **Off-boarding:** use "Remove from role" to stop someone without losing history.

## Client (project) invoices

One invoice per project and billing period, with a line per employee, in the style of invoice S2534.

```
perDay = round(monthly rate ÷ calendar days in period)        (whole units; PROJECT_INVOICE_PER_DAY_DECIMALS)
amount = monthly rate − (days not on the project + leave days) × perDay
```

- **Rates:** the monthly rate comes from the employee's project assignment. Set it on the project page; anyone without a rate is listed as skipped.
- **Leave:** absent and paid leave count 1, a half day 0.5, and only working days count. Leave dates appear in the line text, e.g. "(2 Days Leave on 25th Sept & 5th Oct)".
- **Unmarked days:** unmarked working days are billed as worked and listed as a warning.
- **Line text:** each line reads "Payment for {role on project} {PROJECT_INVOICE_NAME_PREFIX}{first name}". It can be edited before generating. Employees can be excluded, and extra lines (such as costs or discounts) added.
- **Numbering:** the number box is pre-filled with the next S-number: the highest S-number used + 1, never below `PROJECT_INVOICE_START_NUMBER` (2535). It can be edited, and must be unique. An issued invoice can be renumbered (`PATCH /project-invoices/:id`); its PDF is regenerated from the stored snapshot.
- **Dates:** the due date defaults to the 5th of the next month (`PROJECT_INVOICE_DUE_DAY`).
- **PDF contents:** company details, bank details, logo (`assets/logo.png`) and signature (`assets/signature.png`) come from `.env`. The signature image is not in the repo (`.gitignore`); place your own PNG at `assets/signature.png`. Without it, the PDF has no signature. The project's client contact and invoice title fill the "To" line and the heading.
- **Re-generating** the same project and period voids the previous invoice.
- **PDF layout:** the PDF reproduces invoice S2534: DejaVu Sans (bundled in `assets/fonts`), superscript ordinals, the same table geometry, and page breaks for long invoices.
- **Preview and download:** "Preview PDF" shows the PDF in the app, with Download and Open-in-new-tab buttons. On the generator page it previews the draft with the real invoice number, without saving anything (`POST /project-invoices/preview/pdf`). Files download as `INVOICE <number>.pdf`.
- **Line order:** reorder lines with ↑/↓ before generating. The order is remembered per project in the browser and sent as `order`.

Endpoints: `GET /project-invoices/next-number`, `POST /project-invoices/preview`, `POST /project-invoices/preview/pdf`, `POST /project-invoices`, `PATCH /project-invoices/:id`, `GET /project-invoices`, `GET /project-invoices/:id`, `GET /project-invoices/:id/pdf[?download=1]`, `POST /project-invoices/:id/void`.

## API

All routes are under `/api/v1`.

| Route | Access |
|---|---|
| `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password` | Public (login, forgot and reset are limited to 5 requests per minute per IP) |
| `GET /auth/me` | Any signed-in user |
| `GET/POST /users`, `PATCH /users/:id/role` | Admin |
| `GET /employees` (`status`, `search`, `projectId`, `department`, `designation`, `joinedFrom`, `joinedTo`, `page`, `limit`), `GET /employees/facets` | Admin |
| `GET /employees/:id` | Admin, or the employee themself |
| `POST /employees`, `PATCH /employees/:id`, `PATCH /employees/:id/status`, `GET /employees/:id/usage`, `DELETE /employees/:id` | Admin |
| `GET/POST /projects`, `GET/PATCH /projects/:id`, `GET/POST /projects/:id/assignments`, `PATCH /projects/:id/assignments/:assignmentId`, `GET /projects/:id/usage`, `DELETE /projects/:id` | Admin |
| `POST /attendance`, `POST /attendance/bulk`, `GET /attendance?from&to[&employeeId][&projectId]` | Admin |
| `GET/POST /holidays`, `DELETE /holidays/:id` | Admin |
| `GET/POST /salaries` | Admin |
| `POST /invoices`, `POST /invoices/preview`, `GET /invoices`, `GET /invoices/:id`, `GET /invoices/:id/pdf`, `POST /invoices/:id/void` | Admin |

## Deploy to Vercel

The repo deploys as **one Vercel project**. The React app is served as static files from `web/dist`. The API runs as a serverless function (`api/index.js` → `dist/serverless.js`) under `/api/v1`. Both share one domain, so leave `VITE_API_URL` empty. `vercel.json` holds the build and install commands, the function settings and the rewrites.

1. Import the GitHub repo in Vercel (Framework preset: **Other**), or run `npx vercel` from the project folder.
2. Add the environment variables from `.env` under Project → Settings → Environment Variables, then change these:
   - `TRUST_PROXY=1`
   - `CORS_ORIGINS=https://<your-app>.vercel.app`
   - `PASSWORD_RESET_REDIRECT_URL=https://<your-app>.vercel.app/reset-password`, and the same for `INVITE_REDIRECT_URL` with `/accept-invite`
   - `COMPANY_SIGNATURE_PATH=storage:branding/signature.png`. The signature isn't in the repo; upload it to the private `invoices` bucket at `branding/signature.png`.
3. In Supabase, open Authentication → URL Configuration. Set the Site URL to the Vercel URL and add `https://<your-app>.vercel.app/reset-password` to Redirect URLs.

Rate limiting is kept in memory, per function instance.

## Deploy with Docker

```bash
docker build -t payroll-api .
docker run -p 3000:3000 --env-file .env payroll-api
```

Set `TRUST_PROXY=1` behind a load balancer (Render, Fly, Cloud Run) so rate limiting sees real client IPs. Keep `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` in server env vars only.
