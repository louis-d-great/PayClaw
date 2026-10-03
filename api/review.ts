// CrewPay review: the neutral person who rules on disputes. Only accounts whose handle is in
// REVIEWER_HANDLES can use this, and never on a project they're part of. The ruling is sent to
// the vault with the reviewer key, which lives only on the server.
//
// GET  → open disputes with their evidence: the "done when", every submission and file, both
//        sides' statements and the group chat. DMs are private and never included.
// POST { milestoneId, collaboratorPct, note } → rules on Tempo, then records it.
// Env: REVIEWER_HANDLES (e.g. "louis_review"), REVIEWER_PRIVATE_KEY, plus sync's env.
import { createWalletClient, encodeFunctionData, http, keccak256, toBytes, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { admin, caller, syncTx } from './sync.js'

const reviewers = () =>
  (process.env.REVIEWER_HANDLES ?? '')
    .split(',')
    .map((h) => h.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean)

const ruleAbi = [
  {
    type: 'function',
    name: 'rule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'r', type: 'uint256' },
      { name: 'm', type: 'uint256' },
      { name: 'collaboratorBps', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

type Milestone = { id: string; position: number; title: string; done_when: string; pct: number; status: string; role_id: string }
type Role = { id: string; position: number; title: string; pay: number; assignee_id: string | null; milestones: Milestone[] }
type Project = { id: string; name: string; brief: string; lead_id: string; roles: Role[] }

async function gate(request: Request) {
  const db = admin()
  const me = await caller(db, request)
  if (!me || !reviewers().includes(me.handle.toLowerCase())) return { db, me: undefined }
  return { db, me }
}

const isParty = (p: Project, userId: string) => p.lead_id === userId || p.roles.some((r) => r.assignee_id === userId)

export async function GET(request: Request) {
  const { db, me } = await gate(request)
  // ?check: just whether this person is a reviewer, so the app knows to show the link.
  if (new URL(request.url).searchParams.has('check')) return Response.json({ reviewer: !!me })
  if (!me) return Response.json({ error: 'Not a CrewPay reviewer.' }, { status: 403 })
  const { data: open } = await db.from('milestones').select('id, project_id').eq('status', 'disputed')
  const projectIds = [...new Set((open ?? []).map((m) => m.project_id as string))]
  if (projectIds.length === 0) return Response.json({ disputes: [] })

  const { data: projects } = await db
    .from('projects')
    .select('id, name, brief, lead_id, roles(id, position, title, pay, assignee_id, milestones(id, position, title, done_when, pct, status, role_id))')
    .in('id', projectIds)
  const [{ data: subs }, { data: disputes }, { data: statements }, { data: chat }] = await Promise.all([
    db.from('submissions').select('*').in('project_id', projectIds).order('created_at'),
    db.from('disputes').select('*').in('project_id', projectIds),
    db.from('dispute_statements').select('*').in('project_id', projectIds).order('created_at'),
    db.from('messages').select('project_id, author_id, kind, text, attachments, created_at').in('project_id', projectIds).is('recipient_id', null).order('created_at'),
  ])
  const people = new Set<string>()
  for (const p of (projects ?? []) as Project[]) [p.lead_id, ...p.roles.map((r) => r.assignee_id)].forEach((id) => id && people.add(id))
  const { data: profiles } = await db.from('profiles').select('id, name, handle').in('id', [...people])
  const name = (id?: string | null) => profiles?.find((x) => x.id === id)?.name ?? 'CrewPay'

  // Reviewers see every file, finals included: they're judging whether the work is done.
  const paths = (subs ?? []).flatMap((s) => (s.files ?? []).map((f: { path: string }) => f.path))
  const { data: signed } = paths.length ? await db.storage.from('project-files').createSignedUrls(paths, 3600) : { data: [] }
  const url = (path: string) => signed?.find((x) => x.path === path)?.signedUrl

  const out = []
  for (const p of (projects ?? []) as Project[]) {
    if (isParty(p, me.id)) continue
    for (const r of p.roles)
      for (const m of r.milestones) {
        if (m.status !== 'disputed') continue
        const d = disputes?.find((x) => x.milestone_id === m.id)
        out.push({
          project: { id: p.id, name: p.name, brief: p.brief },
          milestone: { id: m.id, title: m.title, doneWhen: m.done_when, amount: Math.round(Number(r.pay) * m.pct) / 100 },
          role: r.title,
          lead: name(p.lead_id),
          collaborator: name(r.assignee_id),
          openedBy: name(d?.opened_by),
          openedAt: d?.created_at,
          submissions: (subs ?? [])
            .filter((s) => s.milestone_id === m.id)
            .map((s) => ({
              at: s.created_at,
              note: s.note,
              review: s.review_kind ? { kind: s.review_kind, note: s.review_note } : undefined,
              files: (s.files ?? []).map((f: { name: string; kind: string; mime?: string; path: string }) => ({ name: f.name, kind: f.kind, mime: f.mime, url: url(f.path) })),
            })),
          statements: (statements ?? []).filter((s) => s.milestone_id === m.id).map((s) => ({ by: name(s.author_id), text: s.text, at: s.created_at })),
          chat: (chat ?? [])
            .filter((c) => c.project_id === p.id)
            .map((c) => ({ by: c.kind === 'system' ? 'CrewPay' : name(c.author_id), text: c.text, at: c.created_at, files: (c.attachments ?? []).length })),
        })
      }
  }
  return Response.json({ disputes: out })
}

export async function POST(request: Request) {
  const { db, me } = await gate(request)
  if (!me) return Response.json({ error: 'Not a CrewPay reviewer.' }, { status: 403 })
  const { milestoneId, collaboratorPct, note } = (await request.json().catch(() => ({}))) as { milestoneId?: string; collaboratorPct?: number; note?: string }
  if (!milestoneId || typeof collaboratorPct !== 'number' || collaboratorPct < 0 || collaboratorPct > 100 || !note?.trim())
    return Response.json({ error: 'Send the milestone, a split between 0 and 100, and a reason.' }, { status: 400 })
  const key = process.env.REVIEWER_PRIVATE_KEY as Hex | undefined
  const vault = process.env.VITE_VAULT_ADDRESS as `0x${string}` | undefined
  if (!key || !vault) return Response.json({ error: 'Server is missing REVIEWER_PRIVATE_KEY or VITE_VAULT_ADDRESS.' }, { status: 500 })

  const { data: m } = await db.from('milestones').select('id, project_id, role_id, status').eq('id', milestoneId).single()
  if (!m || m.status !== 'disputed') return Response.json({ error: 'That milestone isn’t in dispute.' }, { status: 409 })
  const { data: p } = await db
    .from('projects')
    .select('id, name, brief, lead_id, roles(id, position, title, pay, assignee_id, milestones(id, position, title, done_when, pct, status, role_id))')
    .eq('id', m.project_id)
    .single()
  const project = p as Project
  if (isParty(project, me.id)) return Response.json({ error: 'You’re part of this project, so you can’t rule on it.' }, { status: 403 })
  const roles = [...project.roles].sort((a, b) => a.position - b.position)
  const r = roles.findIndex((x) => x.id === m.role_id)
  const mi = [...roles[r].milestones].sort((a, b) => a.position - b.position).findIndex((x) => x.id === m.id)

  try {
    const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: tempoModerato, transport: http() })
    const hash = await wallet.sendTransaction({
      to: vault,
      data: encodeFunctionData({
        abi: ruleAbi,
        functionName: 'rule',
        args: [keccak256(toBytes(project.id)), BigInt(r), BigInt(mi), BigInt(Math.round(collaboratorPct * 100))],
      }),
    })
    const { createPublicClient } = await import('viem')
    await createPublicClient({ chain: tempoModerato, transport: http() }).waitForTransactionReceipt({ hash })
    await syncTx(db, project.id, hash, {}, undefined, note.trim())
    return Response.json({ ok: true, txHash: hash })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split('\n')[0] : String(e) }, { status: 500 })
  }
}
