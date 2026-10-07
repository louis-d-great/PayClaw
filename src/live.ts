import { BUCKET, supabase } from './lib/supabase'
import type { Action } from './store'
import {
  dmKey,
  type Attachment,
  type FileRef,
  type Handle,
  type Message,
  type Milestone,
  type Payout,
  type PayoutPreference,
  type Profile,
  type Project,
  type Role,
} from './types'

// The live data layer: reads rows from Supabase into the app's Project shape, and turns
// app actions into database calls. Anything that crosses people runs as a database
// function (supabase/migrations/0002_live_actions.sql), so the rules hold server-side.

const sb = () => supabase!

// ---------- rows ----------

export type ProfileRow = {
  id: string
  handle: string
  name: string
  bio: string
  skills: string[]
  portfolio: string | null
  wallet_address?: string | null
  email_updates?: boolean | null
}
type FileRow = { name: string; size: number; mime?: string; kind: string; path: string }
type MessageRow = {
  id: string
  project_id: string
  author_id: string | null
  recipient_id: string | null
  kind: Message['kind']
  text: string
  reply_to: string | null
  attachments: FileRow[] | null
  role_id: string | null
  amount: number | string | null
  deposit_pct: number | null
  resolution: 'accepted' | 'rejected' | null
  created_at: string
}
type SubmissionRow = {
  id: string
  note: string
  files: FileRow[] | null
  created_at: string
  review_kind: 'approved' | 'changes' | 'auto-approved' | null
  review_note: string | null
  reviewed_at: string | null
}
type StatementRow = { author_id: string; text: string; created_at: string }
type DisputeRow = {
  opened_by: string
  reason: string
  created_at: string
  ruling_bps: number | null
  ruling_note: string | null
  ruled_at: string | null
  dispute_statements?: StatementRow[]
}
type MilestoneRow = {
  id: string
  position: number
  title: string
  done_when: string
  pct: number
  due: string | null
  revisions: number
  status: Milestone['status']
  submissions?: SubmissionRow[]
  disputes?: DisputeRow | DisputeRow[] | null
}
type ApplicationRow = { applicant_id: string; portfolio: string; note: string; amount: number | string | null; created_at: string }
type RoleRow = {
  id: string
  position: number
  title: string
  assignee_id: string | null
  pay: number | string
  deposit_pct: number
  response: Role['response']
  signed_version: number | null
  payout: PayoutPreference | null
  listed?: boolean | null
  milestones?: MilestoneRow[]
  applications?: ApplicationRow[]
}
type PayoutRow = {
  id: string
  role_id: string | null
  milestone_id: string | null
  to_id: string | null
  amount: number | string
  kind: Payout['kind']
  created_at: string
}
type CancelRow = { proposed_by: string; reason: string; approvals: string[]; created_at: string }
type ProjectRow = {
  id: string
  name: string
  brief: string
  deadline: string | null
  lead_id: string
  version: number
  status: Project['status']
  funded_at: string | null
  created_at: string
  roles?: RoleRow[]
  messages?: MessageRow[]
  payouts?: PayoutRow[]
  cancel_requests?: CancelRow | CancelRow[] | null
}
type ReadRow = { project_id: string; channel: string; user_id: string; seen_at: string }

const SELECT =
  '*, roles(*, milestones(*, submissions(*), disputes(*, dispute_statements(*))), applications(*)), messages(*), payouts(*), cancel_requests(*)'

// Postgres and JavaScript write timestamps differently; the app compares them as strings.
const iso = (s: string) => new Date(s).toISOString()
const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v)
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? undefined : Number(v))
const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined))
const byPosition = <T extends { position: number }>(a: T[] = []) => [...a].sort((x, y) => x.position - y.position)
const byTime = <T extends { created_at: string }>(a: T[] = []) => [...a].sort((x, y) => x.created_at.localeCompare(y.created_at))

// ---------- people ----------

