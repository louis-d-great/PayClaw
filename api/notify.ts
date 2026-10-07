// Email updates. The database posts each batch of new system messages here (see
// 0004_email_notifications.sql); this emails everyone on those projects: what happened, what
// they should do next, and a button to the right page. The person who did it isn't emailed,
// nor anyone who switched emails off. DMs and chat messages never trigger an email.
//
// Env: NOTIFY_SECRET, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, APP_URL,
//      SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

type Msg = { project_id: string; text: string; created_at: string }
type Milestone = { status: string }
type Role = { id: string; title: string; assignee_id: string | null; signed_version: number | null; position: number; milestones: Milestone[] }
type Project = { id: string; name: string; lead_id: string; status: string; version: number; roles: Role[] }
type Person = { id: string; name: string; email_updates: boolean | null }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** What this person should do now, and where. */
export function nextStep(p: Project, who: string, app: string): { line: string; label: string; url: string } {
  const open = { line: 'Open the project to see the details and the group chat.', label: 'Open the project', url: `${app}/p/${p.id}` }
  const draft = p.status === 'signing' || p.status === 'ready'
  const mine = p.roles.find((r) => r.assignee_id === who)
  const isLead = p.lead_id === who
  if (draft && mine && mine.signed_version !== p.version)
    return { line: 'Your terms are waiting: check your pay, deposit and milestones, then sign with your passkey or counter-offer.', label: 'Review and sign', url: `${app}/p/${p.id}/role/${mine.id}` }
  if (draft && isLead && p.roles.length > 0 && p.roles.every((r) => r.signed_version === p.version))
    return { line: 'Everyone has signed. Fund the project so the deposits go out and work can start.', label: 'Fund the project', url: `${app}/p/${p.id}` }
  if (p.status === 'funded' && isLead && p.roles.some((r) => r.milestones.some((m) => m.status === 'submitted')))
    return { line: 'Work is waiting for your review. Approve it, ask for changes, or say nothing and it pays automatically after 7 days.', label: 'Review the work', url: `${app}/p/${p.id}` }
  if (p.status === 'funded' && mine && mine.milestones.some((m) => m.status === 'working'))
    return { line: 'When your next milestone is ready, submit it from the project page.', label: 'Open the project', url: `${app}/p/${p.id}` }
  return open
}

export function emailHtml(project: Project, updates: string[], step: { line: string; label: string; url: string }, app: string) {
  const items = updates.map((u) => `<tr><td style="padding:10px 0;border-top:1px solid #e4ddcf;font-size:15px;line-height:1.5;color:#1d1b16">${esc(u)}</td></tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f6f2ea;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ea;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:#ff6a3d;vertical-align:middle"></span><span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:#1d1b16;margin-left:-9px;vertical-align:middle"></span><b style="font-size:18px;color:#1d1b16;margin-left:8px;vertical-align:middle">CrewPay</b></td></tr>
<tr><td style="background:#fffdf8;border:1px solid #e4ddcf;border-radius:20px;padding:26px">
<div style="font-size:13px;color:#6f6a5f;text-transform:uppercase;letter-spacing:.05em">${esc(project.name)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${items}</table>
<p style="margin:18px 0 0;padding:14px 16px;background:#ffe6dc;border-radius:14px;font-size:15px;line-height:1.5;color:#1d1b16">${esc(step.line)}</p>
<p style="margin:22px 0 0"><a href="${step.url}" style="display:inline-block;background:#1d1b16;color:#f6f2ea;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">${esc(step.label)}</a></p>
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#6f6a5f">You're getting this because you're on this project in CrewPay (Tempo testnet, test dollars). <a href="${app}/" style="color:#6f6a5f">Turn emails off</a> from Edit profile.</td></tr>
</table></td></tr></table></body></html>`
}

let mailer: nodemailer.Transporter | undefined
function transport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return undefined
  const port = Number(SMTP_PORT || 465)
  mailer ??= nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  return mailer
}

async function emailOf(db: SupabaseClient, id: string) {
  const { data } = await db.auth.admin.getUserById(id)
  return data.user?.email
}

export async function POST(request: Request) {
  if (!process.env.NOTIFY_SECRET || request.headers.get('x-crewpay-secret') !== process.env.NOTIFY_SECRET)
    return Response.json({ error: 'Not allowed.' }, { status: 401 })
  const { messages = [] } = (await request.json().catch(() => ({}))) as { messages?: Msg[] }
  const mail = transport()
  if (!mail) return Response.json({ ok: true, sent: 0, note: 'SMTP is not configured.' })
  const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const app = (process.env.APP_URL || 'https://payclaw-six.vercel.app').replace(/\/$/, '')

  const byProject = new Map<string, string[]>()
  for (const m of messages) if (m.project_id && m.text) byProject.set(m.project_id, [...(byProject.get(m.project_id) ?? []), m.text])

  let sent = 0
  const failed: string[] = []
  for (const [projectId, updates] of byProject) {
    const { data: project } = await db
      .from('projects')
      .select('id, name, lead_id, status, version, roles(id, title, assignee_id, signed_version, position, milestones(status))')
      .eq('id', projectId)
      .single()
    if (!project) continue
    const p = project as unknown as Project
    const ids = [...new Set([p.lead_id, ...p.roles.map((r) => r.assignee_id).filter(Boolean)])] as string[]
    // select('*'): works before and after the email_updates column exists.
    const { data: people, error: pe } = await db.from('profiles').select('*').in('id', ids)
    if (pe) failed.push(pe.message)
    for (const person of (people ?? []) as Person[]) {
      if (person.email_updates === false) continue
      // Updates this person caused begin with their own name; don't tell them what they just did.
      const forThem = updates.filter((u) => !u.startsWith(person.name + ' '))
      if (forThem.length === 0) continue
      const to = await emailOf(db, person.id)
      if (!to) continue
      const step = nextStep(p, person.id, app)
      const subject = forThem.length === 1 ? `${p.name}: ${forThem[0]}` : `${p.name}: ${forThem.length} updates`
      try {
        await mail.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_USER,
          to,
          subject: subject.length > 140 ? subject.slice(0, 137) + '…' : subject,
          text: `${forThem.join('\n')}\n\n${step.line}\n${step.label}: ${step.url}`,
          html: emailHtml(p, forThem, step, app),
        })
        sent++
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e))
      }
    }
  }
  return Response.json({ ok: failed.length === 0, sent, failed })
}
