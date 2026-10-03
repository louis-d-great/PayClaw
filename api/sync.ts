// Mirrors a CrewPay vault transaction on Tempo into Supabase: project and milestone status,
// payouts, submissions, reviews, disputes and a system message in the group chat. The chain is
// the source of truth for money; this only records what the transaction's events say, once per
// event, so calling it twice changes nothing.
//
// The words around an event (a submission's note and files, a change request, a dispute's
// reason) aren't stored on-chain, so the caller sends them as `extra`. They're accepted only
// when they match: a note must hash to what the vault recorded, and a dispute reason must come
// from the signed-in person whose wallet opened it. Events that need words wait until they come.
//
// POST { projectId, txHash, extra? }   (Authorization: Bearer <Supabase access token> for disputes)
// Env: SUPABASE_SERVICE_ROLE_KEY (server only), VITE_SUPABASE_URL, VITE_VAULT_ADDRESS.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient, http, keccak256, parseAbi, parseEventLogs, toBytes, type Address, type Hex } from 'viem'
import { tempoModerato } from 'viem/chains'
import { noteHash, workHash, type WorkFile } from '../src/lib/work.js'

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

export type Extra = { note?: string; files?: WorkFile[]; reason?: string }

type Row = { id: string; position: number }
type MilestoneRow = Row & { title: string; revisions: number }
type RoleRow = Row & { title: string; assignee_id: string | null; milestones: MilestoneRow[] }

export function admin() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL.')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** The signed-in person behind a request, from their Supabase access token. */
export async function caller(db: SupabaseClient, request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return undefined
  const { data } = await db.auth.getUser(token)
  if (!data.user) return undefined
  const { data: profile } = await db.from('profiles').select('id, handle, wallet_address').eq('id', data.user.id).single()
  return profile as { id: string; handle: string; wallet_address: string | null } | null
}

