import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Rules from '../components/Rules'
import { Avatar, Badge, Button, Card, Input, Label, Money, TextArea, cx } from '../components/ui'
import { uid } from '../lib/format'
import { DEFAULT_DEPOSIT, DEFAULT_REVISIONS, schedule } from '../lib/rules'
import { personName, useStore } from '../store'
import type { Project } from '../types'

type DraftMilestone = { id: string; title: string; doneWhen: string; due: string; pct: number; revisions: number }
type DraftRole = { id: string; title: string; assignee: string; pay: string; depositPct: number; milestones: DraftMilestone[] }

const SEGMENT_COLORS = ['#ff6a3d', '#1d1b16', '#3d7bff', '#1f8a5b', '#a855f7', '#e0a100']

const newMilestone = (pct: number): DraftMilestone => ({
  id: uid(),
  title: '',
  doneWhen: '',
  due: '',
  pct,
  revisions: DEFAULT_REVISIONS,
})

const newRole = (): DraftRole => ({
  id: uid(),
  title: '',
  assignee: '',
  pay: '',
  depositPct: DEFAULT_DEPOSIT,
  milestones: [newMilestone(100 - DEFAULT_DEPOSIT)],
})

// Split what's left after the deposit evenly; the last milestone absorbs rounding.
function evenSplit(milestones: DraftMilestone[], depositPct: number): DraftMilestone[] {
  const left = 100 - depositPct
  const each = Math.floor(left / milestones.length)
  return milestones.map((m, i) => ({ ...m, pct: i === milestones.length - 1 ? left - each * (milestones.length - 1) : each }))
}

const toHandle = (s: string) => {
  const clean = s.trim().replace(/^@+/, '').toLowerCase()
  return clean ? `@${clean}` : undefined
}

const payOf = (r: DraftRole) => Math.max(0, Number(r.pay) || 0)
const pctSum = (r: DraftRole) => r.depositPct + r.milestones.reduce((s, m) => s + m.pct, 0)

const fromProject = (p: Project): DraftRole[] =>
  p.roles.map((r) => ({
    id: r.id,
    title: r.title,
    assignee: r.assignee ?? '',
    pay: String(r.pay),
    depositPct: r.depositPct,
    milestones: r.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      doneWhen: m.doneWhen,
      due: m.due ?? '',
      pct: m.pct,
      revisions: m.revisions,
    })),
  }))

