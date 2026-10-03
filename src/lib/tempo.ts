import { Provider, Storage, WebAuthnCeremony, webAuthn } from 'accounts'
import { createPublicClient, encodeFunctionData, erc20Abi, http, keccak256, toBytes, type Address, type Hex } from 'viem'
import { tempoModerato } from 'viem/chains'
import type { Project, Role } from '../types'
import { schedule } from './rules'
import { supabase } from './supabase'
import { vaultAbi } from './vaultAbi'

// CrewPay on Tempo: passkey wallets, terms, and the vault. Everyone's wallet is a passkey
// (Face ID, fingerprint, Windows PIN or their phone); CrewPay pays every network fee through
// /api/relay, so nobody needs to hold anything to agree, fund, submit or approve.

export const chain = tempoModerato
export const VAULT = import.meta.env.VITE_VAULT_ADDRESS as Address | undefined
export const PATH_USD: Address = '0x20c0000000000000000000000000000000000000'
export const EXPLORER = 'https://explore.testnet.tempo.xyz'
export const walletsEnabled = !!(supabase && VAULT)

export const publicClient = createPublicClient({ chain, transport: http() })

const usd6 = (n: number) => BigInt(Math.round(n * 1_000_000))
export const fromUsd6 = (n: bigint) => Number(n) / 1_000_000
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ---------- passkeys ----------

// Browsers reveal a passkey's public key only once, when it's created. Keep it in this
// browser (IndexedDB) and back it up in Supabase, so the same wallet works on other devices.
const credentialStore = Storage.idb()
const fresh = new Map<string, Hex>() // credentialId -> public key, registered this session

function ceremony() {
  const local = WebAuthnCeremony.local({ storage: credentialStore })
  return WebAuthnCeremony.from({
    getRegistrationOptions: (p) => local.getRegistrationOptions(p),
    getAuthenticationOptions: (p) => local.getAuthenticationOptions(p),
    async verifyRegistration(credential, options) {
      const r = await local.verifyRegistration(credential, options)
      fresh.set(r.credentialId, r.publicKey)
      return r
    },
    async verifyAuthentication(response) {
      try {
        return await local.verifyAuthentication(response)
      } catch {
        const { data } = await supabase!.from('passkeys').select('public_key').eq('credential_id', response.id).maybeSingle()
        if (!data) throw new Error('That passkey isn’t linked to your CrewPay account. Pick the one you made for CrewPay, or create a new wallet.')
        const saved = ((await credentialStore.getItem<Record<string, Hex>>('credentials')) ?? {}) as Record<string, Hex>
        await credentialStore.setItem('credentials', { ...saved, [response.id]: data.public_key as Hex })
        return { credentialId: response.id, publicKey: data.public_key as Hex }
      }
    },
  })
}

let provider: ReturnType<typeof Provider.create> | undefined
function wallet() {
  provider ??= Provider.create({
    adapter: webAuthn({ ceremony: ceremony(), name: 'CrewPay' }),
    chains: [chain],
    testnet: true,
    feePayer: '/api/relay',
  })
  return provider
}

type Connected = { accounts: readonly { address: Address }[] }

