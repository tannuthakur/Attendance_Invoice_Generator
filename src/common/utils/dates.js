// All dates are ISO 'YYYY-MM-DD' strings handled in UTC, so server timezone never shifts a day.

const DAY_MS = 86_400_000;

export const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const formatDate = (date) => date.toISOString().slice(0, 10);

export const addDays = (iso, n) => formatDate(new Date(parseDate(iso).getTime() + n * DAY_MS));

/** 0 = Sunday … 6 = Saturday */
export const dayOfWeek = (iso) => parseDate(iso).getUTCDay();

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Inclusive list of dates from start to end. */
export function eachDay(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export const daysBetween = (start, end) => Math.round((parseDate(end) - parseDate(start)) / DAY_MS) + 1;

/** 'YYYY-MM' → 'YYYY-MM-01' */
export const monthToDate = (month) => `${month}-01`;

/**
 * Billing period for `month` ('YYYY-MM') given the cycle start day.
 * Start day 1 → calendar month. Start day 21 → 21st of previous month to 20th of `month`.
 */
export function billingPeriod(month, startDay = 1) {
  const [y, m] = month.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  if (startDay === 1) {
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` };
  }
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return { start: `${prevY}-${pad(prevM)}-${pad(startDay)}`, end: `${y}-${pad(m)}-${pad(startDay - 1)}` };
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
