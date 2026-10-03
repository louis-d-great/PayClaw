// Deploys CrewPayVault.
//   DEPLOYER_PRIVATE_KEY=0x… REVIEWER_ADDRESS=0x… npm run deploy:tempo-testnet
// Optional: OWNER_ADDRESS (defaults to the deployer), TOKEN_ADDRESS (defaults per network).
const { ethers, network } = require('hardhat')

// The dollar stablecoin the vault holds on each network. Base: Circle's USDC.
// Tempo testnet: pathUSD (TIP-20, 6 decimals), which is also the default fee token,
// so a Lead needs only one coin. Mainnet Tempo: choose the coin with the best on/off-ramps.
const TOKEN = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  tempoTestnet: '0x20c0000000000000000000000000000000000000',
}
// Tempo's TIP-20 coins support transfer memos; each payout is tagged with its project.
const MEMOS = { tempoTestnet: true, tempo: true }

async function main() {
  const [deployer] = await ethers.getSigners()
  const token = process.env.TOKEN_ADDRESS || TOKEN[network.name]
  const memos = !!MEMOS[network.name]
  const reviewer = process.env.REVIEWER_ADDRESS
  const owner = process.env.OWNER_ADDRESS || deployer.address
  if (!token) throw new Error(`No stablecoin address for network "${network.name}". Set TOKEN_ADDRESS.`)
  if (!reviewer) throw new Error('Set REVIEWER_ADDRESS: the wallet that rules on disputes.')

  console.log(`Deploying CrewPayVault to ${network.name} from ${deployer.address}`)
  const vault = await (await ethers.getContractFactory('CrewPayVault')).deploy(token, memos, reviewer, owner)
  await vault.waitForDeployment()
  console.log('CrewPayVault:', await vault.getAddress())
  console.log('Token:', token, '| memos:', memos, '| reviewer:', reviewer, '| owner:', owner)
  console.log('Put the vault address in the app as VITE_VAULT_ADDRESS.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
