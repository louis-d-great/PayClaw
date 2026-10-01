-- Tests for the live app's actions (0002_live_actions.sql). Run with supabase/tests/run.sh.
-- People: Louis (Lead), Ada (invited designer), Tobi (crew elsewhere), Sam (applies for an open role).
\set ON_ERROR_STOP on
\set QUIET on
\t on
\pset format unaligned

reset role;
insert into auth.users values
  ('10000000-0000-0000-0000-00000000000a'), ('10000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000c'), ('10000000-0000-0000-0000-00000000000d');

create function pg_temp.act_as(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

create function pg_temp.refused(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok   refused: %', label;
    return;
  end;
  raise exception 'FAIL should be refused: %', label;
end $$;

create function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

set role authenticated;

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
insert into profiles (id, handle, name) values ('10000000-0000-0000-0000-00000000000a', 'louis2', 'Louis');
select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
insert into profiles (id, handle, name) values ('10000000-0000-0000-0000-00000000000b', 'ada2', 'Ada');
select pg_temp.act_as('10000000-0000-0000-0000-00000000000c');
insert into profiles (id, handle, name) values ('10000000-0000-0000-0000-00000000000c', 'tobi2', 'Tobi');
select pg_temp.act_as('10000000-0000-0000-0000-00000000000d');
insert into profiles (id, handle, name) values ('10000000-0000-0000-0000-00000000000d', 'sam2', 'Sam');

-- ---------------------------------------------------------------- create

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select pg_temp.refused($$select create_project('{"id":"20000000-0000-0000-0000-000000000009","name":"X","brief":"b","roles":[
  {"id":"30000000-0000-0000-0000-000000000009","title":"Mix","assignee":"@nobody","pay":100,"depositPct":0,
   "milestones":[{"id":"40000000-0000-0000-0000-000000000009","title":"Mix","doneWhen":"Delivered","pct":100}]}]}')$$,
  'inviting a handle that does not exist');
select pg_temp.refused($$select create_project('{"id":"20000000-0000-0000-0000-000000000009","name":"X","brief":"b","roles":[
  {"id":"30000000-0000-0000-0000-000000000009","title":"Mix","assignee":"","pay":100,"depositPct":20,
   "milestones":[{"id":"40000000-0000-0000-0000-000000000009","title":"Mix","doneWhen":"Delivered","pct":70}]}]}')$$,
  'payment plan that does not add up to 100');
select pg_temp.refused($$select create_project('{"id":"20000000-0000-0000-0000-000000000009","name":"X","brief":"b","roles":[
  {"id":"30000000-0000-0000-0000-000000000009","title":"Mix","assignee":"@louis2","pay":100,"depositPct":0,
   "milestones":[{"id":"40000000-0000-0000-0000-000000000009","title":"Mix","doneWhen":"Delivered","pct":100}]}]}')$$,
  'Lead filling a role in their own project');
select pg_temp.refused($$select create_project('{"id":"20000000-0000-0000-0000-000000000009","name":"X","brief":"b","roles":[]}')$$,
  'project with no roles');
select pg_temp.check((select count(*) from projects) = 0, 'refused creates leave nothing behind');

select create_project('{"id":"20000000-0000-0000-0000-000000000001","name":"Lagos Nights","brief":"A five-track EP","deadline":"2026-12-01","roles":[
  {"id":"30000000-0000-0000-0000-000000000001","title":"Cover art","assignee":"@ada2","pay":500,"depositPct":20,"milestones":[
    {"id":"40000000-0000-0000-0000-000000000001","title":"Sketches","doneWhen":"Three directions","pct":40,"due":"2026-11-01","revisions":2},
    {"id":"40000000-0000-0000-0000-000000000002","title":"Final art","doneWhen":"3000px PNG","pct":40}]},
  {"id":"30000000-0000-0000-0000-000000000002","title":"Mix engineer","assignee":"","pay":300,"depositPct":0,"milestones":[
    {"id":"40000000-0000-0000-0000-000000000003","title":"Mixes","doneWhen":"Five WAVs","pct":100}]}]}');
