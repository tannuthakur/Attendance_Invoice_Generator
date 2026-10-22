import Decimal from 'decimal.js';
import { dayOfWeek, eachDay } from '../common/utils/dates';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class ProjectInvoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Text helpers (match the client invoice style: "24th Sept", "17th Oct, 2026")
// ---------------------------------------------------------------------------
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

const parts = (iso) => iso.split('-').map(Number);

/** '2026-09-24' → '24th Sept' */
export const shortDay = (iso) => {
  const [, m, d] = parts(iso);
  return `${ordinal(d)} ${SHORT_MONTHS[m - 1]}`;
};

/** '2026-10-17' → '17th Oct, 2026' */
export const issueDateLabel = (iso) => {
  const [y, m, d] = parts(iso);
  return `${ordinal(d)} ${SHORT_MONTHS[m - 1]}, ${y}`;
};

/** → '17TH SEPTEMBER TO 16TH OCTOBER 2026' (year shown on both sides when they differ) */
export const periodLabel = (start, end) => {
  const [ys, ms, ds] = parts(start);
  const [ye, me, de] = parts(end);
  const left = `${ordinal(ds)} ${LONG_MONTHS[ms - 1]}${ys !== ye ? ` ${ys}` : ''}`;
  return `${left} to ${ordinal(de)} ${LONG_MONTHS[me - 1]} ${ye}`.toUpperCase();
};

/** ['a', 'b', 'c'] → 'a, b & c' */
export const joinList = (items) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------
/** Days off for client billing: unpaid and paid leave both count; a half day counts 0.5; WFH is a working day. */
const LEAVE_FACTOR = { absent: 1, paid_leave: 1, half_day: 0.5, present: 0, wfh: 0 };

/**
 * One client invoice for a project and period, with one line per employee.
 *
 *   perDay = round(monthlyRate / calendar days in period)          (whole units by default)
 *   amount = monthlyRate − (days not on the project + leave days) × perDay
 *
 * Leave is counted on working days only (not weekends or holidays). Unmarked working
 * days are billed as worked and reported as a warning.
 *
 * @param {object} input
 * @param {string} input.periodStart
 * @param {string} input.periodEnd
 * @param {number[]} input.weekendDays
 * @param {{date: string}[]} input.holidays
 * @param {Array<{employee: object, assignments: object[], attendance: {date: string, status: string}[]}>} input.members
 * @param {Record<string, string>} [input.overrides]     employeeId → custom line text
 * @param {{description: string, amount: number|string}[]} [input.extraLines]
 * @param {string} [input.namePrefix]                    e.g. 'Er. '
 * @param {number} [input.perDayDecimals]                rounding of the per-day rate (default 0)
 */
