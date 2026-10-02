-- CrewPay: the actions the live app calls.
-- Anything that touches someone else's row, changes a project's status, or writes to the
-- group chat's system log runs here, so the rules hold whatever a client sends.
-- System messages are evidence in a dispute, so only these functions write them.

-- ------------------------------------------------------------------ helpers (not callable by clients)

create or replace function public.display_name(u uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select name from profiles where id = u), 'Someone')
$$;

create or replace function public.usd(n numeric) returns text
  language sql immutable as $$
  select '$' || case when n = trunc(n) then to_char(n, 'FM999,999,999,990') else to_char(n, 'FM999,999,999,990.00') end
$$;

create or replace function public.log_event(p uuid, t text) returns void
  language sql security definer set search_path = public as $$
  insert into messages (project_id, author_id, kind, text) values (p, null, 'system', t)
$$;

-- Writes a draft's roles and milestones. Keeps a person's signature on record when they stay in
-- their role (it no longer counts once the version bumps, so they're asked to sign again).
create or replace function public.save_roles(pid uuid, roles_in jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r jsonb; m jsonb; rid uuid; who uuid; h text; old roles; total int;
  rpos int := 0; mpos int;
  lead uuid := (select lead_id from projects where id = pid);
begin
  if jsonb_array_length(coalesce(roles_in, '[]')) = 0 then raise exception 'Add at least one role.'; end if;
  -- Counter-offers point at their role; detach them from roles leaving the draft.
  update messages set role_id = null, resolution = coalesce(resolution, 'rejected')
  where project_id = pid and role_id is not null
    and role_id not in (select (x->>'id')::uuid from jsonb_array_elements(roles_in) x);
  delete from roles where project_id = pid and id not in (select (x->>'id')::uuid from jsonb_array_elements(roles_in) x);
  -- Positions are unique per project; park the old ones before renumbering.
  update roles set position = position + 1000 where project_id = pid;

  for r in select * from jsonb_array_elements(roles_in) loop
    rid := (r->>'id')::uuid;
    h := lower(regexp_replace(coalesce(r->>'assignee', ''), '^@+', ''));
    who := null;
    if h <> '' then
      select id into who from profiles where handle = h;
      if who is null then
        raise exception 'Nobody on CrewPay is called @% yet. Leave the role open and send them the invite link.', h;
      end if;
      if who = lead then raise exception 'You lead this project, so you can''t fill one of its roles.'; end if;
    end if;
    total := (r->>'depositPct')::int + (select coalesce(sum((x->>'pct')::int), 0) from jsonb_array_elements(r->'milestones') x);
    if total <> 100 then raise exception 'The payment plan for % adds up to % percent, not 100.', r->>'title', total; end if;

    select * into old from roles where id = rid and project_id = pid;
    if old.id is null then
      insert into roles (id, project_id, position, title, assignee_id, pay, deposit_pct)
      values (rid, pid, rpos, r->>'title', who, (r->>'pay')::numeric, (r->>'depositPct')::int);
    else
      update roles set
        position = rpos, title = r->>'title', assignee_id = who,
        pay = (r->>'pay')::numeric, deposit_pct = (r->>'depositPct')::int, response = 'pending',
        signed_version = case when old.assignee_id is not distinct from who then old.signed_version end,
        signature = case when old.assignee_id is not distinct from who then old.signature end,
        payout = case when old.assignee_id is not distinct from who then old.payout end
      where id = rid;
    end if;
    if who is not null then delete from applications where role_id = rid; end if;

    delete from milestones where role_id = rid and id not in (select (x->>'id')::uuid from jsonb_array_elements(r->'milestones') x);
    update milestones set position = position + 1000 where role_id = rid;
    mpos := 0;
    for m in select * from jsonb_array_elements(r->'milestones') loop
      insert into milestones (id, role_id, project_id, position, title, done_when, pct, due, revisions)
      values ((m->>'id')::uuid, rid, pid, mpos, m->>'title', m->>'doneWhen', (m->>'pct')::int,
              nullif(m->>'due', '')::date, coalesce((m->>'revisions')::int, 2))
      on conflict (id) do update set
        position = excluded.position, title = excluded.title, done_when = excluded.done_when,
        pct = excluded.pct, due = excluded.due, revisions = excluded.revisions
      where milestones.role_id = excluded.role_id;
      mpos := mpos + 1;
    end loop;
    rpos := rpos + 1;
  end loop;
end $$;

revoke execute on function public.display_name(uuid) from public, anon, authenticated;
revoke execute on function public.log_event(uuid, text) from public, anon, authenticated;
revoke execute on function public.save_roles(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ drafts

create or replace function public.create_project(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare pid uuid := (p->>'id')::uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Finish your profile first.'; end if;
  insert into projects (id, name, brief, deadline, lead_id)
  values (pid, p->>'name', p->>'brief', nullif(p->>'deadline', '')::date, auth.uid());
  perform save_roles(pid, p->'roles');
  perform log_event(pid, display_name(auth.uid()) || ' posted the brief and sent invites.');
  return pid;
end $$;

-- Any edit bumps the version, so every signature has to be given again.
create or replace function public.save_draft(pid uuid, p jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare pr projects;
begin
  select * into pr from projects where id = pid for update;
  if pr.id is null or pr.lead_id <> auth.uid() then raise exception 'Only the Lead can edit the draft.'; end if;
  if pr.status not in ('signing', 'ready') then raise exception 'This project is past the draft stage.'; end if;
  update projects set name = p->>'name', brief = p->>'brief', deadline = nullif(p->>'deadline', '')::date, version = version + 1
  where id = pid;
  perform save_roles(pid, p->'roles');
  -- Open counter-offers were about the old terms.
  update messages set resolution = 'rejected' where project_id = pid and kind = 'counter' and resolution is null;
  perform log_event(pid, format('Draft v%s: %s edited the draft. Everyone signs the new version.', pr.version + 1, display_name(auth.uid())));
end $$;

-- Before funding nothing is locked, so the Lead can call it off alone.
create or replace function public.cancel_draft(pid uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public as $$
declare pr projects;
begin
  select * into pr from projects where id = pid for update;
  if pr.id is null or pr.lead_id <> auth.uid() then raise exception 'Only the Lead can cancel the draft.'; end if;
  if pr.status not in ('signing', 'ready') then raise exception 'Once funded, a cancel needs the whole crew to agree.'; end if;
  update projects set status = 'cancelled' where id = pid;
  perform log_event(pid, format('%s cancelled the project before funding.%s No money moved.', display_name(auth.uid()),
    case when coalesce(p_reason, '') <> '' then format(' “%s”', p_reason) else '' end));
end $$;

-- ------------------------------------------------------------------ responding to an invite

drop function if exists public.sign_role(uuid, int, text, jsonb);
create function public.sign_role(p_role uuid, p_version int, p_signature text, p_payout jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  select * into r from roles where id = p_role for update;
  if r.id is null or r.assignee_id is distinct from auth.uid() then raise exception 'This role isn''t yours.'; end if;
  if not is_draft(r.project_id) then raise exception 'This project isn''t collecting signatures.'; end if;
  if p_version <> (select version from projects where id = r.project_id) then
    raise exception 'The draft changed. Review it again before signing.';
  end if;
  update roles set response = 'accepted', signed_version = p_version, signature = p_signature, payout = p_payout where id = p_role;
  perform log_event(r.project_id, format('%s accepted and signed %s for %s, paid by %s.', display_name(auth.uid()), r.title, usd(r.pay),
    case when p_payout->>'method' = 'bank' then 'bank transfer in ' || coalesce(p_payout->'bank'->>'currency', 'their currency')
         else 'USDC to their wallet' end));
end $$;

drop function if exists public.decline_role(uuid);
drop function if exists public.decline_role(uuid, text); -- so this file can be run again
create function public.decline_role(p_role uuid, p_note text default '') returns void
  language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  select * into r from roles where id = p_role for update;
  if r.id is null or r.assignee_id is distinct from auth.uid() then raise exception 'This role isn''t yours.'; end if;
  if not is_draft(r.project_id) then raise exception 'This project isn''t collecting signatures.'; end if;
  -- Declining frees the role so the Lead can invite someone else.
  update roles set assignee_id = null, response = 'pending', signed_version = null, signature = null, payout = null where id = p_role;
  update messages set resolution = 'rejected' where role_id = p_role and kind = 'counter' and resolution is null;
  perform log_event(r.project_id, format('%s declined %s.%s The role is open again.', display_name(auth.uid()), r.title,
    case when coalesce(p_note, '') <> '' then format(' “%s”', p_note) else '' end));
end $$;

create or replace function public.counter_offer(p_role uuid, p_amount numeric, p_deposit int, p_note text) returns void
  language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  select * into r from roles where id = p_role for update;
  if r.id is null or r.assignee_id is distinct from auth.uid() then raise exception 'This role isn''t yours.'; end if;
  if not is_draft(r.project_id) then raise exception 'This project isn''t collecting signatures.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Name a price above zero.'; end if;
  if p_deposit is null or p_deposit < 0 or p_deposit > 100 then raise exception 'The deposit must be between 0 and 100 percent.'; end if;
  -- Only the newest counter-offer is open.
  update messages set resolution = 'rejected' where role_id = p_role and kind = 'counter' and resolution is null;
  update roles set response = 'countered' where id = p_role;
  insert into messages (project_id, author_id, kind, text, role_id, amount, deposit_pct)
  values (r.project_id, auth.uid(), 'counter', coalesce(p_note, ''), p_role, p_amount, p_deposit);
end $$;

-- Accepting changes the terms: the version bumps and everyone signs again.
create or replace function public.resolve_counter(p_message uuid, p_accept boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  msg messages; r roles; pr projects; dep int; target int; cur int; n int; i int := 0; used int := 0; share int; ms record;
begin
  select * into msg from messages where id = p_message for update;
  if msg.id is null or msg.kind <> 'counter' or msg.resolution is not null then raise exception 'This counter-offer was already answered.'; end if;
  select * into pr from projects where id = msg.project_id for update;
  if pr.lead_id <> auth.uid() then raise exception 'Only the Lead answers counter-offers.'; end if;
  if pr.status not in ('signing', 'ready') then raise exception 'This project is past the draft stage.'; end if;
  select * into r from roles where id = msg.role_id for update;

  if not p_accept then
    update messages set resolution = 'rejected' where id = p_message;
    update roles set response = 'pending' where id = r.id;
    perform log_event(pr.id, format('%s kept %s at %s with a %s%% deposit. %s can accept or decline.',
      display_name(auth.uid()), r.title, usd(r.pay), r.deposit_pct, display_name(msg.author_id)));
    return;
  end if;

  dep := coalesce(msg.deposit_pct, r.deposit_pct);
  update messages set resolution = 'accepted' where id = p_message;
  update projects set version = version + 1 where id = pr.id;
  update roles set response = 'pending' where project_id = pr.id;
  update roles set pay = msg.amount, deposit_pct = dep where id = r.id;
  -- Keep milestone shares in proportion so the plan still adds up to 100%.
  target := 100 - dep;
  select coalesce(nullif(sum(pct), 0), 1), count(*) into cur, n from milestones where role_id = r.id;
  for ms in select id, pct from milestones where role_id = r.id order by position loop
    i := i + 1;
    share := case when i = n then target - used else round(ms.pct::numeric * target / cur) end;
    update milestones set pct = share where id = ms.id;
    used := used + share;
  end loop;
  perform log_event(pr.id, format('Draft v%s: %s is now %s with %s%% up front. The terms changed, so everyone signs the new version.',
    pr.version + 1, r.title, usd(msg.amount), dep));
end $$;

-- ------------------------------------------------------------------ open roles

create or replace function public.apply_role(p_role uuid, p_portfolio text, p_note text, p_amount numeric) returns void
  language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Finish your profile first.'; end if;
  select * into r from roles where id = p_role;
  if r.id is null or r.assignee_id is not null then raise exception 'This role isn''t open.'; end if;
  if not is_draft(r.project_id) then raise exception 'This project isn''t taking applications.'; end if;
  if is_lead(r.project_id) then raise exception 'You lead this project.'; end if;
  insert into applications (role_id, project_id, applicant_id, portfolio, note, amount)
  values (p_role, r.project_id, auth.uid(), p_portfolio, p_note, p_amount)
  on conflict (role_id, applicant_id) do nothing;
  if not found then raise exception 'You already applied for this role.'; end if;
  perform log_event(r.project_id, format('%s applied for %s%s.', display_name(auth.uid()), r.title,
    case when p_amount is not null and p_amount <> r.pay then ', asking ' || usd(p_amount) else '' end));
end $$;

-- Picking someone at a different price changes the terms, so everyone signs again.
create or replace function public.pick_applicant(p_role uuid, p_applicant uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare r roles; pr projects; a applications; repriced boolean;
begin
  select * into r from roles where id = p_role for update;
  select * into pr from projects where id = r.project_id for update;
  if pr.id is null or pr.lead_id <> auth.uid() then raise exception 'Only the Lead picks who joins.'; end if;
  if pr.status not in ('signing', 'ready') then raise exception 'This project is past the draft stage.'; end if;
  if r.assignee_id is not null then raise exception 'This role is already filled.'; end if;
  select * into a from applications where role_id = p_role and applicant_id = p_applicant;
  if a.id is null then raise exception 'That person hasn''t applied for this role.'; end if;
  repriced := a.amount is not null and a.amount <> r.pay;
  if repriced then
    update projects set version = version + 1 where id = pr.id;
    update roles set response = 'pending' where project_id = pr.id;
  end if;
  update roles set assignee_id = p_applicant, pay = case when repriced then a.amount else pay end, response = 'pending' where id = p_role;
  delete from applications where role_id = p_role;
  perform log_event(pr.id, case when repriced
    then format('Draft v%s: %s picked %s for %s at %s. The budget changed, so everyone signs again.',
      pr.version + 1, display_name(auth.uid()), display_name(p_applicant), r.title, usd(a.amount))
    else format('%s picked %s for %s. %s can now review and sign.',
      display_name(auth.uid()), display_name(p_applicant), r.title, display_name(p_applicant)) end);
end $$;

-- Invite page for someone who isn't on the crew yet. Now carries ids so the app can show the
-- same screen members see, and the Lead's and assignees' handles.
create or replace function public.invite(p_project uuid)
  returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'brief', p.brief, 'deadline', p.deadline, 'version', p.version, 'status', p.status,
    'created_at', p.created_at,
    'lead', (select jsonb_build_object('id', id, 'handle', handle, 'name', name) from profiles where id = p.lead_id),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'pay', r.pay, 'deposit_pct', r.deposit_pct, 'response', r.response,
        'signed_version', r.signed_version,
        'assignee', (select jsonb_build_object('id', id, 'handle', handle, 'name', name) from profiles where id = r.assignee_id),
        'milestones', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'done_when', m.done_when,
          'pct', m.pct, 'due', m.due, 'revisions', m.revisions) order by m.position), '[]') from milestones m where m.role_id = r.id)
      ) order by r.position), '[]') from roles r where r.project_id = p.id)
  ) from projects p where p.id = p_project and p.status in ('signing', 'ready')
$$;

grant execute on function public.create_project(jsonb) to authenticated;
grant execute on function public.save_draft(uuid, jsonb) to authenticated;
grant execute on function public.cancel_draft(uuid, text) to authenticated;
grant execute on function public.sign_role(uuid, int, text, jsonb) to authenticated;
grant execute on function public.decline_role(uuid, text) to authenticated;
grant execute on function public.counter_offer(uuid, numeric, int, text) to authenticated;
grant execute on function public.resolve_counter(uuid, boolean) to authenticated;
grant execute on function public.apply_role(uuid, text, text, numeric) to authenticated;
grant execute on function public.pick_applicant(uuid, uuid) to authenticated;
grant execute on function public.invite(uuid) to anon, authenticated;