select pg_temp.check((select count(*) from roles where project_id = '20000000-0000-0000-0000-000000000001') = 2, 'create: two roles');
select pg_temp.check((select count(*) from milestones where project_id = '20000000-0000-0000-0000-000000000001') = 3, 'create: three milestones');
select pg_temp.check((select text from messages where kind = 'system') = 'Louis posted the brief and sent invites.', 'create: system message');

-- Helpers can't be called directly: that would let anyone forge the chat's system log.
select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select pg_temp.refused($$select log_event('20000000-0000-0000-0000-000000000001', 'Louis approved everything')$$, 'forging a system message');
select pg_temp.refused($$select save_roles('20000000-0000-0000-0000-000000000001', '[]')$$, 'calling save_roles directly');
select pg_temp.check((select count(*) from projects) = 1, 'invited crew can read the project');

-- Strangers see the invite, not the project.
select pg_temp.act_as('10000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from projects) = 0, 'stranger cannot read the project');
select pg_temp.check(jsonb_array_length(invite('20000000-0000-0000-0000-000000000001')->'roles') = 2, 'stranger sees the invite');
select pg_temp.check(invite('20000000-0000-0000-0000-000000000001')->'roles'->0->'milestones'->0->>'id' = '40000000-0000-0000-0000-000000000001',
  'invite carries milestone ids');

-- ---------------------------------------------------------------- counter-offers

select pg_temp.act_as('10000000-0000-0000-0000-00000000000c');
select pg_temp.refused($$select counter_offer('30000000-0000-0000-0000-000000000001', 900, 50, 'mine')$$, 'counter-offer on someone else''s role');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select pg_temp.refused($$select counter_offer('30000000-0000-0000-0000-000000000001', 0, 20, 'free')$$, 'counter-offer of zero');
select counter_offer('30000000-0000-0000-0000-000000000001', 550, 30, 'Two extra revision rounds');
select pg_temp.check((select response from roles where id = '30000000-0000-0000-0000-000000000001') = 'countered', 'counter: role marked countered');
select pg_temp.refused($$select resolve_counter((select id from messages where kind = 'counter'), true)$$, 'collaborator accepting their own counter');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select resolve_counter((select id from messages where kind = 'counter'), true);
select pg_temp.check((select version from projects) = 2, 'accepted counter bumps the version');
select pg_temp.check((select pay = 550 and deposit_pct = 30 from roles where id = '30000000-0000-0000-0000-000000000001'), 'accepted counter sets pay and deposit');
select pg_temp.check((select sum(pct) from milestones where role_id = '30000000-0000-0000-0000-000000000001') = 70, 'milestones rebalanced to 70%');
select pg_temp.refused($$select resolve_counter((select id from messages where kind = 'counter'), false)$$, 'answering a counter twice');
select pg_temp.check((select text from messages where kind = 'system' order by created_at desc, text limit 1) like 'Draft v2: Cover art is now $550 with 30% up front.%',
  'accepted counter is logged');

-- ---------------------------------------------------------------- signing

select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select pg_temp.refused($$select sign_role('30000000-0000-0000-0000-000000000001', 1, 'sig', '{"method":"wallet"}')$$, 'signing an old version');
select sign_role('30000000-0000-0000-0000-000000000001', 2, 'sig', '{"method":"wallet","wallet":"0x0000000000000000000000000000000000000001"}');
select pg_temp.check((select signed_version from roles where id = '30000000-0000-0000-0000-000000000001') = 2, 'signed on v2');
select pg_temp.check(exists (select 1 from messages where text = 'Ada accepted and signed Cover art for $550, paid by USDC to their wallet.'), 'signing is logged');

-- ---------------------------------------------------------------- open roles

select pg_temp.act_as('10000000-0000-0000-0000-00000000000d');
select pg_temp.refused($$select apply_role('30000000-0000-0000-0000-000000000001', 'https://x', 'me', null)$$, 'applying for a filled role');
select apply_role('30000000-0000-0000-0000-000000000002', 'https://sam.example', 'I mix afrobeats', 350);
select pg_temp.refused($$select apply_role('30000000-0000-0000-0000-000000000002', 'https://x', 'again', null)$$, 'applying twice');
select pg_temp.check((select count(*) from applications) = 1, 'applicant sees their own application');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from applications) = 0, 'other crew cannot read applications');
select pg_temp.refused($$select pick_applicant('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000d')$$, 'crew picking an applicant');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select pick_applicant('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000d');
select pg_temp.check((select assignee_id = '10000000-0000-0000-0000-00000000000d' and pay = 350 from roles where id = '30000000-0000-0000-0000-000000000002'),
  'picked applicant fills the role at their price');
