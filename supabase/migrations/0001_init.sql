-- CrewPay database: projects, signed terms, milestones, chat, DMs, files.
-- Money never moves here. The vault contract on Base is the source of truth for funds;
-- the `payouts` table mirrors its events and only the server (service role) writes it.
--
-- Access is enforced with row-level security:
--   * project data is visible to its crew (the Lead and everyone in a role)
--   * the group chat is visible to the crew and can't be edited or deleted (it's the evidence)
--   * DMs are visible only to the two people in them
--   * final files are locked until their milestone is paid

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{2,30}$'),
  name text not null,
  bio text not null default '',
  skills text[] not null default '{}',
  portfolio text,
  wallet_address text check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ projects and terms

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brief text not null,
  deadline date,
  lead_id uuid not null references public.profiles (id),
  version int not null default 1,
  status text not null default 'signing' check (status in ('signing', 'ready', 'funded', 'done', 'cancelled')),
  chain_project_id text unique, -- bytes32 hex used by the vault
  funded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position int not null,
  title text not null,
  assignee_id uuid references public.profiles (id), -- null = open role
  pay numeric(18, 6) not null check (pay > 0),
  deposit_pct int not null default 20 check (deposit_pct between 0 and 100),
  response text not null default 'pending' check (response in ('pending', 'accepted', 'countered', 'declined')),
  signed_version int,
  signature text, -- EIP-712 signature over the terms, checked again by the vault
  payout jsonb, -- how they want to be paid: {"method":"wallet","wallet":"0x…"} or {"method":"bank",…}
  unique (project_id, position)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position int not null,
  title text not null,
  done_when text not null,
  pct int not null check (pct between 0 and 100),
  due date,
  revisions int not null default 2 check (revisions between 0 and 10),
  status text not null default 'working'
    check (status in ('working', 'submitted', 'paid', 'disputed', 'resolved', 'reclaimed', 'cancelled')),
  unique (role_id, position)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id),
  portfolio text not null,
  note text not null,
  amount numeric(18, 6),
  created_at timestamptz not null default now(),
  unique (role_id, applicant_id)
);

-- ------------------------------------------------------------------ work, reviews, disputes

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note text not null,
  files jsonb not null default '[]', -- [{name,size,kind:"preview"|"final",path}]
  created_at timestamptz not null default now(),
  review_kind text check (review_kind in ('approved', 'changes', 'auto-approved')),
  review_note text,
  reviewed_at timestamptz
);

create table public.disputes (
  milestone_id uuid primary key references public.milestones (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  reason text not null,
  created_at timestamptz not null default now(),
  ruling_bps int check (ruling_bps between 0 and 10000),
  ruling_note text,
  ruled_at timestamptz
);

create table public.dispute_statements (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.disputes (milestone_id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  text text not null,
  created_at timestamptz not null default now()
);

create table public.cancel_requests (
  project_id uuid primary key references public.projects (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id),
  reason text not null,
  approvals uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Mirrors the vault's payout events. Written only by the server's chain indexer.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  role_id uuid references public.roles (id),
  milestone_id uuid references public.milestones (id),
  to_id uuid references public.profiles (id),
  amount numeric(18, 6) not null,
  kind text not null check (kind in ('deposit', 'milestone', 'auto', 'ruling', 'refund')),
  tx_hash text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ chat

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id), -- null = system message
  recipient_id uuid references public.profiles (id), -- null = group chat; set = DM
  kind text not null default 'text' check (kind in ('text', 'counter', 'system')),
  text text not null default '',
  reply_to uuid references public.messages (id),
  attachments jsonb not null default '[]', -- [{name,size,mime,kind,path}]
  role_id uuid references public.roles (id), -- counter-offers
  amount numeric(18, 6),
  deposit_pct int,
  resolution text check (resolution in ('accepted', 'rejected')),
  created_at timestamptz not null default now(),
  check (recipient_id is null or kind = 'text')
);
create index messages_project_idx on public.messages (project_id, created_at);

create table public.message_reads (
  project_id uuid not null references public.projects (id) on delete cascade,
  channel text not null, -- 'group' or the other person's profile id
  user_id uuid not null references public.profiles (id),
  seen_at timestamptz not null default now(),
  primary key (project_id, channel, user_id)
);

-- ------------------------------------------------------------------ membership helpers

create function public.is_lead(p uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and lead_id = auth.uid())
$$;

create function public.is_member(p uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and lead_id = auth.uid())
      or exists (select 1 from roles where project_id = p and assignee_id = auth.uid())
$$;

create function public.is_member_user(p uuid, u uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and lead_id = u)
      or exists (select 1 from roles where project_id = p and assignee_id = u)
$$;

-- Applicants can't read roles (they aren't crew yet), so this check runs with elevated rights.
create function public.is_open_role(p_role uuid, p uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from roles where id = p_role and project_id = p and assignee_id is null)
$$;

