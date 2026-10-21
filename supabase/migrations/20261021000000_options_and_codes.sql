-- 1) Auto-generated employee IDs that continue the existing numbering: 01, 02, … → 05, 06, …
--    (zero-padded to 2 digits; existing codes are kept unchanged).
create sequence if not exists public.employee_code_seq;
select setval(
  'public.employee_code_seq',
  coalesce((select max(employee_code::int) from public.employees where employee_code ~ '^\d+$'), 0) + 1,
  false
);
alter table public.employees
  alter column employee_code set default lpad(nextval('public.employee_code_seq')::text, 2, '0');

-- 2) Managed lists: employee designations and project roles.
create type public.option_kind as enum ('designation', 'role');

create table public.job_options (
  id         uuid primary key default gen_random_uuid(),
  kind       public.option_kind not null,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index job_options_kind_name_uidx on public.job_options (kind, lower(name));
create trigger job_options_updated_at before update on public.job_options
  for each row execute function public.set_updated_at();

alter table public.job_options enable row level security;
create policy "admins do everything" on public.job_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed with values already in use, plus common defaults (edit or delete them in the app).
insert into public.job_options (kind, name)
select distinct 'designation'::public.option_kind, trim(designation)
  from public.employees where coalesce(trim(designation), '') <> ''
on conflict do nothing;

insert into public.job_options (kind, name)
select distinct 'role'::public.option_kind, trim(role_title)
  from public.project_assignments where coalesce(trim(role_title), '') <> ''
on conflict do nothing;

insert into public.job_options (kind, name)
select 'designation'::public.option_kind, v from unnest(array[
  'Software Engineer', 'Senior Software Engineer', 'Team Lead', 'Project Manager',
  'UI/UX Designer', 'QA Engineer', 'Intern'
]) as v
on conflict do nothing;

insert into public.job_options (kind, name)
select 'role'::public.option_kind, v from unnest(array[
  'React Native Developer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer',
  'UI/UX Developer', 'QA Engineer', 'DevOps Engineer', 'Project Manager'
]) as v
on conflict do nothing;
