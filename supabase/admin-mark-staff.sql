-- $LOGOUT admin: mark a Tower ID (auth user id, shown in More > System > Tower ID) as a TEAM STAFF account. Run in the SQL editor
-- after schema-addendum-team-staff.sql. Idempotent. Never touches the GM (role = 'gm' rows are skipped). Grants no perks: the account
-- stays a normal hero, gets a STAFF tag, and is left off the leaderboard, rankings and every reward list.
-- Replace the id below (one statement per account).
update public.profiles set team = true where id = '00000000-0000-0000-0000-000000000000' and role is distinct from 'gm';
update public.damage set is_staff = true, is_team = true where user_id = '00000000-0000-0000-0000-000000000000' and public.is_team(user_id); -- existing board rows
select id, role, team from public.profiles where id = '00000000-0000-0000-0000-000000000000';
-- Undo: update public.profiles set team = false where id = '<id>';  update public.damage set is_team = false, is_staff = false where user_id = '<id>';
