import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Chat from '../components/Chat'
import { Avatar, Badge, Button, Card, Money } from '../components/ui'
import { shortDate } from '../lib/format'
import Schedule from '../components/Schedule'
import { canReclaim, earnedBy, vault } from '../lib/rules'
import { milestoneStatus, projectStatus, roleStatus } from '../lib/status'
import { budget, personName, signedCount, useStore } from '../store'
import { REVIEWER, type Project, type Role } from '../types'

export default function ProjectPage() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const { projects, me, dispatch } = useStore()
  const project = projects.find((p) => p.id === projectId)

  if (!project)
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Project not found.</h1>
        <Link to="/" className="mt-6 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    )

  const isLead = project.lead === me
  const myRole = project.roles.find((r) => r.assignee === me)
  const s = projectStatus(project)
  const signed = signedCount(project)

  return (
    <div className="animate-rise">
      {params.get('invites') && isLead && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-ok-soft px-5 py-4 text-sm text-ok">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-white">✓</span>
          Your project is live as a draft. Share each role’s invite link below.
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <Badge>Draft v{project.version}</Badge>
            {project.deadline && <Badge>Due {shortDate(project.deadline)}</Badge>}
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{project.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-muted">
            <Avatar handle={project.lead} size={22} /> Led by {isLead ? 'you' : personName(project.lead)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Budget</p>
          <Money value={budget(project)} className="text-4xl font-bold" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {project.fundedAt ? (
            <>
              <VaultCard project={project} />
              <Attention project={project} />
              {project.roles.map((r) => (
                <WorkCard key={r.id} project={project} role={r} />
              ))}
            </>
          ) : (
            <>
              <SignatureGate project={project} signed={signed} isLead={isLead} onFund={() => dispatch({ type: 'fund', projectId: project.id })} />

              {!isLead && myRole && project.status === 'signing' && (
                <Link
                  to={`/p/${project.id}/role/${myRole.id}`}
                  className="flex items-center justify-between rounded-2xl bg-ink px-5 py-4 text-paper transition hover:bg-ink/90"
                >
                  <span>
                    Your role: <b>{myRole.title}</b> · ${myRole.pay}
                  </span>
                  <span className="text-sm opacity-80">Review →</span>
                </Link>
              )}

              <Card className="divide-y divide-line">
                {project.roles.map((r) => (
                  <RoleRow key={r.id} project={project} role={r} isLead={isLead} />
                ))}
              </Card>
            </>
          )}

          <Card className="p-6">
            <h2 className="mb-2 font-display text-lg font-bold">The brief</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted">{project.brief}</p>
          </Card>
        </div>

        <Card className="flex h-[560px] flex-col overflow-hidden lg:sticky lg:top-24">
          <div className="border-b border-line px-5 py-4">
            <p className="font-display text-lg font-bold">Project chat</p>
            <p className="text-xs text-muted">The official record. Counter-offers, changes and payouts are logged here, and it’s the evidence in a dispute.</p>
          </div>
          <div className="min-h-0 flex-1">
            <Chat project={project} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function SignatureGate({
  project,
  signed,
  isLead,
  onFund,
}: {
  project: Project
  signed: number
  isLead: boolean
  onFund: () => void
}) {
  const [funding, setFunding] = useState(false)
  const total = project.roles.length

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold">
          {signed} of {total} signed
        </p>
        <p className="text-sm text-muted">{project.status === 'ready' ? 'Everyone’s in' : 'Nothing is final until everyone signs'}</p>
      </div>
      <div className="mt-4 flex gap-1.5">
        {project.roles.map((r) => (
          <div key={r.id} className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
            <div
              className="h-full rounded-full bg-ok transition-all duration-700"
              style={{ width: r.signedVersion === project.version ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>
      {project.status === 'ready' && isLead && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft/60 p-4">
          <p className="flex-1 text-sm">
            Fund the vault with <b>${budget(project).toLocaleString('en-US')} USDC</b>. Your crew sees the money before they start.
          </p>
          <Button
            variant="accent"
            disabled={funding}
            onClick={() => {
              setFunding(true)
              setTimeout(onFund, 900)
            }}
          >
            {funding ? 'Funding…' : 'Fund project'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function RoleRow({ project, role, isLead }: { project: Project; role: Role; isLead: boolean }) {
  const [copied, setCopied] = useState(false)
  const s = roleStatus(project, role)
  const link = `${window.location.origin}/p/${project.id}/role/${role.id}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Clipboard can be blocked; the link is still reachable through "View invite".
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <Avatar handle={role.assignee} size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{role.title}</p>
        <p className="truncate text-sm text-muted">
          {role.assignee ? personName(role.assignee) : 'Open role'} · {role.milestones.length} milestone
          {role.milestones.length === 1 ? '' : 's'}
        </p>
      </div>
      <Badge tone={s.tone}>{s.label}</Badge>
      <span className="w-16 text-right font-medium tabular-nums">${role.pay.toLocaleString('en-US')}</span>
      {isLead && project.status === 'signing' && (
        <div className="flex w-full gap-2 sm:w-auto">
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? 'Copied' : 'Copy invite link'}
          </Button>
          <Link
            to={`/p/${project.id}/role/${role.id}`}
            className="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            View invite
          </Link>
        </div>
      )}
    </div>
  )
}

function VaultCard({ project }: { project: Project }) {
  const v = vault(project)
  const pct = (n: number) => `${v.funded ? (n / v.funded) * 100 : 0}%`
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ok-soft text-lg text-ok">⬢</span>
        <div>
          <p className="font-display text-lg font-bold">Project vault</p>
          <p className="text-sm text-muted">Terms are locked. Money moves only by the rules everyone signed.</p>
        </div>
      </div>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-ink/5">
        <div className="h-full bg-ok transition-all duration-700" style={{ width: pct(v.paid) }} />
        <div className="h-full bg-muted/40 transition-all duration-700" style={{ width: pct(v.returned) }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ['Funded', v.funded, 'text-ink'],
            ['Paid out', v.paid, 'text-ok'],
            ['Returned', v.returned, 'text-muted'],
            ['Still in vault', v.held, 'text-ink'],
          ] as const
        ).map(([label, n, c]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`font-display text-xl font-bold tabular-nums ${c}`}>${n.toLocaleString('en-US')}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

// Everything waiting on the person viewing, so nobody has to hunt for it.
function Attention({ project }: { project: Project }) {
  const { me, now } = useStore()
  const isLead = project.lead === me
  const items: { to: string; text: string; tone: 'accent' | 'warn' }[] = []
  for (const r of project.roles)
    for (const m of r.milestones) {
      const to = `/p/${project.id}/m/${r.id}/${m.id}`
      if (isLead && m.status === 'submitted') items.push({ to, tone: 'accent', text: `Review “${m.title}” from ${personName(r.assignee!)}` })
      if (isLead && canReclaim(m, now)) items.push({ to, tone: 'warn', text: `“${m.title}” is overdue with nothing submitted` })
      if (r.assignee === me && m.status === 'working' && m.submissions.length > 0)
        items.push({ to, tone: 'warn', text: `Changes requested on “${m.title}”` })
      if (m.status === 'disputed' && (isLead || r.assignee === me || me === REVIEWER))
        items.push({ to, tone: 'warn', text: me === REVIEWER ? `Rule on “${m.title}”` : `“${m.title}” is in dispute` })
    }
  if (items.length === 0) return null
  return (
    <Card className="border-accent/40 p-2">
      <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-accent">Needs you</p>
      {items.map((it) => (
        <Link key={it.text} to={it.to} className="flex items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-ink/[.03]">
          <span className={`h-2 w-2 rounded-full ${it.tone === 'accent' ? 'bg-accent' : 'bg-warn'}`} />
          <span className="text-sm font-medium">{it.text}</span>
          <span className="ml-auto text-sm text-muted">Open →</span>
        </Link>
      ))}
    </Card>
  )
}

function WorkCard({ project, role }: { project: Project; role: Role }) {
  const { me, now } = useStore()
  const earned = earnedBy(project, role.id)
  const active = role.milestones.find((m) => !['paid', 'resolved', 'reclaimed'].includes(m.status))
  const payout =
    role.payout?.method === 'bank'
      ? `Bank · ${role.payout.bank?.name} ${role.payout.bank?.currency}`
      : role.payout?.method === 'wallet'
        ? 'USDC wallet'
        : undefined
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar handle={role.assignee} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {role.title}
            {role.assignee === me && <span className="ml-2 text-xs font-medium text-accent">You</span>}
          </p>
          <p className="text-sm text-muted">
            {role.assignee ? personName(role.assignee) : 'Open'}
            {payout && ` · paid by ${payout}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Earned so far</p>
          <p className="tabular-nums">
            <b className="font-display text-lg">${earned.toLocaleString('en-US')}</b>
            <span className="text-sm text-muted"> / ${role.pay.toLocaleString('en-US')}</span>
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Schedule project={project} role={role} linkMilestones />
      </div>
      {active && (
        <Link
          to={`/p/${project.id}/m/${role.id}/${active.id}`}
          className="mt-1 flex items-center justify-between rounded-2xl bg-paper px-4 py-3 text-sm transition hover:bg-ink/[.05]"
        >
          <span>
            Current: <b>{active.title}</b> · {milestoneStatus(project, active, now).label}
          </span>
          <span className="text-muted">Open →</span>
        </Link>
      )}
    </Card>
  )
}
