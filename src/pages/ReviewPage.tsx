import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Label, TextArea } from '../components/ui'
import { timeAgo } from '../lib/format'
import { supabase } from '../lib/supabase'
import { mediaKind } from '../lib/files'
import { txUrl } from '../lib/tempo'

// CrewPay review (live): open disputes with all the evidence the rules allow (the "done when",
// every submission and file, both sides' statements, the group chat; never DMs), and a ruling
// that splits the locked money. Only reviewers listed on the server can open this.

type Dispute = {
  project: { id: string; name: string; brief: string }
  milestone: { id: string; title: string; doneWhen: string; amount: number }
  role: string
  lead: string
  collaborator: string
  openedBy: string
  openedAt?: string
  submissions: { at: string; note: string; review?: { kind: string; note?: string }; files: { name: string; kind: string; mime?: string; url?: string }[] }[]
  statements: { by: string; text: string; at: string }[]
  chat: { by: string; text: string; at: string; files: number }[]
}

async function call(method: 'GET' | 'POST', body?: unknown, query = '') {
  const { data } = await supabase!.auth.getSession()
  const res = await fetch('/api/review' + query, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'Request failed'), { status: res.status })
  return json
}

/** Whether the signed-in person is a CrewPay reviewer (the server decides). */
export function useIsReviewer(enabled: boolean) {
  const [is, setIs] = useState(false)
  useEffect(() => {
    if (!enabled) return
    call('GET', undefined, '?check').then(
      (j) => setIs(!!j.reviewer),
      () => setIs(false),
    )
  }, [enabled])
  return is
}

export default function ReviewPage() {
  const [disputes, setDisputes] = useState<Dispute[] | undefined>()
  const [error, setError] = useState('')
  const load = useCallback(() => {
    call('GET').then(
      (j) => setDisputes(j.disputes),
      (e: Error & { status?: number }) => setError(e.status === 403 ? 'Only CrewPay reviewers can open this page.' : e.message),
    )
  }, [])
  useEffect(load, [load])

  if (error) return <p className="py-24 text-center text-muted">{error}</p>
  if (!disputes) return <p className="py-24 text-center text-muted">Loading disputes…</p>
  return (
    <div className="animate-rise mx-auto max-w-4xl">
      <p className="mb-2 text-sm font-medium text-warn">CrewPay review</p>
      <h1 className="font-display text-4xl font-bold tracking-tight">Disputes to rule on</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Judge the work against its “Done when”. You see the submissions, both sides and the group chat. DMs are private and never shown. Your
        ruling moves the locked money on Tempo and is final.
      </p>
      {disputes.length === 0 && <Card className="mt-8 p-10 text-center text-muted">Nothing open. Projects you’re part of are never shown here.</Card>}
      <div className="mt-8 space-y-8">
        {disputes.map((d) => (
          <DisputeCase key={d.milestone.id} d={d} onRuled={load} />
        ))}
      </div>
    </div>
  )
}

function DisputeCase({ d, onRuled }: { d: Dispute; onRuled: () => void }) {
  const [pct, setPct] = useState(50)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tx, setTx] = useState('')
  const toCollab = Math.round(d.milestone.amount * pct) / 100

  const rule = async () => {
    setBusy(true)
    setError('')
    try {
      const j = await call('POST', { milestoneId: d.milestone.id, collaboratorPct: pct, note: note.trim() })
      setTx(j.txHash)
      setTimeout(onRuled, 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-warn-soft/50 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warn">Dispute</Badge>
          <span className="text-sm text-muted">
            {d.project.name} · {d.role} · opened by {d.openedBy} {d.openedAt && timeAgo(d.openedAt)}
          </span>
        </div>
        <p className="mt-2 font-display text-2xl font-bold">
          “{d.milestone.title}” · ${d.milestone.amount.toLocaleString('en-US')} locked
        </p>
        <p className="mt-2 text-sm">
          <b>Done when:</b> {d.milestone.doneWhen}
        </p>
        <p className="mt-1 text-sm text-muted">
          {d.collaborator} (collaborator) vs {d.lead} (Lead)
        </p>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Submissions</p>
          <ol className="space-y-3">
            {d.submissions.map((s, i) => (
              <li key={i} className="rounded-2xl border border-line p-3 text-sm">
                <p className="text-xs text-muted">
                  Round {i + 1} · {timeAgo(s.at)}
                </p>
                <p className="mt-1">{s.note}</p>
                {s.files.map((f, j) => (
                  <div key={j} className="mt-2">
                    {f.url && mediaKind(f.mime) === 'audio' && <audio controls src={f.url} className="w-full" />}
                    {f.url && mediaKind(f.mime) === 'image' && <img src={f.url} alt={f.name} className="max-h-48 rounded-xl" />}
                    {f.url && mediaKind(f.mime) === 'video' && <video controls src={f.url} className="max-h-48 w-full rounded-xl" />}
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                      {f.kind === 'final' ? '📦' : '👁'} {f.name}
                    </a>
                  </div>
                ))}
                {s.review && (
                  <p className="mt-2 rounded-xl bg-warn-soft/60 p-2 text-xs">
                    {s.review.kind === 'changes' ? 'Changes requested: ' : 'Review: '}
                    {s.review.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Both sides</p>
          <ul className="space-y-2">
            {d.statements.map((s, i) => (
              <li key={i} className="rounded-2xl bg-paper p-3 text-sm">
                <b>{s.by}:</b> {s.text}
                <span className="mt-0.5 block text-xs text-muted">{timeAgo(s.at)}</span>
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Group chat ({d.chat.length} messages)</summary>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">
              {d.chat.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.by}:</span> {c.text || (c.files ? `📎 ${c.files} file${c.files === 1 ? '' : 's'}` : '')}
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>

      <div className="border-t border-line p-6">
        {tx ? (
          <p className="text-sm">
            Ruled. The vault paid {d.collaborator} ${toCollab.toLocaleString('en-US')}.{' '}
            <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="underline">
              View on Tempo ↗
            </a>
          </p>
        ) : (
          <>
            <Label hint={`${d.collaborator} $${toCollab.toLocaleString('en-US')} · ${d.lead} $${(d.milestone.amount - toCollab).toLocaleString('en-US')}`}>
              Split: {pct}% to {d.collaborator}
            </Label>
            <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[#ff6a3d]" />
            <Label>Reason (both sides see this)</Label>
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Which parts of “Done when” were met, and why this split." />
            {error && <p className="mt-2 text-sm text-warn">{error}</p>}
            <Button variant="accent" className="mt-3" disabled={busy || note.trim().length < 10} onClick={rule}>
              {busy ? 'Ruling on Tempo…' : 'Issue final ruling'}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