create function public.is_draft(p uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and status in ('signing', 'ready'))
$$;

-- ------------------------------------------------------------------ row-level security

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.roles enable row level security;
alter table public.milestones enable row level security;
alter table public.applications enable row level security;
alter table public.submissions enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_statements enable row level security;
alter table public.cancel_requests enable row level security;
alter table public.payouts enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

-- Profiles are public; you edit only your own.
create policy "profiles are public" on public.profiles for select using (true);
create policy "create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid());

-- Projects: the crew reads; the Lead creates and edits the draft. Status, funding and chain
-- fields change only through the server once the vault confirms (column grants below).
create policy "crew reads project" on public.projects for select using (public.is_member(id));
create policy "lead creates project" on public.projects for insert to authenticated with check (lead_id = auth.uid());
create policy "lead edits draft" on public.projects for update to authenticated
  using (lead_id = auth.uid() and status in ('signing', 'ready'));

create policy "crew reads roles" on public.roles for select using (public.is_member(project_id));
create policy "lead adds roles to draft" on public.roles for insert to authenticated
  with check (public.is_lead(project_id) and public.is_draft(project_id));
create policy "lead edits draft roles" on public.roles for update to authenticated
  using (public.is_lead(project_id) and public.is_draft(project_id));
create policy "lead removes draft roles" on public.roles for delete to authenticated
  using (public.is_lead(project_id) and public.is_draft(project_id));

create policy "crew reads milestones" on public.milestones for select using (public.is_member(project_id));
create policy "lead writes draft milestones" on public.milestones for all to authenticated
  using (public.is_lead(project_id) and public.is_draft(project_id))
  with check (public.is_lead(project_id) and public.is_draft(project_id));

-- Open roles: anyone signed in applies once; the Lead and the applicant can read it.
create policy "apply to open role" on public.applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and not public.is_lead(project_id)
    and public.is_open_role(role_id, project_id)
    and public.is_draft(project_id)
  );
create policy "lead and applicant read applications" on public.applications for select
  using (applicant_id = auth.uid() or public.is_lead(project_id));

-- Work: the collaborator on the milestone submits; the crew reads; the Lead records reviews.
create policy "crew reads submissions" on public.submissions for select using (public.is_member(project_id));
create policy "collaborator submits" on public.submissions for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.milestones m join public.roles r on r.id = m.role_id
      where m.id = milestone_id and r.assignee_id = auth.uid() and m.status = 'working'
    )
  );
create policy "lead reviews" on public.submissions for update to authenticated using (public.is_lead(project_id));

create policy "crew reads disputes" on public.disputes for select using (public.is_member(project_id));
create policy "party opens dispute" on public.disputes for insert to authenticated
  with check (opened_by = auth.uid() and public.is_member(project_id));
create policy "crew reads statements" on public.dispute_statements for select using (public.is_member(project_id));
create policy "party adds statement" on public.dispute_statements for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(project_id));

create policy "crew reads cancel" on public.cancel_requests for select using (public.is_member(project_id));
create policy "party proposes cancel" on public.cancel_requests for insert to authenticated
  with check (proposed_by = auth.uid() and public.is_member(project_id) and approvals = array[auth.uid()]);

create policy "crew reads payouts" on public.payouts for select using (public.is_member(project_id));

-- Chat. Group messages: the crew. DMs: only the two people. Nobody edits or deletes a message.
create policy "read group chat and own DMs" on public.messages for select using (
  (recipient_id is null and public.is_member(project_id))
  or author_id = auth.uid()
  or recipient_id = auth.uid()
);
create policy "crew posts" on public.messages for insert to authenticated with check (
  author_id = auth.uid()
  and kind in ('text', 'counter')
  and public.is_member(project_id)
  and (recipient_id is null or (recipient_id <> auth.uid() and public.is_member_user(project_id, recipient_id)))
);
create policy "lead answers counter-offers" on public.messages for update to authenticated
  using (kind = 'counter' and public.is_lead(project_id));

create policy "own read receipts" on public.message_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(project_id));
create policy "crew sees read receipts" on public.message_reads for select using (public.is_member(project_id));

-- ------------------------------------------------------------------ column-level limits

