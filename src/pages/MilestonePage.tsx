import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Rules from '../components/Rules'
import { Avatar, Badge, Button, Card, Label, Money, TextArea, cx } from '../components/ui'
import { shortDate, timeAgo } from '../lib/format'
import {
  AUTO_APPROVE_DAYS,
  DAY,
  DISPUTE_DAYS,
  amountFor,
  autoApproveAt,
  canReclaim,
  collaboratorCanDispute,
  leadCanDispute,
  reclaimAt,
  revisionsLeft,
  revisionsUsed,
} from '../lib/rules'
import { milestoneStatus } from '../lib/status'
import { personName, useStore } from '../store'
import { mediaKind, readFile, sizeLabel } from '../lib/files'
import { REVIEWER, type FileRef, type Milestone, type Project, type Role, type Submission } from '../types'

export default function MilestonePage() {
  const { projectId, roleId, milestoneId } = useParams()
  const { projects, now } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const role = project?.roles.find((r) => r.id === roleId)
  const m = role?.milestones.find((x) => x.id === milestoneId)

  if (!project || !role || !m)
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Milestone not found.</h1>
        <Link to="/" className="mt-6 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    )

  const s = milestoneStatus(project, m, now)
  const amount = amountFor(role, m.id)

  return (
    <div className="animate-rise">
      <Link to={`/p/${project.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        ← {project.name}
      </Link>

      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Avatar handle={role.assignee} size={22} />
          {role.title} · {role.assignee ? personName(role.assignee) : 'Open'}
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{m.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          {m.due && <Badge>Due {shortDate(m.due)}</Badge>}
          <Badge>
            Revisions used {revisionsUsed(m)} of {m.revisions}
          </Badge>
        </div>
      </div>

      <Stepper m={m} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔒</span>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Done when</p>
            </div>
            <p className="mt-2 text-lg leading-relaxed">{m.doneWhen}</p>
            <p className="mt-3 text-xs text-muted">
              Agreed by {personName(project.lead)} and {role.assignee ? personName(role.assignee) : 'the collaborator'} when they signed
              draft v{project.version}. Reviews are judged against this.
            </p>
          </Card>

          {(m.status === 'disputed' || m.status === 'resolved') && m.dispute && (
            <DisputePanel project={project} role={role} m={m} amount={amount} />
          )}

          <div>
            <h2 className="mb-3 font-display text-xl font-bold">History</h2>
            {m.submissions.length === 0 ? (
              <Card className="p-6 text-sm text-muted">Nothing submitted yet.</Card>
            ) : (
              <ol className="space-y-4">
                {m.submissions.map((sub, i) => (
                  <SubmissionItem key={sub.id} project={project} role={role} m={m} sub={sub} round={i + 1} />
                ))}
              </ol>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-line p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">This milestone pays</p>
              <Money value={amount} className="mt-1 block text-4xl font-bold" />
              <p className="mt-1 text-sm text-muted">Held in the vault until it’s approved.</p>
            </div>
            <div className="p-6">
              <ActionPanel project={project} role={role} m={m} amount={amount} />
            </div>
          </Card>
          <Rules />
        </aside>
      </div>
    </div>
  )
}

// ---------- progress ----------

function Stepper({ m }: { m: Milestone }) {
  const disputed = m.status === 'disputed' || m.status === 'resolved'
  const steps = disputed
    ? ['Working', 'Submitted', 'Dispute', 'Ruling']
    : ['Working', 'Submitted', 'Reviewed', 'Paid']
  const at =
    m.status === 'working'
      ? 0
      : m.status === 'submitted'
        ? 1
        : m.status === 'disputed'
          ? 2
          : m.status === 'reclaimed'
            ? 0
            : 3
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((label, i) => (
        <div key={label} className="flex shrink-0 items-center gap-2">
          <span
            className={cx(
              'flex h-8 items-center gap-2 rounded-full px-3 text-sm font-medium transition',
              i < at && 'bg-ok-soft text-ok',
              i === at && (disputed && i >= 2 && m.status === 'disputed' ? 'bg-warn-soft text-warn' : 'bg-ink text-paper'),
              i > at && 'bg-ink/5 text-muted',
            )}
          >
            {i < at || (i === at && m.status !== 'working' && i === 3) ? '✓' : i + 1} {label}
          </span>
          {i < steps.length - 1 && <span className={cx('h-px w-6', i < at ? 'bg-ok' : 'bg-line')} />}
        </div>
      ))}
    </div>
  )
}

// ---------- history ----------

function SubmissionItem({
  project,
  role,
  m,
  sub,
  round,
}: {
  project: Project
  role: Role
  m: Milestone
  sub: Submission
  round: number
}) {
  return (
    <li className="space-y-3">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Avatar handle={role.assignee} size={26} />
          <span className="text-sm font-medium">{personName(role.assignee!)}</span>
          <span className="text-xs text-muted">
            submitted round {round} · {timeAgo(sub.at)}
          </span>
        </div>
        <p className="mt-3 leading-relaxed">{sub.note}</p>
        {sub.files.length > 0 && (
          <div className="mt-4 space-y-2">
            {sub.files.map((f, i) => (
              <FileItem key={i} f={f} locked={f.kind === 'final' && m.status !== 'paid'} />
            ))}
          </div>
        )}
      </Card>
      {sub.review && (
        <div
          className={cx(
            'ml-6 rounded-2xl border p-4 text-sm',
            sub.review.kind === 'changes' ? 'border-warn/30 bg-warn-soft/60' : 'border-ok/30 bg-ok-soft/60',
          )}
        >
          <p className="font-medium">
            {sub.review.kind === 'approved' && `${personName(project.lead)} approved · paid`}
            {sub.review.kind === 'auto-approved' && `Auto-approved after ${AUTO_APPROVE_DAYS} days with no response · paid`}
            {sub.review.kind === 'changes' && `${personName(project.lead)} asked for changes`}
            <span className="ml-2 text-xs font-normal text-muted">{timeAgo(sub.review.at)}</span>
          </p>
          {sub.review.note && <p className="mt-1 leading-relaxed">{sub.review.note}</p>}
        </div>
      )}
    </li>
  )
}

// Previews play or show right here so the Lead can judge the work against "Done when".
// Finals stay locked until paid, then become a download.
function FileItem({ f, locked }: { f: FileRef; locked: boolean }) {
  const media = mediaKind(f.mime)
  const open = !locked && f.url
  return (
    <div
      className={cx('overflow-hidden rounded-xl border text-sm', locked ? 'border-dashed border-line text-muted' : 'border-line bg-paper')}
      title={locked ? 'Unlocks when this milestone is paid' : undefined}
    >
      {open && f.kind === 'preview' && media === 'audio' && <audio controls src={f.url} className="w-full px-2 pt-2" />}
      {open && f.kind === 'preview' && media === 'video' && <video controls src={f.url} className="max-h-72 w-full bg-ink" />}
      {open && f.kind === 'preview' && media === 'image' && <img src={f.url} alt={f.name} className="max-h-72 w-full object-contain" />}
      <div className="flex items-center gap-2 px-3 py-2">
        <span>{locked ? '🔒' : f.kind === 'final' ? '📦' : media === 'audio' ? '🎧' : '👁'}</span>
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        <span className="text-xs text-muted">{sizeLabel(f.size)}</span>
        {open && f.kind === 'final' ? (
          <a href={f.url} download={f.name} className="text-xs font-medium text-accent hover:underline">
            Download
          </a>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{f.kind}</span>
        )}
      </div>
      {!f.url && !locked && <p className="px-3 pb-2 text-xs text-muted">Too large to keep in the demo. Saved when storage is connected.</p>}
    </div>
  )
}

// ---------- actions ----------

function Countdown({ to, now }: { to: number; now: number }) {
  const ms = Math.max(0, to - now)
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / 3_600_000)
  return (
    <span className="tabular-nums">
      {d}d {h}h
    </span>
  )
}

function ActionPanel({ project, role, m, amount }: { project: Project; role: Role; m: Milestone; amount: number }) {
  const { me, now, dispatch } = useStore()
  const isLead = me === project.lead
  const isCollab = me === role.assignee
  const target = { projectId: project.id, roleId: role.id, milestoneId: m.id }

  if (!project.fundedAt) return <p className="text-sm text-muted">Work starts once everyone signs and the vault is funded.</p>

  if (m.status === 'paid') {
    const how =
      role.payout?.method === 'bank'
        ? `sent to ${role.payout.bank?.name} ${role.payout.bank?.account} in ${role.payout.bank?.currency}`
        : `sent as USDC to ${role.payout?.wallet ?? 'their wallet'}`
    return (
      <Outcome tone="ok" title={`Paid $${amount.toLocaleString('en-US')}`} body={`The vault released this payment, ${how}. Final files are unlocked.`} />
    )
  }
  if (m.status === 'reclaimed')
    return <Outcome tone="neutral" title="Returned to the Lead" body="The deadline passed with nothing submitted, so this money went back to the Lead." />
  if (m.status === 'resolved')
    return <Outcome tone="neutral" title="Settled by CrewPay review" body="The ruling is final. See the dispute above for how the money was split." />
  if (m.status === 'disputed')
    return (
      <p className="text-sm leading-relaxed text-muted">
        This milestone is in dispute. The money stays locked in the vault until CrewPay review rules. Add your side of the story in the
        dispute panel.
      </p>
    )

  // Submitted: the Lead reviews.
  if (m.status === 'submitted') {
    const auto = autoApproveAt(m)!
    const deadline = (
      <div className="mb-5 rounded-2xl bg-paper p-4 text-sm">
        <p className="text-muted">Auto-approves in</p>
        <p className="font-display text-2xl font-bold">
          <Countdown to={auto} now={now} />
        </p>
        <p className="mt-1 text-xs text-muted">If {personName(project.lead)} doesn’t respond, the vault pays {personName(role.assignee!)} automatically.</p>
      </div>
    )
    if (!isLead)
      return (
        <>
          {deadline}
          <p className="text-sm text-muted">Waiting for {personName(project.lead)} to review.</p>
        </>
      )
    return (
      <>
        {deadline}
        <ReviewForm
          m={m}
          amount={amount}
          onApprove={() => dispatch({ type: 'review', kind: 'approved', note: '', ...target })}
          onChanges={(note) => dispatch({ type: 'review', kind: 'changes', note, ...target })}
          onDispute={(reason) => dispatch({ type: 'openDispute', reason, ...target })}
        />
      </>
    )
  }

  // Working (nothing submitted yet, or changes requested).
  if (isCollab)
    return (
      <SubmitForm
        m={m}
        canDispute={collaboratorCanDispute(m)}
        onSubmit={(note, files) => dispatch({ type: 'submit', note, files, ...target })}
        onDispute={(reason) => dispatch({ type: 'openDispute', reason, ...target })}
      />
    )

  if (isLead) {
    const at = reclaimAt(m)
    if (canReclaim(m, now))
      return (
        <div>
          <p className="text-sm leading-relaxed">
            The deadline passed more than 7 days ago and {personName(role.assignee!)} hasn’t submitted anything. You can take this
            milestone’s money back.
          </p>
          <Button variant="outline" className="mt-4 w-full" onClick={() => dispatch({ type: 'reclaim', ...target })}>
            Reclaim ${amount.toLocaleString('en-US')}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">Tip: message them in the group chat first.</p>
        </div>
      )
    return (
      <p className="text-sm leading-relaxed text-muted">
        {m.submissions.length
          ? `You asked for changes. Waiting for ${personName(role.assignee!)} to resubmit.`
          : `Waiting for ${personName(role.assignee!)} to submit.`}
        {at && m.submissions.length === 0 && ` If nothing arrives by ${shortDate(new Date(at).toISOString())}, you can reclaim this money.`}
      </p>
    )
  }

  return <p className="text-sm text-muted">Only {personName(role.assignee!)} and {personName(project.lead)} can act on this milestone.</p>
}

function ReviewForm({
  m,
  amount,
  onApprove,
  onChanges,
  onDispute,
}: {
  m: Milestone
  amount: number
  onApprove: () => void
  onChanges: (note: string) => void
  onDispute: (reason: string) => void
}) {
  const [mode, setMode] = useState<'none' | 'changes' | 'dispute'>('none')
  const [note, setNote] = useState('')
  const left = revisionsLeft(m)

  if (mode !== 'none')
    return (
      <div className="animate-rise space-y-3">
        <p className="font-display text-lg font-bold">{mode === 'changes' ? 'Ask for changes' : 'Open a dispute'}</p>
        <p className="text-sm text-muted">
          {mode === 'changes'
            ? `Say exactly what doesn’t meet the “Done when”. This uses revision round ${revisionsUsed(m) + 1} of ${m.revisions}.`
            : 'You’ve used every revision round. Explain why the work doesn’t meet the “Done when”. CrewPay review will decide.'}
        </p>
        <TextArea
          autoFocus
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === 'changes' ? 'The delivery page is missing the zone price table.' : 'What’s missing, measured against the “Done when”.'}
        />
        <Button className="w-full" disabled={note.trim().length < 10} onClick={() => (mode === 'changes' ? onChanges(note.trim()) : onDispute(note.trim()))}>
          {mode === 'changes' ? 'Send change request' : 'Open dispute'}
        </Button>
        <button onClick={() => setMode('none')} className="w-full text-center text-sm text-muted hover:text-ink">
          Back
        </button>
      </div>
    )

  return (
    <div className="space-y-2">
      <Button size="lg" variant="accent" className="w-full" onClick={onApprove}>
        Approve & release ${amount.toLocaleString('en-US')}
      </Button>
      {left > 0 ? (
        <Button variant="outline" className="w-full" onClick={() => setMode('changes')}>
          Ask for changes · {left} round{left === 1 ? '' : 's'} left
        </Button>
      ) : (
        leadCanDispute(m) && (
          <Button variant="outline" className="w-full" onClick={() => setMode('dispute')}>
            Open a dispute
          </Button>
        )
      )}
      <p className="pt-1 text-center text-xs text-muted">Check the work against the “Done when”, not personal taste.</p>
    </div>
  )
}

function SubmitForm({
  m,
  canDispute,
  onSubmit,
  onDispute,
}: {
  m: Milestone
  canDispute: boolean
  onSubmit: (note: string, files: FileRef[]) => void
  onDispute: (reason: string) => void
}) {
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<FileRef[]>([])
  const [meets, setMeets] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const lastReview = m.submissions[m.submissions.length - 1]?.review

  if (disputing)
    return (
      <div className="animate-rise space-y-3">
        <p className="font-display text-lg font-bold">Open a dispute</p>
        <p className="text-sm text-muted">
          You think the work already meets the “Done when” and the last change request was unfair. Say why. The money stays locked until
          CrewPay review rules.
        </p>
        <TextArea autoFocus rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the work meets what we agreed." />
        <Button className="w-full" disabled={note.trim().length < 10} onClick={() => onDispute(note.trim())}>
          Open dispute
        </Button>
        <button onClick={() => setDisputing(false)} className="w-full text-center text-sm text-muted hover:text-ink">
          Back
        </button>
      </div>
    )

  return (
    <div className="space-y-4">
      {lastReview?.kind === 'changes' && (
        <div className="rounded-2xl bg-warn-soft p-4 text-sm text-warn">
          <b>Changes requested:</b> {lastReview.note}
        </div>
      )}
      <p className="font-display text-lg font-bold">{m.submissions.length ? 'Resubmit your work' : 'Submit your work'}</p>
      <label className="block">
        <Label>What you’re handing in</Label>
        <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What’s done, where to find it, anything to check." />
      </label>
      <FilePicker files={files} setFiles={setFiles} />
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={meets} onChange={(e) => setMeets(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff6a3d]" />
        <span>
          This meets the “Done when”: <span className="text-muted">{m.doneWhen}</span>
        </span>
      </label>
      <Button size="lg" variant="accent" className="w-full" disabled={!meets || note.trim().length < 5} onClick={() => onSubmit(note.trim(), files)}>
        Submit for review
      </Button>
      <p className="text-center text-xs text-muted">The Lead has {AUTO_APPROVE_DAYS} days to respond, or it pays out automatically.</p>
      {canDispute && (
        <button onClick={() => setDisputing(true)} className="w-full text-center text-sm font-medium text-muted underline underline-offset-4 hover:text-ink">
          Disagree with the change request? Open a dispute
        </button>
      )}
    </div>
  )
}

function FilePicker({ files, setFiles }: { files: FileRef[]; setFiles: (f: FileRef[]) => void }) {
  const preview = useRef<HTMLInputElement>(null)
  const final = useRef<HTMLInputElement>(null)
  const add = async (list: FileList | null, kind: FileRef['kind']) => {
    if (!list) return
    const read = await Promise.all([...list].map((f) => readFile(f, f.name)))
    setFiles([...files, ...read.map((r) => ({ ...r, kind }))])
  }
  return (
    <div>
      <Label hint="Finals unlock when you’re paid">Files</Label>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => preview.current?.click()} className="rounded-2xl border border-dashed border-line p-3 text-left text-sm hover:border-ink/40">
          <span className="block font-medium">👁 Add preview</span>
          <span className="text-xs text-muted">Lead can play or view it now</span>
        </button>
        <button onClick={() => final.current?.click()} className="rounded-2xl border border-dashed border-line p-3 text-left text-sm hover:border-ink/40">
          <span className="block font-medium">🔒 Add final</span>
          <span className="text-xs text-muted">Locked until paid</span>
        </button>
      </div>
      <input ref={preview} type="file" multiple hidden onChange={(e) => (add(e.target.files, 'preview'), (e.target.value = ''))} />
      <input ref={final} type="file" multiple hidden onChange={(e) => (add(e.target.files, 'final'), (e.target.value = ''))} />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span>{f.kind === 'final' ? '🔒' : '👁'}</span>
              <span className="truncate">{f.name}</span>
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-auto text-muted hover:text-ink" aria-label="Remove file">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Outcome({ tone, title, body }: { tone: 'ok' | 'neutral'; title: string; body: string }) {
  return (
    <div className="text-center">
      <span className={cx('mx-auto grid h-12 w-12 place-items-center rounded-full text-xl', tone === 'ok' ? 'bg-ok text-white' : 'bg-ink/10')}>
        {tone === 'ok' ? '✓' : '⚖'}
      </span>
      <p className="mt-3 font-display text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  )
}

// ---------- dispute ----------

function DisputePanel({ project, role, m, amount }: { project: Project; role: Role; m: Milestone; amount: number }) {
  const { me, now, dispatch } = useStore()
  const d = m.dispute!
  const target = { projectId: project.id, roleId: role.id, milestoneId: m.id }
  const party = me === project.lead || me === role.assignee
  const caseClosesAt = new Date(d.at).getTime() + DISPUTE_DAYS * DAY
  const [text, setText] = useState('')
  const sides = [
    { who: role.assignee!, label: `${role.title}’s side` },
    { who: project.lead, label: 'Lead’s side' },
  ]
  const chatCount = project.messages.filter((x) => x.kind !== 'system').length

  return (
    <Card className="overflow-hidden border-warn/40">
      <div className="bg-warn-soft/60 p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-warn">{d.ruling ? 'Dispute settled' : 'Dispute open'}</p>
        <p className="mt-1 font-display text-2xl font-bold">
          ${amount.toLocaleString('en-US')} is locked until this is decided
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          Opened by <b>{personName(d.openedBy)}</b> {timeAgo(d.at)}: “{d.reason}”
        </p>
      </div>

      <ol className="grid gap-px bg-line sm:grid-cols-4">
        {[
          ['Opened', 'Money frozen in the vault'],
          [`Both sides speak`, d.ruling ? 'Closed' : now < caseClosesAt ? `Closes in ${Math.ceil((caseClosesAt - now) / DAY)}d` : 'Closed'],
          ['Review', 'Done when, work, group chat'],
          ['Ruling', 'Money split, final'],
        ].map(([t, sub], i) => {
          const step = d.ruling ? 4 : now < caseClosesAt ? 1 : 2
          return (
            <li key={t} className={cx('bg-card p-4', i <= step && 'text-ink', i > step && 'text-muted')}>
              <p className="text-xs font-semibold">
                {i < step || d.ruling ? '✓' : i + 1} · {t}
              </p>
              <p className="mt-1 text-xs text-muted">{sub}</p>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {sides.map(({ who, label }) => {
          const said = d.statements.filter((s) => s.by === who)
          return (
            <div key={who} className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex items-center gap-2">
                <Avatar handle={who} size={24} />
                <p className="text-sm font-medium">{label}</p>
              </div>
              {said.length === 0 ? (
                <p className="text-sm text-muted">No statement yet.</p>
              ) : (
                <ul className="space-y-3">
                  {said.map((s, i) => (
                    <li key={i} className="text-sm leading-relaxed">
                      {s.text}
                      <span className="mt-0.5 block text-xs text-muted">{timeAgo(s.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {!d.ruling && party && (
        <div className="border-t border-line p-6">
          <Label hint="Be specific. Point to the “Done when” and the chat.">Add to your side</Label>
          <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your side of what happened." />
          <Button
            className="mt-3"
            disabled={text.trim().length < 10}
            onClick={() => {
              dispatch({ type: 'statement', text: text.trim(), ...target })
              setText('')
            }}
          >
            Add statement
          </Button>
        </div>
      )}

      <div className="border-t border-line p-6">
        <p className="text-sm font-medium">Evidence the reviewer sees</p>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-xl bg-paper px-3 py-2">🔒 The signed “Done when”</li>
          <li className="rounded-xl bg-paper px-3 py-2">📎 {m.submissions.length} submission{m.submissions.length === 1 ? '' : 's'} + reviews</li>
          <li className="rounded-xl bg-paper px-3 py-2">
            💬{' '}
            <Link to={`/p/${project.id}`} className="underline underline-offset-2">
              Group chat
            </Link>{' '}
            ({chatCount} messages)
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">Private DMs are never used as evidence. Agree on things in the group chat.</p>
      </div>

      {d.ruling ? (
        <RulingResult amount={amount} pct={d.ruling.collaboratorPct} note={d.ruling.note} project={project} role={role} />
      ) : me === REVIEWER ? (
        <RulingForm amount={amount} project={project} role={role} onRule={(pct, note) => dispatch({ type: 'rule', collaboratorPct: pct, note, ...target })} />
      ) : null}
    </Card>
  )
}

function Split({ amount, pct, project, role }: { amount: number; pct: number; project: Project; role: Role }) {
  const toCollab = Math.round(amount * pct) / 100
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span>
          <b>${toCollab.toLocaleString('en-US')}</b> to {personName(role.assignee!)} ({pct}%)
        </span>
        <span>
          <b>${(Math.round((amount - toCollab) * 100) / 100).toLocaleString('en-US')}</b> back to {personName(project.lead)}
        </span>
      </div>
    </div>
  )
}

function RulingForm({
  amount,
  project,
  role,
  onRule,
}: {
  amount: number
  project: Project
  role: Role
  onRule: (pct: number, note: string) => void
}) {
  const [pct, setPct] = useState(50)
  const [note, setNote] = useState('')
  return (
    <div className="border-t border-line bg-paper/60 p-6">
      <p className="font-display text-lg font-bold">Your ruling</p>
      <p className="mt-1 text-sm text-muted">You’re viewing as CrewPay review. Decide how much of the work met the “Done when”.</p>
      <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-4 w-full accent-[#ff6a3d]" />
      <Split amount={amount} pct={pct} project={project} role={role} />
      <TextArea className="mt-4" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reasoning both sides will read." />
      <Button className="mt-3 w-full" disabled={note.trim().length < 10} onClick={() => onRule(pct, note.trim())}>
        Issue final ruling
      </Button>
    </div>
  )
}

function RulingResult({ amount, pct, note, project, role }: { amount: number; pct: number; note: string; project: Project; role: Role }) {
  return (
    <div className="border-t border-line p-6">
      <p className="font-display text-lg font-bold">Ruling</p>
      <p className="mt-1 mb-4 text-sm leading-relaxed">“{note}”</p>
      <Split amount={amount} pct={pct} project={project} role={role} />
      <p className="mt-3 text-xs text-muted">Final. Paid out from the vault.</p>
    </div>
  )
}
