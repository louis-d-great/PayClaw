// EIP-712 definition of the terms every collaborator signs. The app uses the same
// shape when it asks a wallet to sign, and the vault checks it on-chain.

const TYPES = {
  Terms: [
    { name: 'projectId', type: 'bytes32' },
    { name: 'lead', type: 'address' },
    { name: 'version', type: 'uint32' },
    { name: 'roles', type: 'Role[]' },
  ],
  Role: [
    { name: 'collaborator', type: 'address' },
    { name: 'deposit', type: 'uint128' },
    { name: 'milestones', type: 'Milestone[]' },
  ],
  Milestone: [
    { name: 'amount', type: 'uint128' },
    { name: 'due', type: 'uint64' },
    { name: 'revisions', type: 'uint8' },
    { name: 'doneWhen', type: 'bytes32' },
  ],
}

const domain = (chainId, verifyingContract) => ({ name: 'CrewPay', version: '1', chainId, verifyingContract })

module.exports = { TYPES, domain }
