-- Work from home: a paid working day, counted separately from 'present'.
alter type public.attendance_status add value if not exists 'wfh' after 'present';
