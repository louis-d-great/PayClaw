import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { personName, useStore } from '../store'
import { Button, cx } from './ui'

// First-run guide: a welcome card, then a spotlight on each part of the dashboard, then a
// "try it with a friend" card. Shown once per person (stored in this browser); replay it from
// your profile. PageHint gives each other page a one-time "what this page is for" card.

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // Storage blocked: the tour simply shows again next time.
  }
}

function useWho() {
  const { mode, userId } = useStore()
  return mode === 'live' ? (userId ?? 'live') : 'demo'
}
const tourKey = (who: string) => `crewpay:tour:${who}`
const hintKey = (who: string, id: string) => `crewpay:hint:${who}:${id}`
const HINTS = ['create', 'project', 'invite', 'milestone']

/** Clears the tour and page hints so they show again, then opens the dashboard. */
export function useReplayTour() {
  const who = useWho()
  const navigate = useNavigate()
  return () => {
    write(tourKey(who), null)
    HINTS.forEach((h) => write(hintKey(who, h), null))
    navigate('/', { state: { tour: Date.now() } })
  }
}

type Step = { target?: string[]; title: string; body: ReactNode }

export default function Tour() {
  const { me, mode } = useStore()
  const who = useWho()
  const location = useLocation()
  const navigate = useNavigate()
  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const live = mode === 'live'

  const steps: Step[] = [
    {
      title: `Welcome to CrewPay, ${personName(me).split(' ')[0]}`,
      body: (
        <>
          <p>
            CrewPay is for crews who work and get paid together: music collabs, design teams, freelancers, small shops. The Lead sets
            everyone's pay up front, everyone signs, and the money is locked in before work starts.
          </p>
          <ul className="mt-4 grid gap-2.5">
            {[
              ['Agree first', 'Each role gets a fixed price, a deposit and milestones. Nothing binds until everyone signs.'],
              ['Money locked in', 'The Lead funds a vault. Deposits go out the moment it’s funded.'],
              ['Paid per milestone', 'Approved work is paid instantly. If the Lead stays silent for 7 days, the payment is released anyway.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className={cx('mt-0.5 h-5 w-5 shrink-0 rounded-full', i === 0 ? 'bg-accent' : i === 1 ? 'bg-ink' : 'bg-ok')} />
                <span>
                  <b>{t}.</b> <span className="text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          {live && <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm">This is the test version on Tempo: all money here is free test dollars.</p>}
        </>
      ),
    },
    {
      target: ['[data-tour=wallet]'],
      title: 'Your wallet',
      body: 'Your pay lands here, in dollars. It opens with a passkey (Face ID, your fingerprint, a PIN or your phone), so there’s no app or seed phrase, and CrewPay pays every network fee. On this test version, “Get test dollars” gives you free money to try things.',
    },
    {
      target: ['[data-tour=new]', '[data-tour=new-mobile]'],
      title: 'Start a project',
      body: 'Write a short brief, add each role with a fixed price and an upfront deposit, and split the rest into milestones that say what “done” means. Invite people by their @handle, or leave a role open for anyone with the link.',
    },
    {
      target: ['[data-tour=jobs]', '[data-tour=jobs-card]'],
      title: 'Find paid work',
      body: 'Open roles lists paid roles on real CrewPay projects: the pay, the upfront deposit and what each milestone needs. Apply with your portfolio and your price; if the Lead picks you, you sign the same terms.',
    },
    {
      target: ['[data-tour=stats]'],
      title: 'What needs you',
      body: 'What you’ve been paid so far, invites waiting for your signature, and counter-offers or work waiting for your review.',
    },
    {
      target: ['[data-tour=tabs]'],
      title: 'Your projects',
      body: 'Projects you lead on one side, projects you’ve joined on the other. Open one to see the vault, each person’s milestones and the group chat.',
    },
    {
      target: ['[data-tour=profile]', '[data-tour=profile-chip]'],
      title: 'Your track record',
      body: `Every paid project becomes a work receipt on your profile, so people can see what you’ve delivered. Friends invite you by your handle: ${me}.`,
    },
    {
      title: 'Try it with a friend',
      body: (
        <ol className="grid gap-2.5">
          {[
            'Create a project and put your friend’s @handle on a role.',
            'They open their invite and sign with their passkey.',
            live ? 'You tap “Get test dollars”, then fund. Their deposit lands instantly.' : 'You fund the project. Their deposit lands instantly.',
            'They submit their work, you approve, and the vault pays them.',
          ].map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-paper">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      ),
    },
  ]

  // Start on the dashboard for anyone who hasn't seen it (or after "Take the tour again").
  useEffect(() => {
    if (location.pathname !== '/') return
    if (read(tourKey(who))) return
    const t = setTimeout(() => setStep(0), 600)
    return () => clearTimeout(t)
  }, [location.pathname, location.state, who])

  const finish = useCallback(() => {
    write(tourKey(who), 'done')
    setStep(null)
  }, [who])

  // Skip steps whose target isn't on screen (no wallet card in the demo, phone layouts).
  const findTarget = (s: Step) => {
    for (const sel of s.target ?? []) {
      const el = document.querySelector<HTMLElement>(sel)
      const r = el?.getBoundingClientRect()
      if (el && r && r.width > 0 && r.height > 0) return el
    }
    return null
  }
  const go = useCallback(
    (from: number, dir: 1 | -1) => {
      let i = from + dir
      while (i > 0 && i < steps.length - 1 && steps[i].target && !findTarget(steps[i])) i += dir
      setStep(Math.max(0, Math.min(steps.length - 1, i)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps.length],
  )

  const current = step === null ? null : steps[step]
  useLayoutEffect(() => {
    if (!current?.target) return setRect(null)
    const el = findTarget(current)
    if (!el) return setRect(null)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const t = setTimeout(update, 400)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    if (step === null) return
    nextBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' && step < steps.length - 1) go(step, 1)
      if (e.key === 'ArrowLeft' && step > 0) go(step, -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, steps.length, finish, go])

  if (step === null || !current) return null
  const last = step === steps.length - 1
  const pad = 10
  const spot = rect && { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }

  // Place the card below the spotlight if it fits, otherwise above; centred when there's no target.
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const cardW = Math.min(380, vw - 32)
  let cardStyle: React.CSSProperties = {}
  if (spot) {
    const left = Math.max(16, Math.min(vw - cardW - 16, spot.left + spot.width / 2 - cardW / 2))
    const below = spot.top + spot.height + 14
    cardStyle = below + 230 < vh ? { width: cardW, left, top: below } : { width: cardW, left, bottom: vh - spot.top + 14 }
  }
  const shown = steps.map((s, i) => (s.target && i > 0 && i < steps.length - 1 && findTarget(s) ? i : -1)).filter((i) => i >= 0)

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={current.title}>
      {spot ? (
        <div
          className="pointer-events-none fixed rounded-3xl ring-2 ring-accent transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgba(29,27,22,.62)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-ink/60" onClick={finish} />
      )}
      <div className={cx(!spot && 'pointer-events-none fixed inset-0 grid place-items-center p-4')}>
      <div
        className={cx(
          'animate-rise rounded-3xl border border-line bg-card p-6 text-ink shadow-[0_24px_60px_-20px_rgba(29,27,22,.6)]',
          spot ? 'fixed' : 'pointer-events-auto max-h-full w-full overflow-y-auto',
          !spot && (step === 0 ? 'max-w-[460px]' : 'max-w-[400px]'),
        )}
        style={spot ? cardStyle : undefined}
      >
        {spot && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
            {shown.indexOf(step) + 1} of {shown.length}
          </p>
        )}
        <h2 className={cx('font-display font-bold tracking-tight', step === 0 ? 'text-3xl' : 'text-xl')}>{current.title}</h2>
        <div className="mt-2 text-[15px] leading-relaxed">{current.body}</div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step === 0 ? (
            <>
              <Button ref={nextBtn} variant="accent" onClick={() => go(0, 1)}>
                Show me around
              </Button>
              <Button variant="ghost" onClick={finish}>
                Skip
              </Button>
            </>
          ) : last ? (
            <>
              <Button
                ref={nextBtn}
                variant="accent"
                onClick={() => {
                  finish()
                  navigate('/new')
                }}
              >
                Create a project
              </Button>
              <Button variant="ghost" onClick={finish}>
                I’ll look around
              </Button>
            </>
          ) : (
            <>
              <Button ref={nextBtn} onClick={() => go(step, 1)}>
                Next
              </Button>
              <Button variant="ghost" onClick={() => go(step, -1)}>
                Back
              </Button>
              <button onClick={finish} className="ml-auto text-sm text-muted hover:text-ink">
                Skip tour
              </button>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

/** A one-time "what this page is for" card at the top of a page. */
export function PageHint({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const who = useWho()
  const [open, setOpen] = useState(() => !read(hintKey(who, id)))
  if (!open) return null
  return (
    <div className="animate-rise mb-6 flex items-start gap-4 rounded-3xl border border-accent/30 bg-accent-soft/60 p-5" role="note">
      <span className="relative mt-1 inline-block h-5 w-8 shrink-0" aria-hidden="true">
        <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-accent" />
        <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold">{title}</p>
        <div className="mt-1 text-[15px] leading-relaxed">{children}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          write(hintKey(who, id), 'seen')
          setOpen(false)
        }}
      >
        Got it
      </Button>
    </div>
  )
}
