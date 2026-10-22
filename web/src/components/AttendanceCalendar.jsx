import { useState } from 'react';
import { api } from '../api';
import { ErrorAlert, Loading, useAsync, useToast } from './ui';
import { STATUS_LABELS, WEEKDAYS, billingPeriod, dayOfWeek, eachDay, formatMonth, shiftMonth } from '../format';

export const STATUSES = ['present', 'wfh', 'half_day', 'paid_leave', 'absent'];
export const SHORT = { present: 'P', wfh: 'W', half_day: 'H', paid_leave: 'L', absent: 'A' };

export function Brushes({ value, onChange }) {
  return (
    <div className="brushes" role="radiogroup" aria-label="Status to apply">
      {STATUSES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} className={`brush ${value === s ? 'on' : ''}`} onClick={() => onChange(s)}>
          <span className={`badge st-${s}`}>{SHORT[s]}</span> {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

/** One employee's calendar month. Clicking a day saves the selected status immediately. */
export function AttendanceCalendar({ employeeId, initialMonth, editable = false, weekendDays = [0, 6] }) {
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [brush, setBrush] = useState('present');
  const [saving, setSaving] = useState(null);
  const { start, end } = billingPeriod(month, 1);

  const { data, error, loading, setData } = useAsync(async () => {
    const [marks, holidays] = await Promise.all([
      api('/attendance', { query: { employeeId, from: start, to: end } }),
      api('/holidays', { query: { from: start, to: end } }),
    ]);
    return {
      marks: Object.fromEntries(marks.map((m) => [m.date, m.status])),
      holidays: Object.fromEntries(holidays.filter((h) => !h.projectId).map((h) => [h.date, h.name])),
    };
  }, [employeeId, start, end]);

  const mark = async (date) => {
    if (!editable || saving) return;
    setSaving(date);
    try {
      await api('/attendance', { method: 'POST', body: { employeeId, date, status: brush } });
      setData((d) => ({ ...d, marks: { ...d.marks, [date]: brush } }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  };

  const days = eachDay(start, end);
  const leading = dayOfWeek(start);
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: Object.values(data?.marks || {}).filter((v) => v === s).length }), {});

  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
        <div className="actions">
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <strong style={{ minWidth: 90, textAlign: 'center' }}>{formatMonth(month)}</strong>
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        </div>
        <div className="legend">
          {STATUSES.map((s) => (
            <span key={s}><span className={`badge st-${s}`}>{counts[s]}</span> {STATUS_LABELS[s]}</span>
          ))}
        </div>
      </div>
      {editable && (
        <div className="actions">
          <span className="muted small">Click a day to mark it as</span>
          <Brushes value={brush} onChange={setBrush} />
        </div>
      )}
      <ErrorAlert error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="cal">
          {WEEKDAYS.map((d) => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: leading }, (_, i) => <div key={`b${i}`} className="day blank" />)}
          {days.map((d) => {
            const status = data.marks[d];
            const holiday = data.holidays[d];
            const off = weekendDays.includes(dayOfWeek(d)) || holiday;
            return (
              <div
                key={d}
                className={`day ${off ? 'off' : ''}`}
                onClick={() => mark(d)}
                title={holiday || (status ? STATUS_LABELS[status] : 'Not marked')}
                style={editable ? undefined : { cursor: 'default' }}
              >
                <span className="num">{Number(d.slice(8))}</span>
                {saving === d ? (
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                ) : status ? (
                  <span className={`tag st-${status}`}>{STATUS_LABELS[status]}</span>
                ) : holiday ? (
                  <span className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holiday}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
