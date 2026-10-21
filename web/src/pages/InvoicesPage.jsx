import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, saveUrl } from '../api';
import { PdfPreview, loadSignedPdf } from '../components/PdfPreview';
import { DeleteInvoiceConfirm } from '../components/DeleteConfirm';
import { MarkPaidModal, PaidBanner } from '../components/PaymentModal';
import { Badge, Empty, ErrorAlert, Field, Loading, PageHeader, Pagination, useAsync, useDebounced, useToast } from '../components/ui';
import { EmployeeSelect, ProjectSelect, loadProjects } from '../components/pickers';
import { WEEKDAYS, billingPeriod, currentMonth, formatDate, formatDateTime, formatMoney } from '../format';

const LIMIT = 20;

async function downloadPdf(invoiceId, toast) {
  try {
    const { pdfUrl, fileName } = await api(`/invoices/${invoiceId}/pdf`, { query: { download: 1 } });
    saveUrl(pdfUrl.url, fileName);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function InvoicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employeeId') || '';
  const projectId = params.get('projectId') || '';
  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(params.get('search') || '');
  const debouncedSearch = useDebounced(search);
  const filtered = Boolean(employeeId || projectId || status || from || to || search);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const [previewing, setPreviewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [paying, setPaying] = useState(null);
  const { data, error, loading, reload } = useAsync(
    () => api('/invoices', { query: { page, limit: LIMIT, employeeId, projectId, status, from, to, search: debouncedSearch.trim() } }),
    [page, employeeId, projectId, status, from, to, debouncedSearch],
  );

  return (
    <>
      <PageHeader title="Salary invoices" subtitle="Per-employee pro-rata salary invoices. Each stores a frozen copy of the numbers it was built from.">
        <Link className="btn btn-primary" to="/invoices/new">Generate invoice</Link>
      </PageHeader>
      <div className="toolbar">
        <div style={{ minWidth: 240 }}><EmployeeSelect value={employeeId} onChange={(v) => setParam('employeeId', v)} placeholder="All employees" /></div>
        <div style={{ minWidth: 200 }}><ProjectSelect value={projectId} onChange={(v) => setParam('projectId', v)} placeholder="All projects" /></div>
        <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="issued">Issued (unpaid)</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <input className="input" placeholder="Invoice no." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 0, width: 150 }} aria-label="Invoice number" />
        <label className="actions small muted" style={{ gap: 6 }}>
          Period
          <input className="input" type="date" value={from} onChange={(e) => setParam('from', e.target.value)} aria-label="Period from" style={{ minWidth: 0, width: 150 }} />
          –
          <input className="input" type="date" value={to} onChange={(e) => setParam('to', e.target.value)} aria-label="Period to" style={{ minWidth: 0, width: 150 }} />
        </label>
        {filtered && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>
        )}
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        {loading && !data ? (
          <Loading />
        ) : data?.data.length === 0 ? (
          <Empty>No invoices match these filters.</Empty>
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Invoice</th><th>Employee</th><th>Project</th><th>Period</th><th className="right">Payable days</th><th className="right">Net</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {data.data.map((inv) => (
                    <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="mono nowrap">{inv.invoiceNumber}</td>
                      <td>{inv.employee?.fullName}<div className="muted small mono">{inv.employee?.employeeCode}</div></td>
                      <td>{inv.project?.name}</td>
                      <td className="nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                      <td className="right mono">{Number(inv.payableDays)} / {inv.workingDays}</td>
                      <td className="right mono nowrap">{formatMoney(inv.netAmount, inv.currency)}</td>
                      <td><Badge value={inv.status} /></td>
                      <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="link-btn" onClick={() => downloadPdf(inv.id, toast)}>Download</button>
                        {' · '}
                        <button className="link-btn" onClick={() => setPreviewing(inv)}>Preview</button>
                        {inv.status === 'issued' && (
                          <>
                            {' · '}
                            <button className="link-btn" onClick={() => setPaying(inv)}>Mark paid</button>
                          </>
                        )}
                        {' · '}
                        <button className="link-btn danger" onClick={() => setDeleting(inv)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={LIMIT} total={data.total} onPage={(p) => setParam('page', String(p))} />
          </>
        ) : null}
      </div>
      {previewing && (
        <PdfPreview
          title={`Invoice ${previewing.invoiceNumber}`}
          load={() => loadSignedPdf(() => api(`/invoices/${previewing.id}/pdf`))}
          onClose={() => setPreviewing(null)}
        />
      )}
      {paying && (
        <MarkPaidModal
          invoice={paying}
          path={`/invoices/${paying.id}`}
          amount={paying.netAmount}
          currency={paying.currency}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); reload(); }}
        />
      )}
      {deleting && (
        <DeleteInvoiceConfirm
          invoice={deleting}
          path={`/invoices/${deleting.id}`}
          onClose={() => setDeleting(null)}
          onDeleted={() => { toast(`${deleting.invoiceNumber} deleted`); setDeleting(null); reload(); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Breakdown (shared by preview and detail)
// ---------------------------------------------------------------------------
function Row({ label, children, total }) {
  return (
    <div className={`breakdown-row ${total ? 'total' : ''}`}>
      <span className={total ? '' : 'muted'}>{label}</span>
      <span className="mono right">{children}</span>
    </div>
  );
}

export function Breakdown({ calc }) {
  const cur = calc.currency;
  const multi = calc.salarySegments.length > 1;
  return (
    <div className="stack">
      {calc.warnings?.map((w) => (
        <div key={w.code} className="alert warning">
          {w.message}
          {w.dates?.length ? <div className="small" style={{ marginTop: 4 }}>{w.dates.map(formatDate).join(', ')}</div> : null}
        </div>
      ))}

      <div className="card card-body" style={{ textAlign: 'center' }}>
        <div className="muted">Net payable</div>
        <div className="net-figure">{formatMoney(calc.netAmount, cur)}</div>
        <div className="muted small">
          {formatDate(calc.periodStart)} – {formatDate(calc.periodEnd)} · {calc.payableDays} of {calc.workingDays} working days payable
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Attendance</h3></div>
        <div className="card-body">
          <Row label="Working days in period">{calc.workingDays}</Row>
          <Row label="Present">{calc.attendance.present}</Row>
          <Row label="Half days (× 0.5)">{calc.attendance.halfDay}</Row>
          <Row label="Paid leave">{calc.attendance.paidLeave}</Row>
          <Row label="Absent">{calc.attendance.absent}</Row>
          <Row label="Not marked (counted as 0)">{calc.attendance.unmarked}</Row>
          {calc.attendance.notAssigned > 0 && <Row label="Outside assignment / employment">{calc.attendance.notAssigned}</Row>}
          <Row label="Weekend">{calc.weekendDays.map((d) => WEEKDAYS[d]).join(', ') || 'None'}</Row>
          <Row label="Holidays">{calc.holidays.length ? calc.holidays.map((h) => `${formatDate(h.date)} ${h.name}`).join('; ') : 'None'}</Row>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Calculation</h3></div>
        <div className="card-body">
          {calc.salarySegments.map((s) => (
            <div key={s.effectiveMonth}>
              <Row label={`Monthly salary${multi ? ` (${formatDate(s.from)} – ${formatDate(s.to)})` : ''}`}>{formatMoney(s.monthlyAmount, cur)}</Row>
              <Row label={`Per-day rate (÷ ${calc.workingDays})`}>{formatMoney(s.perDayRate, cur)}</Row>
              {multi && <Row label={`Payable days × rate`}>{s.payableDays} → {formatMoney(s.amount, cur)}</Row>}
            </div>
          ))}
          <Row label="Payable days">{calc.payableDays}</Row>
          <Row label="Gross pay">{formatMoney(calc.grossAmount, cur)}</Row>
          {calc.adjustments.map((a, i) => (
            <Row key={i} label={`${a.type === 'deduction' ? 'Deduction' : 'Allowance'}: ${a.label}`}>
              {a.type === 'deduction' ? '− ' : '+ '}{formatMoney(a.amount, cur)}
            </Row>
          ))}
          <Row label="Net payable" total>{formatMoney(calc.netAmount, cur)}</Row>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
const newAdjustment = () => ({ type: 'allowance', label: '', amount: '' });

export function InvoiceNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [employeeId, setEmployeeId] = useState(params.get('employeeId') || '');
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(currentMonth());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [adjustments, setAdjustments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const projects = useAsync(loadProjects, []);
  const employee = useAsync(() => (employeeId ? api(`/employees/${employeeId}`) : null), [employeeId]);

  // Only offer projects the employee has been assigned to.
  const employeeProjects = useMemo(() => {
    const ids = new Set((employee.data?.assignments || []).map((a) => a.projectId));
    return (projects.data || []).filter((p) => ids.has(p.id));
  }, [employee.data, projects.data]);

  useEffect(() => {
    if (!employee.data) return;
    if (employeeProjects.length === 1) setProjectId(employeeProjects[0].id);
    else if (!employeeProjects.some((p) => p.id === projectId)) setProjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeProjects]);

  const project = projects.data?.find((p) => p.id === projectId);
  const derived = project && mode === 'month' ? billingPeriod(month, project.billingCycleStartDay) : null;

  // Any change makes the preview stale.
  useEffect(() => {
    setPreview(null);
    setExisting(null);
  }, [employeeId, projectId, mode, month, periodStart, periodEnd, adjustments]);

  const body = () => {
    const b = { employeeId, projectId };
    if (mode === 'month') b.month = month;
    else Object.assign(b, { periodStart, periodEnd });
    const adj = adjustments.filter((a) => a.label.trim() && a.amount !== '');
    if (adj.length) b.adjustments = adj.map((a) => ({ type: a.type, label: a.label.trim(), amount: Number(a.amount) }));
    return b;
  };

  const runPreview = async (e) => {
    e.preventDefault();
    setBusy('preview');
    setError(null);
    try {
      const result = await api('/invoices/preview', { method: 'POST', body: body() });
      setPreview(result);
      // Background check: is there already an issued invoice for this exact period?
      api('/invoices', { query: { employeeId, projectId, status: 'issued', from: result.periodStart, to: result.periodEnd, limit: 100 } })
        .then((issued) => setExisting(issued.data.find((i) => i.periodStart === result.periodStart && i.periodEnd === result.periodEnd) || null))
        .catch(() => {});
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('generate');
    setError(null);
    try {
      const res = await api('/invoices', { method: 'POST', body: body() });
      toast(`Invoice ${res.invoice.invoiceNumber} issued`);
      navigate(`/invoices/${res.invoice.id}`);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  const updateAdj = (i, patch) => setAdjustments((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <>
      <PageHeader crumbs={<Link to="/invoices">Salary invoices</Link>} title="Generate salary invoice" subtitle="Preview the pro-rata salary calculation, then issue the invoice and its PDF." />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={runPreview}>
          <div className="card-body stack">
            <Field label="Employee">
              <EmployeeSelect value={employeeId} onChange={setEmployeeId} required />
            </Field>
            <Field
              label="Project"
              hint={employeeId && employee.data && !employeeProjects.length ? 'This employee is not assigned to any project yet.' : undefined}
            >
              <ProjectSelect projects={employeeId ? employeeProjects : []} value={projectId} onChange={setProjectId} required placeholder={employeeId ? 'Select project…' : 'Choose an employee first'} />
            </Field>

            <div className="field">
              <span>Billing period</span>
              <div className="segmented" style={{ alignSelf: 'flex-start' }}>
                <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>By month</button>
                <button type="button" className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Custom dates</button>
              </div>
            </div>
            {mode === 'month' ? (
              <Field label="Invoice month" hint={derived ? `Period: ${formatDate(derived.start)} – ${formatDate(derived.end)} (project cycle starts on day ${project.billingCycleStartDay})` : 'The period follows the project’s billing cycle.'}>
                <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
              </Field>
            ) : (
              <div className="form-grid">
                <Field label="From"><input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required /></Field>
                <Field label="To"><input className="input" type="date" min={periodStart} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required /></Field>
              </div>
            )}

            <div className="field">
              <span>Adjustments</span>
              {adjustments.map((a, i) => (
                <div key={i} className="adj-row">
                  <select className="input" value={a.type} onChange={(e) => updateAdj(i, { type: e.target.value })} aria-label="Type">
                    <option value="allowance">+ Allowance</option>
                    <option value="deduction">− Deduction</option>
                  </select>
                  <input className="input" placeholder="Label, e.g. Travel" value={a.label} onChange={(e) => updateAdj(i, { label: e.target.value })} aria-label="Label" />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Amount" value={a.amount} onChange={(e) => updateAdj(i, { amount: e.target.value })} aria-label="Amount" />
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setAdjustments((l) => l.filter((_, j) => j !== i))} aria-label="Remove adjustment">✕</button>
                </div>
              ))}
              <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdjustments((l) => [...l, newAdjustment()])}>
                + Add allowance or deduction
              </button>
            </div>

            <ErrorAlert error={error} />
          </div>
          <div className="savebar">
            <span className="muted small">{preview ? 'Preview is up to date.' : 'Nothing is saved until you generate.'}</span>
            <div className="actions">
              <button className="btn" disabled={Boolean(busy)}>{busy === 'preview' ? 'Calculating…' : 'Preview'}</button>
              <button type="button" className="btn btn-primary" disabled={!preview || Boolean(busy)} onClick={generate}>
                {busy === 'generate' ? 'Generating…' : 'Generate invoice'}
              </button>
            </div>
          </div>
        </form>

        <div>
          {preview ? (
            <div className="stack">
              {existing && (
                <div className="alert info">
                  {existing.invoiceNumber} is already issued for this period. Generating a new invoice will void it.
                </div>
              )}
              <Breakdown calc={preview} />
            </div>
          ) : (
            <div className="card"><Empty>Fill in the form and click Preview to see the calculation.</Empty></div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export function InvoiceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data: inv, error, loading, reload } = useAsync(() => api(`/invoices/${id}`), [id]);
  const [voiding, setVoiding] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const navigate = useNavigate();

  if (loading && !inv) return <Loading />;
  if (error) return <ErrorAlert error={error} />;

  const b = inv.breakdown;
  const voidInvoice = async () => {
    if (!window.confirm(`Void ${inv.invoiceNumber}? This cannot be undone.`)) return;
    setVoiding(true);
    try {
      await api(`/invoices/${id}/void`, { method: 'POST' });
      toast(`${inv.invoiceNumber} voided`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={<Link to="/invoices">Salary invoices</Link>}
        title={<span className="mono">{inv.invoiceNumber}</span>}
        subtitle={<span className="actions" style={{ gap: 8 }}><Badge value={inv.status} /> Issued {formatDateTime(inv.createdAt)}</span>}
      >
        <button className="btn" onClick={() => setShowPdf(true)}>Preview PDF</button>
        <button className="btn" onClick={() => downloadPdf(inv.id, toast)}>Download</button>
        {inv.status === 'issued' && (
          <>
            <button className="btn btn-primary" onClick={() => setPaying(true)}>Mark as paid</button>
            <Link className="btn" to={`/invoices/new?employeeId=${inv.employeeId}&projectId=${inv.projectId}`}>Re-generate</Link>
            <button className="btn btn-danger" disabled={voiding} onClick={voidInvoice}>{voiding ? 'Voiding…' : 'Void'}</button>
          </>
        )}
        <button className="btn btn-danger" onClick={() => setDeleting(true)}>Delete</button>
      </PageHeader>
      {deleting && (
        <DeleteInvoiceConfirm
          invoice={inv}
          path={`/invoices/${inv.id}`}
          onClose={() => setDeleting(false)}
          onDeleted={() => { toast(`${inv.invoiceNumber} deleted`); navigate('/invoices', { replace: true }); }}
        />
      )}

      {inv.status === 'void' && (
        <div className="alert error" style={{ marginBottom: 16 }}>Voided {formatDateTime(inv.voidedAt)}. Kept for the audit trail.</div>
      )}
      {showPdf && <PdfPreview title={`Invoice ${inv.invoiceNumber}`} load={() => loadSignedPdf(() => api(`/invoices/${inv.id}/pdf`))} onClose={() => setShowPdf(false)} />}
      {inv.status === 'paid' && <PaidBanner invoice={inv} path={`/invoices/${inv.id}`} onChanged={reload} />}
      {paying && (
        <MarkPaidModal
          invoice={inv}
          path={`/invoices/${inv.id}`}
          amount={inv.netAmount}
          currency={inv.currency}
          onClose={() => setPaying(false)}
          onSaved={() => { setPaying(false); reload(); }}
        />
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Employee</h3></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Name</dt><dd><Link to={`/employees/${inv.employeeId}`}>{b.employee?.fullName}</Link></dd>
                <dt>Employee ID</dt><dd className="mono">{b.employee?.employeeCode}</dd>
                <dt>Designation</dt><dd>{b.employee?.designation || '—'}</dd>
                <dt>Department</dt><dd>{b.employee?.department || '—'}</dd>
              </dl>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Project</h3></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Project</dt><dd><Link to={`/projects/${inv.projectId}`}>{b.project?.name}</Link></dd>
                <dt>Client</dt><dd>{b.project?.clientName || '—'}</dd>
                <dt>Billing period</dt><dd>{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</dd>
                <dt>Generated by</dt><dd>{b.generatedBy}</dd>
              </dl>
            </div>
          </div>
        </div>
        <Breakdown calc={b} />
      </div>
    </>
  );
}