export function calculateProjectInvoice(input) {
  const {
    periodStart,
    periodEnd,
    weekendDays = [0, 6],
    holidays = [],
    members = [],
    overrides = {},
    extraLines = [],
    namePrefix = 'Er. ',
    perDayDecimals = 0,
  } = input;

  if (periodEnd < periodStart) throw new ProjectInvoiceError('INVALID_PERIOD', 'periodEnd must be on or after periodStart');

  const days = eachDay(periodStart, periodEnd);
  const periodDays = days.length;
  const weekend = new Set(weekendDays);
  const holidayDates = new Set(holidays.map((h) => h.date));
  const isWorking = (d) => !weekend.has(dayOfWeek(d)) && !holidayDates.has(d);

  const lines = [];
  const skipped = [];
  const warnings = [];

  for (const { employee, assignments, attendance } of members) {
    const inEmployment = (d) =>
      (!employee.date_of_joining || d >= employee.date_of_joining) &&
      (!employee.off_role_date || d <= employee.off_role_date);
    const assignmentOn = (d) =>
      inEmployment(d) ? assignments.find((a) => a.start_date <= d && (!a.end_date || d <= a.end_date)) : undefined;

    const coveredDays = days.filter((d) => assignmentOn(d));
    if (!coveredDays.length) continue; // not on the project during this period

    const used = [...new Set(coveredDays.map((d) => assignmentOn(d)))];
    const rates = [...new Set(used.map((a) => (a.monthly_rate === null || a.monthly_rate === undefined ? null : String(new D(a.monthly_rate)))))];
    if (rates.includes(null)) {
      skipped.push({
        employeeId: employee.id,
        fullName: employee.full_name,
        code: 'NO_RATE',
        assignmentIds: used.filter((a) => a.monthly_rate === null || a.monthly_rate === undefined).map((a) => a.id),
        reason: 'No monthly rate set on the project assignment',
      });
      continue;
    }
    if (rates.length > 1) {
      skipped.push({
        employeeId: employee.id,
        fullName: employee.full_name,
        code: 'MULTIPLE_RATES',
        reason: 'Different monthly rates within one period; split the invoice period',
      });
      continue;
    }

    const rate = new D(rates[0]);
    const perDay = rate.dividedBy(periodDays).toDecimalPlaces(perDayDecimals, D.ROUND_HALF_UP);
    const marks = new Map(attendance.map((a) => [a.date, a.status]));

    const leaveDates = [];
    const halfDayDates = [];
    let leaveDays = new D(0);
    let unmarked = 0;
    for (const d of coveredDays) {
      if (!isWorking(d)) continue;
      const status = marks.get(d);
      if (!status) unmarked += 1;
      else if (status === 'half_day') halfDayDates.push(d);
      else if (LEAVE_FACTOR[status] === 1) leaveDates.push(d);
      leaveDays = leaveDays.plus(LEAVE_FACTOR[status] ?? 0);
    }

    const offProjectDays = periodDays - coveredDays.length;
    const deduction = perDay.times(leaveDays.plus(offProjectDays));
    const amount = D.max(0, rate.minus(deduction)).toDecimalPlaces(2, D.ROUND_HALF_UP);

    const noteParts = [];
    if (coveredDays[0] !== periodStart) noteParts.push(`From ${shortDay(coveredDays[0])}`);
    if (coveredDays[coveredDays.length - 1] !== periodEnd) noteParts.push(`Till ${shortDay(coveredDays[coveredDays.length - 1])}`);
    if (leaveDates.length) noteParts.push(`${plural(leaveDates.length, 'Day')} Leave on ${joinList(leaveDates.map(shortDay))}`);
    if (halfDayDates.length) noteParts.push(`${plural(halfDayDates.length, 'Half Day')} on ${joinList(halfDayDates.map(shortDay))}`);
    const note = noteParts.join(' & ');

    const role = used[0].role_title || employee.designation || 'Developer';
    const firstName = (employee.full_name || '').trim().split(/\s+/)[0];
    const defaultText = `Payment for ${role} ${namePrefix}${firstName}${note ? `     (${note})` : ''}`;

    if (unmarked) {
      warnings.push({
        code: 'UNMARKED_ATTENDANCE',
        employeeId: employee.id,
        message: `${employee.full_name}: ${plural(unmarked, 'working day')} not marked; billed as worked`,
      });
    }

    lines.push({
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      fullName: employee.full_name,
      role,
      text: overrides[employee.id]?.trim() || defaultText,
      defaultText,
      note,
      monthlyRate: rate.toFixed(2),
      perDayRate: perDay.toFixed(2),
      periodDays,
      coveredDays: coveredDays.length,
      offProjectDays,
      leaveDays: leaveDays.toNumber(),
      leaveDates,
      halfDayDates,
      unmarkedDays: unmarked,
      deduction: deduction.toDecimalPlaces(2).toFixed(2),
      amount: amount.toFixed(2),
    });
  }

  const extras = extraLines
    .filter((x) => x.description?.trim())
    .map((x) => ({ text: x.description.trim(), amount: new D(x.amount).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2) }));

  // With skipped employees, still return the result so the caller can show why they were skipped.
  if (!lines.length && !extras.length && !skipped.length) {
    throw new ProjectInvoiceError('NO_LINES', 'Nobody is assigned to this project during the period');
  }

  const total = [...lines, ...extras].reduce((acc, l) => acc.plus(l.amount), new D(0));

  return {
    periodStart,
    periodEnd,
    periodDays,
    workingDays: days.filter(isWorking).length,
    periodLabel: periodLabel(periodStart, periodEnd),
    lines,
    extraLines: extras,
    skipped,
    warnings,
    totalAmount: total.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2),
  };
}
