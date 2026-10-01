import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
import { uid } from './lib/format'
import {
  AUTO_APPROVE_DAYS,
  DAY,
  DEFAULT_REVISIONS,
  amountFor,
  autoApproveAt,
  canReclaim,
  collaboratorCanDispute,
  isSettled,
  lastSubmission,
  leadCanDispute,
  rebalance,
  revisionsLeft,
  schedule,
} from './lib/rules'
import {
  REVIEWER,
  type FileRef,
  type Handle,
  type Message,
  type Milestone,
  type Payout,
  type PayoutPreference,
  type Project,
  type Role,
} from './types'

// Front-end-only store for the MVP prototype. Everything lives in
// localStorage; Supabase (drafts, chat, files) and the Base vault replace it later.

export const PEOPLE: Handle[] = ['@louis', '@tobi', '@ada', '@kemi', REVIEWER]

type State = {
  me: Handle
  projects: Project[]
  // Demo time travel: lets you see auto-approve and missed-deadline rules fire.
  clockOffset: number
}

type Target = { projectId: string; roleId: string; milestoneId: string }

type Action =
  | { type: 'switchUser'; me: Handle }
  | { type: 'create'; project: Project }
  | { type: 'accept'; projectId: string; roleId: string; payout: PayoutPreference }
  | { type: 'counter'; projectId: string; roleId: string; amount: number; depositPct: number; note: string }
  | { type: 'decline'; projectId: string; roleId: string; note: string }
  | { type: 'resolveCounter'; projectId: string; messageId: string; accept: boolean }
  | { type: 'say'; projectId: string; text: string }
  | { type: 'fund'; projectId: string }
  | ({ type: 'submit'; note: string; files: FileRef[] } & Target)
  | ({ type: 'review'; kind: 'approved' | 'changes'; note: string } & Target)
  | ({ type: 'openDispute'; reason: string } & Target)
  | ({ type: 'statement'; text: string } & Target)
  | ({ type: 'rule'; collaboratorPct: number; note: string } & Target)
  | ({ type: 'reclaim' } & Target)
  | { type: 'advance'; days: number }
  | { type: 'reset' }

export const isSigned = (p: Project, r: Role) => r.signedVersion === p.version
export const budget = (p: Project) => p.roles.reduce((sum, r) => sum + r.pay, 0)
export const signedCount = (p: Project) => p.roles.filter((r) => isSigned(p, r)).length

const name = (h: Handle) =>
  h === REVIEWER ? 'CrewPay review' : h.replace(/^@/, '').replace(/^./, (c) => c.toUpperCase())
const money = (n: number) => `$${n.toLocaleString('en-US')}`

// ---------- demo data ----------