// Creates a project, or edits one that's still collecting signatures (`editing`).
export default function CreateProject({ editing }: { editing?: Project }) {
  const { me, dispatch } = useStore()
  const navigate = useNavigate()
  const [name, setName] = useState(editing?.name ?? '')
  const [brief, setBrief] = useState(editing?.brief ?? '')
  const [deadline, setDeadline] = useState(editing?.deadline ?? '')
  const [roles, setRoles] = useState<DraftRole[]>(() => (editing ? fromProject(editing) : [newRole()]))

  const total = roles.reduce((s, r) => s + payOf(r), 0)
  const deposits = roles.reduce((s, r) => s + Math.round((payOf(r) * r.depositPct) / 100), 0)

  const updateRole = (id: string, patch: Partial<DraftRole>) =>
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const updateMilestone = (roleId: string, mId: string, patch: Partial<DraftMilestone>) =>
    setRoles((rs) =>
      rs.map((r) =>
        r.id === roleId ? { ...r, milestones: r.milestones.map((m) => (m.id === mId ? { ...m, ...patch } : m)) } : r,
      ),
    )

  const allMilestones = roles.flatMap((r) => r.milestones)
  const checks = [
    { ok: name.trim().length > 0, label: 'Project has a name' },
    { ok: brief.trim().length >= 30, label: 'Brief says what you’re building (30+ characters)' },
    { ok: roles.length > 0 && roles.every((r) => r.title.trim() && payOf(r) > 0), label: 'Every role has a title and pay' },
    { ok: allMilestones.every((m) => m.title.trim()), label: 'Every milestone has a title' },
    { ok: allMilestones.every((m) => m.doneWhen.trim().length >= 10), label: 'Every milestone says when it’s done' },
    { ok: roles.every((r) => pctSum(r) === 100), label: 'Each payment plan adds up to 100%' },
  ]
  const ready = checks.every((c) => c.ok)

  const toRoles = (): Project['roles'] =>
    roles.map((r) => ({
      id: r.id,
      title: r.title.trim(),
      assignee: toHandle(r.assignee),
      pay: payOf(r),
      depositPct: r.depositPct,
      response: 'pending',
      milestones: r.milestones.map((m) => ({
        id: m.id,
        title: m.title.trim(),
        doneWhen: m.doneWhen.trim(),
        due: m.due || undefined,
        pct: m.pct,
        revisions: m.revisions,
        status: 'working',
        submissions: [],
      })),
    }))

  const submit = () => {
    if (!ready) return
    if (editing) {
      dispatch({
        type: 'editDraft',
        projectId: editing.id,
        draft: { name: name.trim(), brief: brief.trim(), deadline: deadline || undefined, roles: toRoles() },
      })
      navigate(`/p/${editing.id}`)
      return
    }
    const project: Project = {
      id: uid(),
      name: name.trim(),
      brief: brief.trim(),
      deadline: deadline || undefined,
      lead: me,
      version: 1,
      status: 'signing',
      createdAt: new Date().toISOString(),
      payouts: [],
      dms: {},
      roles: toRoles(),
      messages: [
        {
          id: uid(),
          author: 'system',
          at: new Date().toISOString(),
          kind: 'system',
          text: `${personName(me)} posted the brief and sent invites.`,
        },
      ],
    }
    dispatch({ type: 'create', project })
    navigate(`/p/${project.id}?invites=1`)
  }

  return (
    <div className="animate-rise">
      <div className="mb-8 max-w-2xl">
        <p className="mb-2 text-sm font-medium text-accent">{editing ? `Editing draft v${editing.version}` : 'New project'}</p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{editing ? 'Update the deal.' : 'Build your crew.'}</h1>
        <p className="mt-3 text-lg text-muted">
          {editing
            ? 'Change anything below. Saving creates a new version, and everyone signs again. Clear “Who” to reopen a role.'
            : 'Write the brief, set each role’s pay and payment plan, and send invites. Nothing is final until everyone signs.'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Step 1 — the brief */}
          <Card className="p-6 sm:p-8">
            <StepTitle n={1} title="The brief" sub="What you’re building. Your crew reads this before they say yes." />
            <div className="space-y-5">
              <label className="block">
                <Label>Project name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lagos Nights EP" />
              </label>
              <label className="block">
                <Label hint={`${brief.trim().length} characters`}>Brief</Label>
                <TextArea
                  rows={5}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="What’s the project, what’s done already, what you need from each person, and what “finished” looks like."
                />
              </label>
              <label className="block sm:w-1/2">
                <Label hint="Optional">Final deadline</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            </div>
          </Card>

          {/* Step 2 — the crew and how each person gets paid */}
          <Card className="p-6 sm:p-8">
            <StepTitle
              n={2}
              title="The crew"
              sub="One card per role. Pay is fixed, a deposit goes out first, and the rest is paid milestone by milestone."
            />
            <div className="space-y-5">
              {roles.map((r, i) => (
                <RoleEditor
                  key={r.id}
                  r={r}
                  index={i}
                  canRemove={roles.length > 1}
                  onRemove={() => setRoles((rs) => rs.filter((x) => x.id !== r.id))}
                  update={(patch) => updateRole(r.id, patch)}
                  updateMilestone={(mId, patch) => updateMilestone(r.id, mId, patch)}
                />
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setRoles((rs) => [...rs, newRole()])}>
              + Add a role
            </Button>
          </Card>

          <Rules title="The rules your crew signs up to" />
        </div>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-line p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Total budget</p>
              <Money value={total} className="mt-1 block text-4xl font-bold" />
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-ink/5">
                {roles.map((r, i) =>
                  payOf(r) > 0 ? (
                    <div
                      key={r.id}
                      className="h-full transition-all duration-500"
                      style={{ width: `${(payOf(r) / (total || 1)) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="mt-4 space-y-2">
                {roles.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                    <span className={cx('truncate', !r.title && 'text-muted/60')}>{r.title || `Role ${i + 1}`}</span>
                    <Avatar handle={toHandle(r.assignee)} size={20} />
                    <span className="ml-auto tabular-nums text-muted">${payOf(r).toLocaleString('en-US')}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-2xl bg-accent-soft/60 p-3 text-sm">
                <b>${deposits.toLocaleString('en-US')}</b> goes out as deposits the moment you fund the vault.
              </div>
            </div>
            <div className="p-6">
              <ul className="mb-5 space-y-2">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2 text-sm">
                    <span
                      className={cx(
                        'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] transition',
                        c.ok ? 'bg-ok text-white' : 'border border-line',
                      )}
                    >
                      {c.ok && '✓'}
                    </span>
                    <span className={c.ok ? 'text-ink' : 'text-muted'}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" variant="accent" className="w-full" disabled={!ready} onClick={submit}>
                {editing ? `Save as draft v${editing.version + 1}` : 'Send invites'}
              </Button>
              <p className="mt-3 text-center text-xs text-muted">
                Collaborators can counter-offer on pay and deposit. Any change asks everyone to sign again.
              </p>
            </div>
          </Card>
          <div className="mt-4 hidden lg:block">
            <Badge>No fees while we’re in beta</Badge>
          </div>
        </aside>
      </div>
    </div>
  )
}

function RoleEditor({
  r,
  index,
  canRemove,
  onRemove,
  update,
  updateMilestone,
}: {
  r: DraftRole
  index: number
  canRemove: boolean
  onRemove: () => void
  update: (patch: Partial<DraftRole>) => void
  updateMilestone: (mId: string, patch: Partial<DraftMilestone>) => void
}) {
  const sum = pctSum(r)
  const lines = schedule({ pay: payOf(r), depositPct: r.depositPct, milestones: r.milestones.map((m) => ({ ...m, status: 'working', submissions: [] })) })
  const amountOf = (key: string) => lines.find((l) => l.key === key)?.amount ?? 0

  return (
    <div className="animate-rise rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} />
        <span className="text-sm font-medium text-muted">Role {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="ml-auto text-sm text-muted hover:text-ink">
            Remove
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr_140px]">
        <label className="block">
          <Label>Role</Label>
          <Input value={r.title} onChange={(e) => update({ title: e.target.value })} placeholder="Mix engineer" />
        </label>
        <label className="block">
          <Label hint="Blank = open role">Who</Label>
          <Input value={r.assignee} onChange={(e) => update({ assignee: e.target.value })} placeholder="@handle" />
        </label>
        <label className="block">
          <Label>Pay (USDC)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
            <Input
              inputMode="decimal"
              value={r.pay}
              onChange={(e) => update({ pay: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="300"
              className="pl-8 tabular-nums"
            />
          </div>
        </label>
      </div>

      {/* Deposit */}
      <div className="mt-5 rounded-2xl border border-accent/30 bg-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">
            <span className="mr-1 text-accent">↑</span> Upfront deposit · {r.depositPct}%
          </p>
          <p className="text-sm tabular-nums text-muted">${amountOf('deposit').toLocaleString('en-US')}</p>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          step={5}
          value={r.depositPct}
          onChange={(e) => {
            const depositPct = Number(e.target.value)
            update({ depositPct, milestones: evenSplit(r.milestones, depositPct) })
          }}
          className="mt-2 w-full accent-[#ff6a3d]"
          aria-label="Deposit percentage"
        />
        <p className="text-xs text-muted">Paid first, the moment you fund the vault. It shows you’re serious before any work starts.</p>
      </div>

      {/* Milestones */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium">Milestones</p>
          <p className={cx('text-xs font-medium', sum === 100 ? 'text-ok' : 'text-warn')}>
            Plan adds up to {sum}%{sum === 100 ? ' ✓' : ' · needs 100%'}
          </p>
        </div>
        <div className="space-y-3">
          {r.milestones.map((m, mi) => (
            <div key={m.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/5 text-xs font-semibold">{mi + 1}</span>
                <Input
                  value={m.title}
                  onChange={(e) => updateMilestone(m.id, { title: e.target.value })}
                  placeholder={mi === 0 ? 'First draft delivered' : 'Final files delivered'}
                  className="h-10"
                />
                {r.milestones.length > 1 && (
                  <button
                    onClick={() => {
                      const rest = r.milestones.filter((x) => x.id !== m.id)
                      update({ milestones: evenSplit(rest, r.depositPct) })
                    }}
                    className="px-2 text-muted hover:text-ink"
                    aria-label="Remove milestone"
                  >
                    ×
                  </button>
                )}
              </div>
              <label className="mt-3 block">
                <Label hint="Reviews are judged against this">Done when…</Label>
                <TextArea
                  rows={2}
                  value={m.doneWhen}
                  onChange={(e) => updateMilestone(m.id, { doneWhen: e.target.value })}
                  placeholder="4 mastered WAVs at -14 LUFS, labelled, with one round of notes included."
                  className="text-sm"
                />
              </label>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <label className="block">
                  <Label>Share</Label>
                  <div className="relative">
                    <Input
                      inputMode="numeric"
                      value={String(m.pct)}
                      onChange={(e) => updateMilestone(m.id, { pct: Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                      className="h-10 pr-7 tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
                  </div>
                  <span className="mt-1 block text-xs tabular-nums text-muted">${amountOf(m.id).toLocaleString('en-US')}</span>
                </label>
                <label className="block">
                  <Label>Due</Label>
                  <Input type="date" value={m.due} onChange={(e) => updateMilestone(m.id, { due: e.target.value })} className="h-10 px-3 text-sm" />
                </label>
                <label className="block">
                  <Label>Revisions</Label>
                  <select
                    value={m.revisions}
                    onChange={(e) => updateMilestone(m.id, { revisions: Number(e.target.value) })}
                    className="h-10 w-full rounded-2xl border border-line bg-card px-3 text-sm"
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} round{n === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4">
          <button
            onClick={() => update({ milestones: evenSplit([...r.milestones, newMilestone(0)], r.depositPct) })}
            className="text-sm font-medium text-muted hover:text-ink"
          >
            + Add milestone
          </button>
          {sum !== 100 && (
            <button onClick={() => update({ milestones: evenSplit(r.milestones, r.depositPct) })} className="text-sm font-medium text-accent">
              Split the rest evenly
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6 flex gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">
        {n}
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
    </div>
  )
}
