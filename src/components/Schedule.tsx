import { Link } from 'react-router-dom'
import { shortDate } from '../lib/format'
import { schedule } from '../lib/rules'
import { milestoneStatus } from '../lib/status'
import { useStore } from '../store'
import type { Project, Role } from '../types'
import { Badge, cx } from './ui'

// The role's money, line by line: deposit first, then each milestone.
// Used on the invite (what you're agreeing to) and on the project page (where it stands).
export default function Schedule({
  project,
  role,
  showDoneWhen = false,
  linkMilestones = false,
}: {
  project: Project
  role: Role
  showDoneWhen?: boolean
  linkMilestones?: boolean
}) {
  const { now } = useStore()
  const lines = schedule(role)
  const depositPaid = project.payouts.some((x) => x.roleId === role.id && x.kind === 'deposit')

  return (
    <ol className="relative">
      {lines.map((line, i) => {
        const m = role.milestones.find((x) => x.id === line.key)
        const status = m
          ? milestoneStatus(project, m, now)
          : depositPaid
            ? { label: 'Paid', tone: 'ok' as const }
            : { label: 'Paid on funding', tone: 'accent' as const }
        const done = status.label === 'Paid'
        const body = (
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  done ? 'bg-ok text-white' : m ? 'bg-ink/5 text-ink' : 'bg-accent-soft text-accent',
                )}
              >
                {done ? '✓' : m ? i + (lines[0].key === 'deposit' ? 0 : 1) : '↑'}
              </span>
              {i < lines.length - 1 && <span className="my-1 w-px flex-1 bg-line" />}
            </div>
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-medium">{line.label}</p>
                {m?.due && <p className="text-xs text-muted">due {shortDate(m.due)}</p>}
                <p className="ml-auto tabular-nums">
                  <span className="font-medium">${line.amount.toLocaleString('en-US')}</span>
                  <span className="ml-1 text-xs text-muted">{line.pct}%</span>
                </p>
              </div>
              {!m && <p className="mt-0.5 text-xs text-muted">Released first, the moment the vault is funded.</p>}
              {m && showDoneWhen && (
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  <span className="font-medium text-ink">Done when:</span> {m.doneWhen}
                </p>
              )}
              {m && showDoneWhen && (
                <p className="mt-1 text-xs text-muted">
                  Up to {m.revisions} round{m.revisions === 1 ? '' : 's'} of changes
                </p>
              )}
              <div className="mt-1.5">
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            </div>
          </div>
        )
        return (
          <li key={line.key}>
            {m && linkMilestones && project.fundedAt ? (
              <Link to={`/p/${project.id}/m/${role.id}/${m.id}`} className="-mx-2 block rounded-2xl px-2 pt-2 transition hover:bg-ink/[.03]">
                {body}
              </Link>
            ) : (
              <div className="pt-2">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