select pg_temp.check((select version from projects) = 3, 'a new price bumps the version');
select pg_temp.check((select signed_version from roles where id = '30000000-0000-0000-0000-000000000001') = 2, 'Ada''s signature is now stale');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from projects) = 1, 'picked applicant can now read the project');

-- ---------------------------------------------------------------- editing the draft

select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select counter_offer('30000000-0000-0000-0000-000000000001', 600, 30, 'One more');
select pg_temp.refused($$select save_draft('20000000-0000-0000-0000-000000000001', '{"name":"Mine","brief":"b","roles":[]}')$$, 'crew editing the draft');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select save_draft('20000000-0000-0000-0000-000000000001', '{"name":"Lagos Nights EP","brief":"A five-track EP","deadline":"","roles":[
  {"id":"30000000-0000-0000-0000-000000000001","title":"Cover art","assignee":"@ada2","pay":550,"depositPct":30,"milestones":[
    {"id":"40000000-0000-0000-0000-000000000002","title":"Final art","doneWhen":"3000px PNG and a square crop","pct":70}]},
  {"id":"30000000-0000-0000-0000-000000000002","title":"Mix engineer","assignee":"@sam2","pay":350,"depositPct":0,"milestones":[
    {"id":"40000000-0000-0000-0000-000000000003","title":"Mixes","doneWhen":"Five WAVs","pct":100}]}]}');
select pg_temp.check((select version = 4 and name = 'Lagos Nights EP' and deadline is null from projects), 'edit bumps the version and saves fields');
select pg_temp.check((select count(*) from milestones where role_id = '30000000-0000-0000-0000-000000000001') = 1, 'removed milestone is gone');
select pg_temp.check((select position from milestones where id = '40000000-0000-0000-0000-000000000002') = 0, 'remaining milestone renumbered');
select pg_temp.check((select signed_version from roles where id = '30000000-0000-0000-0000-000000000001') = 2, 'same person keeps their old signature on record');
select pg_temp.check(not exists (select 1 from messages where kind = 'counter' and resolution is null), 'edit closes open counter-offers');

-- Removing a role that has a counter-offer on it.
select save_draft('20000000-0000-0000-0000-000000000001', '{"name":"Lagos Nights EP","brief":"A five-track EP","roles":[
  {"id":"30000000-0000-0000-0000-000000000002","title":"Mix engineer","assignee":"@sam2","pay":350,"depositPct":0,"milestones":[
    {"id":"40000000-0000-0000-0000-000000000003","title":"Mixes","doneWhen":"Five WAVs","pct":100}]}]}');
select pg_temp.check((select count(*) from roles) = 1, 'role with a counter-offer can be removed');

-- ---------------------------------------------------------------- declining and cancelling

select pg_temp.act_as('10000000-0000-0000-0000-00000000000d');
select decline_role('30000000-0000-0000-0000-000000000002', 'Booked that month');
select pg_temp.check((select count(*) from projects) = 0, 'declining removes access');

select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select pg_temp.check((select assignee_id is null from roles where id = '30000000-0000-0000-0000-000000000002'), 'declined role is open again');
select pg_temp.check(exists (select 1 from messages where text = 'Sam declined Mix engineer. “Booked that month” The role is open again.'), 'decline is logged');
select cancel_draft('20000000-0000-0000-0000-000000000001', 'Label pulled out');
select pg_temp.check((select status from projects) = 'cancelled', 'Lead cancels before funding');
select pg_temp.refused($$select save_draft('20000000-0000-0000-0000-000000000001', '{"name":"Back","brief":"b","roles":[]}')$$, 'editing a cancelled project');

reset role;
