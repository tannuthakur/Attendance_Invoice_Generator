-- Invoices can be marked as paid once the payment is received.
alter type public.invoice_status add value if not exists 'paid';

alter table public.invoices
  add column if not exists paid_at date,
  add column if not exists paid_by uuid references public.profiles (id),
  add column if not exists payment_reference text,
  add column if not exists payment_note text;

alter table public.project_invoices
  add column if not exists paid_at date,
  add column if not exists paid_by uuid references public.profiles (id),
  add column if not exists payment_reference text,
  add column if not exists payment_note text;

-- One live (issued or paid) invoice per period; void ones don't count.
-- (Written as "<> 'void'" because a new enum value can't be used in the same transaction.)
drop index if exists public.invoices_one_issued_per_period_uidx;
create unique index if not exists invoices_one_live_per_period_uidx
  on public.invoices (employee_id, project_id, period_start, period_end)
  where status <> 'void';

drop index if exists public.project_invoices_one_issued_per_period_uidx;
create unique index if not exists project_invoices_one_live_per_period_uidx
  on public.project_invoices (project_id, period_start, period_end)
  where status <> 'void';
