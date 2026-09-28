import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Card, Input, Label, Money, TextArea, cx } from '../components/ui'
import { uid } from '../lib/format'
import { personName, useStore } from '../store'
import type { Project } from '../types'

type DraftMilestone = { id: string; title: string; due: string }
type DraftRole = { id: string; title: string; assignee: string; pay: string; milestones: DraftMilestone[] }

const SEGMENT_COLORS = ['#ff6a3d', '#1d1b16', '#3d7bff', '#1f8a5b', '#a855f7', '#e0a100']

const newRole = (): DraftRole => ({
  id: uid(),
  title: '',
  assignee: '',
  pay: '',
  milestones: [{ id: uid(), title: '', due: '' }],
})

const toHandle = (s: string) => {
  const clean = s.trim().replace(/^@+/, '').toLowerCase()
  return clean ? `@${clean}` : undefined
}

const payOf = (r: DraftRole) => Math.max(0, Number(r.pay) || 0)

export default function CreateProject() {
  const { me, dispatch } = useStore()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [deadline, setDeadline] = useState('')
  const [roles, setRoles] = useState<DraftRole[]>([newRole()])

  const total = roles.reduce((s, r) => s + payOf(r), 0)

  const updateRole = (id: string, patch: Partial<DraftRole>) =>
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const updateMilestone = (roleId: string, mId: string, patch: Partial<DraftMilestone>) =>
    setRoles((rs) =>
      rs.map((r) =>
        r.id === roleId ? { ...r, milestones: r.milestones.map((m) => (m.id === mId ? { ...m, ...patch } : m)) } : r,
      ),
    )

  const checks = [
    { ok: name.trim().length > 0, label: 'Project has a name' },
    { ok: brief.trim().length >= 30, label: 'Brief says what you’re building (30+ characters)' },
    { ok: roles.length > 0 && roles.every((r) => r.title.trim()), label: 'Every role has a title' },
    { ok: roles.every((r) => payOf(r) > 0), label: 'Every role has pay' },
    {
      ok: roles.every((r) => r.milestones.some((m) => m.title.trim())),
      label: 'Every role has at least one milestone',
    },
  ]
  const ready = checks.every((c) => c.ok)

  const submit = () => {
    if (!ready) return
    const project: Project = {
      id: `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${uid().slice(0, 4)}`,
      name: name.trim(),
      brief: brief.trim(),
      deadline: deadline || undefined,
      lead: me,
      version: 1,
      status: 'signing',
      createdAt: new Date().toISOString(),
      roles: roles.map((r) => ({
        id: r.id,
        title: r.title.trim(),
        assignee: toHandle(r.assignee),
        pay: payOf(r),
        response: 'pending',
        milestones: r.milestones
          .filter((m) => m.title.trim())
          .map((m) => ({ id: m.id, title: m.title.trim(), due: m.due || undefined })),
      })),
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
        <p className="mb-2 text-sm font-medium text-accent">New project</p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Build your crew.</h1>
        <p className="mt-3 text-lg text-muted">
          Write the brief, set the pay for each role, and send invites. Nothing is final until everyone signs.
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

          {/* Step 2 — the crew */}
          <Card className="p-6 sm:p-8">
            <StepTitle
              n={2}
              title="The crew"
              sub="One card per role. Pay is a fixed amount, so a raise for one person never cuts anyone else’s."
            />
            <div className="space-y-4">
              {roles.map((r, i) => (
                <div key={r.id} className="animate-rise rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                    <span className="text-sm font-medium text-muted">Role {i + 1}</span>
                    {roles.length > 1 && (
                      <button
                        onClick={() => setRoles((rs) => rs.filter((x) => x.id !== r.id))}
                        className="ml-auto text-sm text-muted hover:text-ink"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr_140px]">
                    <label className="block">
                      <Label>Role</Label>
                      <Input value={r.title} onChange={(e) => updateRole(r.id, { title: e.target.value })} placeholder="Mix engineer" />
                    </label>
                    <label className="block">
                      <Label hint="Blank = open role">Who</Label>
                      <Input
                        value={r.assignee}
                        onChange={(e) => updateRole(r.id, { assignee: e.target.value })}
                        placeholder="@handle"
                      />
                    </label>
                    <label className="block">
                      <Label>Pay (USDC)</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
                        <Input
                          inputMode="decimal"
                          value={r.pay}
                          onChange={(e) => updateRole(r.id, { pay: e.target.value.replace(/[^\d.]/g, '') })}
                          placeholder="300"
                          className="pl-8 tabular-nums"
                        />
                      </div>
                    </label>
                  </div>

                  <div className="mt-4">
                    <Label hint="Pay is released as the Lead approves each one">Milestones</Label>
                    <div className="space-y-2">
                      {r.milestones.map((m, mi) => (
                        <div key={m.id} className="flex gap-2">
                          <Input
                            value={m.title}
                            onChange={(e) => updateMilestone(r.id, m.id, { title: e.target.value })}
                            placeholder={mi === 0 ? 'First draft delivered' : 'Final files delivered'}
                          />
                          <Input
                            type="date"
                            value={m.due}
                            onChange={(e) => updateMilestone(r.id, m.id, { due: e.target.value })}
                            className="w-36 shrink-0 sm:w-40"
                            aria-label="Due date"
                          />
                          {r.milestones.length > 1 && (
                            <button
                              onClick={() =>
                                updateRole(r.id, { milestones: r.milestones.filter((x) => x.id !== m.id) })
                              }
                              className="px-2 text-muted hover:text-ink"
                              aria-label="Remove milestone"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => updateRole(r.id, { milestones: [...r.milestones, { id: uid(), title: '', due: '' }] })}
                      className="mt-2 text-sm font-medium text-muted hover:text-ink"
                    >
                      + Add milestone
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setRoles((rs) => [...rs, newRole()])}>
              + Add a role
            </Button>
          </Card>
        </div>

        {/* Live preview */}
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
                      className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
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
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Once everyone signs, you fund the vault with this amount. Your crew sees the money is there before they start.
              </p>
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
                Send invites
              </Button>
              <p className="mt-3 text-center text-xs text-muted">
                You can still change the draft. Any change asks everyone to sign again.
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
