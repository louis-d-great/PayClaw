import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card, Input, Label, TextArea } from '../components/ui'
import { shortDate } from '../lib/format'
import { history, reputation } from '../lib/reputation'
import { projectStatus } from '../lib/status'
import { personName, useStore } from '../store'
import type { Profile } from '../types'

export default function ProfilePage() {
  const { handle: raw } = useParams()
  const { projects, profiles, me } = useStore()
  const handle = `@${raw}`
  const profile: Profile = profiles[handle] ?? { handle, name: personName(handle), bio: '', skills: [] }
  const rep = reputation(projects, handle)
  const work = history(projects, handle)
  const [editing, setEditing] = useState(false)

  return (
    <div className="animate-rise mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-start gap-5">
        <Avatar handle={handle} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-bold tracking-tight">{profile.name}</h1>
          <p className="text-muted">{handle}</p>
          {profile.bio && <p className="mt-3 max-w-xl leading-relaxed">{profile.bio}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {profile.skills.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
            {profile.portfolio && (
              <a href={profile.portfolio} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent underline underline-offset-2">
                Portfolio ↗
              </a>
            )}
          </div>
        </div>
        {me === handle && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        )}
      </div>

      {editing && <EditProfile profile={profile} onDone={() => setEditing(false)} />}

      <h2 className="mb-1 font-display text-xl font-bold">Track record</h2>
      <p className="mb-4 text-sm text-muted">Counted from signed agreements and vault payouts. Nobody can edit these numbers, including {profile.name}.</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <Stat label="Earned through CrewPay" value={`$${rep.earned.toLocaleString('en-US')}`} />
        <Stat label="Milestones delivered" value={String(rep.delivered)} />
        <Stat label="Delivered on time" value={rep.onTimePct === undefined ? '—' : `${rep.onTimePct}%`} />
        <Stat
          label="Disputes"
          value={rep.disputes ? `${rep.disputes}` : '0'}
          sub={rep.disputesDecided ? `${rep.disputesWon} of ${rep.disputesDecided} ruled mostly in their favour` : rep.disputes ? 'Awaiting ruling' : undefined}
        />
      </div>
      <div className="mb-10 grid gap-3 sm:grid-cols-4">
        <Stat label="Missed deadlines" value={String(rep.missed)} tone={rep.missed ? 'warn' : undefined} />
        <Stat label="Projects led" value={String(rep.led)} />
        <Stat label="Average review time (as Lead)" value={rep.avgReviewHours === undefined ? '—' : rep.avgReviewHours < 48 ? `${rep.avgReviewHours}h` : `${Math.round(rep.avgReviewHours / 24)}d`} />
        <Stat label="Reviews left to auto-approve" value={String(rep.leadSilent)} tone={rep.leadSilent ? 'warn' : undefined} />
      </div>

      <h2 className="mb-3 font-display text-xl font-bold">Work receipts</h2>
      {work.length === 0 ? (
        <Card className="p-6 text-sm text-muted">No signed work yet.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {work.map(({ p, r, paid }) => {
            const s = projectStatus(p)
            return (
              <Link key={p.id + r.id} to={`/r/${p.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-ink/[.02]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted">
                    {r.title} · led by {personName(p.lead)}
                    {p.fundedAt && ` · since ${shortDate(p.fundedAt.slice(0, 10))}`}
                  </p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="w-28 text-right tabular-nums">
                  <b>${paid.toLocaleString('en-US')}</b>
                  <span className="text-sm text-muted"> / ${r.pay.toLocaleString('en-US')}</span>
                </span>
              </Link>
            )
          })}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  )
}

function EditProfile({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const [skills, setSkills] = useState(profile.skills.join(', '))
  const [portfolio, setPortfolio] = useState(profile.portfolio ?? '')
  return (
    <Card className="animate-rise mb-10 space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label>Name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <Label>Portfolio link</Label>
          <Input id="profile-portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://" />
        </label>
      </div>
      <label className="block">
        <Label>Bio</Label>
        <TextArea id="profile-bio" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="block">
        <Label hint="Comma separated">Skills</Label>
        <Input id="profile-skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            dispatch({
              type: 'updateProfile',
              profile: {
                handle: profile.handle,
                name: name.trim() || profile.name,
                bio: bio.trim(),
                skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
                portfolio: portfolio.trim() || undefined,
              },
            })
            onDone()
          }}
        >
          Save profile
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
