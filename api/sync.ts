// Mirrors a CrewPay vault transaction on Tempo into Supabase: funded status, milestone
// status, payouts and a system message in the group chat. The chain is the source of truth;
// this only records what the transaction's events say, once per event, so anyone can call it
// and calling it twice changes nothing.
//
// POST { projectId, txHash }
// Env: SUPABASE_SERVICE_ROLE_KEY (server only), VITE_SUPABASE_URL, VITE_VAULT_ADDRESS.
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, keccak256, parseAbi, parseEventLogs, toBytes, type Address, type Hex } from 'viem'
import { tempoModerato } from 'viem/chains'

const events = parseAbi([
  'event Funded(bytes32 indexed projectId, address indexed lead, uint32 version, uint256 total, bytes32 termsDigest)',
  'event DepositPaid(bytes32 indexed projectId, uint256 indexed role, address indexed to, uint256 amount)',
  'event WorkSubmitted(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, bytes32 workHash)',
  'event ChangesRequested(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, bytes32 noteHash, uint8 round)',
  'event MilestonePaid(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, address to, uint256 amount, bool automatic)',
  'event DisputeOpened(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, address by)',
  'event DisputeRuled(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, uint256 collaboratorBps, uint256 toCollaborator, uint256 toLead)',
  'event MilestoneReclaimed(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, uint256 amount)',
  'event ProjectCancelled(bytes32 indexed projectId, uint256 refunded)',
  'event ProjectCompleted(bytes32 indexed projectId)',
])

const dollars = (n: bigint) => Number(n) / 1_000_000
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

type Row = { id: string; position: number }
type RoleRow = Row & { title: string; assignee_id: string | null; milestones: (Row & { title: string })[] }

