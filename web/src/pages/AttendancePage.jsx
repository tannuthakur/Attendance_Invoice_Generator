import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fetchAllPages } from '../api';
import { Empty, ErrorAlert, Loading, PageHeader, useAsync, useToast } from '../components/ui';
import { ProjectSelect, loadProjects } from '../components/pickers';
import { Brushes, SHORT, STATUSES } from '../components/AttendanceCalendar';
import { STATUS_LABELS, WEEKDAYS, billingPeriod, currentMonth, dayOfWeek, eachDay, formatDate, formatMonth, shiftMonth, todayIso } from '../format';

const FACTOR = { present: 1, wfh: 1, paid_leave: 1, half_day: 0.5, absent: 0 };
const key = (employeeId, date) => `${employeeId}|${date}`;

export function AttendancePage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || '';
  const month = params.get('month') || currentMonth();
  const [brush, setBrush] = useState('present');
  const [edits, setEdits] = useState({});
  const [painting, setPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [batchDate, setBatchDate] = useState('');

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const projects = useAsync(loadProjects, []);
  const project = projects.data?.find((p) => p.id === projectId);
  const period = billingPeriod(month, project?.billingCycleStartDay || 1);
  const weekend = project?.weekendDays || [0, 6];
  const ready = !projectId || project;

  const { data, error, loading, reload } = useAsync(async () => {
    if (!ready) return null;
    const [employees, marks, holidays] = await Promise.all([
      fetchAllPages('/employees', projectId ? { projectId } : {}),
      api('/attendance', { query: { from: period.start, to: period.end, projectId } }),
      api('/holidays', { query: { from: period.start, to: period.end, projectId } }),
    ]);
    return {
      employees: employees.filter(
        (e) =>
          (!e.dateOfJoining || e.dateOfJoining <= period.end) &&
          (e.employmentStatus === 'on_role' || (e.offRoleDate && e.offRoleDate >= period.start)),
      ),
      saved: Object.fromEntries(marks.map((m) => [key(m.employeeId, m.date), m.status])),
      holidays: Object.fromEntries(
        holidays.filter((h) => !h.projectId || h.projectId === projectId).map((h) => [h.date, h.name]),
      ),
    };
  }, [projectId, period.start, period.end, ready]);

  // Discard unsaved edits when the view changes.
  useEffect(() => {
    setEdits({});
    setBatchDate('');
  }, [projectId, period.start, period.end]);
  useEffect(() => setSelected(new Set()), [projectId]);

  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const dirtyCount = Object.keys(edits).length;
  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const days = useMemo(() => eachDay(period.start, period.end), [period.start, period.end]);
  const isOff = (d) => weekend.includes(dayOfWeek(d)) || Boolean(data?.holidays[d]);
  const workingDays = days.filter((d) => !isOff(d));
  const statusOf = (empId, d) => edits[key(empId, d)] ?? data?.saved[key(empId, d)];

  const paint = (cells) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const [empId, d] of cells) {
        const k = key(empId, d);
        if (data.saved[k] === brush) delete next[k];
        else next[k] = brush;
      }
      return next;
    });

  const visibleEmployees = (data?.employees || []).filter(
    (e) =>
      (!nameFilter.trim() || `${e.fullName} ${e.employeeCode}`.toLowerCase().includes(nameFilter.trim().toLowerCase())) &&
      (!onlyUnmarked || workingDays.some((d) => !statusOf(e.id, d))),
  );

  // With employees ticked, date clicks and "Mark" apply to them only; otherwise to everyone shown.
  const selectedShown = visibleEmployees.filter((e) => selected.has(e.id));
  const targets = selectedShown.length ? selectedShown : visibleEmployees;
  const allShownSelected = visibleEmployees.length > 0 && selectedShown.length === visibleEmployees.length;
  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visibleEmployees) {
        if (allShownSelected) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });
  const today = todayIso();
  const markDate = batchDate || (today >= period.start && today <= period.end ? today : period.start);

  const fillRow = (emp) => paint(workingDays.filter((d) => !statusOf(emp.id, d)).map((d) => [emp.id, d]));
  const fillColumn = (d) => paint(targets.map((e) => [e.id, d]));

  const save = async () => {
    setSaving(true);
    try {
      const marks = Object.entries(edits).map(([k, status]) => {
        const [employeeId, date] = k.split('|');
        return { employeeId, date, status };
      });
      for (let i = 0; i < marks.length; i += 2000) {
        await api('/attendance/bulk', { method: 'POST', body: { marks: marks.slice(i, i + 2000) } });
      }
      toast(`Saved ${marks.length} attendance mark${marks.length === 1 ? '' : 's'}`);
      setEdits({});
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={
          <>
            {project ? `${project.name}: billing period ` : 'Calendar month '}
            {formatDate(period.start)} – {formatDate(period.end)} · {workingDays.length} working days
          </>
        }
      />

      <div className="card card-body" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div style={{ minWidth: 220 }}>
            <ProjectSelect projects={projects.data || []} value={projectId} onChange={(v) => setParam('projectId', v)} placeholder="All employees (calendar month)" />
          </div>
          <div className="actions">
            <button className="btn btn-sm" onClick={() => setParam('month', shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <input className="input" type="month" value={month} onChange={(e) => e.target.value && setParam('month', e.target.value)} style={{ minWidth: 150 }} />
            <button className="btn btn-sm" onClick={() => setParam('month', shiftMonth(month, 1))} aria-label="Next month">›</button>
          </div>
          {project && <span className="muted small">Invoice month {formatMonth(month)}</span>}
          <input className="input" placeholder="Filter employees…" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} style={{ minWidth: 180 }} aria-label="Filter employees" />
          <label className={`check-pill ${onlyUnmarked ? 'on' : ''}`}>
            <input type="checkbox" checked={onlyUnmarked} onChange={(e) => setOnlyUnmarked(e.target.checked)} /> Only with unmarked days
          </label>
        </div>
        <div className="toolbar" style={{ marginBottom: 0, justifyContent: 'space-between' }}>
          <div className="actions">
            <span className="muted small">Paint with</span>
            <Brushes value={brush} onChange={setBrush} />
          </div>
          <div className="legend muted">
            <span><i style={{ background: 'var(--off-day)' }} />Weekend</span>
            <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--border-strong), var(--border-strong) 2px, transparent 2px, transparent 4px)' }} />Holiday</span>
            <span><i style={{ boxShadow: 'inset 0 0 0 2px var(--warning)' }} />Unsaved</span>
          </div>
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Click or drag across cells. Tick employees to mark just them, click a date to mark everyone ticked (or everyone shown), or “Fill” to mark a person's unmarked working days.
        </p>
        {selectedShown.length > 0 && (
          <div className="toolbar batch-bar">
            <strong>{selectedShown.length} selected</strong>
            <div className="actions">
              <span className="muted small">Mark as</span>
              <span className={`badge st-${brush}`}>{STATUS_LABELS[brush]}</span>
              <span className="muted small">on</span>
              <input
                className="input"
                type="date"
                value={markDate}
                min={period.start}
                max={period.end}
                onChange={(e) => setBatchDate(e.target.value)}
                aria-label="Date to mark"
              />
              <button className="btn btn-primary btn-sm" onClick={() => fillColumn(markDate)}>Mark selected</button>
              <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          </div>
        )}
      </div>

      <ErrorAlert error={error || projects.error} />
      <div className="card">
        {(loading && !data) || !ready ? (
          <Loading />
        ) : !data?.employees.length ? (
          <Empty>
            {projectId ? 'No employees are assigned to this project in this period.' : 'No employees yet.'}{' '}
            <Link to={projectId ? `/projects/${projectId}` : '/employees'}>{projectId ? 'Assign someone' : 'Add one'}</Link>.
          </Empty>
        ) : (
          <>
            <div className="att-scroll">
              <table className="att-grid">
                <thead>
                  <tr>
                    <th className="name">
                      <label className="actions" style={{ flexWrap: 'nowrap', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={allShownSelected}
                          ref={(el) => el && (el.indeterminate = selectedShown.length > 0 && !allShownSelected)}
                          onChange={toggleAllShown}
                          aria-label="Select all employees shown"
                        />
                        Employee
                      </label>
                    </th>
                    {days.map((d) => (
                      <th
                        key={d}
                        className={data.holidays[d] ? 'holiday' : isOff(d) ? 'off' : ''}
                        title={data.holidays[d] || `Mark ${selectedShown.length ? 'selected employees' : 'everyone shown'} ${STATUS_LABELS[brush].toLowerCase()} on ${formatDate(d)}`}
                        onClick={() => fillColumn(d)}
                      >
                        {Number(d.slice(8))}
                        <span className="dow">{WEEKDAYS[dayOfWeek(d)].slice(0, 2)}</span>
                      </th>
                    ))}
                    <th className="name" style={{ position: 'static', minWidth: 120 }}>Payable / working</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.length === 0 && (
                    <tr><td className="name muted" colSpan={days.length + 2}>No employees match the filter.</td></tr>
                  )}
                  {visibleEmployees.map((emp) => {
                    let payable = 0;
                    for (const d of workingDays) payable += FACTOR[statusOf(emp.id, d)] ?? 0;
                    return (
                      <tr key={emp.id}>
                        <td className="name">
                          <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                            <input
                              type="checkbox"
                              checked={selected.has(emp.id)}
                              onChange={() => toggleSelected(emp.id)}
                              aria-label={`Select ${emp.fullName}`}
                            />
                            <Link to={`/employees/${emp.id}`} title={emp.fullName} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.fullName}</Link>
                            <button className="link-btn small" onClick={() => fillRow(emp)} title="Mark unmarked working days">Fill</button>
                          </div>
                        </td>
                        {days.map((d) => {
                          const k = key(emp.id, d);
                          const status = statusOf(emp.id, d);
                          const classes = ['cell', status ? `st-${status}` : data.holidays[d] ? 'holiday' : isOff(d) ? 'off' : '', edits[k] ? 'dirty' : ''];
                          return (
                            <td
                              key={d}
                              className={classes.join(' ')}
                              title={`${emp.fullName} · ${formatDate(d)}${data.holidays[d] ? ` · ${data.holidays[d]}` : ''}: ${status ? STATUS_LABELS[status] : 'not marked'}`}
                              onMouseDown={(e) => { e.preventDefault(); setPainting(true); paint([[emp.id, d]]); }}
                              onMouseEnter={() => painting && paint([[emp.id, d]])}
                            >
                              {status ? SHORT[status] : ''}
                            </td>
                          );
                        })}
                        <td className="summary">{payable} / {workingDays.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="savebar">
              <span className="muted">
                {dirtyCount ? `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}` : 'All changes saved'}
                {' · '}
                {STATUSES.map((s) => SHORT[s] + ' ' + STATUS_LABELS[s]).join(' · ')}
              </span>
              <div className="actions">
                <button className="btn" disabled={!dirtyCount || saving} onClick={() => setEdits({})}>Discard</button>
                <button className="btn btn-primary" disabled={!dirtyCount || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
