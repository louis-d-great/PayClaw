# CrewPay

The product is **CrewPay** (the repo is named PayClaw by mistake; don't rename the product to PayClaw).

Groups who work and get paid together (music collabs, design duos, freelance teams, small shops) agree on pay up front, sign, and get paid from a vault on Base as milestones are delivered. The Lead writes the brief, sets each role's fixed pay, deposit and milestones; collaborators accept, counter-offer or decline, and state how they want to be paid. Nothing binds until everyone signs.

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
- Payouts: USDC to a wallet now; bank via an offramp partner later.

## State of the code

- React 19, TypeScript, Tailwind v4, Vite, React Router. Two modes in `src/store.tsx`: **live** (Supabase, when `.env.local` has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) and **demo** (`localStorage`, "Viewing as", "Skip 7 days"). Live covers sign-in, profiles, projects, signing, counter-offers, open roles, draft edits and chat/DMs with files; `src/live.ts` maps rows to the app's types and actions to database functions in `supabase/migrations/0002_live_actions.sql`. Funding, milestone work and disputes are demo-only until the vault is wired.
- Database tests: `supabase/tests/run.sh` (CI runs it). Every cross-person action and every system message goes through a security-definer function; clients can't write system messages.
- `main` on GitHub (`louis-d-great/PayClaw`) has the full app (milestones, disputes, chat with files/voice/DMs, applications, edit/cancel, profiles, `npm start`), the Solidity vault for Base with tests and CI, and the Supabase schema + security rules and Vercel config.
- Next: Coinbase Smart Wallet, EIP-712 signatures, wire the vault, then milestone work and disputes live.

## Working here

- Run: `npm install`, then `npm start` (opens http://localhost:5173). Check with `npm run build` and `npm run lint`.
- Work on a `claude/...` branch and open a PR; don't commit straight to `main`.
- The user is not a developer: explain in plain words, give step-by-step instructions for anything they must do.