function seed(): State {
  const t = Date.now()
  const ago = (days: number) => new Date(t - days * DAY).toISOString()
  const day = (offset: number) => new Date(t + offset * DAY).toISOString().slice(0, 10)
  const msg = (m: Omit<Message, 'id'>): Message => ({ id: uid(), ...m })
  const ms = (m: Partial<Milestone> & Pick<Milestone, 'id' | 'title' | 'doneWhen' | 'pct'>): Milestone => ({
    revisions: DEFAULT_REVISIONS,
    status: 'working',
    submissions: [],
    ...m,
  })

  // 1. Signing: shows invites, counter-offers and re-signing.
  const lagos: Project = {
    id: 'lagos-nights',
    name: 'Lagos Nights EP',
    brief:
      'A 4-track afrobeats EP for release in March. I have the concept, two demos and the artwork direction. ' +
      'I need a producer to finish the beats, a vocalist for hooks and harmonies, and a mix engineer to bring it home.',
    deadline: day(60),
    lead: '@louis',
    version: 1,
    status: 'signing',
    createdAt: ago(1.1),
    payouts: [],
    roles: [
      {
        id: 'r-prod',
        title: 'Producer',
        assignee: '@tobi',
        pay: 600,
        depositPct: 20,
        response: 'accepted',
        signedVersion: 1,
        payout: { method: 'wallet', wallet: '0x7a3f…c21e' },
        milestones: [
          ms({ id: 'm1', title: 'Beats for all 4 tracks', doneWhen: '4 beats, 2–3 min each, shared as MP3 for review.', pct: 40, due: day(21) }),
          ms({ id: 'm2', title: 'Stems delivered to mix', doneWhen: 'Separate WAV stems (24-bit) for every track, labelled.', pct: 40, due: day(35) }),
        ],
      },
      {
        id: 'r-vox',
        title: 'Vocalist',
        assignee: '@ada',
        pay: 450,
        depositPct: 20,
        response: 'countered',
        milestones: [
          ms({ id: 'm3', title: 'Hooks + harmonies recorded', doneWhen: 'Dry vocal takes for all 4 hooks, plus harmony stacks.', pct: 80, due: day(30) }),
        ],
      },
      {
        id: 'r-mix',
        title: 'Mix engineer',
        pay: 300,
        depositPct: 10,
        response: 'pending',
        milestones: [
          ms({ id: 'm4', title: 'Final mix + master', doneWhen: '4 mastered WAVs at -14 LUFS, 1 round of notes included.', pct: 90, due: day(55) }),
        ],
      },
    ],
    messages: [],
  }
  lagos.messages = [
    msg({ author: 'system', kind: 'system', text: 'Louis posted the brief and sent invites.', at: ago(1.1) }),
    msg({ author: '@tobi', kind: 'system', text: 'Tobi accepted and signed Producer for $600.', at: ago(0.8) }),
    msg({ author: '@tobi', kind: 'text', text: "Demos sound great. I'll start on track 2 first.", at: ago(0.79) }),
    msg({
      author: '@ada',
      kind: 'counter',
      roleId: 'r-vox',
      amount: 550,
      depositPct: 30,
      text: 'Love the brief. Hooks + stacked harmonies on 4 tracks is two extra studio sessions, so I’m asking $550 with 30% up front to book the studio.',
      at: ago(0.03),
    }),
  ]

  // 2. Louis is invited to someone else's project.
  const kora: Project = {
    id: 'kora-identity',
    name: 'Kora — brand identity',
    brief: 'Full identity for Kora, a Lagos coffee roaster: logo, packaging illustrations and a short motion loop for socials.',
    deadline: day(75),
    lead: '@kemi',
    version: 1,
    status: 'signing',
    createdAt: ago(0.2),
    payouts: [],
    roles: [
      {
        id: 'r-illus',
        title: 'Illustrator',
        assignee: '@louis',
        pay: 800,
        depositPct: 25,
        response: 'pending',
        milestones: [
          ms({ id: 'k1', title: 'Three packaging directions', doneWhen: '3 rough directions as PDF, one page each.', pct: 25, due: day(25) }),
          ms({ id: 'k2', title: 'Final illustrations', doneWhen: 'Chosen direction, final art for 3 bag sizes, vector files.', pct: 50, due: day(50) }),
        ],
      },
      {
        id: 'r-motion',
        title: 'Motion designer',
        assignee: '@ada',
        pay: 500,
        depositPct: 20,
        response: 'accepted',
        signedVersion: 1,
        payout: { method: 'bank', bank: { name: 'GTBank', account: '•••• 4471', currency: 'NGN' } },
        milestones: [ms({ id: 'k3', title: '15s social loop', doneWhen: '1080×1920 MP4, 15s, loops cleanly, logo animates in.', pct: 80, due: day(66) })],
      },
    ],
    messages: [
      msg({ author: 'system', kind: 'system', text: 'Kemi posted the brief and sent invites.', at: ago(0.2) }),
      msg({ author: '@ada', kind: 'system', text: 'Ada accepted and signed Motion designer for $500.', at: ago(0.1) }),
    ],
  }

  // 3. Funded and in progress: every milestone state is here.
  const oja: Project = {
    id: 'oja-shop',
    name: 'Oja — shop website',
    brief: 'A 5-page website for Oja, a fabric shop in Balogun market. Home, catalogue, about, delivery and contact. Must load fast on 3G.',
    deadline: day(20),
    lead: '@louis',
    version: 1,
    status: 'funded',
    createdAt: ago(30),
    fundedAt: ago(28),
    roles: [
      {
        id: 'o-design',
        title: 'Web designer',
        assignee: '@ada',
        pay: 700,
        depositPct: 20,
        response: 'accepted',
        signedVersion: 1,
        payout: { method: 'bank', bank: { name: 'GTBank', account: '•••• 4471', currency: 'NGN' } },
        milestones: [
          ms({
            id: 'o1',
            title: 'Homepage + catalogue design',
            doneWhen: 'Figma designs for Home and Catalogue, mobile and desktop, using the Oja brand colours.',
            pct: 40,
            due: day(-6),
            status: 'paid',
            submissions: [
              {
                id: 's1',
                at: ago(9),
                note: 'Both pages, mobile + desktop. Prototype link inside.',
                files: [
                  { name: 'oja-home-catalogue-preview.png', size: 1_400_000, kind: 'preview' },
                  { name: 'oja-home-catalogue.fig', size: 8_200_000, kind: 'final' },
                ],
                review: { kind: 'approved', note: 'Beautiful. The fabric swatches are perfect.', at: ago(8) },
              },
            ],
          }),
          ms({
            id: 'o2',
            title: 'Remaining 3 pages',
            doneWhen: 'Figma designs for About, Delivery and Contact, mobile and desktop.',
            pct: 40,
            due: day(4),
            status: 'submitted',
            submissions: [
              {
                id: 's2',
                at: ago(5),
                note: 'All three pages done.',
                files: [{ name: 'oja-pages-v1-preview.png', size: 1_100_000, kind: 'preview' }],
                review: { kind: 'changes', note: 'Delivery page is missing the Lagos zone price table from the brief.', at: ago(4) },
              },
              {
                id: 's3',
                at: ago(2),
                note: 'Added the zone price table and a map of delivery zones.',
                files: [
                  { name: 'oja-pages-v2-preview.png', size: 1_200_000, kind: 'preview' },
                  { name: 'oja-pages-final.fig', size: 9_900_000, kind: 'final' },
                ],
              },
            ],
          }),
        ],
      },
      {
        id: 'o-dev',
        title: 'Frontend dev',
        assignee: '@tobi',
        pay: 900,
        depositPct: 20,
        response: 'accepted',
        signedVersion: 1,
        payout: { method: 'wallet', wallet: '0x7a3f…c21e' },
        milestones: [
          ms({
            id: 'o3',
            title: 'Site live on staging',
            doneWhen: 'All 5 pages built from the Figma, live on a staging link, Lighthouse performance score 85+ on mobile.',
            pct: 50,
            due: day(-3),
            status: 'disputed',
            submissions: [
              {
                id: 's4',
                at: ago(10),
                note: 'Staging is up: oja-staging.vercel.app',
                files: [{ name: 'lighthouse-report.pdf', size: 320_000, kind: 'preview' }],
                review: { kind: 'changes', note: 'Lighthouse mobile score is 61, the brief says 85+.', at: ago(9) },
              },
              {
                id: 's5',
                at: ago(7),
                note: 'Compressed images, score is now 78.',
                files: [{ name: 'lighthouse-report-2.pdf', size: 310_000, kind: 'preview' }],
                review: { kind: 'changes', note: 'Still under 85. The brief was clear on this.', at: ago(6) },
              },
            ],
            dispute: {
              openedBy: '@tobi',
              at: ago(1),
              reason:
                'The 85 target is unreachable with the 40 full-size product photos the design requires. I got it from 61 to 78 and the site works.',
              statements: [
                {
                  by: '@tobi',
                  text: 'The catalogue design has 40 hi-res images above the fold. I raised this in the group chat on day 3. Everything else in the brief is done.',
                  at: ago(1),
                },
              ],
            },
          }),
          ms({ id: 'o4', title: 'Launch + handover', doneWhen: 'Live on oja.ng, 30-minute handover call, code on GitHub.', pct: 30, due: day(15) }),
        ],
      },
      {
        id: 'o-copy',
        title: 'Copywriter',
        assignee: '@kemi',
        pay: 200,
        depositPct: 20,
        response: 'accepted',
        signedVersion: 1,
        payout: { method: 'wallet', wallet: '0x19be…0a4d' },
        milestones: [
          ms({ id: 'o5', title: 'Copy for all 5 pages', doneWhen: 'Final copy in a Google Doc, English and Yoruba headlines.', pct: 80, due: day(-9) }),
        ],
      },
    ],
    payouts: [],
    messages: [],
  }
  oja.payouts = [
    ...oja.roles.map<Payout>((r) => ({
      id: uid(),
      at: ago(28),
      roleId: r.id,
      milestoneId: 'deposit',
      to: r.assignee!,
      amount: amountFor(r, 'deposit'),
      kind: 'deposit',
    })),
    { id: uid(), at: ago(8), roleId: 'o-design', milestoneId: 'o1', to: '@ada', amount: amountFor(oja.roles[0], 'o1'), kind: 'milestone' },
  ]
  oja.messages = [
    msg({ author: 'system', kind: 'system', text: 'Everyone signed. Louis funded the vault with $1,800 USDC.', at: ago(28) }),
    msg({ author: 'system', kind: 'system', text: 'Deposits paid: Ada $140, Tobi $180, Kemi $40.', at: ago(28) }),
    msg({
      author: '@tobi',
      kind: 'text',
      text: 'Heads up: 40 full-size photos on the catalogue will make 85 on Lighthouse very hard. Can we lazy-load or cut them?',
      at: ago(27),
    }),
    msg({ author: '@louis', kind: 'text', text: 'The photos are the whole point of the shop, keep them.', at: ago(26.9) }),
    msg({ author: 'system', kind: 'system', text: 'Louis approved “Homepage + catalogue design”. Vault paid Ada $280.', at: ago(8) }),
    msg({ author: 'system', kind: 'system', text: 'Tobi opened a dispute on “Site live on staging”. CrewPay review will rule.', at: ago(1) }),
  ]

  return { me: '@louis', projects: [oja, lagos, kora], clockOffset: 0 }
}

