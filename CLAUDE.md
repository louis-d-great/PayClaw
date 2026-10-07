# CrewPay

The product is **CrewPay** (the repo is named PayClaw by mistake; don't rename the product to PayClaw).

Groups who work and get paid together (music collabs, design duos, freelance teams, small shops) agree on pay up front, sign, and get paid from a vault on Tempo as milestones are delivered. The Lead writes the brief, sets each role's fixed pay, deposit and milestones; collaborators accept, counter-offer or decline, and state how they want to be paid. Nothing binds until everyone signs.

## Decisions already made (don't re-litigate)

- **Milestones are signed terms.** The Lead drafts them, each collaborator agrees by signing; they can counter-offer on pay and deposit. Every milestone has a "Done when" definition that reviews and disputes are judged against.
- **Pay per milestone is a percentage set by the Lead**, part of what's signed. Deposit + milestone % must sum to 100.
- **Upfront deposit is prioritised**: paid the moment the vault is funded (default 20%).
- **Any change to the draft bumps the version**; old signatures stop counting and everyone re-signs.
- Blank assignee = open role; anyone with the link can apply.
- Lead can fund only after everyone has signed. Everyone sees everyone's pay.
- **Review rules** (`src/lib/rules.ts`, which the vault contract mirrors): Lead silent 7 days after a submission → auto-approve and pay; N revision rounds (default 2), then approve or dispute; rejecting never returns money to the Lead; previews are open, finals unlock only when paid; deadline + 7 days with nothing submitted → Lead may reclaim.
- **Disputes**: both sides state their case for 3 days; CrewPay review (the platform, said openly) rules and can split the money. **Only the group chat is evidence; DMs are private and never seen by the reviewer.**
- Chat should feel like WhatsApp: files from phone, voice notes, replies, read ticks, DMs between members.
- Payouts: dollars (a stablecoin) to the person's CrewPay passkey wallet now; bank via an off-ramp partner later. Users see "USD" / "CrewPay wallet", not USDC or chain names.

## State of the code

- React 19, TypeScript, Tailwind v4, Vite, React Router. Two modes in `src/store.tsx`: **live** (Supabase, when `.env.local` has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) and **demo** (`localStorage`, "Viewing as", "Skip 7 days"). Live covers sign-in, profiles, projects, signing, counter-offers, open roles, draft edits and chat/DMs with files; `src/live.ts` maps rows to the app's types and actions to database functions in `supabase/migrations/0002_live_actions.sql`. Signing, funding, submit/approve/changes, 7-day release, disputes and rulings run on the Tempo vault: `src/lib/tempo.ts` (passkey wallets, vault calls), `src/liveWork.ts` (milestone actions), `api/relay.ts` (fee sponsorship, vault calls only), `api/sync.ts` (mirrors vault events into Supabase once each; checks submission/change notes against on-chain hashes), `api/review.ts` (reviewer page, server-held reviewer key, `REVIEWER_HANDLES`). Only cancelling a funded project is still demo-only.
- Database tests: `supabase/tests/run.sh` (CI runs it). Every cross-person action and every system message goes through a security-definer function; clients can't write system messages.
- Deployed at https://payclaw-six.vercel.app (Vercel, production = `main`). Env vars there mirror `.env.local`. Supabase migrations 0001–0003 are applied by hand in the SQL Editor; new migrations must be re-runnable and the user told to run them.
- `.npmrc` has `legacy-peer-deps=true` (the accounts SDK's optional peers break a normal install).
- **Hackathon:** Colosseum Crypto World's Fair, **Tempo track**, submissions due **2026-10-12**. Code started 2026-09-28 (inside the judged window; disclose it).
- **Chain: Tempo** (Stripe/Paradigm payments L1, no native coin, fees in stablecoins). Vault live on Tempo testnet at `0xCEb2e939DE06360eB2fE68e07A2589059d9CAc2A`, holding pathUSD, payouts tagged with `transferWithMemo(projectId)`. Collaborators agree with `agree(termsDigest)` so passkey accounts work. Test-only keys live in `contracts/.env` (git-ignored).
- Wallets are passkeys (Tempo Accounts SDK, `webAuthn` adapter); public keys backed up in the `passkeys` table. CrewPay pays every fee via `/api/relay`.
- First-run tour (`src/components/Tour.tsx`): welcome + dashboard spotlight once per person (localStorage), one-time PageHint cards on create/project/invite/milestone, replay from the profile.
- Before mainnet: the fee sponsor (`api/relay.ts`) only checks which contract is called; limit it to signed-in CrewPay users with a per-person cap so it can't be drained.
- Open roles board (`/jobs`, `src/pages/OpenRoles.tsx`, `open_roles()` in 0005): public, no sign-in; Leads opt in per open role (`roles.listed`). The product vision is "the place crews form": a talent marketplace for crews with pay built in. Revenue is a small platform fee on funded projects and ramp fees, never gas (CrewPay pays gas).
- Next: the user records the pitch and demo videos (`docs/VIDEOS.md`) and submits on Colosseum. Later: on/off-ramp partner, multisig reviewer/owner keys, vault audit, mainnet.

## Working here

- Run: `npm install`, then `npm start` (opens http://localhost:5173). Check with `npm run build` and `npm run lint`.
- Work on a `claude/...` branch and open a PR; don't commit straight to `main`.
- The user is not a developer: explain in plain words, give step-by-step instructions for anything they must do.