/** Creates a new passkey wallet and links it to the signed-in CrewPay account. */
export async function createWallet(userId: string, label: string): Promise<Address> {
  const res = (await wallet().request({
    method: 'wallet_connect',
    params: [{ capabilities: { method: 'register', name: label } }],
  } as never)) as unknown as Connected
  const address = res.accounts[0].address
  const [credentialId, publicKey] = [...fresh.entries()].at(-1) ?? []
  if (credentialId && publicKey) {
    const { error } = await supabase!.from('passkeys').insert({ credential_id: credentialId, user_id: userId, public_key: publicKey, address })
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase!.from('profiles').update({ wallet_address: address }).eq('id', userId)
  if (error) throw new Error(error.message)
  return address
}

/** Unlocks the wallet already linked to this account (on this or another device). */
export async function unlockWallet(expected: Address): Promise<Address> {
  const { data } = await supabase!.from('passkeys').select('credential_id').eq('address', expected)
  const res = (await wallet().request({
    method: 'wallet_connect',
    params: [{ capabilities: { method: 'login', credentialId: (data ?? []).map((d) => d.credential_id) } }],
  } as never)) as unknown as Connected
  const address = res.accounts[0].address
  if (address.toLowerCase() !== expected.toLowerCase())
    throw new Error('That passkey opens a different wallet. Pick the passkey you made for CrewPay.')
  return address
}

async function unlockedAs(expected: Address) {
  const accounts = (await wallet().request({ method: 'eth_accounts' } as never)) as unknown as Address[]
  if (!accounts.some((a) => a.toLowerCase() === expected.toLowerCase())) await unlockWallet(expected)
}

type Call = { to: Address; data: Hex }
type Receipt = { transactionHash: Hex; status: string }

/** Sends one or more calls in a single transaction. CrewPay's relay pays the fee. */
async function send(from: Address, calls: Call[]): Promise<Hex> {
  await unlockedAs(from)
  const receipt = (await wallet().request({
    method: 'eth_sendTransactionSync',
    params: [{ from, calls, chainId: chain.id }],
  } as never)) as unknown as Receipt
  if (receipt.status !== 'success' && receipt.status !== '0x1') throw new Error('The transaction failed on Tempo.')
  return receipt.transactionHash
}

// ---------- terms ----------

/** The project's id on-chain: a hash of its CrewPay id. */
export const chainProjectId = (projectId: string) => keccak256(toBytes(projectId))
const hashText = (s: string) => keccak256(toBytes(s))
const dueAt = (due?: string) => (due ? BigInt(Math.floor(Date.parse(`${due}T23:59:59Z`) / 1000)) : 0n)

export type Terms = {
  projectId: Hex
  lead: Address
  version: number
  roles: { collaborator: Address; deposit: bigint; milestones: { amount: bigint; due: bigint; revisions: number; doneWhen: Hex }[] }[]
}

/** Why the terms can't be agreed on-chain yet, if they can't. */
export function termsBlocker(
  p: Project,
  wallets: Record<string, string | undefined>,
  name: (handle: string) => string = (h) => h,
): string | undefined {
  const open = p.roles.filter((r) => !r.assignee)
  if (open.length) return `Every role needs a person before anyone signs: ${open.map((r) => r.title).join(', ')} ${open.length === 1 ? 'is' : 'are'} still open.`
  const missing = [p.lead, ...p.roles.map((r) => r.assignee!)].filter((h) => !wallets[h])
  if (missing.length) return `Waiting for ${[...new Set(missing)].map(name).join(', ')} to set up a CrewPay wallet.`
}

/** Builds exactly the terms the vault checks, from the draft everyone sees. */
export function termsFor(p: Project, wallets: Record<string, string | undefined>): Terms {
  const blocker = termsBlocker(p, wallets)
  if (blocker) throw new Error(blocker)
  return {
    projectId: chainProjectId(p.id),
    lead: wallets[p.lead] as Address,
    version: p.version,
    roles: p.roles.map((r: Role) => {
      const lines = schedule(r)
      const amount = (key: string) => usd6(lines.find((l) => l.key === key)?.amount ?? 0)
      return {
        collaborator: wallets[r.assignee!] as Address,
        deposit: amount('deposit'),
        milestones: r.milestones.map((m) => ({ amount: amount(m.id), due: dueAt(m.due), revisions: m.revisions, doneWhen: hashText(m.doneWhen) })),
      }
    }),
  }
}

export const termsTotal = (t: Terms) =>
  t.roles.reduce((s, r) => s + r.deposit + r.milestones.reduce((x, m) => x + m.amount, 0n), 0n)

export const termsDigest = (t: Terms) =>
  publicClient.readContract({ address: VAULT!, abi: vaultAbi, functionName: 'termsDigest', args: [t] }) as Promise<Hex>

// ---------- actions ----------

/** A collaborator agrees to the exact terms on-chain. Returns the transaction hash. */
export async function agree(from: Address, t: Terms): Promise<Hex> {
  const digest = await termsDigest(t)
  return send(from, [{ to: VAULT!, data: encodeFunctionData({ abi: vaultAbi, functionName: 'agree', args: [digest] }) }])
}

/** Which collaborators haven't agreed to these terms on-chain yet. */
export async function notAgreed(t: Terms): Promise<Address[]> {
  const digest = await termsDigest(t)
  const flags = await Promise.all(
    t.roles.map((r) => publicClient.readContract({ address: VAULT!, abi: vaultAbi, functionName: 'agreed', args: [r.collaborator, digest] })),
  )
  return t.roles.filter((_, i) => !flags[i]).map((r) => r.collaborator)
}

export const balanceOf = (address: Address) =>
  publicClient.readContract({ address: PATH_USD, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

/** Testnet: free test dollars, so a Lead can fund without buying anything. */
export async function getTestDollars(address: Address) {
  const res = await fetch('/api/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'The faucet didn’t answer.')
  for (let i = 0; i < 20; i++) {
    if ((await balanceOf(address)) > 0n) return
    await new Promise((r) => setTimeout(r, 1500))
  }
}

/** The Lead approves the vault and funds it in one transaction; deposits pay out at once. */
export async function fund(from: Address, t: Terms): Promise<Hex> {
  return send(from, [
    { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [VAULT!, termsTotal(t)] }) },
    { to: VAULT!, data: encodeFunctionData({ abi: vaultAbi, functionName: 'fund', args: [t, t.roles.map(() => '0x' as Hex)] }) },
  ])
}

const vaultCall = (from: Address, data: Hex) => send(from, [{ to: VAULT!, data }])

export const submitWork = (from: Address, p: Project, r: number, m: number, work: string) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'submit', args: [chainProjectId(p.id), BigInt(r), BigInt(m), hashText(work)] }))
export const approveWork = (from: Address, p: Project, r: number, m: number) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'approve', args: [chainProjectId(p.id), BigInt(r), BigInt(m)] }))
export const requestChanges = (from: Address, p: Project, r: number, m: number, note: string) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'requestChanges', args: [chainProjectId(p.id), BigInt(r), BigInt(m), hashText(note)] }))
export const openDispute = (from: Address, p: Project, r: number, m: number) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'openDispute', args: [chainProjectId(p.id), BigInt(r), BigInt(m)] }))
export const releaseWork = (from: Address, p: Project, r: number, m: number) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'release', args: [chainProjectId(p.id), BigInt(r), BigInt(m)] }))
export const reclaimWork = (from: Address, p: Project, r: number, m: number) =>
  vaultCall(from, encodeFunctionData({ abi: vaultAbi, functionName: 'reclaim', args: [chainProjectId(p.id), BigInt(r), BigInt(m)] }))
