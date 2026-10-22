-- Launch moved: game gate opens Mon Oct 26 2026, 8:30 PM CT (CDT, UTC-5) = 2026-10-27 01:30 UTC (was 10:30 AM CT / 15:30 UTC).
-- Keeps the pre-launch floors 11-20 HP softener running until the new opening. Idempotent. NOT run by the client; run in the SQL editor.
alter table public.tower_config alter column prelaunch_until set default '2026-10-27 01:30:00+00';
update public.tower_config set prelaunch_until = '2026-10-27 01:30:00+00' where id = 1;
select id, prelaunch_enabled, prelaunch_until from public.tower_config;
