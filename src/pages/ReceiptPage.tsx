import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Card, PersonLink } from '../components/ui'
import { shortDate } from '../lib/format'
import { earnedBy, vault } from '../lib/rules'
import { projectStatus } from '../lib/status'
import { budget, useStore } from '../store'

// A public, shareable record of who worked on a project and what they were paid.
// No brief details or chat: just the signed terms and the vault's payouts.
export default function ReceiptPage() {
  const { projectId } = useParams()
  const { projects } = useStore()
  const p = projects.find((x) => x.id === projectId)
  if (!p)
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Receipt not found.</h1>
        <Link to="/" className="mt-6 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    )
  const s = projectStatus(p)
  const v = vault(p)
  const date = (iso?: string) => (iso ? shortDate(iso.slice(0, 10)) : '—')

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <p className="mb-2 text-sm font-medium text-accent">Work receipt</p>
      <h1 className="font-display text-4xl font-bold tracking-tight">{p.name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className="flex items-center gap-1.5">
          <Avatar handle={p.lead} size={20} /> Led by <PersonLink handle={p.lead} className="text-ink" />
        </span>
        <span>· Signed agreement v{p.version}</span>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ['Started', date(p.createdAt)],
            ['Funded', date(p.fundedAt)],
            ['Budget', `$${budget(p).toLocaleString('en-US')}`],
            ['Paid out', `$${v.paid.toLocaleString('en-US')}`],
          ] as const
        ).map(([k, val]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-display text-xl font-bold tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>

      <Card className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Person</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Milestones</th>
              <th className="px-5 py-3 text-right font-medium">Paid / agreed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.roles.map((r) => {
              const done = r.milestones.filter((m) => m.status === 'paid' || m.status === 'resolved').length
              return (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar handle={r.assignee} size={24} />
                      <PersonLink handle={r.assignee} className="font-medium" />
                    </span>
                  </td>
                  <td className="px-5 py-3">{r.title}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {done} of {r.milestones.length} delivered
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <b>${earnedBy(p, r.id).toLocaleString('en-US')}</b>
                    <span className="text-muted"> / ${r.pay.toLocaleString('en-US')}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Every number on this receipt comes from the signed agreement and the project vault’s payouts. Once the vault runs on Tempo, this page links
        to the contract and each payment transaction so anyone can verify it.
      </p>
    </div>
  )
}
