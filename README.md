# CrewPay

**Your crew agrees on pay before the work starts, and everyone gets paid on Tempo as the work gets done.**

Live app: **https://payclaw-six.vercel.app** · Vault on Tempo testnet: [`0xCEb2…Ac2A`](https://explore.testnet.tempo.xyz/address/0xCEb2e939DE06360eB2fE68e07A2589059d9CAc2A) · Built for the Colosseum Crypto World's Fair, **Tempo track**

## The problem

Music collabs, design duos, freelance crews and small shops work together on a handshake. The producer delivers the beat and waits weeks to get paid. The Lead pays a deposit and the designer disappears. Nobody wrote down what "done" means, so every disagreement turns into an argument. Escrow tools exist for one buyer and one seller, not for a whole crew.

## What CrewPay does

1. **The Lead posts the deal.** A brief, then each role with a fixed price, an upfront deposit, and milestones. Every milestone has a **"Done when"** ("Track 1 mixed, 24-bit WAV, up to 2 rounds of changes").
2. **Everyone agrees, or pushes back.** Each person accepts, counter-offers on price and deposit, or declines. Any change creates a new version, and everyone signs again. Nothing binds until everyone has agreed.
3. **The money is locked in first.** The Lead funds a vault on Tempo. Deposits go out the same second.
4. **Work gets paid as it's delivered.** The collaborator submits; the Lead approves (paid instantly), asks for changes (limited rounds), or says nothing (paid automatically after 7 days).
5. **Disagreements have an ending.** After the agreed revision rounds, either side can open a dispute. Both state their case, CrewPay review reads the "Done when" and the group chat, and splits the money. Final.

The crew talks in a WhatsApp-style chat with files and voice notes. Only the group chat is evidence; private DMs never are.

## Why Tempo

- **Dollars, not tokens.** The vault holds a dollar stablecoin. Fees are paid in dollars too, so nobody ever buys a gas coin.
- **Nobody pays fees.** CrewPay sponsors every transaction through Tempo's fee sponsorship. A collaborator with $0 can sign a contract and get paid.
- **No wallet app, no seed phrase.** Every wallet is a **passkey**: Face ID, a fingerprint, a Windows PIN, or a phone. Built on the Tempo Accounts SDK.
- **Every payout carries a reference.** The vault pays with `transferWithMemo`, tagging each payment with its project, like a bank transfer reference.
- **Cheap enough to disappear.** A whole project (two agreements, funding, two deposits, a submission and an approval) cost about **$0.003** in fees on testnet.

## Try it

**Live, on Tempo testnet:** open https://payclaw-six.vercel.app, sign in with your email, and create your wallet with a passkey. Create a project and invite a second account (a private window works). Sign as the collaborator, then fund as the Lead: "Get test dollars" tops you up for free. Then submit work, approve it, and watch the payment land in the collaborator's wallet.

**Demo, no sign-in:** click **Explore the demo** on the sign-in screen. Use **Viewing as** to play every side, and **Skip 7 days** to watch auto-approval fire.

## How it works

```
Browser (React)                     Server (Vercel)                 Tempo testnet
───────────────                     ───────────────                 ─────────────
Passkey wallet ── one tap ────────► /api/relay  (co-signs as fee ─► CrewPayVault
 agree · fund · submit · approve      payer; vault calls only)       holds pathUSD,
                                                                     enforces the rules,
                 ◄── events ─────── /api/sync   (records what   ◄── pays with memos
                                      the vault did, once)
Supabase: accounts, projects, chat, files (row-level security)
```

- **The vault decides everything about money.** `contracts/contracts/CrewPayVault.sol`: deposits on funding, approve and pay, limited change requests, release after 7 days of silence, disputes and rulings, reclaim after a missed deadline, and cancel only if everyone agrees. 22 tests.
- **Agreeing to terms.** The terms (every person's wallet, every amount and deadline, the draft version) are hashed. Each collaborator calls `agree(hash)` with their passkey. The vault refuses to be funded unless every collaborator agreed to that exact hash, so changing anything means agreeing again.
- **Proving what was submitted.** A submission's note and files are hashed into the vault transaction. The server only records the words and files that match that hash.
- **The database can't lie about the chat.** System messages (signed, funded, paid, ruled) are written only by database functions and the server, never by a browser. 87 database security and action tests.

## Run it yourself

You need [Node.js](https://nodejs.org) (LTS).

```bash
git clone https://github.com/louis-d-great/PayClaw.git
cd PayClaw
npm install
npm start
```

Without settings it opens the demo. To run it live, follow [docs/SETUP.md](docs/SETUP.md) (Supabase, Vercel, Tempo testnet) and fill in `.env.local` from `.env.example`.

| Check | Command |
| --- | --- |
| App build and types | `npm run build` |
| Vault tests | `cd contracts && npm install && npm test` |
| Database tests | `supabase/tests/run.sh` (needs Postgres 16; runs in CI) |
| Full project on live testnet | `cd contracts && VAULT_ADDRESS=0x… npx hardhat run scripts/smoke-tempo.js --network tempoTestnet` |

## What's real and what isn't yet

| Piece | Status |
| --- | --- |
| Sign-in, projects, versions, counter-offers, open roles, chat, DMs, files | Live (Supabase) |
| Passkey wallets, sponsored fees | Live (Tempo testnet) |
| Agree, fund, deposits, submit, approve, changes, 7-day release, dispute, ruling | Live (Tempo testnet vault) |
| Money | Test dollars (pathUSD from Tempo's faucet) |
| Cancelling a funded project | Demo only |
| Paying in and cashing out in naira, cedis or dollars | Next: an on/off-ramp partner such as Yellow Card or Bridge |
| Reviewer and owner keys | Single test keys now; a multi-signature setup before real money |
| Security audit of the vault | Needed before mainnet |

## Built during the hackathon

The first commit is dated 2026-09-28, inside the judged window (Sep 14 – Oct 12, 2026). Everything in this repository was built during the hackathon; the git history shows every step.

## Project map

```
contracts/                  CrewPayVault (Solidity), tests, Tempo deploy + smoke test
api/relay.ts                Fee sponsorship: CrewPay pays users' fees, vault calls only
api/sync.ts                 Mirrors vault events into Supabase, once each
api/review.ts               CrewPay review: open disputes and rulings
api/faucet.ts               Testnet top-ups
src/lib/tempo.ts            Passkey wallets, terms, vault calls
src/live.ts, src/store.tsx  Live (Supabase) and demo data
src/pages/                  Create, review & sign, project, milestone, review, profile
supabase/migrations/        Schema, row-level security, actions
```

React 19 · TypeScript · Tailwind CSS v4 · Vite · Supabase · Tempo Accounts SDK · viem · Hardhat · Vercel
