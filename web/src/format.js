// Dates are ISO 'YYYY-MM-DD' strings handled in UTC, matching the API.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (date) => date.toISOString().slice(0, 10);

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
export const currentMonth = () => todayIso().slice(0, 7);

export const addDays = (iso, n) => toIso(new Date(parse(iso).getTime() + n * 86_400_000));
export const dayOfWeek = (iso) => parse(iso).getUTCDay();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function eachDay(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Same rule as the API: start day 1 → calendar month; 21 → 21st of previous month to 20th. */
export function billingPeriod(month, startDay = 1) {
  const [y, m] = month.split('-').map(Number);
  if (startDay === 1) return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(y, m))}` };
  const prev = shiftMonth(month, -1);
  return { start: `${prev}-${pad(startDay)}`, end: `${month}-${pad(startDay - 1)}` };
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatMonth(month) {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export const formatDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function formatMoney(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const formatted = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
  return `${formatted} ${currency}`;
}

export const STATUS_LABELS = {
  present: 'Present',
  half_day: 'Half day',
  paid_leave: 'Paid leave',
  absent: 'Absent',
  on_role: 'On role',
  off_role: 'Off role',
  issued: 'Issued',
  paid: 'Paid',
  void: 'Void',
  admin: 'Admin',
  user: 'User',
};
