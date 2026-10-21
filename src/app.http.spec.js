import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AppModule } from './app.module';
import { SupabaseService } from './supabase/supabase.service';
import { fakeSupabase, eqOf, ok } from './test-utils/fake-supabase';
import { eachDay, dayOfWeek } from './common/utils/dates';

const SECRET = 'test-jwt-secret';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';

const PROFILES = {
  [ADMIN_ID]: { id: ADMIN_ID, email: 'admin@test.dev', full_name: 'Ada Admin', role: 'admin', employee_id: null },
  [USER_ID]: { id: USER_ID, email: 'user@test.dev', full_name: 'Uma User', role: 'user', employee_id: EMPLOYEE_ID },
};
const EMPLOYEE = {
  id: EMPLOYEE_ID, employee_code: 'EMP-001', full_name: 'Uma User', designation: 'Engineer',
  department: 'Platform', date_of_joining: '2025-04-01', employment_status: 'on_role', off_role_date: null,
};
const PROJECT = {
  id: PROJECT_ID, name: 'Atlas', client_name: 'Acme Corp', billing_cycle_start_day: 21,
  weekend_days: [0, 6], currency: 'INR',
};

// Worked example: 21 Sep → 20 Oct 2026, 2 Oct holiday → 21 working days;
// 18 present, 1 half day, 1 paid leave, 1 absent.
const workingDays = eachDay('2026-09-21', '2026-10-20').filter((d) => ![0, 6].includes(dayOfWeek(d)) && d !== '2026-10-02');
const ATTENDANCE = workingDays.map((date, i) => ({
  date,
  status: i < 18 ? 'present' : ['half_day', 'paid_leave', 'absent'][i - 18],
}));

const token = (sub) => `Bearer ${jwt.sign({ sub, aud: 'authenticated' }, SECRET, { expiresIn: '1h' })}`;

describe('HTTP API (fake Supabase)', () => {
  let app;
  let supabase;

  beforeAll(async () => {
    Object.assign(process.env, {
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      SUPABASE_JWT_SECRET: SECRET,
      COMPANY_NAME: 'Test Co',
    });

    supabase = fakeSupabase({
      tables: {
        profiles: (calls) => ok(PROFILES[eqOf(calls, 'id')] ?? null),
        employees: (calls) => {
          const id = eqOf(calls, 'id');
          if (calls.some(([m]) => m === 'range')) return { data: [EMPLOYEE], count: 1, error: null };
          return ok(id === EMPLOYEE_ID ? { ...EMPLOYEE, assignments: [] } : null);
        },
        projects: (calls) => ok(eqOf(calls, 'id') === PROJECT_ID ? PROJECT : null),
        salaries: (calls) =>
          calls.some(([m]) => m === 'maybeSingle')
            ? ok({ effective_month: '2026-01-01', monthly_amount: 60000, currency: 'INR' })
            : ok([{ effective_month: '2026-01-01', monthly_amount: '60000.00', currency: 'INR' }]),
        holidays: ok([{ date: '2026-10-02', name: 'Gandhi Jayanti' }]),
        project_assignments: ok([{ start_date: '2026-01-01', end_date: null }]),
        attendance: ok(ATTENDANCE),
        // "Is this period already paid?" check before issuing.
        invoices: ok([]),
      },
      rpc: {
        next_invoice_number: () => ok('INV-2026-10-000123'),
        issue_invoice: ({ p }) => ok({ id: 'inv-1', status: 'issued', ...p }),
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(supabase)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app?.close());

  describe('auth & roles', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/employees').expect(401);
    });

    it('returns the caller profile from /auth/me', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', token(USER_ID));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ role: 'user', employeeId: EMPLOYEE_ID });
    });

    it('forbids normal users from admin routes', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/employees').set('Authorization', token(USER_ID));
      expect(res.status).toBe(403);
    });

    it('lets normal users read only their own employee record', async () => {
      const own = await request(app.getHttpServer())
        .get(`/api/v1/employees/${EMPLOYEE_ID}`)
        .set('Authorization', token(USER_ID));
      expect(own.status).toBe(200);
      expect(own.body).toMatchObject({ employeeCode: 'EMP-001', currentSalary: { monthlyAmount: 60000 } });

      await request(app.getHttpServer())
        .get(`/api/v1/employees/${OTHER_EMPLOYEE_ID}`)
        .set('Authorization', token(USER_ID))
        .expect(403);
    });

    it('lets admins list employees with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/employees?page=1&limit=10&status=on_role')
        .set('Authorization', token(ADMIN_ID));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, limit: 10, total: 1 });
    });
  });

  describe('validation', () => {
    it('rejects unknown properties and bad values', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/employees')
        .set('Authorization', token(ADMIN_ID))
        .send({ fullName: '', hacker: true, employeeCode: 'MANUAL-1' });
      expect(res.status).toBe(400);
      // The Employee ID is generated by the database and cannot be supplied.
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'property hacker should not exist',
          'property employeeCode should not exist',
          'fullName should not be empty',
        ]),
      );
    });

    it('requires a month or an explicit period for invoices', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices/preview')
        .set('Authorization', token(ADMIN_ID))
        .send({ employeeId: EMPLOYEE_ID, projectId: PROJECT_ID });
      expect(res.status).toBe(400);
    });

    it('validates nested adjustments', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices/preview')
        .set('Authorization', token(ADMIN_ID))
        .send({ employeeId: EMPLOYEE_ID, projectId: PROJECT_ID, month: '2026-10', adjustments: [{ type: 'bonus', amount: -1 }] });
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/^adjustments\.0\.type/)]));
    });
  });

  describe('invoices', () => {
    const body = {
      employeeId: EMPLOYEE_ID,
      projectId: PROJECT_ID,
      month: '2026-10',
      adjustments: [
        { type: 'allowance', label: 'Travel', amount: 2000 },
        { type: 'deduction', label: 'Advance', amount: 500 },
      ],
    };

    it('previews the worked example', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices/preview')
        .set('Authorization', token(ADMIN_ID))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        periodStart: '2026-09-21',
        periodEnd: '2026-10-20',
        workingDays: 21,
        payableDays: 19.5,
        grossAmount: '55714.29',
        netAmount: '57214.29',
        warnings: [],
      });
      expect(supabase.recorded.rpc).toHaveLength(0);
    });

    it('issues an invoice, uploads the PDF and returns a signed URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', token(ADMIN_ID))
        .send(body);
      expect(res.status).toBe(201);
      expect(res.body.invoice).toMatchObject({
        invoiceNumber: 'INV-2026-10-000123',
        grossAmount: '55714.29',
        netAmount: '57214.29',
        pdfPath: `${EMPLOYEE_ID}/INV-2026-10-000123.pdf`,
        generatedBy: ADMIN_ID,
      });
      expect(res.body.pdfUrl).toEqual({
        url: expect.stringContaining('INV-2026-10-000123.pdf'),
        expiresIn: 600,
      });

      const [upload] = supabase.recorded.uploads;
      expect(upload.bucket).toBe('invoices');
      expect(upload.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('forbids normal users from generating invoices', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', token(USER_ID))
        .send(body)
        .expect(403);
    });
  });
});
