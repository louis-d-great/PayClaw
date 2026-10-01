require('@nomicfoundation/hardhat-toolbox')
const { subtask } = require('hardhat/config')
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names')

const SOLC = '0.8.28'

// Use the compiler from npm (solcjs) instead of downloading it, so builds work
// on machines that can't reach binaries.soliditylang.org.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
  if (args.solcVersion !== SOLC) return runSuper()
  return {
    compilerPath: require.resolve('solc/soljson.js'),
    isSolcJs: true,
    version: SOLC,
    longVersion: require('solc').version().replace('.Emscripten.clang', ''),
  }
})

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'cancun' },
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
}
