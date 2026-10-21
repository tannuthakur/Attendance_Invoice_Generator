import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fetchFile, saveUrl } from '../api';
import { PdfPreview, loadSignedPdf } from '../components/PdfPreview';
import { DeleteInvoiceConfirm } from '../components/DeleteConfirm';
import { MarkPaidModal, PaidBanner } from '../components/PaymentModal';
import { Badge, Empty, ErrorAlert, Field, FormModal, Loading, PageHeader, Pagination, useAsync, useDebounced, useToast } from '../components/ui';
import { ProjectSelect, loadProjects } from '../components/pickers';
import { billingPeriod, currentMonth, formatDate, formatDateTime, formatMoney, todayIso } from '../format';

const LIMIT = 20;
const orderKey = (projectId) => `payroll.lineOrder.${projectId}`;
const readOrder = (projectId) => {
  try {
    return JSON.parse(localStorage.getItem(orderKey(projectId))) || [];
  } catch {
    return [];
  }
};
const writeOrder = (projectId, ids) => {
  try {
    localStorage.setItem(orderKey(projectId), JSON.stringify(ids));
  } catch {
    // Storage unavailable: the order just isn't remembered.
  }
};
const cents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

/** Downloads the stored PDF as "INVOICE S2535.pdf". */
async function downloadPdf(id, toast) {
  try {
    const { pdfUrl, fileName } = await api(`/project-invoices/${id}/pdf`, { query: { download: 1 } });
    saveUrl(pdfUrl.url, fileName);
  } catch (err) {
    toast(err.message, 'error');
  }
}

