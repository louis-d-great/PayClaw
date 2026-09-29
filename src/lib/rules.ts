import type { Milestone, Project, Role } from '../types'

// The protocol rules. These are what the vault contract will enforce on Base;
// keeping them in one place makes the port straightforward.
export const AUTO_APPROVE_DAYS = 7 // Lead silent this long after a submission → it pays out
export const GRACE_DAYS = 7 // past a deadline with nothing submitted → Lead may reclaim
export const DEFAULT_REVISIONS = 2 // rounds of changes before a dispute can open
export const DEFAULT_DEPOSIT = 20 // % of pay released the moment the vault is funded
export const DISPUTE_DAYS = 3 // time each side has to state their case

export const DAY = 86_400_000

export type ScheduleLine = { key: string; label: string; pct: number; amount: number }

// Deposit first, then milestones in order. Cents are rounded down on every line
// except the last, which takes the remainder so the lines always sum to the pay.
export function schedule(role: Pick<Role, 'pay' | 'depositPct' | 'milestones'>): ScheduleLine[] {
  const lines = [
    { key: 'deposit', label: 'Upfront deposit', pct: role.depositPct },
    ...role.milestones.map((m) => ({ key: m.id, label: m.title, pct: m.pct })),
  ].filter((l) => l.pct > 0)
  let left = role.pay
  return lines.map((l, i) => {
    const amount = i === lines.length - 1 ? left : Math.floor((role.pay * l.pct) / 100 * 100) / 100
    left = Math.round((left - amount) * 100) / 100
    return { ...l, amount }
  })
}

export const amountFor = (role: Role, key: string) => schedule(role).find((l) => l.key === key)?.amount ?? 0

export const scheduleTotal = (role: Pick<Role, 'depositPct' | 'milestones'>) =>
  role.depositPct + role.milestones.reduce((s, m) => s + m.pct, 0)

// Keep milestone shares in proportion when the deposit changes, so the schedule still sums to 100%.
export function rebalance(milestones: Milestone[], depositPct: number): Milestone[] {
  const target = 100 - depositPct
  const current = milestones.reduce((s, m) => s + m.pct, 0) || 1
  let used = 0
  return milestones.map((m, i) => {
    const pct = i === milestones.length - 1 ? target - used : Math.round((m.pct / current) * target)
    used += pct
    return { ...m, pct }
  })
}

export const revisionsUsed = (m: Milestone) => m.submissions.filter((s) => s.review?.kind === 'changes').length
export const revisionsLeft = (m: Milestone) => Math.max(0, m.revisions - revisionsUsed(m))
export const lastSubmission = (m: Milestone) => m.submissions[m.submissions.length - 1]

export const autoApproveAt = (m: Milestone) => {
  const s = lastSubmission(m)
  return m.status === 'submitted' && s ? new Date(s.at).getTime() + AUTO_APPROVE_DAYS * DAY : undefined
}

const endOfDay = (d: string) => new Date(d + 'T23:59:59').getTime()

export const isOverdue = (m: Milestone, now: number) => m.status === 'working' && !!m.due && endOfDay(m.due) < now

export const canReclaim = (m: Milestone, now: number) =>
  m.status === 'working' && m.submissions.length === 0 && !!m.due && endOfDay(m.due) + GRACE_DAYS * DAY < now

export const reclaimAt = (m: Milestone) => (m.due ? endOfDay(m.due) + GRACE_DAYS * DAY : undefined)

// The collaborator can escalate once the last allowed round of changes has been asked for.
export const collaboratorCanDispute = (m: Milestone) =>
  m.status === 'working' && m.submissions.length > 0 && revisionsLeft(m) === 0

// The Lead can escalate instead of approving once no revision rounds are left.
export const leadCanDispute = (m: Milestone) => m.status === 'submitted' && revisionsLeft(m) === 0

export const isSettled = (m: Milestone) =>
  m.status === 'paid' || m.status === 'resolved' || m.status === 'reclaimed' || m.status === 'cancelled'

export function vault(p: Project) {
  const funded = p.fundedAt ? p.roles.reduce((s, r) => s + r.pay, 0) : 0
  const paid = p.payouts.filter((x) => x.kind !== 'refund').reduce((s, x) => s + x.amount, 0)
  const returned = p.payouts.filter((x) => x.kind === 'refund').reduce((s, x) => s + x.amount, 0)
  const round = (n: number) => Math.round(n * 100) / 100
  return { funded, paid: round(paid), returned: round(returned), held: round(funded - paid - returned) }
}

export const earnedBy = (p: Project, roleId: string) =>
  p.payouts.filter((x) => x.roleId === roleId && x.kind !== 'refund').reduce((s, x) => s + x.amount, 0)
