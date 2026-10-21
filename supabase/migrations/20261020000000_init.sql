-- Employee Payroll & Invoicing — initial schema
-- Money columns are numeric(12,2). Invoices store a frozen snapshot of the numbers they were built from.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'user');
create type public.employment_status as enum ('on_role', 'off_role');
create type public.attendance_status as enum ('present', 'half_day', 'paid_leave', 'absent');
create type public.invoice_status as enum ('issued', 'void');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  employee_code     text not null unique,
  full_name         text not null,
  email             text,
  designation       text,
  department        text,
  date_of_joining   date,
  employment_status public.employment_status not null default 'on_role',
  off_role_date     date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint employees_off_role_date_chk
    check (employment_status = 'on_role' or off_role_date is not null)
);
create index employees_status_idx on public.employees (employment_status);
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles (one row per login)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.app_role not null default 'user',
  employee_id uuid unique references public.employees (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile whenever an auth user is created (sign-up or admin invite).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects & assignments
-- ---------------------------------------------------------------------------
create table public.projects (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  client_name             text,
  billing_cycle_start_day smallint not null default 1
    check (billing_cycle_start_day between 1 and 28),
  weekend_days            smallint[] not null default '{0,6}'
    check (weekend_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  currency                char(3) not null default 'INR',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_assignments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id),
  project_id  uuid not null references public.projects (id),
  start_date  date not null,
  end_date    date,
  role_title  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_assignments_dates_chk check (end_date is null or end_date >= start_date)
);
create index project_assignments_employee_idx on public.project_assignments (employee_id, project_id);
create index project_assignments_project_idx on public.project_assignments (project_id);
create trigger project_assignments_updated_at before update on public.project_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id),
  date        date not null,
  status      public.attendance_status not null,
  notes       text,
  marked_by   uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, date)
);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- holidays (project_id null = applies to all projects)
-- ---------------------------------------------------------------------------
create table public.holidays (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  name       text not null,
  project_id uuid references public.projects (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index holidays_date_project_uidx
  on public.holidays (date, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
create trigger holidays_updated_at before update on public.holidays
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- salaries
-- ---------------------------------------------------------------------------
create table public.salaries (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id),
  effective_month date not null check (extract(day from effective_month) = 1),
  monthly_amount  numeric(12,2) not null check (monthly_amount >= 0),
  currency        char(3) not null default 'INR',
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, effective_month)
);
create trigger salaries_updated_at before update on public.salaries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create sequence public.invoice_number_seq;

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  employee_id    uuid not null references public.employees (id),
  project_id     uuid not null references public.projects (id),
  period_start   date not null,
  period_end     date not null,
  working_days   integer not null,
  payable_days   numeric(6,1) not null,
  gross_amount   numeric(12,2) not null,
  adjustments    jsonb not null default '[]'::jsonb,
  net_amount     numeric(12,2) not null,
  currency       char(3) not null,
  breakdown      jsonb not null,
  pdf_path       text,
  status         public.invoice_status not null default 'issued',
  generated_by   uuid references public.profiles (id),
  voided_by      uuid references public.profiles (id),
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint invoices_period_chk check (period_end >= period_start)
);
-- Only one issued invoice per employee / project / period.
create unique index invoices_one_issued_per_period_uidx
  on public.invoices (employee_id, project_id, period_start, period_end)
  where status = 'issued';
create index invoices_employee_idx on public.invoices (employee_id);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- INV-YYYY-MM-000123
create or replace function public.next_invoice_number(p_period_end date)
returns text language sql security definer set search_path = public as $$
  select 'INV-' || to_char(p_period_end, 'YYYY-MM') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

-- Atomically void any issued invoice for the same employee/project/period and insert the new one.
create or replace function public.issue_invoice(p jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v public.invoices;
begin
  update public.invoices
     set status = 'void', voided_at = now(), voided_by = (p ->> 'generated_by')::uuid
   where employee_id  = (p ->> 'employee_id')::uuid
     and project_id   = (p ->> 'project_id')::uuid
     and period_start = (p ->> 'period_start')::date
     and period_end   = (p ->> 'period_end')::date
     and status = 'issued';

  insert into public.invoices (
    invoice_number, employee_id, project_id, period_start, period_end,
    working_days, payable_days, gross_amount, adjustments, net_amount,
    currency, breakdown, pdf_path, status, generated_by
  ) values (
    p ->> 'invoice_number',
    (p ->> 'employee_id')::uuid,
    (p ->> 'project_id')::uuid,
    (p ->> 'period_start')::date,
    (p ->> 'period_end')::date,
    (p ->> 'working_days')::integer,
    (p ->> 'payable_days')::numeric,
    (p ->> 'gross_amount')::numeric,
    coalesce(p -> 'adjustments', '[]'::jsonb),
    (p ->> 'net_amount')::numeric,
    p ->> 'currency',
    p -> 'breakdown',
    p ->> 'pdf_path',
    'issued',
    (p ->> 'generated_by')::uuid
  ) returning * into v;

  return v;
end $$;

revoke execute on function public.next_invoice_number(date) from public, anon, authenticated;
revoke execute on function public.issue_invoice(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security (second line of defence; the API uses the service role)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'employees', 'projects', 'project_assignments',
    'attendance', 'holidays', 'salaries', 'invoices'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admins do everything" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t
    );
  end loop;
end $$;

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "users read own employee record" on public.employees
  for select to authenticated
  using (id = (select employee_id from public.profiles where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for invoice PDFs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;
