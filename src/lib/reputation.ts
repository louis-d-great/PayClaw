import type { Handle, Milestone, Project, Role } from '../types'

const endOfDay = (d: string) => new Date(d + 'T23:59:59').getTime()

// On time = the first submission landed by the due date (milestones with no due date count as on time).
const deliveredOnTime = (m: Milestone) => {
  const first = m.submissions[0]
  return !!first && (!m.due || new Date(first.at).getTime() <= endOfDay(m.due))
}

// Facts, not a score: every number here comes from signed work and vault payouts.
export function reputation(projects: Project[], handle: Handle) {
  const roles: { p: Project; r: Role }[] = projects.flatMap((p) =>
    p.fundedAt ? p.roles.filter((r) => r.assignee === handle).map((r) => ({ p, r })) : [],
  )
  const milestones = roles.flatMap(({ r }) => r.milestones)
  const delivered = milestones.filter((m) => m.status === 'paid' || m.status === 'resolved')
  const disputes = milestones.filter((m) => m.dispute)
  const decided = disputes.filter((m) => m.dispute?.ruling)
  const earned = projects
    .flatMap((p) => p.payouts)
    .filter((x) => x.to === handle && x.kind !== 'refund')
    .reduce((s, x) => s + x.amount, 0)

  const led = projects.filter((p) => p.lead === handle && p.fundedAt)
  const reviews = led.flatMap((p) =>
    p.roles.flatMap((r) =>
      r.milestones.flatMap((m) =>
        m.submissions
          .filter((s) => s.review && s.review.kind !== 'auto-approved')
          .map((s) => new Date(s.review!.at).getTime() - new Date(s.at).getTime()),
      ),
    ),
  )
  const silent = led.flatMap((p) => p.roles.flatMap((r) => r.milestones)).filter((m) =>
    m.submissions.some((s) => s.review?.kind === 'auto-approved'),
  )

  return {
    earned: Math.round(earned * 100) / 100,
    roles: roles.length,
    rolesCompleted: roles.filter(({ p, r }) => p.status === 'done' || r.milestones.every((m) => m.status === 'paid' || m.status === 'resolved')).length,
    delivered: delivered.length,
    onTimePct: delivered.length ? Math.round((delivered.filter(deliveredOnTime).length / delivered.length) * 100) : undefined,
    missed: milestones.filter((m) => m.status === 'reclaimed').length,
    disputes: disputes.length,
    disputesWon: decided.filter((m) => m.dispute!.ruling!.collaboratorPct >= 50).length,
    disputesDecided: decided.length,
    led: projects.filter((p) => p.lead === handle).length,
    funded: led.length,
    avgReviewHours: reviews.length ? Math.round(reviews.reduce((s, x) => s + x, 0) / reviews.length / 3_600_000) : undefined,
    leadSilent: silent.length,
  }
}

export type WorkRecord = { p: Project; r: Role; paid: number }

export function history(projects: Project[], handle: Handle): WorkRecord[] {
  return projects
    .flatMap((p) =>
      p.roles
        .filter((r) => r.assignee === handle && r.signedVersion !== undefined)
        .map((r) => ({
          p,
          r,
          paid: p.payouts.filter((x) => x.roleId === r.id && x.to === handle && x.kind !== 'refund').reduce((s, x) => s + x.amount, 0),
        })),
    )
    .sort((a, b) => (b.p.fundedAt ?? b.p.createdAt).localeCompare(a.p.fundedAt ?? a.p.createdAt))
}