-- The Lead can edit draft text, never status or funding fields.
revoke update on public.projects from authenticated;
grant update (name, brief, deadline, version) on public.projects to authenticated;
-- The Lead answers a counter-offer by setting its resolution; the words stay as sent.
revoke update on public.messages from authenticated;
grant update (resolution) on public.messages to authenticated;
-- Reviews only touch review fields.
revoke update on public.submissions from authenticated;
grant update (review_kind, review_note, reviewed_at) on public.submissions to authenticated;

-- ------------------------------------------------------------------ actions that cross people

-- A collaborator signs their own role on the current draft version.
create function public.sign_role(p_role uuid, p_version int, p_signature text, p_payout jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  select * into r from roles where id = p_role for update;
  if r.id is null or r.assignee_id is distinct from auth.uid() then raise exception 'not your role'; end if;
  if not is_draft(r.project_id) then raise exception 'project is not collecting signatures'; end if;
  if p_version <> (select version from projects where id = r.project_id) then raise exception 'draft changed, review it again'; end if;
  update roles set response = 'accepted', signed_version = p_version, signature = p_signature, payout = p_payout where id = p_role;
end $$;

-- A collaborator turns their role down; it reopens for the Lead to fill.
create function public.decline_role(p_role uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare r roles;
begin
  select * into r from roles where id = p_role for update;
  if r.id is null or r.assignee_id is distinct from auth.uid() then raise exception 'not your role'; end if;
  if not is_draft(r.project_id) then raise exception 'project is not collecting signatures'; end if;
  update roles set assignee_id = null, response = 'pending', signed_version = null, signature = null, payout = null where id = p_role;
end $$;

-- Invite page: an invited or open-role visitor sees the brief and terms before joining.
create function public.invite(p_project uuid)
  returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'brief', p.brief, 'deadline', p.deadline, 'version', p.version, 'status', p.status,
    'lead', (select jsonb_build_object('handle', handle, 'name', name) from profiles where id = p.lead_id),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'pay', r.pay, 'deposit_pct', r.deposit_pct, 'open', r.assignee_id is null,
        'milestones', (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'done_when', m.done_when,
          'pct', m.pct, 'due', m.due, 'revisions', m.revisions) order by m.position), '[]') from milestones m where m.role_id = r.id)
      ) order by r.position), '[]') from roles r where r.project_id = p.id)
  ) from projects p where p.id = p_project and p.status in ('signing', 'ready')
$$;

-- Public work receipt: who worked on it and what they were paid. No brief, no chat.
create function public.receipt(p_project uuid)
  returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'status', p.status, 'version', p.version, 'created_at', p.created_at, 'funded_at', p.funded_at,
    'chain_project_id', p.chain_project_id,
    'lead', (select handle from profiles where id = p.lead_id),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', r.title, 'person', (select handle from profiles where id = r.assignee_id), 'pay', r.pay,
        'paid', (select coalesce(sum(amount), 0) from payouts x where x.role_id = r.id and x.kind <> 'refund'),
        'milestones', (select count(*) from milestones m where m.role_id = r.id),
        'delivered', (select count(*) from milestones m where m.role_id = r.id and m.status in ('paid', 'resolved'))
      ) order by r.position), '[]') from roles r where r.project_id = p.id)
  ) from projects p where p.id = p_project and p.funded_at is not null
$$;

grant execute on function public.invite(uuid) to anon, authenticated;
grant execute on function public.receipt(uuid) to anon, authenticated;
grant execute on function public.sign_role(uuid, int, text, jsonb) to authenticated;
grant execute on function public.decline_role(uuid) to authenticated;

-- ------------------------------------------------------------------ files

-- One private bucket. Paths: <project id>/chat/…, <project id>/previews/<milestone id>/…,
-- <project id>/finals/<milestone id>/…  Finals unlock for the crew once the milestone is paid.
insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false)
  on conflict (id) do nothing;

create function public.can_read_file(path text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when (storage.foldername(path))[2] = 'finals' then
      exists (
        select 1 from milestones m join roles r on r.id = m.role_id
        where m.id::text = (storage.foldername(path))[3]
          and m.project_id::text = (storage.foldername(path))[1]
          and (r.assignee_id = auth.uid() or (m.status in ('paid', 'resolved') and is_member(m.project_id)))
      )
    else is_member(((storage.foldername(path))[1])::uuid)
  end
$$;

create policy "crew uploads project files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "crew reads files, finals after payment" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_read_file(name));

-- ------------------------------------------------------------------ realtime

-- Live chat, read receipts and project updates.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.message_reads, public.projects, public.roles, public.milestones, public.submissions;
  end if;
end $$;
