-- The public Open roles board. A Lead can list an open role (no one assigned yet) publicly;
-- anyone, signed in or not, can browse listed roles and apply. Only listed, still-open roles
-- in projects collecting signatures are shown, and only what an applicant needs to decide.
-- Re-runnable.

alter table public.roles add column if not exists listed boolean not null default false;

-- save_roles, as in 0002, now also saves whether each role is listed.
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
      insert into roles (id, project_id, position, title, assignee_id, pay, deposit_pct, listed)
      values (rid, pid, rpos, r->>'title', who, (r->>'pay')::numeric, (r->>'depositPct')::int, coalesce((r->>'listed')::boolean, false));
    else
      update roles set
        position = rpos, title = r->>'title', assignee_id = who,
        pay = (r->>'pay')::numeric, deposit_pct = (r->>'depositPct')::int, response = 'pending',
        listed = coalesce((r->>'listed')::boolean, false),
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
revoke execute on function public.save_roles(uuid, jsonb) from public, anon, authenticated;

create or replace function public.open_roles() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'listed_at' desc), '[]') from (
    select jsonb_build_object(
      'project_id', p.id, 'role_id', r.id, 'listed_at', p.created_at,
      'project', p.name, 'brief', left(p.brief, 280), 'deadline', p.deadline,
      'lead', (select jsonb_build_object('handle', handle, 'name', name) from profiles where id = p.lead_id),
      'title', r.title, 'pay', r.pay, 'deposit_pct', r.deposit_pct,
      'applicants', (select count(*) from applications a where a.role_id = r.id),
      'milestones', (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'done_when', m.done_when, 'pct', m.pct, 'due', m.due) order by m.position), '[]')
                     from milestones m where m.role_id = r.id)
    ) as x
    from roles r join projects p on p.id = r.project_id
    where r.listed and r.assignee_id is null and p.status in ('signing', 'ready')
  ) s
$$;
grant execute on function public.open_roles() to anon, authenticated;
