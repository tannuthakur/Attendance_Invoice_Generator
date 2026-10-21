/**
 * End-to-end flow against a real local Supabase (`supabase start` + migrations applied).
 * Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in the environment (or .env).
 *   npm run test:e2e
 */
require('reflect-metadata');
require('dotenv').config();

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { AppModule } = require('../src/app.module');

const RUN = `${Date.now()}`;
const ADMIN = { email: `admin-${RUN}@e2e.test`, password: 'E2e-Password-1!' };

const describeIfSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfSupabase('Payroll API (e2e, local Supabase)', () => {
  let app;
  let http;
  let auth;
  const ids = {};

  beforeAll(async () => {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      realtime: { transport: ws },
    });
    const { data, error } = await admin.auth.admin.createUser({ ...ADMIN, email_confirm: true });
    if (error) throw error;
    const { error: roleError } = await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
    if (roleError) throw roleError;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(() => app?.close());

  const api = (method, path) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${auth}`);

  it('logs in', async () => {
    const res = await request(http).post('/api/v1/auth/login').send(ADMIN).expect(200);
    expect(res.body.user.role).toBe('admin');
    auth = res.body.accessToken;
  });

  it('sets up an employee, project, assignment, salary and holiday', async () => {
    ids.employee = (
      await api('post', '/employees')
        .send({ fullName: `E2E Employee ${RUN}`, designation: 'Engineer', dateOfJoining: '2026-01-01' })
        .expect(201)
    ).body.id;

    ids.project = (
      await api('post', '/projects')
        .send({ name: `E2E Project ${RUN}`, clientName: 'Acme', billingCycleStartDay: 21, weekendDays: [0, 6] })
        .expect(201)
    ).body.id;

    await api('post', `/projects/${ids.project}/assignments`)
      .send({ employeeId: ids.employee, startDate: '2026-01-01' })
      .expect(201);
    await api('post', '/salaries')
      .send({ employeeId: ids.employee, month: '2026-01', monthlyAmount: 60000, currency: 'INR' })
      .expect(201);
    await api('post', '/holidays').send({ date: '2026-10-02', name: 'Gandhi Jayanti', projectId: ids.project }).expect(201);
  });

  it('bulk-marks attendance for the worked example', async () => {
    const days = [];
    for (let d = new Date('2026-09-21T00:00:00Z'); d <= new Date('2026-10-20T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (![0, 6].includes(d.getUTCDay()) && iso !== '2026-10-02') days.push(iso);
    }
    const marks = days.map((date, i) => ({
      employeeId: ids.employee,
      date,
      status: i < 18 ? 'present' : ['half_day', 'paid_leave', 'absent'][i - 18],
    }));
    const res = await api('post', '/attendance/bulk').send({ marks }).expect(201);
    expect(res.body.count).toBe(21);
  });

  it('issues, re-issues and voids invoices', async () => {
    const body = {
      employeeId: ids.employee,
      projectId: ids.project,
      month: '2026-10',
      adjustments: [
        { type: 'allowance', label: 'Travel', amount: 2000 },
        { type: 'deduction', label: 'Advance', amount: 500 },
      ],
    };

    const preview = await api('post', '/invoices/preview').send(body).expect(200);
    expect(preview.body).toMatchObject({ workingDays: 21, payableDays: 19.5, grossAmount: '55714.29', netAmount: '57214.29' });

    const first = await api('post', '/invoices').send(body).expect(201);
    expect(first.body.invoice.invoiceNumber).toMatch(/^INV-2026-10-\d{6}$/);
    expect(first.body.pdfUrl.url).toContain('token=');

    // Re-generating the same period voids the previous invoice.
    const second = await api('post', '/invoices').send(body).expect(201);
    const old = await api('get', `/invoices/${first.body.invoice.id}`).expect(200);
    expect(old.body.status).toBe('void');

    const pdf = await api('get', `/invoices/${second.body.invoice.id}/pdf`).expect(200);
    const download = await fetch(pdf.body.pdfUrl.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    await api('post', `/invoices/${second.body.invoice.id}/void`).expect(200);
    await api('post', `/invoices/${second.body.invoice.id}/void`).expect(409);
  });

  it('removes an employee from role without deleting them', async () => {
    const res = await api('patch', `/employees/${ids.employee}/status`)
      .send({ status: 'off_role', effectiveDate: '2026-10-31' })
      .expect(200);
    expect(res.body).toMatchObject({ employmentStatus: 'off_role', offRoleDate: '2026-10-31' });
  });
});
