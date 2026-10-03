// Fee sponsorship: CrewPay pays the network fee for its users' Tempo transactions, so nobody
// needs to hold anything to agree, fund, submit or approve. The relay only co-signs as fee
// payer for calls to the CrewPay vault, plus pathUSD approvals for the vault; anything else
// is refused and the user's wallet falls back to paying its own fee.
//
// Env: FEE_PAYER_PRIVATE_KEY (server only, never VITE_), VITE_VAULT_ADDRESS.
import { Handler } from 'accounts/server'
import { decodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

export const PATH_USD: Address = '0x20c0000000000000000000000000000000000000'

type Call = { to?: Address | null; data?: Hex }

export function allowed(calls: Call[], vault: Address): boolean {
  if (calls.length === 0) return false
  return calls.every((c) => {
    const to = c.to?.toLowerCase()
    if (to === vault.toLowerCase()) return true
    if (to !== PATH_USD || !c.data) return false
    try {
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: c.data })
      return functionName === 'approve' && String(args[0]).toLowerCase() === vault.toLowerCase()
    } catch {
      return false
    }
  })
}

let relay: ReturnType<typeof Handler.relay> | undefined

function handler() {
  if (relay) return relay
  const key = process.env.FEE_PAYER_PRIVATE_KEY as Hex | undefined
  const vault = process.env.VITE_VAULT_ADDRESS as Address | undefined
  if (!key || !vault) throw new Error('Set FEE_PAYER_PRIVATE_KEY and VITE_VAULT_ADDRESS.')
  relay = Handler.relay({
    path: '/api/relay',
    chains: [tempoModerato],
    feePayer: {
      account: privateKeyToAccount(key),
      feeToken: PATH_USD,
      name: 'CrewPay',
      url: 'https://payclaw-six.vercel.app',
      validate: (request) => {
        const r = request as { calls?: readonly Call[]; to?: Address | null; data?: Hex }
        return allowed(r.calls?.length ? [...r.calls] : [{ to: r.to, data: r.data }], vault)
      },
    },
  })
  return relay
}

export function POST(request: Request) {
  return handler().fetch(request)
}

export function OPTIONS(request: Request) {
  return handler().fetch(request)
}
