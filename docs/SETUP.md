# Going live: the accounts CrewPay needs

Three free accounts turn the prototype into a real app. Each takes a few minutes. Do them in this order, then send Claude the values marked **Send**.

| Service | What it does for CrewPay | Cost to start |
| --- | --- | --- |
| Supabase | Sign-in, the database (projects, chat, DMs), file storage, live updates | Free tier |
| Vercel | Hosts the website at a real address and redeploys on every merge | Free (Hobby) |
| Base Sepolia | Test network for the vault contract, with fake USDC | Free (faucet) |

## 1. Supabase

1. Go to https://supabase.com and sign up with GitHub.
2. **New project**. Name it `crewpay`, choose a strong database password (save it in a password manager), and pick the region closest to most of your users.
3. When it's ready, open **SQL Editor → New query**. Paste all of `supabase/migrations/0001_init.sql` and click **Run**. It should say "Success".
4. Open **Authentication → Providers** and check that **Email** is on. Magic links are enough to start.
5. Open **Project Settings → API**.
   - **Send:** the **Project URL**.
   - **Send:** the **anon public** key. It's designed to be public; the security rules above protect the data.
   - **Never send** the `service_role` key. It bypasses every rule. It will go into Vercel as a server secret later.

## 2. Vercel

1. Go to https://vercel.com and sign up with GitHub.
2. **Add New → Project** and import `louis-d-great/PayClaw`. If it isn't listed, click "Adjust GitHub App Permissions" and allow the repo.
3. Vercel detects Vite from `vercel.json`. Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL`: your Project URL
   - `VITE_SUPABASE_ANON_KEY`: your anon key
4. Click **Deploy**. You get an address like `payclaw.vercel.app`, and every merge to `main` redeploys it.
5. **Send:** the address.

## 3. Base Sepolia (the vault on a test network)

1. Install a wallet (Coinbase Wallet or MetaMask) and create a **new** account just for deploying. Don't use a wallet that holds real money.
2. Get free test ETH for Base Sepolia from a faucet, e.g. https://portal.cdp.coinbase.com/products/faucet
3. Choose the **reviewer** wallet. It rules on disputes; at the start that's you.
4. Deploy (on your computer, from the repo folder):

```bash
cd contracts
npm install
DEPLOYER_PRIVATE_KEY=0xYOUR_DEPLOY_KEY REVIEWER_ADDRESS=0xREVIEWER npm run deploy:base-sepolia
```

5. **Send:** the printed `CrewPayVault` address. Also add it to Vercel as `VITE_VAULT_ADDRESS`, plus `VITE_CHAIN=base-sepolia`.

Never paste a private key into chat, GitHub or Vercel. It stays on your computer.

## What happens next

With the Project URL, anon key, site address and vault address, Claude can:

- switch the app from demo data to Supabase (sign-in, real projects, live chat with real file uploads, DMs, read receipts)
- connect wallets (Coinbase Smart Wallet) so signing and funding happen on Base Sepolia
- add the small server job that records vault payouts in the database

## Checking the database rules yourself

`supabase/tests/run.sh` runs 34 security checks against a local Postgres 16. Examples: strangers can't read projects, DMs stay between two people, nobody can edit a sent message, and final files stay locked until paid. They also run on GitHub for every change to `supabase/`.
