import { isSigned } from '../store'
import type { Project, Role } from '../types'

type Tone = 'neutral' | 'ok' | 'warn' | 'accent'

export function roleStatus(p: Project, r: Role): { label: string; tone: Tone } {
  if (isSigned(p, r)) return { label: 'Signed', tone: 'ok' }
  if (r.response === 'countered') return { label: 'Counter-offer', tone: 'accent' }
  if (!r.assignee) return { label: 'Open role', tone: 'neutral' }
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
      return { label: 'Done', tone: 'ok' }
  }
}