export async function POST(request: Request) {
  const { projectId, txHash } = (await request.json().catch(() => ({}))) as { projectId?: string; txHash?: string }
  if (!projectId || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return Response.json({ error: 'Send projectId and txHash.' }, { status: 400 })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vault = process.env.VITE_VAULT_ADDRESS as Address | undefined
  if (!url || !key || !vault) return Response.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL or VITE_VAULT_ADDRESS.' }, { status: 500 })

  const db = createClient(url, key, { auth: { persistSession: false } })
  const chain = createPublicClient({ chain: tempoModerato, transport: http() })
  const receipt = await chain.getTransactionReceipt({ hash: txHash as Hex })
  const block = await chain.getBlock({ blockNumber: receipt.blockNumber })
  const at = new Date(Number(block.timestamp) * 1000).toISOString()
  const chainId = keccak256(toBytes(projectId))
  const logs = parseEventLogs({ abi: events, logs: receipt.logs.filter((l) => l.address.toLowerCase() === vault.toLowerCase()) }).filter(
    (l) => (l.args as { projectId: Hex }).projectId === chainId,
  )
  if (logs.length === 0) return Response.json({ ok: true, events: 0 })

  const { data: project, error } = await db
    .from('projects')
    .select('id, lead_id, roles(id, position, title, assignee_id, milestones(id, position, title))')
    .eq('id', projectId)
    .single()
  if (error || !project) return Response.json({ error: error?.message ?? 'No such project.' }, { status: 404 })
  const roles = ((project.roles ?? []) as RoleRow[]).sort((a, b) => a.position - b.position)
  const roleAt = (i: bigint) => roles[Number(i)]
  const milestoneAt = (r: bigint, m: bigint) => [...(roleAt(r)?.milestones ?? [])].sort((a, b) => a.position - b.position)[Number(m)]
  const ids = [project.lead_id, ...roles.map((r) => r.assignee_id)].filter(Boolean) as string[]
  const { data: people } = await db.from('profiles').select('id, name').in('id', ids)
  const name = (id: string | null | undefined) => people?.find((p) => p.id === id)?.name ?? 'Someone'

  const messages: string[] = []
  const deposits: string[] = []
  let handled = 0
  for (const log of logs) {
    // Record each event once; a second sync of the same transaction does nothing.
    const { error: seen } = await db
      .from('chain_events')
      .insert({ tx_hash: txHash, log_index: log.logIndex, project_id: projectId, name: log.eventName })
    if (seen) continue
    handled++
    const pay = (role: RoleRow | undefined, milestoneId: string | null, to: string | null, amount: bigint, kind: string) =>
      db.from('payouts').insert({
        project_id: projectId,
        role_id: role?.id ?? null,
        milestone_id: milestoneId,
        to_id: to,
        amount: dollars(amount),
        kind,
        tx_hash: txHash,
        log_index: log.logIndex,
        created_at: at,
      })
    const setMilestone = (r: bigint, m: bigint, status: string) =>
      db.from('milestones').update({ status }).eq('id', milestoneAt(r, m)?.id ?? '')

    switch (log.eventName) {
      case 'Funded':
        await db.from('projects').update({ status: 'funded', funded_at: at, chain_project_id: chainId }).eq('id', projectId)
        messages.push(`${name(project.lead_id)} funded the vault on Tempo with ${usd(dollars(log.args.total))}. Work can start.`)
        break
      case 'DepositPaid': {
        const role = roleAt(log.args.role)
        await pay(role, null, role?.assignee_id ?? null, log.args.amount, 'deposit')
        deposits.push(`${name(role?.assignee_id)} ${usd(dollars(log.args.amount))}`)
        break
      }
      case 'WorkSubmitted':
        await setMilestone(log.args.role, log.args.milestone, 'submitted')
        break
      case 'ChangesRequested':
        await setMilestone(log.args.role, log.args.milestone, 'working')
        break
      case 'MilestonePaid': {
        const role = roleAt(log.args.role)
        const m = milestoneAt(log.args.role, log.args.milestone)
        await setMilestone(log.args.role, log.args.milestone, 'paid')
        await pay(role, m?.id ?? null, role?.assignee_id ?? null, log.args.amount, log.args.automatic ? 'auto' : 'milestone')
        messages.push(
          log.args.automatic
            ? `No response in 7 days, so “${m?.title}” auto-approved. The vault paid ${name(role?.assignee_id)} ${usd(dollars(log.args.amount))}.`
            : `${name(project.lead_id)} approved “${m?.title}”. The vault paid ${name(role?.assignee_id)} ${usd(dollars(log.args.amount))}.`,
        )
        break
      }
      case 'DisputeOpened':
        await setMilestone(log.args.role, log.args.milestone, 'disputed')
        break
      case 'DisputeRuled': {
        const role = roleAt(log.args.role)
        const m = milestoneAt(log.args.role, log.args.milestone)
        await setMilestone(log.args.role, log.args.milestone, 'resolved')
        if (log.args.toCollaborator > 0n) await pay(role, m?.id ?? null, role?.assignee_id ?? null, log.args.toCollaborator, 'ruling')
        if (log.args.toLead > 0n) await pay(role, m?.id ?? null, project.lead_id, log.args.toLead, 'refund')
        messages.push(
          `CrewPay review ruled on “${m?.title}”: ${usd(dollars(log.args.toCollaborator))} to ${name(role?.assignee_id)}, ${usd(dollars(log.args.toLead))} back to ${name(project.lead_id)}. This is final.`,
        )
        break
      }
      case 'MilestoneReclaimed': {
        const m = milestoneAt(log.args.role, log.args.milestone)
        await setMilestone(log.args.role, log.args.milestone, 'reclaimed')
        await pay(roleAt(log.args.role), m?.id ?? null, project.lead_id, log.args.amount, 'refund')
        messages.push(`“${m?.title}” passed its deadline with nothing submitted. ${usd(dollars(log.args.amount))} returned to ${name(project.lead_id)}.`)
        break
      }
      case 'ProjectCancelled':
        await db.from('projects').update({ status: 'cancelled' }).eq('id', projectId)
        if (log.args.refunded > 0n) await pay(undefined, null, project.lead_id, log.args.refunded, 'refund')
        messages.push(`Everyone agreed. The project is cancelled and ${usd(dollars(log.args.refunded))} still in the vault went back to ${name(project.lead_id)}.`)
        break
      case 'ProjectCompleted':
        await db.from('projects').update({ status: 'done' }).eq('id', projectId)
        messages.push('Every milestone is settled. The project is complete.')
        break
    }
  }
  if (deposits.length) messages.splice(1, 0, `Deposits paid: ${deposits.join(', ')}.`)
  if (messages.length)
    await db.from('messages').insert(messages.map((text) => ({ project_id: projectId, author_id: null, kind: 'system', text })))
  return Response.json({ ok: true, events: handled })
}
