-- Default currency is USD. Existing rows keep their currency.
alter table public.projects alter column currency set default 'USD';
alter table public.salaries alter column currency set default 'USD';
