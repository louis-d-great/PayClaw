import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ChatPanel from '../components/Chat'
import { CreateWalletButton, friendlyError, useBalance } from '../components/Wallet'
import { fund, getTestDollars, notAgreed, termsBlocker, termsFor, txUrl, walletsEnabled } from '../lib/tempo'
import { Avatar, Badge, Button, Card, Input, Money, PersonLink, TextArea } from '../components/ui'
import { shortDate } from '../lib/format'
import Schedule from '../components/Schedule'
import { canReclaim, earnedBy, vault } from '../lib/rules'
import { milestoneStatus, projectStatus, roleStatus } from '../lib/status'
import { budget, parties, personName, signedCount, useStore } from '../store'
import { REVIEWER, type Project, type Role } from '../types'
import { PageHint } from '../components/Tour'

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
      <PageHint id="project" title="Inside a project">
        On the left: who has signed, the vault, and each person’s milestones (open one to submit or review work). On the right: the
        group chat, which is the official record if there’s ever a dispute. Private DMs are never used as evidence.
      </PageHint>
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
            <Avatar handle={project.lead} size={22} /> Led by {isLead ? 'you' : <PersonLink handle={project.lead} />}
            {project.fundedAt && (
              <Link to={`/r/${project.id}`} className="ml-2 text-sm font-medium text-accent underline underline-offset-2">
                Public receipt
              </Link>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Budget</p>
          <Money value={budget(project)} className="text-4xl font-bold" />
        </div>
      </div>

      {project.status === 'cancelled' && (
        <div className="mb-6 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
          <b>This project is cancelled.</b>{' '}
          <span className="text-muted">
            {project.fundedAt
              ? 'Money already paid out stays with the people who earned it. The rest went back to the Lead.'
              : 'It was called off before funding, so no money moved.'}
          </span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          {project.fundedAt ? (
            <>
              <VaultCard project={project} />
              <Attention project={project} />
              {project.roles.map((r) => (
                <WorkCard key={r.id} project={project} role={r} />
              ))}
              {(project.status === 'funded' || project.cancel) && project.status !== 'cancelled' && <CancelCard project={project} />}
            </>
          ) : (
            <>
              {project.status !== 'cancelled' && (
                <SignatureGate project={project} signed={signed} isLead={isLead} onFund={() => dispatch({ type: 'fund', projectId: project.id })} />
              )}
              {isLead && (project.status === 'signing' || project.status === 'ready') && <DraftActions project={project} />}

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

        <Card className="flex h-[640px] max-h-[calc(100vh-7rem)] min-h-[480px] flex-col overflow-hidden lg:sticky lg:top-24">
          <ChatPanel project={project} />
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
  const { mode } = useStore()
  const liveWallets = mode === 'live' && walletsEnabled
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
      {project.status === 'ready' && isLead && liveWallets && <LiveFund project={project} />}
      {project.status === 'ready' && isLead && !liveWallets && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft/60 p-4">
          <p className="flex-1 text-sm">
            Fund the vault with <b>${budget(project).toLocaleString('en-US')}</b>. Your crew sees the money before they start.
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

// Live: the Lead funds the vault on Tempo. One passkey prompt approves the budget and funds it;
// deposits pay out in the same transaction. Then /api/sync records it for everyone.
function LiveFund({ project }: { project: Project }) {
  const { me, profiles, refresh } = useStore()
  const wallet = profiles[me]?.wallet as `0x${string}` | undefined
  const { balance, refresh: refreshBalance } = useBalance(wallet)
  const [stage, setStage] = useState<'idle' | 'topping' | 'funding' | 'recording'>('idle')
  const [error, setError] = useState('')
  const [tx, setTx] = useState('')
  const total = budget(project)
  const wallets = Object.fromEntries(Object.entries(profiles).map(([h, p]) => [h, p.wallet]))
  const blocker = wallet ? termsBlocker(project, wallets, personName) : undefined
  const short = balance !== undefined && balance < total

  const go = async () => {
    setError('')
    try {
      const terms = termsFor(project, wallets)
      const pending = await notAgreed(terms)
      if (pending.length) {
        const who = Object.entries(wallets)
          .filter(([, w]) => w && pending.some((p) => p.toLowerCase() === w.toLowerCase()))
          .map(([h]) => personName(h))
        throw new Error(`${who.join(', ') || 'Someone'} still needs to sign this version with their passkey.`)
      }
      setStage('funding')
      const hash = await fund(wallet!, terms)
      setTx(hash)
      setStage('recording')
      await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, txHash: hash }) })
      await refresh(project.id)
      refreshBalance()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setStage('idle')
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-accent-soft/60 p-4">
      {!wallet ? (
        <>
          <p className="mb-3 text-sm">To fund the vault you need your CrewPay wallet. Create it with a passkey: Face ID, fingerprint, Windows PIN or your phone.</p>
          <CreateWalletButton />
        </>
      ) : blocker ? (
        <p className="text-sm text-warn">{blocker}</p>
      ) : (
        <>
          <p className="text-sm">
            Fund the vault with <b>${total.toLocaleString('en-US')}</b>. Deposits go out the moment it lands, and your crew can see the money before they start.
            CrewPay covers the network fee.
          </p>
          <p className="mt-2 text-xs text-muted">
            Your wallet: {balance === undefined ? 'checking…' : `$${(Math.floor(balance * 100) / 100).toLocaleString('en-US')}`}
            {short && ' · not enough yet'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {short && (
              <Button
                variant="outline"
                disabled={stage !== 'idle'}
                onClick={async () => {
                  setStage('topping')
                  try {
                    await getTestDollars(wallet)
                    refreshBalance()
                  } catch (e) {
                    setError(friendlyError(e))
                  } finally {
                    setStage('idle')
                  }
                }}
              >
                {stage === 'topping' ? 'Adding test dollars…' : 'Get test dollars'}
              </Button>
            )}
            <Button variant="accent" disabled={stage !== 'idle' || short || balance === undefined} onClick={go}>
              {stage === 'funding' ? 'Confirm with your passkey…' : stage === 'recording' ? 'Recording…' : 'Fund project'}
            </Button>
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {tx && (
        <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-muted underline">
          Funded on Tempo ↗
        </a>
      )}
    </div>
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
          {role.assignee ? <PersonLink handle={role.assignee} /> : 'Open role'} · {role.milestones.length} milestone
          {role.milestones.length === 1 ? '' : 's'}
        </p>
      </div>
      <Badge tone={s.tone}>{s.label}</Badge>
      <span className="w-16 text-right font-medium tabular-nums">${role.pay.toLocaleString('en-US')}</span>
      {isLead && project.status === 'signing' && !role.assignee && role.applicants && role.applicants.length > 0 && (
        <Applicants project={project} role={role} />
      )}
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
        ? 'CrewPay wallet'
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
            <PersonLink handle={role.assignee} />
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

function DraftActions({ project }: { project: Project }) {
  const { dispatch } = useStore()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="font-medium">Need to change something?</p>
          <p className="text-sm text-muted">Edit pay, roles, milestones or people. Any change asks everyone to sign again.</p>
        </div>
        <Link
          to={`/p/${project.id}/edit`}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:bg-ink/85"
        >
          Edit draft
        </Link>
        <Button variant="ghost" onClick={() => setCancelling((c) => !c)}>
          Cancel project
        </Button>
      </div>
      {cancelling && (
        <div className="animate-rise mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-sm">Nothing has been funded yet, so you can call this off on your own. Your crew sees your reason in the chat.</p>
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you’re cancelling (optional)" />
          <Button variant="outline" onClick={() => dispatch({ type: 'cancelDraft', projectId: project.id, reason: reason.trim() })}>
            Yes, cancel the project
          </Button>
        </div>
      )}
    </Card>
  )
}

function Applicants({ project, role }: { project: Project; role: Role }) {
  const { dispatch } = useStore()
  return (
    <div className="w-full space-y-2 pt-1">
      <p className="text-xs font-medium uppercase tracking-wider text-accent">Applicants · pick one to invite</p>
      {role.applicants!.map((a) => (
        <div key={a.handle} className="rounded-2xl border border-line bg-paper/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar handle={a.handle} size={28} />
            <PersonLink handle={a.handle} className="font-medium" />
            <a href={a.portfolio} target="_blank" rel="noreferrer" className="truncate text-sm text-accent underline underline-offset-2">
              Portfolio ↗
            </a>
            <span className="ml-auto text-sm tabular-nums">
              {a.amount && a.amount !== role.pay ? (
                <>
                  asks <b>${a.amount.toLocaleString('en-US')}</b>
                </>
              ) : (
                <>accepts ${role.pay.toLocaleString('en-US')}</>
              )}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{a.note}</p>
          <Button size="sm" className="mt-3" onClick={() => dispatch({ type: 'pick', projectId: project.id, roleId: role.id, handle: a.handle })}>
            Pick {personName(a.handle)}
            {a.amount && a.amount !== role.pay ? ` at $${a.amount}` : ''}
          </Button>
        </div>
      ))}
    </div>
  )
}

// Once money is in the vault, cancelling needs everyone. Paid work stays paid; the rest returns to the Lead.
function CancelCard({ project }: { project: Project }) {
  const { me, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const everyone = parties(project)
  const isParty = everyone.includes(me)
  const c = project.cancel

  if (!c)
    return isParty ? (
      <Card className="p-5">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
          <span>
            <span className="block font-medium">Cancel the project</span>
            <span className="text-sm text-muted">Needs everyone to agree. Paid work stays paid; the rest returns to the Lead.</span>
          </span>
          <span className="text-muted">{open ? '−' : '+'}</span>
        </button>
        {open && (
          <div className="animate-rise mt-4 space-y-3">
            <TextArea id="cancel-proposal" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the crew should stop here." />
            <Button variant="outline" disabled={reason.trim().length < 5} onClick={() => dispatch({ type: 'proposeCancel', projectId: project.id, reason: reason.trim() })}>
              Ask everyone to cancel
            </Button>
          </div>
        )}
      </Card>
    ) : null

  const agreed = c.approvals.includes(me)
  return (
    <Card className="border-warn/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-warn">Cancel requested</p>
      <p className="mt-1 font-medium">
        {personName(c.proposedBy)}: “{c.reason}”
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {everyone.map((h) => (
          <span
            key={h}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${c.approvals.includes(h) ? 'bg-ok-soft text-ok' : 'bg-ink/5 text-muted'}`}
          >
            <Avatar handle={h} size={18} /> {personName(h)} {c.approvals.includes(h) ? '✓' : '…'}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">
        If everyone agrees, ${vault(project).held.toLocaleString('en-US')} still in the vault goes back to {personName(project.lead)}.
      </p>
      {isParty && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!agreed && (
            <Button variant="outline" onClick={() => dispatch({ type: 'approveCancel', projectId: project.id })}>
              I agree to cancel
            </Button>
          )}
          <Button variant="ghost" onClick={() => dispatch({ type: 'withdrawCancel', projectId: project.id })}>
            {me === c.proposedBy ? 'Withdraw request' : 'Keep working'}
          </Button>
        </div>
      )}
    </Card>
  )
}
