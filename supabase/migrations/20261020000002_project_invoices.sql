-- Project-level (client) invoices: one invoice per project per period, one line per employee.

-- Monthly billing rate charged to the client for this employee on this project.
alter table public.project_assignments
  add column monthly_rate numeric(12,2) check (monthly_rate is null or monthly_rate >= 0);

-- Printed on client invoices.
alter table public.projects
  add column client_contact text,
  add column invoice_title text;

-- S2535, S2536, … (continues after the last manual invoice, S2534).
create sequence public.project_invoice_number_seq start with 2535;

create table public.project_invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id     uuid not null references public.projects (id),
  period_start   date not null,
  period_end     date not null,
  issue_date     date not null,
  due_date       date,
  currency       char(3) not null,
  lines          jsonb not null,
  total_amount   numeric(12,2) not null,
  breakdown      jsonb not null,
  pdf_path       text,
  status         public.invoice_status not null default 'issued',
  generated_by   uuid references public.profiles (id),
  voided_by      uuid references public.profiles (id),
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_invoices_period_chk check (period_end >= period_start)
);
create unique index project_invoices_one_issued_per_period_uidx
  on public.project_invoices (project_id, period_start, period_end)
  where status = 'issued';
create index project_invoices_project_idx on public.project_invoices (project_id);
create trigger project_invoices_updated_at before update on public.project_invoices
  for each row execute function public.set_updated_at();

create or replace function public.next_project_invoice_number()
returns text language sql security definer set search_path = public as $$
  select 'S' || nextval('public.project_invoice_number_seq')::text;
$$;

-- Atomically void any issued invoice for the same project/period and insert the new one.
create or replace function public.issue_project_invoice(p jsonb)
returns public.project_invoices language plpgsql security definer set search_path = public as $$
declare
  v public.project_invoices;
begin
  update public.project_invoices
     set status = 'void', voided_at = now(), voided_by = (p ->> 'generated_by')::uuid
   where project_id   = (p ->> 'project_id')::uuid
     and period_start = (p ->> 'period_start')::date
     and period_end   = (p ->> 'period_end')::date
     and status = 'issued';

  insert into public.project_invoices (
    invoice_number, project_id, period_start, period_end, issue_date, due_date,
    currency, lines, total_amount, breakdown, pdf_path, status, generated_by
  ) values (
    p ->> 'invoice_number',
    (p ->> 'project_id')::uuid,
    (p ->> 'period_start')::date,
    (p ->> 'period_end')::date,
    (p ->> 'issue_date')::date,
    nullif(p ->> 'due_date', '')::date,
    p ->> 'currency',
    p -> 'lines',
    (p ->> 'total_amount')::numeric,
    p -> 'breakdown',
    p ->> 'pdf_path',
    'issued',
    (p ->> 'generated_by')::uuid
  ) returning * into v;

  return v;
end $$;

revoke execute on function public.next_project_invoice_number() from public, anon, authenticated;
revoke execute on function public.issue_project_invoice(jsonb) from public, anon, authenticated;

alter table public.project_invoices enable row level security;
create policy "admins do everything" on public.project_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
