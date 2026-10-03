// End-to-end check of a deployed vault on Tempo testnet, with real transactions:
// two collaborators agree on-chain, the Lead funds (deposits pay out), one milestone is
// submitted and approved, and every payout carries the project id as its memo.
// Prints what each step cost in fees.
//   VAULT_ADDRESS=0x… npx hardhat run scripts/smoke-tempo.js --network tempoTestnet
const { ethers, network } = require('hardhat')

const PATH_USD = '0x20c0000000000000000000000000000000000000'
const usd = (n) => ethers.parseUnits(String(n), 6)
const fmt = (n) => `$${ethers.formatUnits(n, 6)}`
const text = (s) => ethers.keccak256(ethers.toUtf8Bytes(s))

async function faucet(address) {
  await network.provider.send('tempo_fundAddress', [address])
}

async function waitForFunds(coin, address) {
  for (let i = 0; i < 30; i++) {
    if ((await coin.balanceOf(address)) > 0n) return
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`Faucet never funded ${address}`)
}

async function main() {
  const [lead] = await ethers.getSigners()
  const vault = await ethers.getContractAt('CrewPayVault', process.env.VAULT_ADDRESS)
  const coin = await ethers.getContractAt('MockTIP20', PATH_USD) // same ERC-20 + memo interface
  const provider = ethers.provider

  // Fresh collaborators for each run, funded from the faucet so they can pay their own fees.
  const ada = ethers.Wallet.createRandom().connect(provider)
  const tobi = ethers.Wallet.createRandom().connect(provider)
  await faucet(ada.address)
  await faucet(tobi.address)
  await waitForFunds(coin, ada.address)
  await waitForFunds(coin, tobi.address)

  const projectId = ethers.id(`smoke-${Date.now()}`)
  const terms = {
    projectId,
    lead: lead.address,
    version: 1,
    roles: [
      { collaborator: ada.address, deposit: usd(100), milestones: [{ amount: usd(400), due: 0, revisions: 2, doneWhen: text('Cover art, 3000px PNG') }] },
      { collaborator: tobi.address, deposit: usd(50), milestones: [{ amount: usd(450), due: 0, revisions: 2, doneWhen: text('Five mixed WAVs') }] },
    ],
  }
  const digest = await vault.termsDigest(terms)

  // Fee = what the sender's pathUSD balance dropped by, beyond the money they moved.
  const step = async (label, who, send, moved = 0n) => {
    const before = await coin.balanceOf(who.address)
    const tx = await send()
    const receipt = await tx.wait()
    const after = await coin.balanceOf(who.address)
    console.log(`${label.padEnd(34)} gas ${String(receipt.gasUsed).padStart(9)}  fee ${fmt(before - after - moved)}  tx ${receipt.hash}`)
    return receipt
  }

  await step('Ada agrees to the terms', ada, () => vault.connect(ada).agree(digest))
  await step('Tobi agrees to the terms', tobi, () => vault.connect(tobi).agree(digest))
  await step('Lead approves the vault to pull $1000', lead, () => coin.connect(lead).approve(vault, usd(1000)))
  const funded = await step('Lead funds; deposits pay out', lead, () => vault.connect(lead).fund(terms, ['0x', '0x']), usd(1000))
  await step('Ada submits her milestone', ada, () => vault.connect(ada).submit(projectId, 0, 0, text('figma link')))
  const approved = await step('Lead approves; Ada is paid', lead, () => vault.connect(lead).approve(projectId, 0, 0))

  const memoTopic = coin.interface.getEvent('TransferWithMemo').topicHash
  const memos = [...funded.logs, ...approved.logs].filter((l) => l.topics[0] === memoTopic).map((l) => coin.interface.parseLog(l))
  console.log(`\nPayouts tagged with the project id: ${memos.length}`)
  for (const m of memos) console.log(`  ${fmt(m.args.amount)} to ${m.args.to}  memo ${m.args.memo === projectId ? 'matches project' : 'WRONG'}`)

  const held = await vault.held(projectId)
  console.log(`\nStill held in the vault for this project: ${fmt(held)} (expected $450, Tobi's milestone)`)
  if (held !== usd(450) || memos.length !== 3 || memos.some((m) => m.args.memo !== projectId)) throw new Error('Smoke test failed')
  console.log('Smoke test passed.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
