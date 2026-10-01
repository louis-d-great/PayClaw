-- Security tests for the CrewPay schema. Run with supabase/tests/run.sh.
-- People: Louis (Lead), Ada and Tobi (crew), Sam (a stranger). Each step acts as one person.
\set ON_ERROR_STOP on
\set QUIET on
\t on
\pset format unaligned

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');

create function pg_temp.act_as(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

-- Expect a statement to be refused.
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

-- Everyone creates their own profile; nobody can create someone else's.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into profiles (id, handle, name) values ('00000000-0000-0000-0000-00000000000a', 'louis', 'Louis');
select pg_temp.refused($$insert into profiles (id, handle, name) values ('00000000-0000-0000-0000-00000000000b', 'fake', 'Fake')$$, 'profile for someone else');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into profiles (id, handle, name) values ('00000000-0000-0000-0000-00000000000b', 'ada', 'Ada');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into profiles (id, handle, name) values ('00000000-0000-0000-0000-00000000000c', 'tobi', 'Tobi');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
insert into profiles (id, handle, name) values ('00000000-0000-0000-0000-00000000000d', 'sam', 'Sam');

-- Louis creates the project, roles and milestones.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into projects (id, name, brief, lead_id) values
  ('11111111-1111-1111-1111-111111111111', 'Oja — shop website', 'Secret brief: 5 pages for a fabric shop', '00000000-0000-0000-0000-00000000000a');
insert into roles (id, project_id, position, title, assignee_id, pay) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 0, 'Web designer', '00000000-0000-0000-0000-00000000000b', 700),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1, 'Frontend dev', '00000000-0000-0000-0000-00000000000c', 900),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 2, 'Copywriter', null, 200);
insert into milestones (id, role_id, project_id, position, title, done_when, pct) values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 0, 'Designs', 'Figma for 5 pages', 80);
select pg_temp.refused($$insert into projects (name, brief, lead_id) values ('x', 'y', '00000000-0000-0000-0000-00000000000b')$$, 'project with someone else as Lead');

-- Only the crew can see the project.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from projects) = 1, 'crew member sees the project');
select pg_temp.check((select count(*) from roles) = 3, 'crew member sees all roles and pay');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from projects) = 0, 'stranger sees no projects');
select pg_temp.check((select count(*) from roles) = 0, 'stranger sees no roles');
select pg_temp.check((public.invite('11111111-1111-1111-1111-111111111111') ->> 'name') = 'Oja — shop website', 'invite link shows the terms to a stranger');

-- Open roles take applications; filled roles don't.
insert into applications (role_id, project_id, applicant_id, portfolio, note) values
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'https://sam.dev', 'I write in English and Yoruba');
select pg_temp.refused($$insert into applications (role_id, project_id, applicant_id, portfolio, note) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'https://sam.dev', 'hi')$$, 'applying to a filled role');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from applications) = 0, 'crew member cannot read other people''s applications');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from applications) = 1, 'Lead reads applications');

-- Group chat vs DMs.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into messages (project_id, author_id, text) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'Hero draft attached');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into messages (project_id, author_id, recipient_id, text) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'Private: use her Instagram photos');
select pg_temp.check((select count(*) from messages) = 2, 'Lead sees group chat and own DM');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from messages) = 1, 'third crew member sees the group chat but not the DM');
select pg_temp.refused($$insert into messages (project_id, author_id, text) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'impersonating Ada')$$, 'posting as someone else');
select pg_temp.refused($$insert into messages (project_id, author_id, kind, text) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'system', 'Vault paid Tobi $900')$$, 'faking a system message');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from messages) = 0, 'stranger sees no messages');
select pg_temp.refused($$insert into messages (project_id, author_id, text) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'hi')$$, 'stranger posting in the chat');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.refused($$update messages set text = 'I never said that' where author_id = '00000000-0000-0000-0000-00000000000b'$$, 'editing a sent message');
delete from messages;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from messages) = 2, 'deleting chat messages does nothing');

-- Signing: only your own role, only the current version.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused($$select sign_role('22222222-2222-2222-2222-222222222221', 1, '0xsig', '{"method":"wallet"}')$$, 'signing someone else''s role');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.refused($$select sign_role('22222222-2222-2222-2222-222222222221', 7, '0xsig', '{"method":"wallet"}')$$, 'signing an old or future version');
select sign_role('22222222-2222-2222-2222-222222222221', 1, '0xsig', '{"method":"bank","currency":"NGN"}');
select pg_temp.check((select signed_version from roles where id = '22222222-2222-2222-2222-222222222221') = 1, 'Ada signs her role on v1');
-- Row-level security skips rows you may not change, so the update quietly does nothing.
update roles set pay = 5000 where id = '22222222-2222-2222-2222-222222222221';
select pg_temp.check((select pay from roles where id = '22222222-2222-2222-2222-222222222221') = 700, 'collaborator can''t raise their own pay');

-- Money fields belong to the server.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.refused($$update projects set status = 'funded' where id = '11111111-1111-1111-1111-111111111111'$$, 'Lead marking the project funded');
select pg_temp.refused($$insert into payouts (project_id, amount, kind, tx_hash) values ('11111111-1111-1111-1111-111111111111', 900, 'milestone', '0xfake')$$, 'writing a payout');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.check(public.receipt('11111111-1111-1111-1111-111111111111') is null, 'no receipt before funding');

-- Files: Ada uploads a final; Louis can't open it until it's paid.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into storage.objects (bucket_id, name) values
  ('project-files', '11111111-1111-1111-1111-111111111111/finals/33333333-3333-3333-3333-333333333331/oja.fig'),
  ('project-files', '11111111-1111-1111-1111-111111111111/previews/33333333-3333-3333-3333-333333333331/oja.png');
select pg_temp.check((select count(*) from storage.objects) = 2, 'uploader sees her preview and final');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from storage.objects) = 1, 'Lead sees the preview but not the locked final');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.refused($$insert into storage.objects (bucket_id, name) values ('project-files', '11111111-1111-1111-1111-111111111111/chat/spam.png')$$, 'stranger uploading to the project');

-- The server (service role) records funding and a paid milestone from vault events.
reset role;
set role service_role;
update projects set status = 'funded', funded_at = now(), chain_project_id = '0xabc' where id = '11111111-1111-1111-1111-111111111111';
update milestones set status = 'paid' where id = '33333333-3333-3333-3333-333333333331';
insert into payouts (project_id, role_id, milestone_id, to_id, amount, kind, tx_hash) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333331', '00000000-0000-0000-0000-00000000000b', 560, 'milestone', '0x01');
reset role;
set role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from storage.objects) = 2, 'final unlocks for the Lead once paid');
select pg_temp.refused($$insert into roles (project_id, position, title, pay) values ('11111111-1111-1111-1111-111111111111', 9, 'Extra', 10)$$, 'changing roles after funding');
update roles set pay = 1 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select pay from roles where id = '22222222-2222-2222-2222-222222222222') = 900, 'funded terms can''t be edited');

reset role;
set role anon;
select pg_temp.act_as('');
select pg_temp.check((public.receipt('11111111-1111-1111-1111-111111111111') -> 'roles' -> 0 ->> 'paid')::numeric = 560, 'public receipt shows what Ada was paid');
select pg_temp.check(public.receipt('11111111-1111-1111-1111-111111111111')::text not like '%Secret brief%', 'public receipt hides the brief');
select pg_temp.check((select count(*) from projects) = 0, 'signed-out visitors see no projects');

\echo 'All security tests passed.'