export class People {
  byId = new Map<string, ProfileRow>()
  add(rows: ProfileRow[]) {
    for (const r of rows) this.byId.set(r.id, r)
  }
  handle = (id: string): Handle => {
    const p = this.byId.get(id)
    return p ? `@${p.handle}` : '@unknown'
  }
  idOf(h: Handle) {
    const clean = h.replace(/^@/, '')
    for (const p of this.byId.values()) if (p.handle === clean) return p.id
    return undefined
  }
  profiles(): Record<Handle, Profile> {
    const out: Record<Handle, Profile> = {}
    for (const p of this.byId.values())
      out[`@${p.handle}`] = {
        handle: `@${p.handle}`,
        name: p.name,
        bio: p.bio,
        skills: p.skills,
        portfolio: opt(p.portfolio),
        wallet: p.wallet_address ?? undefined,
        emailUpdates: p.email_updates ?? true,
      }
    return out
  }
}

function peopleIn(rows: ProjectRow[]): string[] {
  const ids = new Set<string>()
  for (const p of rows) {
    ids.add(p.lead_id)
    for (const r of p.roles ?? []) {
      if (r.assignee_id) ids.add(r.assignee_id)
      for (const a of r.applications ?? []) ids.add(a.applicant_id)
      for (const m of r.milestones ?? []) {
        const d = one(m.disputes)
        if (d) {
          ids.add(d.opened_by)
          for (const s of d.dispute_statements ?? []) ids.add(s.author_id)
        }
      }
    }
    for (const m of p.messages ?? []) {
      if (m.author_id) ids.add(m.author_id)
      if (m.recipient_id) ids.add(m.recipient_id)
    }
    for (const x of p.payouts ?? []) if (x.to_id) ids.add(x.to_id)
    const c = one(p.cancel_requests)
    if (c) [c.proposed_by, ...c.approvals].forEach((id) => ids.add(id))
  }
  return [...ids]
}

export async function fetchProfiles(ids: string[]): Promise<ProfileRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await sb().from('profiles').select('*').in('id', ids)
  if (error) throw error
  return data as ProfileRow[]
}

// ---------- reading ----------

async function signUrls(rows: ProjectRow[]): Promise<Map<string, string>> {
  const paths: string[] = []
  for (const p of rows) {
    for (const m of p.messages ?? []) for (const a of m.attachments ?? []) paths.push(a.path)
    for (const r of p.roles ?? []) for (const m of r.milestones ?? []) for (const s of m.submissions ?? []) for (const f of s.files ?? []) paths.push(f.path)
  }
  const out = new Map<string, string>()
  if (paths.length === 0) return out
  // Locked finals come back without a link; storage rules decide.
  const { data } = await sb().storage.from(BUCKET).createSignedUrls(paths, 6 * 60 * 60)
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl)
  return out
}

function toMessage(m: MessageRow, people: People, urls: Map<string, string>): Message {
  return {
    id: m.id,
    author: m.author_id ? people.handle(m.author_id) : 'system',
    at: iso(m.created_at),
    kind: m.kind,
    text: m.text,
    roleId: opt(m.role_id),
    amount: num(m.amount),
    depositPct: opt(m.deposit_pct),
    resolution: opt(m.resolution),
    replyTo: opt(m.reply_to),
    attachments: (m.attachments ?? []).map(
      (a): Attachment => ({ name: a.name, size: a.size, mime: a.mime ?? '', kind: a.kind as Attachment['kind'], path: a.path, url: urls.get(a.path) }),
    ),
  }
}