const loadStoredPdf = (id) => () => loadSignedPdf(() => api(`/project-invoices/${id}/pdf`));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function ProjectInvoicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || '';
  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(params.get('search') || '');
  const debouncedSearch = useDebounced(search);
  const filtered = Boolean(projectId || status || from || to || search);
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
    () => api('/project-invoices', { query: { page, limit: LIMIT, projectId, status, from, to, search: debouncedSearch.trim() } }),
    [page, projectId, status, from, to, debouncedSearch],
  );

  return (
    <>
      <PageHeader title="Client invoices" subtitle="One invoice per project and billing period, with a line for each employee.">
        <Link className="btn btn-primary" to={`/project-invoices/new${projectId ? `?projectId=${projectId}` : ''}`}>New client invoice</Link>
      </PageHeader>
      <div className="toolbar">
        <div style={{ minWidth: 220 }}><ProjectSelect value={projectId} onChange={(v) => setParam('projectId', v)} placeholder="All projects" /></div>
        <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="issued">Issued (unpaid)</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <input className="input" placeholder="Invoice no." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 0, width: 130 }} aria-label="Invoice number" />
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
          <Empty>{filtered ? 'No client invoices match these filters.' : <>No client invoices yet. <Link to="/project-invoices/new">Create the first one</Link>.</>}</Empty>
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Project</th><th>Period</th><th>Issued</th><th>Due</th><th className="right">Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.data.map((inv) => (
                    <tr key={inv.id} className="clickable" onClick={() => navigate(`/project-invoices/${inv.id}`)}>
                      <td className="mono nowrap">{inv.invoiceNumber}</td>
                      <td>{inv.project?.name}<div className="muted small">{inv.project?.clientName}</div></td>
                      <td className="nowrap">{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</td>
                      <td className="nowrap">{formatDate(inv.issueDate)}</td>
                      <td className="nowrap">{formatDate(inv.dueDate)}</td>
                      <td className="right mono nowrap">{formatMoney(inv.totalAmount, inv.currency.trim())}</td>
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
        <PdfPreview title={`Invoice ${previewing.invoiceNumber}`} load={loadStoredPdf(previewing.id)} onClose={() => setPreviewing(null)} />
      )}
      {paying && (
        <MarkPaidModal
          invoice={paying}
          path={`/project-invoices/${paying.id}`}
          amount={paying.totalAmount}
          currency={paying.currency.trim()}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); reload(); }}
        />
      )}
      {deleting && (
        <DeleteInvoiceConfirm
          invoice={deleting}
          path={`/project-invoices/${deleting.id}`}
          onClose={() => setDeleting(null)}
          onDeleted={() => { toast(`${deleting.invoiceNumber} deleted`); setDeleting(null); reload(); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
export function ProjectInvoiceNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(currentMonth());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [suggested, setSuggested] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [preview, setPreview] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [texts, setTexts] = useState({});
  const [extras, setExtras] = useState([]);
  const [order, setOrder] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const projects = useAsync(loadProjects, []);
  const project = projects.data?.find((p) => p.id === projectId);

  // Pre-fill the next invoice number; the user can overwrite it.
  useEffect(() => {
    api('/project-invoices/next-number').then(({ invoiceNumber: next }) => {
      setSuggested(next);
      setInvoiceNumber((cur) => cur || next);
    }, () => {});
  }, []);
  const derived = project && mode === 'month' ? billingPeriod(month, project.billingCycleStartDay) : null;

  // Changing what is calculated makes the preview stale; text edits, exclusions and extra lines do not.
  useEffect(() => {
    setPreview(null);
    setExcluded(new Set());
    setTexts({});
    setOrder([]);
  }, [projectId, mode, month, periodStart, periodEnd]);

  const request = (forGenerate) => {
    const b = { projectId, issueDate, order: order.length ? order : readOrder(projectId) };
    if (!b.order.length) delete b.order;
    if (mode === 'month') b.month = month;
    else Object.assign(b, { periodStart, periodEnd });
    if (dueDate) b.dueDate = dueDate;
    if (invoiceNumber.trim()) b.invoiceNumber = invoiceNumber.trim();
    if (!forGenerate) return b;
    if (excluded.size) b.employeeIds = preview.lines.filter((l) => !excluded.has(l.employeeId)).map((l) => l.employeeId);
    const overrides = Object.entries(texts)
      .filter(([id, text]) => text.trim() && text !== preview.lines.find((l) => l.employeeId === id)?.defaultText)
      .map(([employeeId, text]) => ({ employeeId, text: text.trim() }));
    if (overrides.length) b.overrides = overrides;
    const extraLines = extras.filter((x) => x.description.trim() && x.amount !== '').map((x) => ({ description: x.description.trim(), amount: Number(x.amount) }));
    if (extraLines.length) b.extraLines = extraLines;
    return b;
  };

  const runPreview = async (e) => {
    e?.preventDefault();
    setBusy('preview');
    setError(null);
    try {
      const result = await api('/project-invoices/preview', { method: 'POST', body: request(false) });
      setPreview(result);
      setOrder(result.lines.map((l) => l.employeeId));
      setTexts(Object.fromEntries(result.lines.map((l) => [l.employeeId, l.text])));
      if (!dueDate) setDueDate(result.dueDate);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const ordered = preview
    ? [...preview.lines].sort((a, b) => order.indexOf(a.employeeId) - order.indexOf(b.employeeId))
    : [];
  const included = ordered.filter((l) => !excluded.has(l.employeeId));
  const move = (id, delta) =>
    setOrder((current) => {
      const i = current.indexOf(id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= current.length) return current;
      const next = [...current];
      [next[i], next[j]] = [next[j], next[i]];
      writeOrder(projectId, next);
      return next;
    });
  const validExtras = extras.filter((x) => x.description.trim() && x.amount !== '' && !Number.isNaN(Number(x.amount)));
  const total = useMemo(
    () => fromCents(included.reduce((a, l) => a + cents(l.amount), 0) + validExtras.reduce((a, x) => a + cents(x.amount), 0)),
    [included, validExtras],
  );
  const currency = preview?.currency || project?.currency?.trim() || 'USD';

  const previewPdf = () => {
    if (!included.length && !validExtras.length) return setError(new Error('Select at least one employee or add a line.'));
    setError(null);
    setShowPdf(true);
  };

  const generate = async () => {
    if (!included.length && !validExtras.length) return setError(new Error('Select at least one employee or add a line.'));
    setBusy('generate');
    setError(null);
    try {
      const res = await api('/project-invoices', { method: 'POST', body: request(true) });
      toast(`Invoice ${res.invoice.invoiceNumber} issued`);
      navigate(`/project-invoices/${res.invoice.id}`);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  const toggle = (id) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const updateExtra = (i, patch) => setExtras((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <PageHeader
        crumbs={<Link to="/project-invoices">Client invoices</Link>}
        title="New client invoice"
        subtitle="One invoice for the project, with a line per employee: monthly rate minus leave days."
      />

      <form className="card" onSubmit={runPreview} style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Field label="Project">
              <ProjectSelect projects={projects.data || []} value={projectId} onChange={setProjectId} required />
            </Field>
            <div className="field">
              <span>Billing period</span>
              <div className="segmented" style={{ alignSelf: 'flex-start' }}>
                <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>By month</button>
                <button type="button" className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Custom dates</button>
              </div>
            </div>
            {mode === 'month' ? (
              <Field label="Invoice month" hint={derived ? `${formatDate(derived.start)} – ${formatDate(derived.end)}` : 'Follows the project’s billing cycle'}>
                <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
              </Field>
            ) : (
              <>
                <Field label="From"><input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required /></Field>
                <Field label="To"><input className="input" type="date" min={periodStart} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required /></Field>
              </>
            )}
            <Field label="Invoice date">
              <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
            </Field>
            <Field label="Due date" hint="Default: the 5th of the following month.">
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field
              label="Invoice number"
              hint={suggested && invoiceNumber.trim() !== suggested ? <>Next available: <button type="button" className="link-btn" onClick={() => setInvoiceNumber(suggested)}>{suggested}</button></> : 'Pre-filled with the next number; you can change it.'}
            >
              <input className="input mono" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={suggested || 'S2535'} maxLength={30} required />
            </Field>
          </div>
          <ErrorAlert error={error} />
        </div>
        <div className="savebar">
          <span className="muted small">{preview ? 'Edit lines below, then generate.' : 'Preview first. Nothing is saved until you generate.'}</span>
          <div className="actions">
            <button className="btn" disabled={Boolean(busy) || !projectId}>{busy === 'preview' ? 'Calculating…' : preview ? 'Recalculate' : 'Preview'}</button>
            <button type="button" className="btn" disabled={!preview || Boolean(busy)} onClick={previewPdf} title="See the PDF exactly as it will be issued, without saving anything">
              Preview PDF
            </button>
            <button type="button" className="btn btn-primary" disabled={!preview || Boolean(busy)} onClick={generate}>
              {busy === 'generate' ? 'Generating…' : 'Generate invoice'}
            </button>
          </div>
        </div>
      </form>

      {showPdf && (
        <PdfPreview
          title={`Preview: invoice ${invoiceNumber.trim() || suggested}`}
          load={() => fetchFile('/project-invoices/preview/pdf', { body: request(true), fallbackName: `INVOICE ${invoiceNumber.trim() || suggested}.pdf` })}
          onClose={() => setShowPdf(false)}
        />
      )}

      {preview && (
        <div className="stack">
          {preview.warnings.length > 0 && (
            <div className="alert warning">
              {preview.warnings.map((w, i) => <div key={i}>{w.message}</div>)}
            </div>
          )}
          {preview.skipped.length > 0 && (
            <SkippedPanel projectId={projectId} currency={currency} skipped={preview.skipped} onRateSaved={() => runPreview()} />
          )}

          <div className="card">
            <div className="card-head">
              <div>
                <h2>Particulars ({preview.periodLabel})</h2>
                <div className="muted small">
                  {preview.periodDays} calendar days · {preview.workingDays} working days · To {preview.project.clientContact || preview.project.clientName || '—'}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th style={{ width: 44 }} /><th>Line text (editable)</th><th className="right">Rate</th><th className="right">Per day</th><th className="right">Days off</th><th className="right">Amount</th></tr>
                </thead>
                <tbody>
                  {ordered.map((l, i) => {
                    const off = excluded.has(l.employeeId);
                    return (
                      <tr key={l.employeeId} style={off ? { opacity: 0.45 } : undefined}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ height: 20, padding: '0 6px' }} disabled={i === 0} onClick={() => move(l.employeeId, -1)} aria-label={`Move ${l.fullName} up`}>↑</button>
                            <input type="checkbox" checked={!off} onChange={() => toggle(l.employeeId)} aria-label={`Include ${l.fullName}`} />
                            <button type="button" className="btn btn-ghost btn-sm" style={{ height: 20, padding: '0 6px' }} disabled={i === ordered.length - 1} onClick={() => move(l.employeeId, 1)} aria-label={`Move ${l.fullName} down`}>↓</button>
                          </div>
                        </td>
                        <td style={{ minWidth: 420, width: '55%' }}>
                          <div className="actions" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                            <span className="muted mono" style={{ paddingTop: 8 }}>{off ? '–' : included.indexOf(l) + 1}.</span>
                            <textarea
                              className="input"
                              rows={2}
                              style={{ minHeight: 0, resize: 'vertical' }}
                              value={texts[l.employeeId] ?? l.text}
                              disabled={off}
                              onChange={(e) => setTexts((t) => ({ ...t, [l.employeeId]: e.target.value }))}
                              aria-label={`Line text for ${l.fullName}`}
                            />
                          </div>
                          <div className="muted small" style={{ marginTop: 3 }}>
                            {l.fullName} · {l.coveredDays}/{l.periodDays} days on project
                            {l.leaveDays ? ` · ${l.leaveDays} leave day${l.leaveDays === 1 ? '' : 's'}` : ''}
                            {l.unmarkedDays ? ` · ${l.unmarkedDays} unmarked` : ''}
                          </div>
                        </td>
                        <td className="right mono nowrap">{formatMoney(l.monthlyRate, currency)}</td>
                        <td className="right mono nowrap">{formatMoney(l.perDayRate, currency)}</td>
                        <td className="right mono">{l.leaveDays + l.offProjectDays}</td>
                        <td className="right mono nowrap"><strong>{formatMoney(l.amount, currency)}</strong></td>
                      </tr>
                    );
                  })}
                  {extras.map((x, i) => (
                    <tr key={`x${i}`}>
                      <td><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setExtras((list) => list.filter((_, j) => j !== i))} aria-label="Remove line">✕</button></td>
                      <td><input className="input" placeholder="Description, e.g. Server costs" value={x.description} onChange={(e) => updateExtra(i, { description: e.target.value })} /></td>
                      <td colSpan={3} className="muted small right">Use a negative amount for a discount</td>
                      <td className="right"><input className="input right" type="number" step="0.01" placeholder="0.00" value={x.amount} onChange={(e) => updateExtra(i, { amount: e.target.value })} style={{ width: 120 }} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td />
                    <td colSpan={5}>
                      <button type="button" className="link-btn" onClick={() => setExtras((l) => [...l, { description: '', amount: '' }])}>+ Add another line</button>
                    </td>
                  </tr>
                  <tr>
                    <td />
                    <td colSpan={4}><strong>TOTAL DUE</strong></td>
                    <td className="right mono nowrap"><strong>{currency} {total}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Employees left off the invoice, with an inline fix for a missing monthly rate. */
function SkippedPanel({ projectId, currency, skipped, onRateSaved }) {
  const toast = useToast();
  const [rates, setRates] = useState({});
  const [saving, setSaving] = useState(null);

  const saveRate = async (s) => {
    const value = Number(rates[s.employeeId]);
    if (!rates[s.employeeId] || Number.isNaN(value) || value < 0) return toast('Enter a monthly rate', 'error');
    setSaving(s.employeeId);
    try {
      for (const assignmentId of s.assignmentIds) {
        await api(`/projects/${projectId}/assignments/${assignmentId}`, { method: 'PATCH', body: { monthlyRate: value } });
      }
      toast(`Rate saved for ${s.fullName}`);
      await onRateSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Not on this invoice ({skipped.length})</h2>
          <div className="muted small">These employees are on the project but can't be billed yet.</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {skipped.map((s) => (
              <tr key={s.employeeId}>
                <td><Link to={`/employees/${s.employeeId}`}>{s.fullName}</Link><div className="muted small">{s.reason}</div></td>
                <td className="right">
                  {s.code === 'NO_RATE' && s.assignmentIds?.length ? (
                    <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Monthly rate (${currency})`}
                        value={rates[s.employeeId] || ''}
                        onChange={(e) => setRates((r) => ({ ...r, [s.employeeId]: e.target.value }))}
                        style={{ width: 170 }}
                        aria-label={`Monthly rate for ${s.fullName}`}
                      />
                      <button type="button" className="btn btn-primary btn-sm" disabled={saving === s.employeeId} onClick={() => saveRate(s)}>
                        {saving === s.employeeId ? 'Saving…' : 'Save rate & recalculate'}
                      </button>
                    </div>
                  ) : (
                    <Link to={`/projects/${projectId}`} className="small">Open project</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export function ProjectInvoiceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data: inv, error, loading, reload } = useAsync(() => api(`/project-invoices/${id}`), [id]);
  const [voiding, setVoiding] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const navigate = useNavigate();

  if (loading && !inv) return <Loading />;
  if (error) return <ErrorAlert error={error} />;

  const b = inv.breakdown;
  const cur = inv.currency.trim();
  const voidInvoice = async () => {
    if (!window.confirm(`Void ${inv.invoiceNumber}? This cannot be undone.`)) return;
    setVoiding(true);
    try {
      await api(`/project-invoices/${id}/void`, { method: 'POST' });
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
        crumbs={<Link to="/project-invoices">Client invoices</Link>}
        title={<span className="mono">{inv.invoiceNumber}</span>}
        subtitle={<span className="actions" style={{ gap: 8 }}><Badge value={inv.status} /> {b.project?.name} · Created {formatDateTime(inv.createdAt)}</span>}
      >
        <button className="btn" onClick={() => setShowPdf(true)}>Preview PDF</button>
        <button className="btn" onClick={() => downloadPdf(inv.id, toast)}>Download</button>
        {inv.status !== 'void' && <button className="btn" onClick={() => setRenaming(true)}>Edit number</button>}
        {inv.status === 'issued' && (
          <>
            <button className="btn btn-primary" onClick={() => setPaying(true)}>Mark as paid</button>
            <Link className="btn" to={`/project-invoices/new?projectId=${inv.projectId}`}>Re-generate</Link>
            <button className="btn btn-danger" disabled={voiding} onClick={voidInvoice}>{voiding ? 'Voiding…' : 'Void'}</button>
          </>
        )}
        <button className="btn btn-danger" onClick={() => setDeleting(true)}>Delete</button>
      </PageHeader>
      {deleting && (
        <DeleteInvoiceConfirm
          invoice={inv}
          path={`/project-invoices/${inv.id}`}
          onClose={() => setDeleting(false)}
          onDeleted={() => { toast(`${inv.invoiceNumber} deleted`); navigate('/project-invoices', { replace: true }); }}
        />
      )}

      {inv.status === 'void' && (
        <div className="alert error" style={{ marginBottom: 16 }}>Voided {formatDateTime(inv.voidedAt)}. Kept for the audit trail.</div>
      )}
      {inv.status === 'paid' && <PaidBanner invoice={inv} path={`/project-invoices/${inv.id}`} onChanged={reload} />}
      {paying && (
        <MarkPaidModal
          invoice={inv}
          path={`/project-invoices/${inv.id}`}
          amount={inv.totalAmount}
          currency={inv.currency.trim()}
          onClose={() => setPaying(false)}
          onSaved={() => { setPaying(false); reload(); }}
        />
      )}
      {showPdf && <PdfPreview key={inv.pdfPath} title={`Invoice ${inv.invoiceNumber}`} load={loadStoredPdf(inv.id)} onClose={() => setShowPdf(false)} />}
      {renaming && (
        <RenumberModal
          invoice={inv}
          onClose={() => setRenaming(false)}
          onSaved={(updated) => { setRenaming(false); toast(`Renumbered to ${updated.invoiceNumber}; PDF regenerated`); reload(); }}
        />
      )}

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="label">Total due</div><div className="value" style={{ fontSize: 22 }}>{formatMoney(inv.totalAmount, cur)}</div></div>
        <div className="card stat"><div className="label">Billing period</div><div style={{ fontWeight: 600, marginTop: 4 }}>{formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</div></div>
        <div className="card stat"><div className="label">Invoice date</div><div style={{ fontWeight: 600, marginTop: 4 }}>{formatDate(inv.issueDate)}</div></div>
        <div className="card stat"><div className="label">Due date</div><div style={{ fontWeight: 600, marginTop: 4 }}>{formatDate(inv.dueDate)}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Particulars ({b.periodLabel})</h2>
            <div className="muted small">To {b.project?.clientContact || b.project?.clientName || '—'} · Generated by {b.generatedBy}</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Particulars</th><th className="right">Rate</th><th className="right">Days off</th><th className="right">Total ({cur})</th></tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    {l.text}
                    {l.employeeId && <div className="muted small"><Link to={`/employees/${l.employeeId}`}>{l.fullName}</Link></div>}
                  </td>
                  <td className="right mono nowrap">{l.monthlyRate ? formatMoney(l.monthlyRate, cur) : '—'}</td>
                  <td className="right mono">{l.extra ? '—' : l.leaveDays + l.offProjectDays}</td>
                  <td className="right mono nowrap">{formatMoney(l.amount, cur)}</td>
                </tr>
              ))}
              <tr>
                <td />
                <td colSpan={3}><strong>TOTAL DUE</strong></td>
                <td className="right mono nowrap"><strong>{cur} {Number(inv.totalAmount).toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function RenumberModal({ invoice, onClose, onSaved }) {
  const [number, setNumber] = useState(invoice.invoiceNumber);
  const submit = async () => {
    const updated = await api(`/project-invoices/${invoice.id}`, { method: 'PATCH', body: { invoiceNumber: number.trim() } });
    onSaved(updated);
  };
  return (
    <FormModal title={`Edit invoice number`} submitLabel="Save and regenerate PDF" onSubmit={submit} onClose={onClose}>
      <Field label="Invoice number" hint="The PDF is regenerated with the new number; everything else stays the same.">
        <input className="input mono" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={30} required autoFocus />
      </Field>
    </FormModal>
  );
}
