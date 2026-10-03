import type { Address, Hex } from 'viem'
import { BUCKET, supabase } from './lib/supabase'
import { approveWork, openDispute, reclaimWork, releaseWork, requestChanges, submitWork } from './lib/tempo'
import { workPayload, type WorkFile } from './lib/work'
import type { Action } from './store'
import type { FileRef, Project } from './types'

// Milestone work on the live vault. Each action is one passkey transaction (CrewPay pays the
// fee), then /api/sync records it. The vault decides the money; the server checks the words
// (notes, files, dispute reasons) against what the vault recorded before storing them.

export const CHAIN_ACTIONS = new Set<Action['type']>(['submit', 'review', 'openDispute', 'reclaim', 'release'])

export const BUSY_TEXT: Partial<Record<Action['type'], string>> = {
  submit: 'Submitting your work on Tempo…',
  review: 'Recording your review on Tempo…',
  openDispute: 'Opening the dispute on Tempo…',
  reclaim: 'Reclaiming on Tempo…',
  release: 'Releasing the payment on Tempo…',
}

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

async function upload(project: Project, milestoneId: string, f: FileRef): Promise<WorkFile> {
  if (!f.blob) throw new Error(`${f.name} couldn’t be read. Add it again.`)
  // Finals live under finals/<milestone>, which storage keeps locked until the milestone is paid.
  const path = `${project.id}/${f.kind === 'final' ? 'finals' : 'previews'}/${milestoneId}/${crypto.randomUUID()}-${safeName(f.name)}`
  const { error } = await supabase!.storage.from(BUCKET).upload(path, f.blob, { contentType: f.mime || 'application/octet-stream' })
  if (error) throw new Error(`Couldn’t upload ${f.name}: ${error.message}`)
  return { name: f.name, size: f.size, mime: f.mime, kind: f.kind, path }
}

async function sync(projectId: string, txHash: Hex, extra?: { note?: string; files?: WorkFile[]; reason?: string }) {
  const { data } = await supabase!.auth.getSession()
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ projectId, txHash, extra }),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; waiting?: number }
  if (!res.ok) throw new Error(json.error ?? 'Couldn’t record the transaction.')
  if (json.waiting) throw new Error('The vault recorded it, but CrewPay couldn’t match the details. Refresh and try again.')
}

export async function performChain(a: Action, project: Project, wallet: Address | undefined) {
  if (!wallet) throw new Error('Set up your CrewPay wallet first (on your dashboard).')
  if (!('roleId' in a) || !('milestoneId' in a)) throw new Error('Not a milestone action.')
  const r = project.roles.findIndex((x) => x.id === a.roleId)
  const m = project.roles[r]?.milestones.findIndex((x) => x.id === a.milestoneId) ?? -1
  if (r < 0 || m < 0) throw new Error('Couldn’t find that milestone.')

  switch (a.type) {
    case 'submit': {
      const files = await Promise.all(a.files.map((f) => upload(project, a.milestoneId, f)))
      const hash = await submitWork(wallet, project, r, m, workPayload(a.note, files))
      return sync(project.id, hash, { note: a.note, files })
    }
    case 'review': {
      const hash = a.kind === 'approved' ? await approveWork(wallet, project, r, m) : await requestChanges(wallet, project, r, m, a.note)
      return sync(project.id, hash, a.kind === 'changes' ? { note: a.note } : undefined)
    }
    case 'openDispute':
      return sync(project.id, await openDispute(wallet, project, r, m), { reason: a.reason })
    case 'reclaim':
      return sync(project.id, await reclaimWork(wallet, project, r, m))
    case 'release':
      return sync(project.id, await releaseWork(wallet, project, r, m))
  }
}