function toProject(row: ProjectRow, people: People, urls: Map<string, string>): Project {
  const h = people.handle
  const group: Message[] = []
  const dms: Record<string, Message[]> = {}
  for (const m of byTime(row.messages)) {
    const msg = toMessage(m, people, urls)
    if (!m.recipient_id) group.push(msg)
    else {
      const key = dmKey(h(m.author_id!), h(m.recipient_id))
      ;(dms[key] ??= []).push(msg)
    }
  }
  const cancel = one(row.cancel_requests)
  const project: Project = {
    id: row.id,
    name: row.name,
    brief: row.brief,
    deadline: opt(row.deadline),
    lead: h(row.lead_id),
    version: row.version,
    status: row.status,
    createdAt: iso(row.created_at),
    fundedAt: row.funded_at ? iso(row.funded_at) : undefined,
    messages: group,
    dms,
    payouts: byTime(row.payouts).map((x) => ({
      id: x.id,
      at: iso(x.created_at),
      roleId: x.role_id ?? '',
      milestoneId: opt(x.milestone_id),
      to: x.to_id ? h(x.to_id) : '@unknown',
      amount: Number(x.amount),
      kind: x.kind,
    })),
    cancel: cancel && { proposedBy: h(cancel.proposed_by), reason: cancel.reason, at: iso(cancel.created_at), approvals: cancel.approvals.map(h) },
    roles: byPosition(row.roles).map((r) => ({
      id: r.id,
      title: r.title,
      assignee: r.assignee_id ? h(r.assignee_id) : undefined,
      pay: Number(r.pay),
      depositPct: r.deposit_pct,
      response: r.response,
      listed: !!r.listed,
      signedVersion: opt(r.signed_version),
      payout: opt(r.payout),
      applicants: byTime(r.applications).map((a) => ({
        handle: h(a.applicant_id),
        portfolio: a.portfolio,
        note: a.note,
        amount: num(a.amount),
        at: iso(a.created_at),
      })),
      milestones: byPosition(r.milestones).map((m) => {
        const d = one(m.disputes)
        return {
          id: m.id,
          title: m.title,
          doneWhen: m.done_when,
          pct: m.pct,
          due: opt(m.due),
          revisions: m.revisions,
          status: m.status,
          submissions: byTime(m.submissions).map((s) => ({
            id: s.id,
            at: iso(s.created_at),
            note: s.note,
            files: (s.files ?? []).map((f): FileRef => ({ name: f.name, size: f.size, kind: f.kind as FileRef['kind'], mime: f.mime, url: urls.get(f.path) })),
            review: s.review_kind ? { kind: s.review_kind, note: opt(s.review_note), at: iso(s.reviewed_at ?? s.created_at) } : undefined,
          })),
          dispute: d && {
            openedBy: h(d.opened_by),
            at: iso(d.created_at),
            reason: d.reason,
            statements: byTime(d.dispute_statements).map((s) => ({ by: h(s.author_id), text: s.text, at: iso(s.created_at) })),
            ruling:
              d.ruling_bps === null || !d.ruled_at
                ? undefined
                : { collaboratorPct: d.ruling_bps / 100, note: d.ruling_note ?? '', at: iso(d.ruled_at) },
          },
        }
      }),
    })),
  }
  return derive(project)
}

// The database stores "signing"; "ready" just means every role is signed on this version.
const derive = (p: Project): Project =>
  p.status === 'signing' && p.roles.length > 0 && p.roles.every((r) => r.signedVersion === p.version) ? { ...p, status: 'ready' } : p

export type Loaded = { projects: Project[]; seen: Record<string, string> }

