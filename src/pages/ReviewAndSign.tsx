import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card, Input, Label, Money, TextArea } from '../components/ui'
import Rules from '../components/Rules'
import Schedule from '../components/Schedule'
import { shortDate } from '../lib/format'
import { amountFor } from '../lib/rules'
import { roleStatus } from '../lib/status'
import { CreateWalletButton, friendlyError } from '../components/Wallet'
import { agree, shortAddress, termsBlocker, termsFor, txUrl, walletsEnabled } from '../lib/tempo'
import { isSigned, personName, useStore } from '../store'
import type { PayoutPreference, Project, Role } from '../types'
import { PageHint } from '../components/Tour'

type Panel = 'none' | 'sign' | 'counter' | 'decline'

export default function ReviewAndSign() {
  const { projectId, roleId } = useParams()
  const { projects, me, loadProject } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const role = project?.roles.find((r) => r.id === roleId)
  // Live: someone opening an invite link isn't on the crew yet, so fetch the invite itself.
  const [loading, setLoading] = useState(!project)
  useEffect(() => {
    if (!projectId || project) return
    let live = true
    loadProject(projectId).finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [projectId, project, loadProject])

  if ((!project || !role) && loading) return <p className="py-24 text-center text-muted">Opening invite…</p>
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
      <PageHint id="invite" title="You’ve been invited">
        Check your pay, your upfront deposit and what each milestone needs. Then accept and sign with your passkey, counter-offer on
        the price or deposit, or decline. Your deposit arrives the moment the Lead funds the vault.
      </PageHint>
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

          <h2 className="mt-10 mb-1 font-display text-xl font-bold">Your payment plan</h2>
          <p className="mb-4 text-sm text-muted">
            What you deliver, what counts as done, and what each step pays. You agree to all of it when you sign.
          </p>
          <Card className="px-5 pb-1 pt-3">
            <Schedule project={project} role={role} showDoneWhen />
          </Card>
          <div className="mt-4">
            <Rules defaultOpen />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <YourRole project={project} role={role} canAct={canAct} />
        </aside>

        <div className="lg:col-start-1">
          <h2 className="mb-1 font-display text-xl font-bold">The whole crew</h2>
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
  const { dispatch, me, profiles } = useStore()
  const [panel, setPanel] = useState<Panel>('none')
  const signed = isSigned(project, role)
  const openCounter = project.messages.find((m) => m.kind === 'counter' && m.roleId === role.id && !m.resolution)
  const needsResign = !signed && role.signedVersion !== undefined
  const deposit = amountFor(role, 'deposit')
  const lastChange = [...project.messages].reverse().find((m) => m.kind === 'system' && m.text.startsWith('Draft v'))

  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Your role</p>
        <p className="mt-1 font-display text-2xl font-bold">{role.title}</p>
        <Money value={role.pay} className="mt-4 block text-5xl font-bold" />
        <p className="mt-1 text-sm text-muted">Fixed pay, held in the project vault</p>

        {deposit > 0 && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-accent-soft/70 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white">↑</span>
            <p className="text-sm leading-snug">
              <b>${deposit.toLocaleString('en-US')} up front</b> ({role.depositPct}%), paid the moment {personName(project.lead)} funds
              the vault.
            </p>
          </div>
        )}
        <p className="mt-4 text-sm text-muted">
          Then {role.milestones.length} milestone payment{role.milestones.length === 1 ? '' : 's'}, each released when approved, or
          after 7 days if the Lead doesn’t respond.
        </p>
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
            title={`Counter-offer sent: $${openCounter.amount}, ${openCounter.depositPct ?? role.depositPct}% up front`}
            body={`Waiting for ${personName(project.lead)} to reply. You can keep talking in the project chat.`}
            projectId={project.id}
          />
        ) : !role.assignee && project.lead !== me && project.status === 'signing' ? (
          role.applicants?.some((a) => a.handle === me) ? (
            <Done
              tone="accent"
              title="Application sent"
              body={`${personName(project.lead)} will review your portfolio. If they pick you, you’ll review and sign the same terms here.`}
              projectId={project.id}
            />
          ) : (
            <ApplyPanel
              role={role}
              portfolio={profiles[me]?.portfolio ?? ''}
              onSend={(portfolio, note, amount) => dispatch({ type: 'apply', projectId: project.id, roleId: role.id, portfolio, note, amount })}
            />
          )
        ) : !canAct ? (
          <p className="text-center text-sm text-muted">Responses are only open to the invited person.</p>
        ) : panel === 'sign' ? (
          <SignPanel project={project} role={role} onCancel={() => setPanel('none')} />
        ) : panel === 'counter' ? (
          <CounterPanel
            role={role}
            onCancel={() => setPanel('none')}
            onSend={(amount, depositPct, note) =>
              dispatch({ type: 'counter', projectId: project.id, roleId: role.id, amount, depositPct, note })
            }
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
  const { dispatch, mode, me, profiles } = useStore()
  // Live: the collaborator agrees to the exact terms on Tempo with their passkey wallet.
  const live = mode === 'live' && walletsEnabled
  const myWallet = profiles[me]?.wallet as `0x${string}` | undefined
  const wallets = Object.fromEntries(Object.entries(profiles).map(([h, p]) => [h, p.wallet]))
  const blocker = live && myWallet ? termsBlocker(project, wallets, personName) : undefined
  const [error, setError] = useState('')
  const [tx, setTx] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [stage, setStage] = useState<'confirm' | 'signing'>('confirm')
  const [payout, setPayout] = useState<PayoutPreference>(role.payout ?? { method: 'wallet' })
  const payoutReady =
    payout.method === 'wallet'
      ? true // the wallet they sign with receives the money unless they paste another address
      : !!payout.bank?.name.trim() && !!payout.bank?.account.trim()

  const sign = async () => {
    setStage('signing')
    setError('')
    if (!live) {
      // Demo: a stand-in for agreeing on Tempo.
      setTimeout(() => dispatch({ type: 'accept', projectId: project.id, roleId: role.id, payout }), 900)
      return
    }
    try {
      // The terms name every person's wallet, the draft version and every role's pay,
      // so this agreement can't be reused for any other draft.
      const hash = await agree(myWallet!, termsFor(project, wallets))
      setTx(hash)
      dispatch({ type: 'accept', projectId: project.id, roleId: role.id, payout: { ...payout, wallet: myWallet }, signature: `tempo:${hash}` })
    } catch (e) {
      setError(friendlyError(e))
      setStage('confirm')
    }
  }

  return (
    <div className="animate-rise">
      <p className="font-display text-lg font-bold">Sign the agreement</p>
      <p className="mt-2 rounded-2xl border border-line bg-card p-4 text-sm leading-relaxed">
        I agree to work as <b>{role.title}</b> on <b>{project.name}</b> for <b>${role.pay}</b>:{' '}
        <b>{role.depositPct}% up front</b>, the rest by milestone as set out in the payment plan, under draft v{project.version}.
      </p>
      <PayoutPicker value={payout} onChange={setPayout} wallet={live ? myWallet : undefined} />
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
      {live && !myWallet ? (
        <div className="mt-5 rounded-2xl bg-accent-soft/60 p-4">
          <p className="mb-3 text-sm">
            You sign with your CrewPay wallet. Create it now with a passkey: Face ID, your fingerprint, your Windows PIN or your phone.
          </p>
          <CreateWalletButton label="Create my wallet" />
        </div>
      ) : blocker ? (
        <p className="mt-5 rounded-2xl bg-warn-soft p-4 text-sm text-warn">{blocker}</p>
      ) : (
        <Button size="lg" className="mt-5 w-full" disabled={!understood || !payoutReady || stage === 'signing'} onClick={sign}>
          {stage === 'signing' ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" /> {live ? 'Confirm with your passkey…' : 'Signing…'}
            </>
          ) : live ? (
            'Sign with my passkey'
          ) : (
            'Connect wallet & sign'
          )}
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {tx && (
        <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs text-muted underline">
          Agreed on Tempo ↗
        </a>
      )}
      {live && myWallet && <p className="mt-3 text-center text-xs text-muted">Paid to your CrewPay wallet {shortAddress(myWallet)}. CrewPay covers the network fee.</p>}
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
  onSend: (amount: number, depositPct: number, note: string) => void
}) {
  const [amount, setAmount] = useState(String(role.pay))
  const [depositPct, setDepositPct] = useState(role.depositPct)
  const [note, setNote] = useState('')
  const value = Number(amount) || 0
  const diff = value - role.pay
  const changed = value !== role.pay || depositPct !== role.depositPct
  const valid = value > 0 && changed && note.trim().length >= 10

  return (
    <div className="animate-rise space-y-4">
      <p className="font-display text-lg font-bold">Make a counter-offer</p>
      <label className="block">
        <Label hint={diff !== 0 ? `${diff > 0 ? '+' : '−'}$${Math.abs(diff)} vs. offer` : undefined}>Your price (USD)</Label>
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
        <Label hint={`$${Math.round((value * depositPct) / 100).toLocaleString('en-US')} before work starts`}>
          Up front: {depositPct}%
        </Label>
        <input
          type="range"
          min={0}
          max={50}
          step={5}
          value={depositPct}
          onChange={(e) => setDepositPct(Number(e.target.value))}
          className="w-full accent-[#ff6a3d]"
        />
        <span className="mt-1 flex justify-between text-xs text-muted">
          <span>0%</span>
          <span>Offered: {role.depositPct}%</span>
          <span>50%</span>
        </span>
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
      <Button className="w-full" disabled={!valid} onClick={() => onSend(value, depositPct, note.trim())}>
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

// How the collaborator wants to receive money. Recorded with their signature and shown to the Lead.
function PayoutPicker({ value, onChange, wallet }: { value: PayoutPreference; onChange: (p: PayoutPreference) => void; wallet?: string }) {
  const bank = value.bank ?? { name: '', account: '', currency: 'NGN' }
  const options = [
    { method: 'wallet' as const, title: 'My CrewPay wallet', sub: 'Instant, in digital dollars' },
    { method: 'bank' as const, title: 'My bank account', sub: 'Local currency · phase 2' },
  ]
  return (
    <div className="mt-4">
      <Label>How you want to be paid</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.method}
            onClick={() => onChange({ ...value, method: o.method, bank: o.method === 'bank' ? bank : value.bank })}
            className={`rounded-2xl border p-3 text-left text-sm transition ${
              value.method === o.method ? 'border-ink bg-card ring-4 ring-ink/5' : 'border-line hover:border-ink/40'
            }`}
          >
            <span className="block font-medium">{o.title}</span>
            <span className="text-xs text-muted">{o.sub}</span>
          </button>
        ))}
      </div>
      {value.method === 'wallet' && wallet ? (
        <p className="mt-2 rounded-2xl bg-ink/5 px-4 py-3 text-sm text-muted">Your pay lands in your CrewPay wallet, ready to withdraw.</p>
      ) : value.method === 'wallet' ? (
        <Input
          className="mt-2 font-mono text-sm"
          value={value.wallet ?? ''}
          onChange={(e) => onChange({ ...value, wallet: e.target.value })}
          placeholder="0x… (blank = the wallet you sign with)"
        />
      ) : (
        <div className="mt-2 grid grid-cols-[1fr_1fr_80px] gap-2">
          <Input value={bank.name} onChange={(e) => onChange({ ...value, bank: { ...bank, name: e.target.value } })} placeholder="Bank" />
          <Input value={bank.account} onChange={(e) => onChange({ ...value, bank: { ...bank, account: e.target.value } })} placeholder="Account no." />
          <select
            value={bank.currency}
            onChange={(e) => onChange({ ...value, bank: { ...bank, currency: e.target.value } })}
            className="h-11 rounded-2xl border border-line bg-card px-3 text-sm"
          >
            {['NGN', 'GHS', 'KES', 'USD'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      <Input
        className="mt-2 text-sm"
        value={value.note ?? ''}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        placeholder="Anything else? e.g. “Send the deposit to my studio account”"
      />
      {value.method === 'bank' && (
        <p className="mt-2 text-xs text-muted">Bank payouts arrive through a licensed partner that converts digital dollars to your currency.</p>
      )}
    </div>
  )
}

// Open roles: anyone with the link applies with a portfolio; the Lead picks one person, who then signs.
function ApplyPanel({
  role,
  portfolio: initialPortfolio,
  onSend,
}: {
  role: Role
  portfolio: string
  onSend: (portfolio: string, note: string, amount?: number) => void
}) {
  const [portfolio, setPortfolio] = useState(initialPortfolio)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState(String(role.pay))
  const value = Number(amount) || 0
  const validUrl = /^https?:\/\/\S+\.\S+/.test(portfolio.trim())
  return (
    <div className="animate-rise space-y-4">
      <div>
        <p className="font-display text-lg font-bold">Apply for this role</p>
        <p className="mt-1 text-sm text-muted">This role is open. Show your work, and the Lead picks who to invite.</p>
      </div>
      <label className="block">
        <Label>Portfolio link</Label>
        <Input id="apply-portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://your-work.com" />
      </label>
      <label className="block">
        <Label>Why you</Label>
        <TextArea id="apply-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Similar work you’ve done, and how you’d approach this." />
      </label>
      <label className="block">
        <Label hint={value !== role.pay ? `Offer is $${role.pay}` : 'Same as the offer'}>Your price (USD)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
          <Input id="apply-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="pl-8 tabular-nums" />
        </div>
      </label>
      <Button
        size="lg"
        variant="accent"
        className="w-full"
        disabled={!validUrl || note.trim().length < 10 || value <= 0}
        onClick={() => onSend(portfolio.trim(), note.trim(), value !== role.pay ? value : undefined)}
      >
        Send application
      </Button>
    </div>
  )
}
