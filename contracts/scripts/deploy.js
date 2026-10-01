// Deploys CrewPayVault.
//   DEPLOYER_PRIVATE_KEY=0x… REVIEWER_ADDRESS=0x… npm run deploy:base-sepolia
// Optional: OWNER_ADDRESS (defaults to the deployer), USDC_ADDRESS (defaults per network).
const { ethers, network } = require('hardhat')

// Circle's official USDC on each network.
const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const usdc = process.env.USDC_ADDRESS || USDC[network.name]
  const reviewer = process.env.REVIEWER_ADDRESS
  const owner = process.env.OWNER_ADDRESS || deployer.address
  if (!usdc) throw new Error(`No USDC address for network "${network.name}". Set USDC_ADDRESS.`)
  if (!reviewer) throw new Error('Set REVIEWER_ADDRESS: the wallet that rules on disputes.')

  console.log(`Deploying CrewPayVault to ${network.name} from ${deployer.address}`)
  const vault = await (await ethers.getContractFactory('CrewPayVault')).deploy(usdc, reviewer, owner)
  await vault.waitForDeployment()
  console.log('CrewPayVault:', await vault.getAddress())
  console.log('USDC:', usdc, '| reviewer:', reviewer, '| owner:', owner)
  console.log('Put the vault address in the app as VITE_VAULT_ADDRESS.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
