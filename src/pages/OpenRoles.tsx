import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { Badge, Button, Card, Input, Money } from '../components/ui'
import { shortDate, timeAgo } from '../lib/format'
import { supabase } from '../lib/supabase'
import { personName, useStoreMaybe } from '../store'

// The public Open roles board: paid roles on real CrewPay projects that their Lead chose to
// list. Anyone can browse it, signed in or not; applying opens the role's invite page.

type Listing = {
  project_id: string
  role_id: string
  listed_at: string
  project: string
  brief: string
  deadline: string | null
  lead: { handle: string; name: string }
  title: string
  pay: number
  deposit_pct: number
  applicants: number
  milestones: { title: string; done_when: string; pct: number; due: string | null }[]
}

function useListings() {
  const store = useStoreMaybe()
  const demo = store?.mode === 'demo'
  const [live, setLive] = useState<Listing[] | undefined>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (demo || !supabase) return
    supabase.rpc('open_roles').then(({ data, error }) => {
      if (error) setError(error.message)
      else setLive(((data as Listing[]) ?? []).map((l) => ({ ...l, pay: Number(l.pay) })))
    })
  }, [demo])
  const demoListings = useMemo<Listing[]>(() => {
    if (!demo || !store) return []
    return store.projects.flatMap((p) =>
      p.status === 'signing' || p.status === 'ready'
        ? p.roles
            .filter((r) => !r.assignee)
            .map((r) => ({
              project_id: p.id,
              role_id: r.id,
              listed_at: p.createdAt,
              project: p.name,
              brief: p.brief,
              deadline: p.deadline ?? null,
              lead: { handle: p.lead.replace(/^@/, ''), name: personName(p.lead) },
              title: r.title,
              pay: r.pay,
              deposit_pct: r.depositPct,
              applicants: r.applicants?.length ?? 0,
              milestones: r.milestones.map((m) => ({ title: m.title, done_when: m.doneWhen, pct: m.pct, due: m.due ?? null })),
            }))
        : [],
    )
  }, [demo, store])
  return { listings: demo ? demoListings : live, error, signedIn: !!store }
}

export default function OpenRoles() {
  const { listings, error, signedIn } = useListings()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'new' | 'pay'>('new')
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const list = (listings ?? []).filter((l) => {
      const text = `${l.title} ${l.project} ${l.brief} ${l.lead.name} ${l.milestones.map((m) => m.title + ' ' + m.done_when).join(' ')}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
    return [...list].sort((a, b) => (sort === 'pay' ? b.pay - a.pay : b.listed_at.localeCompare(a.listed_at)))
  }, [listings, q, sort])

  return (
    <div className="animate-rise">
      <div className="mb-8 max-w-3xl">
        <p className="mb-2 text-sm font-medium text-accent">Open roles</p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Paid work, pay locked in.</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Roles on real CrewPay projects. The pay is fixed, you see the deposit and exactly what each milestone needs before you apply, and
          the money sits in a vault on Tempo before anyone starts.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="jobs-q" className="sr-only">
            Search roles
          </label>
          <Input id="jobs-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: cover art, mixing, React, video…" />
        </div>
        <div className="inline-flex rounded-full border border-line bg-card p-1" role="group" aria-label="Sort">
          {(
            [
              ['new', 'Newest'],
              ['pay', 'Highest pay'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSort(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${sort === v ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-warn">Couldn’t load roles: {error}</p>}
      {!listings && !error && <p className="py-16 text-center text-muted">Loading open roles…</p>}
      {listings && shown.length === 0 && (
        <Card className="p-10 text-center">
          <p className="font-display text-xl font-bold">{q ? 'No roles match that search.' : 'No open roles right now.'}</p>
          <p className="mx-auto mt-2 max-w-md text-muted">
            Leading a project? Leave a role’s “Who” blank and tick “List on the public Open roles board”. It shows up here for everyone.
          </p>
          {signedIn && (
            <Link to="/new" className="mt-5 inline-block">
              <Button variant="accent">Post a project</Button>
            </Link>
          )}
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {shown.map((l) => {
          const deposit = Math.round((l.pay * l.deposit_pct) / 100)
          return (
            <Card key={l.role_id} className="flex flex-col p-6">
              <p className="text-sm text-muted">
                {l.project} · posted by {l.lead.name} <span className="whitespace-nowrap">· {timeAgo(l.listed_at)}</span>
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{l.title}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Money value={l.pay} className="text-3xl font-bold" />
                {deposit > 0 && <Badge tone="accent">${deposit.toLocaleString('en-US')} up front ({l.deposit_pct}%)</Badge>}
              </div>
              <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed">{l.brief}</p>
              <ol className="mb-5 mt-4 space-y-2">
                {l.milestones.slice(0, 3).map((m, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/5 text-xs font-semibold">{i + 1}</span>
                    <span className="min-w-0">
                      <b>{m.title}</b> <span className="text-muted">· {m.pct}%</span>
                      <span className="block text-muted">Done when: {m.done_when}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <span className="text-sm text-muted">
                  {l.deadline ? `Due ${shortDate(l.deadline)} · ` : ''}
                  {l.applicants === 0 ? 'No applicants yet' : `${l.applicants} applied`}
                </span>
                <Link to={`/p/${l.project_id}/role/${l.role_id}`} className="ml-auto">
                  <Button variant="accent">{signedIn ? 'View & apply' : 'Sign in to apply'}</Button>
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/** The board for visitors who aren't signed in, with its own small header. */
export function PublicOpenRoles({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line/70 bg-paper/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <Button className="ml-auto" size="sm" onClick={onSignIn}>
            Sign in or join
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <OpenRoles />
      </main>
    </div>
  )
}
