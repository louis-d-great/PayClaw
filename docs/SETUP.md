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
   Then do the same with `supabase/migrations/0002_live_actions.sql` (the actions the app calls: create, sign, counter-offer, apply, edit).
4. Open **Authentication → Providers** and check that **Email** is on. Magic links are enough to start.
   Then open **Authentication → URL Configuration**: set **Site URL** to `http://localhost:5173` and add `http://localhost:5173/**` under **Redirect URLs**, so sign-in links open the app. Add your Vercel address the same way once you have one.
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

## 4. Email updates

CrewPay emails people on a project when something needs them: an invite, everyone signed, funding and deposits, submitted work, payments, disputes. People can switch it off under Edit profile.

1. **Run the SQL.** Supabase → SQL Editor → paste all of `supabase/migrations/0004_email_notifications.sql` → Run.
2. **Get an email account to send from.** The quickest is Gmail (up to about 500 emails a day):
   - Turn on 2-Step Verification for the Google account: https://myaccount.google.com/security
   - Create an app password: https://myaccount.google.com/apppasswords (name it "CrewPay"). Google shows 16 letters once.
   - In `.env.local`: `SMTP_USER` = the Gmail address, `SMTP_PASS` = the 16 letters (no spaces), `MAIL_FROM` = `CrewPay <that address>`. Leave `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=465`.
   - Any other provider with SMTP works the same way (Brevo, Mailjet, Resend with your own domain): use its host, port, user and password.
3. **Vercel → Settings → Environment Variables:** add `NOTIFY_SECRET`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` with the values from `.env.local`, then redeploy.
4. **Point the database at the app.** Claude (or anyone with the service key) adds two rows to the `app_config` table: `notify_url` = `<your site>/api/notify` and `notify_secret` = the `NOTIFY_SECRET` value.

## 5. Open roles board

`/jobs` lists open roles that their Lead chose to show publicly. Anyone can browse it without signing in.

1. Supabase → SQL Editor → paste all of `supabase/migrations/0005_open_roles.sql` → Run.
2. That's it. When a Lead leaves a role's "Who" blank, "List on the public Open roles board" is ticked by default.
