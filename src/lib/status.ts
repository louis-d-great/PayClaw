import { isSigned } from '../store'
import type { Milestone, Project, Role } from '../types'
import { isOverdue } from './rules'

export type Tone = 'neutral' | 'ok' | 'warn' | 'accent'

export function roleStatus(p: Project, r: Role): { label: string; tone: Tone } {
  if (isSigned(p, r)) return { label: 'Signed', tone: 'ok' }
  if (r.response === 'countered') return { label: 'Counter-offer', tone: 'accent' }
  if (!r.assignee)
    return r.applicants?.length
      ? { label: `${r.applicants.length} applicant${r.applicants.length === 1 ? '' : 's'}`, tone: 'accent' }
      : { label: 'Open role', tone: 'neutral' }
  if (r.signedVersion !== undefined) return { label: 'Needs to re-sign', tone: 'warn' }
  return { label: 'Invited', tone: 'neutral' }
}

export function projectStatus(p: Project): { label: string; tone: Tone } {
  switch (p.status) {
    case 'signing':
      return { label: 'Waiting for signatures', tone: 'warn' }
    case 'ready':
      return { label: 'Ready to fund', tone: 'accent' }
    case 'funded':
      return { label: 'Funded · in progress', tone: 'ok' }
    case 'done':
      return { label: 'Complete', tone: 'ok' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
  }
}

export function milestoneStatus(p: Project, m: Milestone, now: number): { label: string; tone: Tone } {
  if (!p.fundedAt) return { label: 'Starts when funded', tone: 'neutral' }
  switch (m.status) {
    case 'paid':
      return { label: 'Paid', tone: 'ok' }
    case 'submitted':
      return { label: 'Waiting for review', tone: 'accent' }
    case 'disputed':
      return { label: 'In dispute', tone: 'warn' }
    case 'resolved':
      return { label: 'Settled by review', tone: 'neutral' }
    case 'reclaimed':
      return { label: 'Returned to Lead', tone: 'neutral' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
    case 'working':
      if (m.submissions.length > 0) return { label: 'Changes requested', tone: 'warn' }
      if (isOverdue(m, now)) return { label: 'Overdue', tone: 'warn' }
      return { label: 'In progress', tone: 'neutral' }
  }
}
