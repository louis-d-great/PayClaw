import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card, Input, Label, Money, TextArea } from '../components/ui'
import { shortDate } from '../lib/format'
import { roleStatus } from '../lib/status'
import { isSigned, personName, useStore } from '../store'
import type { Project, Role } from '../types'

type Panel = 'none' | 'sign' | 'counter' | 'decline'

export default function ReviewAndSign() {
  const { projectId, roleId } = useParams()
  const { projects, me } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const role = project?.roles.find((r) => r.id === roleId)

  if (!project || !role)
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">This invite doesn’t exist.</h1>
        <p className="mt-2 text-muted">The link may be wrong, or the role was removed.</p>
        <Link to="/" className="mt-6 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    )

  const isLead = project.lead === me
  const isYours = role.assignee === me
  const canAct = !isLead && (isYours || !role.assignee) && project.status === 'signing'

  return (
    <div className="animate-rise mx-auto max-w-5xl">
      <div className="mb-8 flex items-center gap-3">
        <Avatar handle={project.lead} size={40} />
        <p className="text-muted">
          <span className="font-medium text-ink">{personName(project.lead)}</span>{' '}
          {role.assignee ? 'invited you to join' : 'is looking for someone to join'}
        </p>
      </div>

      {isLead && (
        <div className="mb-6 rounded-2xl border border-dashed border-line bg-card px-5 py-4 text-sm text-muted">
          This is your project. You’re seeing exactly what <b className="text-ink">{role.assignee ? personName(role.assignee) : 'an applicant'}</b>{' '}
          sees when they open this invite.
        </div>
      )}
      {!isLead && role.assignee && !isYours && (
        <div className="mb-6 rounded-2xl border border-dashed border-line bg-card px-5 py-4 text-sm text-muted">
          This role is for {personName(role.assignee)}. You can read it, but only they can respond.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px] lg:grid-rows-[auto_1fr]">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{project.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>Draft v{project.version}</Badge>
            {project.deadline && <Badge>Final deadline {shortDate(project.deadline)}</Badge>}
          </div>
          <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{project.brief}</p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <YourRole project={project} role={role} canAct={canAct} />
        </aside>

        <div className="lg:col-start-1">
          <h2 className="mb-3 font-display text-xl font-bold">The whole crew</h2>
          <p className="mb-4 text-sm text-muted">Everyone sees everyone’s pay. No side deals.</p>
          <Card className="divide-y divide-line">
            {project.roles.map((r) => (
              <CrewRow key={r.id} project={project} role={r} highlight={r.id === role.id} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

function CrewRow({ project, role, highlight }: { project: Project; role: Role; highlight: boolean }) {
  const s = roleStatus(project, role)
  return (
    <div className={`flex items-center gap-3 px-5 py-4 ${highlight ? 'bg-accent-soft/40' : ''}`}>
      <Avatar handle={role.assignee} size={36} />
      <div className="min-w-0">
        <p className="font-medium">
          {role.title}
          {highlight && <span className="ml-2 text-xs font-medium text-accent">You</span>}
        </p>
        <p className="text-sm text-muted">{role.assignee ? personName(role.assignee) : 'Open'}</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className="w-16 text-right tabular-nums">${role.pay.toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}

function YourRole({ project, role, canAct }: { project: Project; role: Role; canAct: boolean }) {
  const { dispatch, me } = useStore()
  const [panel, setPanel] = useState<Panel>('none')
  const signed = isSigned(project, role)
  const openCounter = project.messages.find((m) => m.kind === 'counter' && m.roleId === role.id && !m.resolution)
  const needsResign = !signed && role.signedVersion !== undefined
  const lastChange = [...project.messages].reverse().find((m) => m.kind === 'system' && m.text.startsWith('Draft v'))

  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Your role</p>
        <p className="mt-1 font-display text-2xl font-bold">{role.title}</p>
        <Money value={role.pay} className="mt-4 block text-5xl font-bold" />
        <p className="mt-1 text-sm text-muted">Fixed pay, held in the project vault</p>

        <div className="mt-6 space-y-3">
          {role.milestones.map((m, i) => (
            <div key={m.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/5 text-xs font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.title}</p>
                {m.due && <p className="text-xs text-muted">Due {shortDate(m.due)}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-paper p-4 text-sm leading-relaxed text-muted">
          <b className="text-ink">How you get paid.</b> {personName(project.lead)} funds the vault once everyone signs. When
          they approve a milestone, the vault pays you. If they don’t respond within 7 days, it pays you anyway.
        </div>
      </div>

      <div className="border-t border-line bg-paper/50 p-6">
        {signed ? (
          <Done
            title={`You signed draft v${project.version}`}
            body={
              project.status === 'signing'
                ? 'Waiting for the rest of the crew. You’ll see it here when the vault is funded.'
                : 'Everyone’s in. Watch the project page for funding.'
            }
            projectId={project.id}
          />
        ) : openCounter && openCounter.author === me ? (
          <Done
            tone="accent"
            title={`Counter-offer sent: $${openCounter.amount}`}
            body={`Waiting for ${personName(project.lead)} to reply. You can keep talking in the project chat.`}
            projectId={project.id}
          />
        ) : !canAct ? (
          <p className="text-center text-sm text-muted">Responses are only open to the invited person.</p>
        ) : panel === 'sign' ? (
          <SignPanel project={project} role={role} onCancel={() => setPanel('none')} />
        ) : panel === 'counter' ? (
          <CounterPanel
            role={role}
            onCancel={() => setPanel('none')}
            onSend={(amount, note) => dispatch({ type: 'counter', projectId: project.id, roleId: role.id, amount, note })}
          />
        ) : panel === 'decline' ? (
          <DeclinePanel
            onCancel={() => setPanel('none')}
            onSend={(note) => dispatch({ type: 'decline', projectId: project.id, roleId: role.id, note })}
          />
        ) : (
          <>
            {needsResign && (
              <div className="mb-4 rounded-2xl bg-warn-soft p-4 text-sm text-warn">
                <b>The draft changed since you signed.</b> {lastChange?.text}
              </div>
            )}
            <Button size="lg" variant="accent" className="w-full" onClick={() => setPanel('sign')}>
              Accept ${role.pay}
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setPanel('counter')}>
                Counter-offer
              </Button>
              <Button variant="ghost" onClick={() => setPanel('decline')}>
                Decline
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function SignPanel({ project, role, onCancel }: { project: Project; role: Role; onCancel: () => void }) {
  const { dispatch } = useStore()
  const [understood, setUnderstood] = useState(false)
  const [stage, setStage] = useState<'confirm' | 'signing'>('confirm')

  const sign = () => {
    setStage('signing')
    // Stand-in for the wallet signature. On Base this becomes a typed-data signature
    // over (projectId, version, roleId, pay), so nobody can reuse it for another draft.
    setTimeout(() => dispatch({ type: 'accept', projectId: project.id, roleId: role.id }), 900)
  }

  return (
    <div className="animate-rise">
      <p className="font-display text-lg font-bold">Sign the agreement</p>
      <p className="mt-2 rounded-2xl border border-line bg-card p-4 text-sm leading-relaxed">
        I agree to work as <b>{role.title}</b> on <b>{project.name}</b> for <b>${role.pay} USDC</b>, paid by milestone,
        under draft v{project.version}.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#ff6a3d]"
        />
        <span>
          I understand that once everyone signs, <b>this can’t be changed</b>. The only way out is if the whole crew agrees to
          cancel.
        </span>
      </label>
      <Button size="lg" className="mt-5 w-full" disabled={!understood || stage === 'signing'} onClick={sign}>
        {stage === 'signing' ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" /> Signing…
          </>
        ) : (
          'Connect wallet & sign'
        )}
      </Button>
      <button onClick={onCancel} className="mt-3 w-full text-center text-sm text-muted hover:text-ink">
        Back
      </button>
    </div>
  )
}

function CounterPanel({
  role,
  onCancel,
  onSend,
}: {
  role: Role
  onCancel: () => void
  onSend: (amount: number, note: string) => void
}) {
  const [amount, setAmount] = useState(String(role.pay))
  const [note, setNote] = useState('')
  const value = Number(amount) || 0
  const diff = value - role.pay
  const valid = value > 0 && value !== role.pay && note.trim().length >= 10

  return (
    <div className="animate-rise space-y-4">
      <p className="font-display text-lg font-bold">Make a counter-offer</p>
      <label className="block">
        <Label hint={diff !== 0 ? `${diff > 0 ? '+' : '−'}$${Math.abs(diff)} vs. offer` : undefined}>Your price (USDC)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
          <Input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            className="pl-8 text-lg tabular-nums"
          />
        </div>
      </label>
      <label className="block">
        <Label>Why</Label>
        <TextArea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What you’re bringing, or what the brief underestimates."
        />
      </label>
      <Button className="w-full" disabled={!valid} onClick={() => onSend(value, note.trim())}>
        Send to the Lead
      </Button>
      <button onClick={onCancel} className="w-full text-center text-sm text-muted hover:text-ink">
        Back
      </button>
    </div>
  )
}

function DeclinePanel({ onCancel, onSend }: { onCancel: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <div className="animate-rise space-y-4">
      <p className="font-display text-lg font-bold">Decline this role?</p>
      <label className="block">
        <Label hint="Optional">A note for the Lead</Label>
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fully booked until December." />
      </label>
      <Button className="w-full" onClick={() => onSend(note.trim())}>
        Decline
      </Button>
      <button onClick={onCancel} className="w-full text-center text-sm text-muted hover:text-ink">
        Back
      </button>
    </div>
  )
}

function Done({
  title,
  body,
  projectId,
  tone = 'ok',
}: {
  title: string
  body: string
  projectId: string
  tone?: 'ok' | 'accent'
}) {
  return (
    <div className="animate-rise text-center">
      <span
        className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-xl text-white ${tone === 'ok' ? 'bg-ok' : 'bg-accent'}`}
      >
        {tone === 'ok' ? '✓' : '↗'}
      </span>
      <p className="mt-3 font-display text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <Link to={`/p/${projectId}`} className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
        Open project & chat
      </Link>
    </div>
  )
}