// ---------- reducer ----------

type Ctx = { now: number; iso: string; me: Handle }

function mapProject(state: State, id: string, fn: (p: Project) => Project): State {
  return { ...state, projects: state.projects.map((p) => (p.id === id ? fn(p) : p)) }
}

function mapMilestone(p: Project, roleId: string, milestoneId: string, fn: (m: Milestone, r: Role) => Milestone): Project {
  return {
    ...p,
    roles: p.roles.map((r) =>
      r.id === roleId ? { ...r, milestones: r.milestones.map((m) => (m.id === milestoneId ? fn(m, r) : m)) } : r,
    ),
  }
}

const sys = (c: Ctx, text: string): Message => ({ id: uid(), author: 'system', at: c.iso, kind: 'system', text })

const pay = (c: Ctx, r: Role, milestoneId: string, to: Handle, amount: number, kind: Payout['kind']): Payout => ({
  id: uid(),
  at: c.iso,
  roleId: r.id,
  milestoneId,
  to,
  amount: Math.round(amount * 100) / 100,
  kind,
})

function withStatus(p: Project): Project {
  if (p.status === 'signing' || p.status === 'ready') {
    const allSigned = p.roles.length > 0 && p.roles.every((r) => isSigned(p, r))
    return { ...p, status: allSigned ? 'ready' : 'signing' }
  }
  if (p.status === 'funded' && p.roles.every((r) => r.milestones.every(isSettled))) return { ...p, status: 'done' }
  return p
}