// Loads every project the signed-in person is on (the database only returns those), or just `ids`.
export async function fetchProjects(people: People, ids?: string[]): Promise<Loaded> {
  let q = sb().from('projects').select(SELECT).order('created_at', { ascending: false })
  if (ids) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as ProjectRow[]
  const missing = peopleIn(rows).filter((id) => !people.byId.has(id))
  const [profiles, urls, reads] = await Promise.all([
    fetchProfiles(missing),
    signUrls(rows),
    rows.length ? sb().from('message_reads').select('*').in('project_id', rows.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ])
  people.add(profiles)
  const seen: Record<string, string> = {}
  for (const r of (reads.data ?? []) as ReadRow[]) {
    const who = people.handle(r.user_id)
    const channel = r.channel === 'group' ? 'group' : dmKey(who, people.handle(r.channel))
    seen[`${r.project_id}:${channel}:${who}`] = iso(r.seen_at)
  }
  return { projects: rows.map((r) => toProject(r, people, urls)), seen }
}

type Person = Pick<ProfileRow, 'id' | 'handle' | 'name'>

type InviteRow = {
  id: string
  name: string
  brief: string
  deadline: string | null
  version: number
  status: Project['status']
  created_at: string
  lead: Person
  roles: {
    id: string
    title: string
    pay: number | string
    deposit_pct: number
    response: Role['response']
    signed_version: number | null
    assignee: Person | null
    milestones: { id: string; title: string; done_when: string; pct: number; due: string | null; revisions: number }[]
  }[]
}

// What someone who isn't on the crew yet sees from an invite link: the brief and the terms.
export async function fetchInvite(people: People, projectId: string, meId: string): Promise<Project | undefined> {
  const { data, error } = await sb().rpc('invite', { p_project: projectId })
  if (error || !data) return undefined
  const inv = data as InviteRow
  people.add([inv.lead, ...inv.roles.flatMap((r) => (r.assignee ? [r.assignee] : []))].map((p) => ({ bio: '', skills: [], portfolio: null, ...p })))
  const { data: apps } = await sb().from('applications').select('*').eq('project_id', projectId).eq('applicant_id', meId)
  const mine = (apps ?? []) as (ApplicationRow & { role_id: string })[]
  return derive({
    id: inv.id,
    name: inv.name,
    brief: inv.brief,
    deadline: opt(inv.deadline),
    lead: `@${inv.lead.handle}`,
    version: inv.version,
    status: inv.status,
    createdAt: iso(inv.created_at),
    messages: [],
    dms: {},
    payouts: [],
    guest: true,
    roles: inv.roles.map((r) => ({
      id: r.id,
      title: r.title,
      assignee: r.assignee ? `@${r.assignee.handle}` : undefined,
      pay: Number(r.pay),
      depositPct: r.deposit_pct,
      response: r.response,
      signedVersion: opt(r.signed_version),
      applicants: mine
        .filter((a) => a.role_id === r.id)
        .map((a) => ({ handle: people.handle(meId), portfolio: a.portfolio, note: a.note, amount: num(a.amount), at: iso(a.created_at) })),
      milestones: r.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        doneWhen: m.done_when,
        pct: m.pct,
        due: opt(m.due),
        revisions: m.revisions,
        status: 'working',
        submissions: [],
      })),
    })),
  })
}

// ---------- writing ----------

// Actions that work against the database today. Funding, milestone work and disputes
// go live with the vault contract.
export const LIVE_ACTIONS = new Set<Action['type']>([
  'create',
  'editDraft',
  'cancelDraft',
  'accept',
  'counter',
  'decline',
  'resolveCounter',
  'apply',
  'pick',
  'say',
  'seen',
  'updateProfile',
  'statement',
])

const draftJson = (d: Pick<Project, 'name' | 'brief' | 'deadline' | 'roles'>) => ({
  name: d.name,
  brief: d.brief,
  deadline: d.deadline ?? '',
  roles: d.roles.map((r) => ({
    id: r.id,
    title: r.title,
    assignee: r.assignee ?? '',
    listed: !r.assignee && !!r.listed,
    pay: r.pay,
    depositPct: r.depositPct,
    milestones: r.milestones.map((m) => ({ id: m.id, title: m.title, doneWhen: m.doneWhen, pct: m.pct, due: m.due ?? '', revisions: m.revisions })),
  })),
})

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

