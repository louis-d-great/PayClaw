# CrewPay vault contract

`CrewPayVault` holds a crew's budget in USDC on Base and releases it only by the rules everyone signed. Nobody, including the contract owner, can move money any other way.

## How it works

1. The crew agrees on terms in the app. Each collaborator signs the final terms with their wallet (EIP-712). Coinbase Smart Wallets (ERC-1271) work too.
2. The Lead calls `fund(terms, signatures)`. The vault checks every signature, pulls the full budget from the Lead and pays each **deposit** straight away.
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
npm test            # 17 tests: funding, signatures, milestones, auto-release, reclaim, disputes, cancel
npm run build
```

The Solidity compiler comes from npm (`solc`), so it builds without downloading anything else.

## Deploy to Base Sepolia (testnet)

1. Make a wallet just for deploying and get Base Sepolia test ETH from a faucet (for example the one on the Coinbase Developer Platform).
2. Pick the **reviewer** wallet. It rules on disputes; at launch that's the CrewPay team.
3. Run:

```bash
DEPLOYER_PRIVATE_KEY=0x... REVIEWER_ADDRESS=0x... npm run deploy:base-sepolia
```

4. Put the printed address in the app as `VITE_VAULT_ADDRESS`.

Never commit a private key. `.env` is git-ignored.

## Before mainnet

- **Get an audit.** This contract holds other people's money and hasn't been audited.
- **Guard the owner key.** The owner can change the reviewer, and the reviewer decides disputed milestones. Put the owner on a multisig (e.g. Safe).
- **Undeployed smart wallets.** A brand-new Coinbase Smart Wallet signs with ERC-6492 until its first transaction. Add ERC-6492 support, or have wallets deploy before signing.
