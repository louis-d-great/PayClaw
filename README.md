# Crewpay

**Build your crew, agree on pay, get paid.**

Crewpay is for any group that works together and gets paid together: freelance teams, music collabs, design duos, small shops. The Lead writes the brief and sets each role's pay. Collaborators accept, counter-offer, or decline. Nothing is final until everyone signs. Then the Lead funds a vault on Base, and each person is paid in USDC as their milestones are approved.

This repo is the **front-end prototype**. Wallets, the vault and the database are mocked, so the whole flow can be clicked through today.

| Create project | Review & sign |
| --- | --- |
| ![Create](docs/screens/create.png) | ![Sign](docs/screens/sign.png) |

## Run it

```bash
npm install
npm run dev
```

Use **Viewing as** in the top bar to switch between Louis, Tobi, Ada and Kemi, and play every side of a deal. **Reset demo data** on the dashboard restores the sample projects.

## Try this flow

1. As **Louis**, open *Lagos Nights EP*. Ada has counter-offered $550. Accept it. The draft moves to v2 and Tobi's signature is cleared.
2. Switch to **Tobi**, open the invite from the dashboard, and sign again.
3. Switch to **Ada** and sign. Switch to **Kemi** and take the open Mix engineer role.
4. Back as **Louis**, everyone has signed. Click **Fund project**.

## What's real and what's mocked

| Piece | Now | Next |
| --- | --- | --- |
| Screens, flow, rules (signing, versions, counter-offers) | Real | — |
| Accounts | "Viewing as" switcher | Sign-in + Coinbase Smart Wallet |
| Storage + chat | `localStorage` | Supabase |
| Signatures | Button | EIP-712 signature over (project, version, role, pay) |
| Vault + payouts | Button | Solidity escrow on Base, milestone release, 7-day auto-approve |

## Rules the code enforces

- Every change to the draft bumps its **version**. A signature only counts for the version it was made on, so any change asks everyone to sign again (`src/store.tsx`).
- Pay is a **fixed amount per role**. A raise comes out of the Lead's budget, not a teammate's pay.
- Everyone sees everyone's pay.
- The project can only be funded once every role is signed.

## Stack

React 19 · TypeScript · Tailwind CSS v4 · Vite · React Router

## Project map

```
src/
  types.ts               Project, Role, Milestone, Message
  store.tsx              State, rules, demo data (swap for Supabase later)
  pages/CreateProject    Screen 1: brief, roles, pay, milestones
  pages/ReviewAndSign    Screen 2: accept, counter-offer, decline, sign
  pages/ProjectPage      Signature progress, invite links, funding, chat
  pages/Dashboard        Projects I lead / Projects I'm on
  components/Chat        Chat with counter-offer cards the Lead answers in one tap
```