async function upload(projectId: string, a: Attachment): Promise<FileRow> {
  if (!a.blob) throw new Error(`${a.name} couldn’t be read. Try attaching it again.`)
  const ext = a.mime.includes('webm') && !/\.\w+$/.test(a.name) ? '.webm' : ''
  const path = `${projectId}/chat/${crypto.randomUUID()}-${safeName(a.name)}${ext}`
  const { error } = await sb().storage.from(BUCKET).upload(path, a.blob, { contentType: a.mime })
  if (error) throw new Error(`Couldn’t upload ${a.name}: ${error.message}`)
  return { name: a.name, size: a.size, mime: a.mime, kind: a.kind, path }
}

async function check<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<T> {
  const r = await p
  if (r.error) throw new Error(r.error.message)
  return r
}

export async function perform(a: Action, ctx: { meId: string; people: People; project?: Project }): Promise<void> {
  const rpc = (fn: string, args: Record<string, unknown>) => check(sb().rpc(fn, args))
  const idOf = (h: Handle) => {
    const id = ctx.people.idOf(h)
    if (!id) throw new Error(`Couldn’t find ${h}.`)
    return id
  }
  switch (a.type) {
    case 'create':
      await rpc('create_project', { p: { id: a.project.id, ...draftJson(a.project) } })
      return
    case 'editDraft':
      await rpc('save_draft', { pid: a.projectId, p: draftJson(a.draft) })
      return
    case 'cancelDraft':
      await rpc('cancel_draft', { pid: a.projectId, p_reason: a.reason })
      return
    case 'accept':
      // Live with wallets: the Tempo transaction where they agreed to the terms (tempo:<hash>).
      await rpc('sign_role', {
        p_role: a.roleId,
        p_version: ctx.project?.version,
        p_signature: a.signature ?? `unsigned:v${ctx.project?.version}`,
        p_payout: a.payout,
      })
      return
    case 'counter':
      await rpc('counter_offer', { p_role: a.roleId, p_amount: a.amount, p_deposit: a.depositPct, p_note: a.note })
      return
    case 'decline':
      await rpc('decline_role', { p_role: a.roleId, p_note: a.note })
      return
    case 'resolveCounter':
      await rpc('resolve_counter', { p_message: a.messageId, p_accept: a.accept })
      return
    case 'apply':
      await rpc('apply_role', { p_role: a.roleId, p_portfolio: a.portfolio, p_note: a.note, p_amount: a.amount ?? null })
      return
    case 'pick':
      await rpc('pick_applicant', { p_role: a.roleId, p_applicant: idOf(a.handle) })
      return
    case 'say': {
      const attachments = await Promise.all((a.attachments ?? []).map((x) => upload(a.projectId, x)))
      await check(
        sb().from('messages').insert({
          project_id: a.projectId,
          author_id: ctx.meId,
          recipient_id: a.to ? idOf(a.to) : null,
          text: a.text,
          reply_to: a.replyTo ?? null,
          attachments,
        }),
      )
      return
    }
    case 'seen': {
      const me = ctx.people.handle(ctx.meId)
      const other = a.channel === 'group' ? undefined : a.channel.split('|').find((h) => h !== me)
      await check(
        sb()
          .from('message_reads')
          .upsert({ project_id: a.projectId, channel: other ? idOf(other) : 'group', user_id: ctx.meId, seen_at: new Date().toISOString() }),
      )
      return
    }
    case 'statement': {
      // Off-chain: each side's account of a dispute, for the reviewer to read.
      await check(sb().from('dispute_statements').insert({ milestone_id: a.milestoneId, project_id: a.projectId, author_id: ctx.meId, text: a.text }))
      return
    }
    case 'updateProfile':
      await check(
        sb()
          .from('profiles')
          .update({
            name: a.profile.name,
            bio: a.profile.bio,
            skills: a.profile.skills,
            portfolio: a.profile.portfolio ?? null,
            ...(a.profile.emailUpdates === undefined ? {} : { email_updates: a.profile.emailUpdates }),
          })
          .eq('id', ctx.meId),
      )
      return
    default:
      throw new Error('Not live yet')
  }
}