// Rules that fire with time: a Lead who stays silent for 7 days after a submission auto-approves it.
function sweep(p: Project, c: Ctx): Project {
  if (p.status !== 'funded') return p
  let out = p
  for (const r of p.roles)
    for (const m of r.milestones) {
      const due = autoApproveAt(m)
      if (due === undefined || due > c.now) continue
      const amount = amountFor(r, m.id)
      out = mapMilestone(out, r.id, m.id, (mm) => ({
        ...mm,
        status: 'paid',
        submissions: mm.submissions.map((s, i) =>
          i === mm.submissions.length - 1 ? { ...s, review: { kind: 'auto-approved', at: c.iso } } : s,
        ),
      }))
      out = {
        ...out,
        payouts: [...out.payouts, pay(c, r, m.id, r.assignee!, amount, 'auto')],
        messages: [
          ...out.messages,
          sys(c, `No response from ${name(p.lead)} in ${AUTO_APPROVE_DAYS} days, so “${m.title}” auto-approved. Vault paid ${name(r.assignee!)} ${money(amount)}.`),
        ],
      }
    }
  return withStatus(out)
}

function reduceProject(p: Project, a: Action, c: Ctx): Project {
  switch (a.type) {
    case 'accept': {
      const role = p.roles.find((r) => r.id === a.roleId)!
      const roles = p.roles.map((r) =>
        r.id === a.roleId
          ? { ...r, assignee: r.assignee ?? c.me, response: 'accepted' as const, signedVersion: p.version, payout: a.payout }
          : r,
      )
      const how = a.payout.method === 'wallet' ? 'USDC to their wallet' : `bank transfer in ${a.payout.bank?.currency}`
      return withStatus({
        ...p,
        roles,
        messages: [...p.messages, sys(c, `${name(c.me)} accepted and signed ${role.title} for ${money(role.pay)}, paid by ${how}.`)],
      })
    }
    case 'counter':
      return {
        ...p,
        roles: p.roles.map((r) => (r.id === a.roleId ? { ...r, assignee: r.assignee ?? c.me, response: 'countered' as const } : r)),
        messages: [
          ...p.messages,
          { id: uid(), author: c.me, at: c.iso, kind: 'counter', roleId: a.roleId, amount: a.amount, depositPct: a.depositPct, text: a.note },
        ],
      }
    case 'decline': {
      const role = p.roles.find((r) => r.id === a.roleId)!
      // Declining frees the role up again so the Lead can invite someone else.
      const roles = p.roles.map((r) =>
        r.id === a.roleId ? { ...r, assignee: undefined, response: 'pending' as const, signedVersion: undefined } : r,
      )
      const text = `${name(c.me)} declined ${role.title}.${a.note ? ` “${a.note}”` : ''} The role is open again.`
      return withStatus({ ...p, roles, messages: [...p.messages, sys(c, text)] })
    }
    case 'resolveCounter': {
      const offer = p.messages.find((m) => m.id === a.messageId)
      if (!offer || offer.kind !== 'counter' || offer.resolution) return p
      const role = p.roles.find((r) => r.id === offer.roleId)!
      const messages = p.messages.map((m) =>
        m.id === a.messageId ? { ...m, resolution: a.accept ? ('accepted' as const) : ('rejected' as const) } : m,
      )
      if (!a.accept) {
        const roles = p.roles.map((r) => (r.id === role.id ? { ...r, response: 'pending' as const } : r))
        const text = `${name(p.lead)} kept ${role.title} at ${money(role.pay)} with a ${role.depositPct}% deposit. ${name(offer.author)} can accept or decline.`
        return { ...p, roles, messages: [...messages, sys(c, text)] }
      }
      // Any change to the draft bumps the version, which clears every signature.
      const version = p.version + 1
      const depositPct = offer.depositPct ?? role.depositPct
      const roles = p.roles.map((r) => ({
        ...r,
        ...(r.id === role.id ? { pay: offer.amount!, depositPct, milestones: rebalance(r.milestones, depositPct) } : {}),
        response: r.response === 'declined' ? r.response : ('pending' as const),
      }))
      const text = `Draft v${version}: ${role.title} is now ${money(offer.amount!)} with ${depositPct}% up front. The terms changed, so everyone signs the new version.`
      return withStatus({ ...p, version, roles, messages: [...messages, sys(c, text)] })
    }
    case 'say':
      return { ...p, messages: [...p.messages, { id: uid(), author: c.me, at: c.iso, kind: 'text', text: a.text }] }
    case 'fund': {
      if (p.status !== 'ready') return p
      // Deposits go out first, the moment money lands in the vault.
      const deposits = p.roles
        .map((r) => ({ r, amount: amountFor(r, 'deposit') }))
        .filter((d) => d.amount > 0)
      return {
        ...p,
        status: 'funded',
        fundedAt: c.iso,
        payouts: [...p.payouts, ...deposits.map(({ r, amount }) => pay(c, r, 'deposit', r.assignee!, amount, 'deposit'))],
        messages: [
          ...p.messages,
          sys(c, `${name(p.lead)} funded the vault with ${money(budget(p))} USDC. Work can start.`),
          ...(deposits.length
            ? [sys(c, `Deposits paid: ${deposits.map(({ r, amount }) => `${name(r.assignee!)} ${money(amount)}`).join(', ')}.`)]
            : []),
        ],
      }
    }
    case 'submit':
      return mapMilestoneWithLog(p, a, c, (m) => {
        if (m.status !== 'working') return [m]
        const round = m.submissions.length + 1
        return [
          { ...m, status: 'submitted', submissions: [...m.submissions, { id: uid(), at: c.iso, note: a.note, files: a.files }] },
          `${name(c.me)} submitted “${m.title}”${round > 1 ? ` (round ${round})` : ''}. ${name(p.lead)} has ${AUTO_APPROVE_DAYS} days to review.`,
        ]
      })
    case 'review': {
      const role = p.roles.find((r) => r.id === a.roleId)!
      const m = role.milestones.find((x) => x.id === a.milestoneId)!
      if (m.status !== 'submitted' || c.me !== p.lead) return p
      if (a.kind === 'changes' && revisionsLeft(m) === 0) return p
      const withReview = (mm: Milestone): Milestone => ({
        ...mm,
        status: a.kind === 'approved' ? 'paid' : 'working',
        submissions: mm.submissions.map((s, i) =>
          i === mm.submissions.length - 1 ? { ...s, review: { kind: a.kind, note: a.note || undefined, at: c.iso } } : s,
        ),
      })
      let next = mapMilestone(p, role.id, m.id, withReview)
      if (a.kind === 'approved') {
        const amount = amountFor(role, m.id)
        next = {
          ...next,
          payouts: [...next.payouts, pay(c, role, m.id, role.assignee!, amount, 'milestone')],
          messages: [...next.messages, sys(c, `${name(p.lead)} approved “${m.title}”. Vault paid ${name(role.assignee!)} ${money(amount)}.`)],
        }
      } else {
        const left = revisionsLeft(m) - 1
        next = {
          ...next,
          messages: [
            ...next.messages,
            sys(c, `${name(p.lead)} asked for changes on “${m.title}”: “${a.note}” (${left} revision round${left === 1 ? '' : 's'} left).`),
          ],
        }
      }
      return withStatus(next)
    }
    case 'openDispute':
      return mapMilestoneWithLog(p, a, c, (m) => {
        const ok = (c.me === p.lead && leadCanDispute(m)) || (c.me !== p.lead && collaboratorCanDispute(m))
        if (!ok) return [m]
        return [
          { ...m, status: 'disputed', dispute: { openedBy: c.me, at: c.iso, reason: a.reason, statements: [{ by: c.me, text: a.reason, at: c.iso }] } },
          `${name(c.me)} opened a dispute on “${m.title}”. Both sides state their case, then CrewPay review rules.`,
        ]
      })
    case 'statement':
      return mapMilestone(p, a.roleId, a.milestoneId, (m) =>
        m.dispute && !m.dispute.ruling
          ? { ...m, dispute: { ...m.dispute, statements: [...m.dispute.statements, { by: c.me, text: a.text, at: c.iso }] } }
          : m,
      )
    case 'rule': {
      const role = p.roles.find((r) => r.id === a.roleId)!
      const m = role.milestones.find((x) => x.id === a.milestoneId)!
      if (m.status !== 'disputed' || c.me !== REVIEWER) return p
      const total = amountFor(role, m.id)
      const toCollab = Math.round(total * a.collaboratorPct) / 100
      const toLead = Math.round((total - toCollab) * 100) / 100
      let next = mapMilestone(p, role.id, m.id, (mm) => ({
        ...mm,
        status: 'resolved',
        dispute: { ...mm.dispute!, ruling: { collaboratorPct: a.collaboratorPct, note: a.note, at: c.iso } },
      }))
      next = {
        ...next,
        payouts: [
          ...next.payouts,
          ...(toCollab > 0 ? [pay(c, role, m.id, role.assignee!, toCollab, 'ruling')] : []),
          ...(toLead > 0 ? [pay(c, role, m.id, p.lead, toLead, 'refund')] : []),
        ],
        messages: [
          ...next.messages,
          sys(c, `CrewPay review ruled on “${m.title}”: ${a.collaboratorPct}% to ${name(role.assignee!)} (${money(toCollab)}), ${money(toLead)} back to ${name(p.lead)}. This is final.`),
        ],
      }
      return withStatus(next)
    }
    case 'reclaim': {
      const role = p.roles.find((r) => r.id === a.roleId)!
      const m = role.milestones.find((x) => x.id === a.milestoneId)!
      if (c.me !== p.lead || !canReclaim(m, c.now)) return p
      const amount = amountFor(role, m.id)
      let next = mapMilestone(p, role.id, m.id, (mm) => ({ ...mm, status: 'reclaimed' }))
      next = {
        ...next,
        payouts: [...next.payouts, pay(c, role, m.id, p.lead, amount, 'refund')],
        messages: [...next.messages, sys(c, `“${m.title}” passed its deadline with nothing submitted. ${money(amount)} returned to ${name(p.lead)}.`)],
      }
      return withStatus(next)
    }
    default:
      return p
  }
}

