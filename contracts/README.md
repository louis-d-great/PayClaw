# CrewPay vault contract

`CrewPayVault` holds a crew's budget in a dollar stablecoin and releases it only by the rules everyone agreed to. Nobody, including the contract owner, can move money any other way. It runs on **Tempo** (Stripe and Paradigm's payments chain), and on Base with USDC.

## Live on Tempo testnet (Moderato)

| | |
| --- | --- |
| Vault | [`0xCEb2e939DE06360eB2fE68e07A2589059d9CAc2A`](https://explore.testnet.tempo.xyz/address/0xCEb2e939DE06360eB2fE68e07A2589059d9CAc2A) |
| Stablecoin | pathUSD `0x20c0000000000000000000000000000000000000` (6 decimals, also the default fee token) |
| Chain | 42431, RPC `https://rpc.moderato.tempo.xyz` |
| Reviewer | `0x7Ca2907a94c99b10Ca09302ce8182eB0490E04e6` (test key) |

A full run on the live testnet (`scripts/smoke-tempo.js`): agree ×2, approve, fund with two deposits, submit, approve. Total fees: **about $0.003**. Funding is the biggest step (3.4M gas, $0.002) because Tempo charges more than Ethereum for new storage.

## How it works

1. The crew agrees on terms in the app. Each collaborator then agrees to the final terms in one of two ways:
   - `agree(termsDigest)`: one on-chain tap. Works for **any account, including passkey accounts**, which can't produce the signatures below.
   - Sign the terms with their wallet (EIP-712). Smart wallets (ERC-1271) work too.
   The digest covers the chain, the vault, the project, the draft version and every role's pay, so agreeing to one draft says nothing about another.
2. The Lead calls `fund(terms, signatures)`, passing empty bytes for anyone who agreed on-chain. The vault checks everyone agreed, pulls the full budget from the Lead and pays each **deposit** straight away.
   On Tempo, every payout uses `transferWithMemo` with the project id as the memo, like a bank transfer reference.
3. For each milestone:
   - `submit`: the collaborator hands in work (a hash of it).
   - `approve`: the Lead releases the milestone's money.
   - `requestChanges`: the Lead sends it back, up to the agreed number of revision rounds.
   - `release`: **anyone** can release a submission after the Lead has been silent for 7 days.
   - `openDispute`: once the rounds are used up, either side can escalate.
   - `rule`: the reviewer splits the disputed amount between collaborator and Lead. Final.
   - `reclaim`: if a deadline passes by 7 days with nothing ever submitted, the Lead takes that milestone back.
4. `proposeCancel` / `approveCancel` / `withdrawCancel`: cancelling needs every party. Paid work stays paid; whatever is still held returns to the Lead.

The same rules drive the app's prototype (`src/lib/rules.ts`).

| Rule | Value |
| --- | --- |
| Lead review window | 7 days, then anyone can call `release` |
| Grace after a missed deadline | 7 days, then the Lead can `reclaim` |
| Max roles per project | 16 |
| Max milestones per role | 16 |
| Fee | None |

The terms type is in `lib/terms.js`. The app signs exactly this shape, and a test checks that the contract's digest matches the standard EIP-712 encoding.

## Commands

```bash
cd contracts
npm install
npm test            # 22 tests: funding, signatures, on-chain agreement, Tempo memos, milestones, auto-release, reclaim, disputes, cancel
npm run build
```

The Solidity compiler comes from npm (`solc`), so it builds without downloading anything else.

## Deploy to Tempo testnet

1. Put a throwaway deployer key and a reviewer address in `contracts/.env` (git-ignored): `DEPLOYER_PRIVATE_KEY=0x…`, `REVIEWER_ADDRESS=0x…`.
2. Fund the deployer with test stablecoins: `curl -s https://rpc.moderato.tempo.xyz -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tempo_fundAddress","params":["0xYOUR_ADDRESS"]}'`. Tempo has no gas coin: fees are paid in pathUSD.
3. Deploy and check it end to end:

```bash
set -a; . ./.env; set +a
npm run deploy:tempo-testnet
VAULT_ADDRESS=0x… npx hardhat run scripts/smoke-tempo.js --network tempoTestnet
```

## Deploy to Base Sepolia (testnet)

1. Make a wallet just for deploying and get Base Sepolia test ETH from a faucet (for example the one on the Coinbase Developer Platform).
2. Pick the **reviewer** wallet. It rules on disputes; at launch that's the CrewPay team.
3. Run:

```bash
DEPLOYER_PRIVATE_KEY=0x... REVIEWER_ADDRESS=0x... npm run deploy:base-sepolia
```

4. Put the printed address in the app as `VITE_VAULT_ADDRESS`. On Base the vault is deployed without memos (`memos = false`).

Never commit a private key. `.env` is git-ignored.

## Before mainnet

- **Get an audit.** This contract holds other people's money and hasn't been audited.
- **Guard the owner key.** The owner can change the reviewer, and the reviewer decides disputed milestones. Put the owner on a multisig (e.g. Safe).
- **Undeployed smart wallets.** A brand-new Coinbase Smart Wallet signs with ERC-6492 until its first transaction. Add ERC-6492 support, or have wallets deploy before signing.
