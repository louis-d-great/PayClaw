import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Card, Money, cx } from '../components/ui'
import { shortDate } from '../lib/format'
import { projectStatus, roleStatus } from '../lib/status'
import { budget, isSigned, personName, signedCount, useStore } from '../store'
import type { Project } from '../types'

type View = 'lead' | 'crew'

export default function Dashboard() {
  const { projects, me, dispatch } = useStore()
  const [view, setView] = useState<View>('lead')

  const leading = projects.filter((p) => p.lead === me)
  const joined = projects.filter((p) => p.lead !== me && p.roles.some((r) => r.assignee === me))
  const myRoles = joined.flatMap((p) => p.roles.filter((r) => r.assignee === me).map((r) => ({ p, r })))
  const toSign = myRoles.filter(({ p, r }) => p.status === 'signing' && !isSigned(p, r))
  const openCounters = leading.flatMap((p) => p.messages.filter((m) => m.kind === 'counter' && !m.resolution))
  const committed = myRoles.filter(({ p, r }) => isSigned(p, r) || p.status === 'funded').reduce((s, { r }) => s + r.pay, 0)

  const list = view === 'lead' ? leading : joined

  return (
    <div className="animate-rise">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-accent">Hi {personName(me)}</p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Your projects</h1>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Signed work, yours to earn" value={<Money value={committed} className="text-3xl font-bold" />} />
        <Stat
          label="Invites waiting on you"
          value={<span className="font-display text-3xl font-bold">{toSign.length}</span>}
          accent={toSign.length > 0}
        />
        <Stat
          label="Counter-offers to answer"
          value={<span className="font-display text-3xl font-bold">{openCounters.length}</span>}
          accent={openCounters.length > 0}
        />
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="inline-flex rounded-full border border-line bg-card p-1">
          {(
            [
              ['lead', `Projects I lead · ${leading.length}`],
              ['crew', `Projects I’m on · ${joined.length}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cx(
                'rounded-full px-4 py-1.5 text-sm font-medium transition',
                view === v ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => dispatch({ type: 'reset' })} className="ml-auto text-xs text-muted hover:text-ink">
          Reset demo data
        </button>
      </div>

      {list.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-display text-xl font-bold">
            {view === 'lead' ? 'You’re not leading anything yet.' : 'No invites yet.'}
          </p>
          <p className="mt-2 text-muted">
            {view === 'lead'
              ? 'Got a project you can’t finish alone? Build your crew.'
              : 'When someone invites you to a project, it shows up here.'}
          </p>
          {view === 'lead' && (
            <Link
              to="/new"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
            >
              Start a project
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} view={view} me={me} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <Card className={cx('p-5', accent && 'border-accent/40 bg-accent-soft/30')}>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2">{value}</div>
    </Card>
  )
}

function ProjectCard({ project, view, me }: { project: Project; view: View; me: string }) {
  const s = projectStatus(project)
  const mine = project.roles.find((r) => r.assignee === me)
  const to = view === 'crew' && mine && project.status === 'signing' && !isSigned(project, mine)
    ? `/p/${project.id}/role/${mine.id}`
    : `/p/${project.id}`

  return (
    <Link to={to} className="group block">
      <Card className="h-full p-6 transition group-hover:-translate-y-0.5 group-hover:border-ink/30 group-hover:shadow-[0_12px_32px_-16px_rgba(29,27,22,.25)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-bold">{project.name}</p>
            <p className="mt-1 text-sm text-muted">
              {view === 'lead' ? 'You lead' : `Led by ${personName(project.lead)}`}
              {project.deadline && ` · due ${shortDate(project.deadline)}`}
            </p>
          </div>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div className="flex -space-x-2">
            {project.roles.map((r) => (
              <span key={r.id} className="rounded-full ring-2 ring-card">
                <Avatar handle={r.assignee} size={32} />
              </span>
            ))}
          </div>
          {view === 'lead' ? (
            <div className="text-right">
              <p className="text-xs text-muted">
                {signedCount(project)}/{project.roles.length} signed
              </p>
              <Money value={budget(project)} className="text-2xl font-bold" />
            </div>
          ) : (
            mine && (
              <div className="text-right">
                <p className="text-xs text-muted">
                  {mine.title} · {roleStatus(project, mine).label}
                </p>
                <Money value={mine.pay} className="text-2xl font-bold" />
              </div>
            )
          )}
        </div>
      </Card>
    </Link>
  )
}
