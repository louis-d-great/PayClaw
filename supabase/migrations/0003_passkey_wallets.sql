-- CrewPay wallets: each person's Tempo account is a passkey (Face ID, fingerprint, Windows
-- PIN or their phone). The passkey's private key never leaves their device. We keep its
-- public key here so they can sign in to the same wallet on another device: browsers
-- only reveal a passkey's public key once, when it's created.
--
-- The wallet's address also goes on the profile (profiles.wallet_address), because the
-- terms everyone agrees to on-chain name each person's address.

create table if not exists public.passkeys (
  credential_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  public_key text not null check (public_key ~ '^0x[0-9a-fA-F]+$'),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  created_at timestamptz not null default now()
);

alter table public.passkeys enable row level security;

drop policy if exists "own passkeys" on public.passkeys;
create policy "own passkeys" on public.passkeys for select to authenticated using (user_id = auth.uid());
drop policy if exists "add own passkey" on public.passkeys;
create policy "add own passkey" on public.passkeys for insert to authenticated with check (user_id = auth.uid());

-- ------------------------------------------------------------------ mirroring the vault
-- The vault on Tempo is the source of truth for money. /api/sync (server, service role)
-- reads a vault transaction and mirrors it here: funded status, milestone status, payouts
-- and a system message. Each on-chain event is recorded once, so syncing twice is harmless.

create table if not exists public.chain_events (
  tx_hash text not null,
  log_index int not null,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);
alter table public.chain_events enable row level security; -- no policies: server only

alter table public.payouts add column if not exists log_index int;

-- ------------------------------------------------------------------ signing on Tempo
-- Same rules as 0002; the log now says where the money goes on Tempo.
create or replace function public.sign_role(p_role uuid, p_version int, p_signature text, p_payout jsonb) returns void
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
  perform log_event(r.project_id, format('%s accepted and signed %s for %s%s, paid %s.', display_name(auth.uid()), r.title, usd(r.pay),
    case when p_signature like 'tempo:%' then ' on Tempo' else '' end,
    case when p_payout->>'method' = 'bank' then 'by bank transfer in ' || coalesce(p_payout->'bank'->>'currency', 'their currency')
         else 'in dollars to their CrewPay wallet' end));
end $$;
grant execute on function public.sign_role(uuid, int, text, jsonb) to authenticated;
