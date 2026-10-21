import {
  calculateProjectInvoice, ProjectInvoiceError, issueDateLabel, joinList, periodLabel, shortDay,
} from './project-invoice-calculator';

// Reference invoice S2534: Qatar Living, 17 Sep – 16 Oct 2026 (30 days), weekend Sat/Sun.
const PERIOD = { periodStart: '2026-09-17', periodEnd: '2026-10-16', weekendDays: [0, 6] };
const assign = (rate, role, extra = {}) => [{ start_date: '2026-01-01', end_date: null, monthly_rate: rate, role_title: role, ...extra }];
const emp = (id, name, extra = {}) => ({ id, employee_code: id.toUpperCase(), full_name: name, designation: null, date_of_joining: null, off_role_date: null, ...extra });
const leave = (...dates) => dates.map((date) => ({ date, status: 'absent' }));

const REFERENCE_MEMBERS = [
  { employee: emp('e1', 'Hridey Sharma'), assignments: assign(3500, 'React Native Developer'), attendance: leave('2026-09-24') },
  { employee: emp('e2', 'Sachin Kumar'), assignments: assign(2500, 'Backend Developer'), attendance: [] },
  { employee: emp('e3', 'Tarun Verma'), assignments: assign(2500, 'Frontend Developer'), attendance: [] },
  { employee: emp('e4', 'Gurpreet Singh'), assignments: assign(2500, 'Frontend Developer'), attendance: [] },
  { employee: emp('e5', 'Arvind Rana'), assignments: assign(2500, 'UI/UX Developer'), attendance: leave('2026-09-25', '2026-10-05') },
];

describe('text helpers', () => {
  it('formats dates like the reference invoice', () => {
    expect(shortDay('2026-09-24')).toBe('24th Sept');
    expect(shortDay('2026-10-01')).toBe('1st Oct');
    expect(shortDay('2026-10-12')).toBe('12th Oct');
    expect(issueDateLabel('2026-10-17')).toBe('17th Oct, 2026');
    expect(issueDateLabel('2026-11-05')).toBe('5th Nov, 2026');
    expect(periodLabel('2026-09-17', '2026-10-16')).toBe('17TH SEPTEMBER TO 16TH OCTOBER 2026');
    expect(periodLabel('2025-12-17', '2026-01-16')).toBe('17TH DECEMBER 2025 TO 16TH JANUARY 2026');
    expect(joinList(['25th Sept', '5th Oct'])).toBe('25th Sept & 5th Oct');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b & c');
  });
});

describe('calculateProjectInvoice', () => {
  it('reproduces reference invoice S2534 exactly', () => {
    const result = calculateProjectInvoice({ ...PERIOD, members: REFERENCE_MEMBERS });

    expect(result.periodDays).toBe(30);
    expect(result.lines.map((l) => [l.text, l.amount])).toEqual([
      ['Payment for React Native Developer Er. Hridey     (1 Day Leave on 24th Sept)', '3383.00'],
      ['Payment for Backend Developer Er. Sachin', '2500.00'],
      ['Payment for Frontend Developer Er. Tarun', '2500.00'],
      ['Payment for Frontend Developer Er. Gurpreet', '2500.00'],
      ['Payment for UI/UX Developer Er. Arvind     (2 Days Leave on 25th Sept & 5th Oct)', '2334.00'],
    ]);
    expect(result.totalAmount).toBe('13217.00');
    expect(result.lines[0]).toMatchObject({ perDayRate: '117.00', leaveDays: 1 });
    expect(result.lines[4]).toMatchObject({ perDayRate: '83.00', leaveDays: 2 });
  });

  it('counts paid leave and half days as time off, ignoring leave marked on weekends', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: [{
        employee: emp('e1', 'Hridey Sharma'),
        assignments: assign(3000, 'Developer'),
        attendance: [
          { date: '2026-09-21', status: 'paid_leave' },
          { date: '2026-09-22', status: 'half_day' },
          { date: '2026-09-26', status: 'absent' }, // Saturday: not a working day
        ],
      }],
    });
    // perDay 100; 1.5 days off
    expect(result.lines[0]).toMatchObject({
      leaveDays: 1.5,
      amount: '2850.00',
      note: '1 Day Leave on 21st Sept & 1 Half Day on 22nd Sept',
    });
  });

  it('pro-rates someone who joins the project mid-period', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: [{ employee: emp('e1', 'Tarun Verma'), assignments: assign(3000, 'Frontend Developer', { start_date: '2026-10-01' }), attendance: [] }],
    });
    // 14 days before joining × 100
    expect(result.lines[0]).toMatchObject({ offProjectDays: 14, amount: '1600.00', note: 'From 1st Oct' });
  });

  it('stops billing after the off-role date', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: [{ employee: emp('e1', 'Tarun Verma', { off_role_date: '2026-10-06' }), assignments: assign(3000, 'Dev'), attendance: [] }],
    });
    expect(result.lines[0]).toMatchObject({ offProjectDays: 10, amount: '2000.00', note: 'Till 6th Oct' });
  });

  it('skips employees without a rate and leaves out people not on the project', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: [
        ...REFERENCE_MEMBERS.slice(1, 2),
        { employee: emp('e9', 'No Rate'), assignments: assign(null, 'Dev'), attendance: [] },
        { employee: emp('e8', 'Gone'), assignments: [{ start_date: '2026-01-01', end_date: '2026-08-31', monthly_rate: 2000 }], attendance: [] },
      ],
    });
    expect(result.lines).toHaveLength(1);
    expect(result.skipped).toEqual([expect.objectContaining({ employeeId: 'e9' })]);
  });

  it('applies text overrides and extra lines', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: REFERENCE_MEMBERS.slice(1, 2),
      overrides: { e2: 'Payment for Senior Backend Developer Er. Sachin' },
      extraLines: [{ description: 'Server costs', amount: 120.5 }, { description: 'Discount', amount: -100 }],
    });
    expect(result.lines[0].text).toBe('Payment for Senior Backend Developer Er. Sachin');
    expect(result.totalAmount).toBe('2520.50');
  });

  it('warns about unmarked working days but bills them', () => {
    const result = calculateProjectInvoice({ ...PERIOD, members: REFERENCE_MEMBERS.slice(1, 2) });
    expect(result.warnings[0]).toMatchObject({ code: 'UNMARKED_ATTENDANCE' });
    expect(result.lines[0].amount).toBe('2500.00');
  });

  it('rejects a period with nobody on the project', () => {
    expect(() => calculateProjectInvoice({ ...PERIOD, members: [] })).toThrow(ProjectInvoiceError);
  });

  it('returns skipped reasons instead of failing when nobody is billable', () => {
    const result = calculateProjectInvoice({
      ...PERIOD,
      members: [{ employee: emp('e9', 'Hridey'), assignments: assign(null, 'Full Stack Developer'), attendance: [] }],
    });
    expect(result.lines).toEqual([]);
    expect(result.skipped).toEqual([expect.objectContaining({ fullName: 'Hridey', reason: expect.stringMatching(/rate/) })]);
    expect(result.totalAmount).toBe('0.00');
  });
});