export async function syncTx(
  db: SupabaseClient,
  projectId: string,
  txHash: Hex,
  extra: Extra = {},
  who?: { id: string; wallet_address: string | null } | null,
  rulingNote?: string,
) {
  const vault = process.env.VITE_VAULT_ADDRESS as Address | undefined
  if (!vault) throw new Error('Server is missing VITE_VAULT_ADDRESS.')
  const chain = createPublicClient({ chain: tempoModerato, transport: http() })
  const receipt = await chain.getTransactionReceipt({ hash: txHash })
  const block = await chain.getBlock({ blockNumber: receipt.blockNumber })
  const at = new Date(Number(block.timestamp) * 1000).toISOString()
  const chainId = keccak256(toBytes(projectId))
  const logs = parseEventLogs({ abi: events, logs: receipt.logs.filter((l) => l.address.toLowerCase() === vault.toLowerCase()) }).filter(
    (l) => (l.args as { projectId: Hex }).projectId === chainId,
  )
  if (logs.length === 0) return { events: 0, waiting: 0 }

  const { data: project, error } = await db
    .from('projects')
    .select('id, lead_id, roles(id, position, title, assignee_id, milestones(id, position, title, revisions))')
    .eq('id', projectId)
    .single()
  if (error || !project) throw new Error(error?.message ?? 'No such project.')
  const roles = ((project.roles ?? []) as RoleRow[]).sort((a, b) => a.position - b.position)
  const roleAt = (i: bigint) => roles[Number(i)]
  const milestoneAt = (r: bigint, m: bigint) => [...(roleAt(r)?.milestones ?? [])].sort((a, b) => a.position - b.position)[Number(m)]
  const ids = [project.lead_id, ...roles.map((r) => r.assignee_id)].filter(Boolean) as string[]
  const { data: people } = await db.from('profiles').select('id, name, wallet_address').in('id', ids)
  const name = (id: string | null | undefined) => people?.find((p) => p.id === id)?.name ?? 'Someone'
  const byWallet = (a: string) => people?.find((p) => p.wallet_address?.toLowerCase() === a.toLowerCase())?.id

  const lastSubmission = async (milestoneId: string) =>
    (await db.from('submissions').select('id').eq('milestone_id', milestoneId).order('created_at', { ascending: false }).limit(1)).data?.[0]
      ?.id as string | undefined

  const messages: string[] = []
  const deposits: string[] = []
  let handled = 0
  let waiting = 0
  for (const log of logs) {
    // Events that need words wait until the right person sends matching ones.
    let ready = true
    if (log.eventName === 'WorkSubmitted')
      ready = extra.note !== undefined && workHash(extra.note, extra.files ?? []) === log.args.workHash &&
        (extra.files ?? []).every((f) => f.path.startsWith(`${projectId}/`))
    if (log.eventName === 'ChangesRequested') ready = extra.note !== undefined && noteHash(extra.note) === log.args.noteHash
    if (log.eventName === 'DisputeOpened')
      ready = !!extra.reason?.trim() && !!who?.wallet_address && who.wallet_address.toLowerCase() === log.args.by.toLowerCase()
    if (!ready) {
      waiting++
      continue
    }

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
      case 'WorkSubmitted': {
        const role = roleAt(log.args.role)
        const m = milestoneAt(log.args.role, log.args.milestone)
        const { count } = await db.from('submissions').select('id', { count: 'exact', head: true }).eq('milestone_id', m?.id ?? '')
        await db.from('submissions').insert({
          milestone_id: m?.id,
          project_id: projectId,
          author_id: role?.assignee_id,
          note: extra.note,
          files: extra.files ?? [],
          created_at: at,
        })
        await setMilestone(log.args.role, log.args.milestone, 'submitted')
        const round = (count ?? 0) + 1
        messages.push(
          `${name(role?.assignee_id)} submitted “${m?.title}”${round > 1 ? ` (round ${round})` : ''}. ${name(project.lead_id)} has 7 days to review, then it pays automatically.`,
        )
        break
      }
      case 'ChangesRequested': {
        const m = milestoneAt(log.args.role, log.args.milestone)
        const sub = await lastSubmission(m?.id ?? '')
        if (sub) await db.from('submissions').update({ review_kind: 'changes', review_note: extra.note, reviewed_at: at }).eq('id', sub)
        await setMilestone(log.args.role, log.args.milestone, 'working')
        const left = (m?.revisions ?? 0) - log.args.round
        messages.push(
          `${name(project.lead_id)} asked for changes on “${m?.title}”: “${extra.note}” (${left} revision round${left === 1 ? '' : 's'} left).`,
        )
        break
      }
      case 'MilestonePaid': {
        const role = roleAt(log.args.role)
        const m = milestoneAt(log.args.role, log.args.milestone)
        const sub = await lastSubmission(m?.id ?? '')
        if (sub) await db.from('submissions').update({ review_kind: log.args.automatic ? 'auto-approved' : 'approved', reviewed_at: at }).eq('id', sub)
        await setMilestone(log.args.role, log.args.milestone, 'paid')
        await pay(role, m?.id ?? null, role?.assignee_id ?? null, log.args.amount, log.args.automatic ? 'auto' : 'milestone')
        messages.push(
          log.args.automatic
            ? `No response in 7 days, so “${m?.title}” auto-approved. The vault paid ${name(role?.assignee_id)} ${usd(dollars(log.args.amount))}.`
            : `${name(project.lead_id)} approved “${m?.title}”. The vault paid ${name(role?.assignee_id)} ${usd(dollars(log.args.amount))}.`,
        )
        break
      }
      case 'DisputeOpened': {
        const m = milestoneAt(log.args.role, log.args.milestone)
        const opener = byWallet(log.args.by) ?? who!.id
        await db.from('disputes').insert({ milestone_id: m?.id, project_id: projectId, opened_by: opener, reason: extra.reason, created_at: at })
        await db.from('dispute_statements').insert({ milestone_id: m?.id, project_id: projectId, author_id: opener, text: extra.reason, created_at: at })
        await setMilestone(log.args.role, log.args.milestone, 'disputed')
        messages.push(`${name(opener)} opened a dispute on “${m?.title}”. Both sides state their case, then CrewPay review rules.`)
        break
      }
      case 'DisputeRuled': {
        const role = roleAt(log.args.role)
        const m = milestoneAt(log.args.role, log.args.milestone)
        await db
          .from('disputes')
          .update({ ruling_bps: Number(log.args.collaboratorBps), ruling_note: rulingNote ?? '', ruled_at: at })
          .eq('milestone_id', m?.id ?? '')
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
    await db.from('messages').insert(messages.map((text) => ({ project_id: projectId, author_id: null, kind: 'system', text, created_at: at })))
  return { events: handled, waiting }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; txHash?: string; extra?: Extra }
  const { projectId, txHash } = body
  if (!projectId || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return Response.json({ error: 'Send projectId and txHash.' }, { status: 400 })
  try {
    const db = admin()
    const who = body.extra?.reason ? await caller(db, request) : undefined
    const result = await syncTx(db, projectId, txHash as Hex, body.extra ?? {}, who)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
