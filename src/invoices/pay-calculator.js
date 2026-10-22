import Decimal from 'decimal.js';
import { dayOfWeek, eachDay, daysBetween } from '../common/utils/dates';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const ATTENDANCE_FACTORS = {
  present: 1,
  wfh: 1,
  paid_leave: 1,
  half_day: 0.5,
  absent: 0,
};

export class PayCalculationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const money = (value) => new D(value).toDecimalPlaces(2, D.ROUND_HALF_UP);

/**
 * Pro-rata pay for one employee on one project over a billing period.
 *
 *   gross = Σ_{d ∈ working days} factor(d) × salary(d) / workingDaysInPeriod
 *   net   = gross + allowances − deductions
 *
 * Working days are the period's days that are neither weekend days nor holidays.
 * Only working days inside the employee's assignment (and employment window) can be payable.
 * Rounding (half-up, 2 dp) happens only on the final amounts.
 *
 * @param {object} input
 * @param {string} input.periodStart          'YYYY-MM-DD'
 * @param {string} input.periodEnd            'YYYY-MM-DD'
 * @param {number[]} input.weekendDays        0 = Sunday … 6 = Saturday
 * @param {{date: string, name: string}[]} input.holidays
 * @param {{start_date: string, end_date: string|null}[]} input.assignments
 * @param {{dateOfJoining?: string|null, offRoleDate?: string|null}} [input.employment]
 * @param {{date: string, status: string}[]} input.attendance
 * @param {{effective_month: string, monthly_amount: string|number, currency: string}[]} input.salaries
 * @param {{type: 'allowance'|'deduction', label: string, amount: string|number}[]} [input.adjustments]
 */
export function calculatePay(input) {
  const {
    periodStart,
    periodEnd,
    weekendDays = [0, 6],
    holidays = [],
    assignments = [],
    employment = {},
    attendance = [],
    salaries = [],
    adjustments = [],
  } = input;

  if (periodEnd < periodStart) {
    throw new PayCalculationError('INVALID_PERIOD', 'periodEnd must be on or after periodStart');
  }

  const weekend = new Set(weekendDays);
  const holidaysInPeriod = holidays
    .filter((h) => h.date >= periodStart && h.date <= periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const holidayDates = new Set(holidaysInPeriod.map((h) => h.date));
  const marks = new Map(attendance.map((a) => [a.date, a.status]));
  const salaryRows = [...salaries].sort((a, b) => a.effective_month.localeCompare(b.effective_month));

  const allDays = eachDay(periodStart, periodEnd);
  const workingDays = allDays.filter((d) => !weekend.has(dayOfWeek(d)) && !holidayDates.has(d));
  if (workingDays.length === 0) {
    throw new PayCalculationError('NO_WORKING_DAYS', 'The billing period has no working days');
  }

  const isAssigned = (d) =>
    (!employment.dateOfJoining || d >= employment.dateOfJoining) &&
    (!employment.offRoleDate || d <= employment.offRoleDate) &&
    assignments.some((a) => a.start_date <= d && (!a.end_date || d <= a.end_date));

  const salaryOn = (d) => {
    let row = null;
    for (const s of salaryRows) {
      if (s.effective_month <= d) row = s;
      else break;
    }
    return row;
  };

  const summary = { present: 0, wfh: 0, halfDay: 0, paidLeave: 0, absent: 0, unmarked: 0, notAssigned: 0 };
  const unmarkedDates = [];
  const segments = new Map(); // effective_month → segment
  const currencies = new Set();
  const workingCount = new D(workingDays.length);
  let gross = new D(0);
  let payableDays = new D(0);

  for (const d of workingDays) {
    if (!isAssigned(d)) {
      summary.notAssigned += 1;
      continue;
    }

    const status = marks.get(d);
    if (!status) {
      summary.unmarked += 1;
      unmarkedDates.push(d);
    } else {
      summary[{ present: 'present', wfh: 'wfh', half_day: 'halfDay', paid_leave: 'paidLeave', absent: 'absent' }[status]] += 1;
    }

    const salary = salaryOn(d);
    if (!salary) {
      throw new PayCalculationError('NO_SALARY', `No salary is effective on ${d}`);
    }
    currencies.add(salary.currency);

    const factor = new D(status ? ATTENDANCE_FACTORS[status] : 0);
    const amount = factor.times(salary.monthly_amount).dividedBy(workingCount);
    gross = gross.plus(amount);
    payableDays = payableDays.plus(factor);

    let seg = segments.get(salary.effective_month);
    if (!seg) {
      seg = { salary, from: d, to: d, payableDays: new D(0), amount: new D(0) };
      segments.set(salary.effective_month, seg);
    }
    seg.to = d;
    seg.payableDays = seg.payableDays.plus(factor);
    seg.amount = seg.amount.plus(amount);
  }

  if (summary.notAssigned === workingDays.length) {
    throw new PayCalculationError(
      'NOT_ASSIGNED',
      'The employee is not assigned to this project (or not employed) on any working day of the period',
    );
  }
  if (currencies.size > 1) {
    throw new PayCalculationError('MIXED_CURRENCY', 'Salaries in this period use more than one currency');
  }

  const grossAmount = money(gross);
  const normalizedAdjustments = adjustments.map((a) => ({
    type: a.type,
    label: a.label,
    amount: money(a.amount).toFixed(2),
  }));
  const net = normalizedAdjustments.reduce(
    (acc, a) => (a.type === 'deduction' ? acc.minus(a.amount) : acc.plus(a.amount)),
    grossAmount,
  );

  const warnings = [];
  if (unmarkedDates.length) {
    warnings.push({
      code: 'UNMARKED_ATTENDANCE',
      message: `${unmarkedDates.length} working day(s) have no attendance mark and were counted as 0`,
      dates: unmarkedDates,
    });
  }
  if (net.isNegative()) {
    warnings.push({ code: 'NEGATIVE_NET', message: 'Deductions exceed gross pay; net amount is negative' });
  }

  return {
    periodStart,
    periodEnd,
    calendarDays: daysBetween(periodStart, periodEnd),
    workingDays: workingDays.length,
    payableDays: payableDays.toNumber(),
    currency: [...currencies][0] || null,
    grossAmount: grossAmount.toFixed(2),
    adjustments: normalizedAdjustments,
    netAmount: money(net).toFixed(2),
    attendance: summary,
    weekendDays: [...weekend].sort(),
    holidays: holidaysInPeriod.map((h) => ({ date: h.date, name: h.name })),
    salarySegments: [...segments.values()].map((s) => ({
      effectiveMonth: s.salary.effective_month,
      monthlyAmount: money(s.salary.monthly_amount).toFixed(2),
      perDayRate: money(new D(s.salary.monthly_amount).dividedBy(workingCount)).toFixed(2),
      from: s.from,
      to: s.to,
      payableDays: s.payableDays.toNumber(),
      amount: money(s.amount).toFixed(2),
    })),
    warnings,
  };
}
