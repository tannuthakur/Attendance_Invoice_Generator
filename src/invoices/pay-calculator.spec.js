import { calculatePay, PayCalculationError } from './pay-calculator';
import { billingPeriod, eachDay, dayOfWeek } from '../common/utils/dates';

const PERIOD = { periodStart: '2026-09-21', periodEnd: '2026-10-20' };
const HOLIDAY = [{ date: '2026-10-02', name: 'Gandhi Jayanti' }];
const SALARY_60K = [{ effective_month: '2026-01-01', monthly_amount: '60000.00', currency: 'INR' }];
const FULL_ASSIGNMENT = [{ start_date: '2026-01-01', end_date: null }];

const workingDaysOf = (start, end, holidays = []) =>
  eachDay(start, end).filter((d) => ![0, 6].includes(dayOfWeek(d)) && !holidays.some((h) => h.date === d));

const mark = (dates, status) => dates.map((date) => ({ date, status }));

describe('billingPeriod', () => {
  it('runs 21st → 20th for start day 21', () => {
    expect(billingPeriod('2026-10', 21)).toEqual({ start: '2026-09-21', end: '2026-10-20' });
  });

  it('wraps the year in January', () => {
    expect(billingPeriod('2026-01', 21)).toEqual({ start: '2025-12-21', end: '2026-01-20' });
  });

  it('gives the calendar month for start day 1', () => {
    expect(billingPeriod('2026-02', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(billingPeriod('2028-02', 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});

describe('calculatePay', () => {
  it('reproduces the worked example from the design doc', () => {
    const days = workingDaysOf(PERIOD.periodStart, PERIOD.periodEnd, HOLIDAY);
    expect(days).toHaveLength(21);

    const attendance = [
      ...mark(days.slice(0, 18), 'present'),
      ...mark([days[18]], 'half_day'),
      ...mark([days[19]], 'paid_leave'),
      ...mark([days[20]], 'absent'),
    ];

    const result = calculatePay({
      ...PERIOD,
      weekendDays: [0, 6],
      holidays: HOLIDAY,
      assignments: FULL_ASSIGNMENT,
      attendance,
      salaries: SALARY_60K,
      adjustments: [
        { type: 'allowance', label: 'Travel', amount: 2000 },
        { type: 'deduction', label: 'Advance', amount: 500 },
      ],
    });

    expect(result.workingDays).toBe(21);
    expect(result.payableDays).toBe(19.5);
    expect(result.grossAmount).toBe('55714.29');
    expect(result.netAmount).toBe('57214.29');
    expect(result.currency).toBe('INR');
    expect(result.attendance).toEqual({
      present: 18,
      halfDay: 1,
      paidLeave: 1,
      absent: 1,
      unmarked: 0,
      notAssigned: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it('excludes weekends and holidays from working days', () => {
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      weekendDays: [0, 6],
      holidays: [...HOLIDAY, { date: '2026-10-10', name: 'Saturday holiday' }],
      assignments: FULL_ASSIGNMENT,
      attendance: mark(workingDaysOf('2026-10-01', '2026-10-31', HOLIDAY), 'present'),
      salaries: SALARY_60K,
    });
    // October 2026 has 22 weekdays; minus the 2nd = 21. The Saturday holiday changes nothing.
    expect(result.workingDays).toBe(21);
    expect(result.grossAmount).toBe('60000.00');
    expect(result.holidays).toHaveLength(2);
  });

  it('respects a custom weekend (Friday only)', () => {
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      weekendDays: [5],
      assignments: FULL_ASSIGNMENT,
      attendance: [],
      salaries: SALARY_60K,
    });
    expect(result.workingDays).toBe(31 - 5);
  });

  it('counts half days as 0.5', () => {
    const days = workingDaysOf('2026-10-01', '2026-10-31');
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      assignments: FULL_ASSIGNMENT,
      attendance: mark(days, 'half_day'),
      salaries: SALARY_60K,
    });
    expect(result.payableDays).toBe(11);
    expect(result.grossAmount).toBe('30000.00');
  });

  it('counts unmarked days as 0 and warns', () => {
    const days = workingDaysOf('2026-10-01', '2026-10-31');
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      assignments: FULL_ASSIGNMENT,
      attendance: mark(days.slice(0, 20), 'present'),
      salaries: SALARY_60K,
    });
    expect(result.attendance.unmarked).toBe(2);
    expect(result.warnings[0]).toMatchObject({ code: 'UNMARKED_ATTENDANCE', dates: days.slice(20) });
    expect(result.grossAmount).toBe('54545.45'); // 60000 × 20 / 22
  });

  it('applies a mid-period raise from its effective month', () => {
    const days = workingDaysOf(PERIOD.periodStart, PERIOD.periodEnd, HOLIDAY);
    const result = calculatePay({
      ...PERIOD,
      holidays: HOLIDAY,
      assignments: FULL_ASSIGNMENT,
      attendance: mark(days, 'present'),
      salaries: [...SALARY_60K, { effective_month: '2026-10-01', monthly_amount: '63000', currency: 'INR' }],
    });
    // Sep 21–30: 8 days at 60000/21; Oct 1–20: 13 days at 63000/21.
    expect(result.salarySegments).toEqual([
      expect.objectContaining({ effectiveMonth: '2026-01-01', payableDays: 8, amount: '22857.14' }),
      expect.objectContaining({ effectiveMonth: '2026-10-01', payableDays: 13, amount: '39000.00' }),
    ]);
    expect(result.grossAmount).toBe('61857.14');
  });

  it('clips payable days to the assignment dates', () => {
    const days = workingDaysOf(PERIOD.periodStart, PERIOD.periodEnd, HOLIDAY);
    const result = calculatePay({
      ...PERIOD,
      holidays: HOLIDAY,
      assignments: [{ start_date: '2026-10-01', end_date: '2026-10-16' }],
      attendance: mark(days, 'present'),
      salaries: SALARY_60K,
    });
    // Oct 1, 5–9, 12–16 = 11 assigned working days; denominator stays 21.
    expect(result.attendance.notAssigned).toBe(10);
    expect(result.payableDays).toBe(11);
    expect(result.grossAmount).toBe('31428.57');
  });

  it('clips to the employment window (off-role date)', () => {
    const days = workingDaysOf('2026-10-01', '2026-10-31');
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      assignments: FULL_ASSIGNMENT,
      employment: { offRoleDate: '2026-10-09' },
      attendance: mark(days, 'present'),
      salaries: SALARY_60K,
    });
    expect(result.payableDays).toBe(7);
  });

  it('rejects a period where the employee was never assigned', () => {
    expect(() =>
      calculatePay({
        ...PERIOD,
        assignments: [{ start_date: '2027-01-01', end_date: null }],
        salaries: SALARY_60K,
      }),
    ).toThrow(expect.objectContaining({ code: 'NOT_ASSIGNED' }));
  });

  it('rejects days with no effective salary', () => {
    expect(() =>
      calculatePay({
        ...PERIOD,
        assignments: FULL_ASSIGNMENT,
        salaries: [{ effective_month: '2026-10-01', monthly_amount: 1000, currency: 'INR' }],
      }),
    ).toThrow(PayCalculationError);
  });

  it('rounds half-up only at the end', () => {
    const days = workingDaysOf('2026-10-01', '2026-10-31');
    const result = calculatePay({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      assignments: FULL_ASSIGNMENT,
      attendance: mark(days.slice(0, 1), 'present'),
      salaries: [{ effective_month: '2026-01-01', monthly_amount: '0.11', currency: 'INR' }],
    });
    // 0.11 / 22 = 0.005 → rounds half-up to 0.01
    expect(result.grossAmount).toBe('0.01');
  });
});