function mapMilestoneWithLog(
  p: Project,
  a: Target,
  c: Ctx,
  fn: (m: Milestone) => [Milestone, string?],
): Project {
  let log: string | undefined
  const next = mapMilestone(p, a.roleId, a.milestoneId, (m) => {
    const [mm, text] = fn(m)
    log = text
    return mm
  })
  return log ? { ...next, messages: [...next.messages, sys(c, log)] } : p
}

function reducer(state: State, a: Action): State {
  const now = Date.now() + state.clockOffset
  const c: Ctx = { now, iso: new Date(now).toISOString(), me: state.me }
  switch (a.type) {
    case 'switchUser':
      return { ...state, me: a.me }
    case 'reset':
      return seed()
    case 'create':
      return { ...state, projects: [a.project, ...state.projects] }
    case 'advance': {
      const offset = state.clockOffset + a.days * DAY
      const later: Ctx = { ...c, now: Date.now() + offset, iso: new Date(Date.now() + offset).toISOString() }
      return { ...state, clockOffset: offset, projects: state.projects.map((p) => sweep(p, later)) }
    }
    default:
      return mapProject(state, a.projectId, (p) => sweep(reduceProject(p, a, c), c))
  }
}

// ---------- provider ----------

const KEY = 'crewpay:v2'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch {
    // Storage blocked or corrupt: fall back to demo data.
  }
  return seed()
}

type Store = State & { dispatch: (a: Action) => void; now: number }

const StoreCtx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Not critical for a prototype.
    }
  }, [state])
  // Wall clock ticks every 30s so countdowns stay live; the demo offset moves it forward on "advance".
  const [wall, setWall] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setWall(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const now = wall + state.clockOffset
  return <StoreCtx.Provider value={{ ...state, dispatch, now }}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

export { name as personName, lastSubmission, schedule }
