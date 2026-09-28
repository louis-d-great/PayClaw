import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Chat from '../components/Chat'
import { Avatar, Badge, Button, Card, Money } from '../components/ui'
import { shortDate } from '../lib/format'
import { projectStatus, roleStatus } from '../lib/status'
import { budget, personName, signedCount, useStore } from '../store'
import type { Project, Role } from '../types'

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

          <Card className="p-6">
            <h2 className="mb-2 font-display text-lg font-bold">The brief</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted">{project.brief}</p>
          </Card>
        </div>

        <Card className="flex h-[560px] flex-col overflow-hidden lg:sticky lg:top-24">
          <div className="border-b border-line px-5 py-4">
            <p className="font-display text-lg font-bold">Project chat</p>
            <p className="text-xs text-muted">Counter-offers and every change to the draft are logged here.</p>
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

  if (project.status === 'funded')
    return (
      <Card className="flex items-center gap-4 p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ok-soft text-xl text-ok">⬢</span>
        <div>
          <p className="font-display text-lg font-bold">Vault funded with ${budget(project).toLocaleString('en-US')} USDC</p>
          <p className="text-sm text-muted">The terms are locked. Money is released as milestones are approved.</p>
        </div>
      </Card>
    )

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
