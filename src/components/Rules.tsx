import { useState } from 'react'
import { AUTO_APPROVE_DAYS, DISPUTE_DAYS, GRACE_DAYS } from '../lib/rules'
import { cx } from './ui'

// Plain-words explainer of the protections. Same rules the vault will enforce.
const RULES = [
  {
    icon: '↑',
    title: 'Deposit first',
    body: 'The upfront deposit is paid the moment the Lead funds the vault, before any work starts.',
  },
  {
    icon: '✓',
    title: 'Done means done',
    body: 'Every milestone has a “Done when” agreed at signing. Reviews are judged against it, not against taste.',
  },
  {
    icon: '⏱',
    title: `${AUTO_APPROVE_DAYS}-day review`,
    body: `After you submit, the Lead has ${AUTO_APPROVE_DAYS} days to approve or ask for changes. Silence counts as approval, and the vault pays you.`,
  },
  {
    icon: '↻',
    title: 'Limited revisions',
    body: 'Each milestone allows a set number of change requests. After that, it’s approve or go to a dispute.',
  },
  {
    icon: '🔒',
    title: 'Finals unlock on payment',
    body: 'Upload previews for review. Final files stay locked until the milestone is paid, so work can’t be taken for free.',
  },
  {
    icon: '⚖',
    title: 'Fair disputes',
    body: `Both sides get ${DISPUTE_DAYS} days to make their case. CrewPay review reads the “Done when”, the submissions and the group chat, then splits the money. DMs are never used as evidence.`,
  },
  {
    icon: '⌛',
    title: 'No ghosting',
    body: `If a deadline passes by ${GRACE_DAYS} days with nothing submitted, the Lead can take that milestone’s money back.`,
  },
]

export default function Rules({ title = 'How you’re protected', defaultOpen = false }: { title?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-line bg-paper/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="font-display font-bold">{title}</span>
        <span className={cx('text-muted transition', open && 'rotate-180')}>⌄</span>
      </button>
      {open && (
        <ul className="animate-rise grid gap-4 px-5 pb-5 sm:grid-cols-2">
          {RULES.map((r) => (
            <li key={r.title} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-card text-sm shadow-[0_0_0_1px_var(--color-line)]">
                {r.icon}
              </span>
              <div>
                <p className="text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
