import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { LIVE_ACTIONS, People, fetchInvite, fetchProfiles, fetchProjects, perform } from './live'
import { supabase } from './lib/supabase'
import { Onboarding, SignIn, Splash } from './pages/Auth'
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
  vault,
} from './lib/rules'
import {
  REVIEWER,
  dmKey,
  type Attachment,
  type FileRef,
  type Handle,
  type Message,
  type Milestone,
  type Payout,
  type PayoutPreference,
  type Profile,
  type Project,
  type Role,
} from './types'

// Front-end-only store for the MVP prototype. Everything lives in
// localStorage; Supabase (drafts, chat, files) and the Base vault replace it later.

export const PEOPLE: Handle[] = ['@louis', '@tobi', '@ada', '@kemi', '@zara', REVIEWER]

export type State = {
  me: Handle
  projects: Project[]
  profiles: Record<Handle, Profile>
  // Last time each person looked at each chat: `${projectId}:${channel}:${handle}` → ISO time. Drives the ✓✓ ticks.
  seen: Record<string, string>
  // Demo time travel: lets you see auto-approve and missed-deadline rules fire.
  clockOffset: number
}

export type Channel = 'group' | string // 'group' or a dmKey
export type DraftEdit = Pick<Project, 'name' | 'brief' | 'deadline' | 'roles'>

type Target = { projectId: string; roleId: string; milestoneId: string }

export type Action =
  | { type: 'switchUser'; me: Handle }
  | { type: 'create'; project: Project }
  | { type: 'accept'; projectId: string; roleId: string; payout: PayoutPreference }
  | { type: 'counter'; projectId: string; roleId: string; amount: number; depositPct: number; note: string }
  | { type: 'decline'; projectId: string; roleId: string; note: string }
  | { type: 'resolveCounter'; projectId: string; messageId: string; accept: boolean }
  | { type: 'say'; projectId: string; text: string; attachments?: Attachment[]; replyTo?: string; to?: Handle }
  | { type: 'seen'; projectId: string; channel: Channel }
  | { type: 'apply'; projectId: string; roleId: string; portfolio: string; note: string; amount?: number }
  | { type: 'pick'; projectId: string; roleId: string; handle: Handle }
  | { type: 'editDraft'; projectId: string; draft: DraftEdit }
  | { type: 'cancelDraft'; projectId: string; reason: string }
  | { type: 'proposeCancel'; projectId: string; reason: string }
  | { type: 'approveCancel'; projectId: string }
  | { type: 'withdrawCancel'; projectId: string }
  | { type: 'updateProfile'; profile: Profile }
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

// Live mode fills this with people's real names from their profiles.
const liveNames = new Map<Handle, string>()
export const setLiveNames = (names: [Handle, string][]) => {
  liveNames.clear()
  for (const [h, n] of names) liveNames.set(h, n)
}

const name = (h: Handle) =>
  liveNames.get(h) ?? (h === REVIEWER ? 'CrewPay review' : h.replace(/^@/, '').replace(/^./, (c) => c.toUpperCase()))
const money = (n: number) => `$${n.toLocaleString('en-US')}`

// Everyone whose agreement a cancel needs: the Lead and every signed collaborator.
export const parties = (p: Project) => [p.lead, ...p.roles.map((r) => r.assignee).filter((h): h is Handle => !!h)]

// A tiny inline illustration so the demo chat has a real image attachment.
const DEMO_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f4e3c3"/>' +
      '<circle cx="90" cy="100" r="54" fill="#ff6a3d"/><circle cx="150" cy="100" r="54" fill="#1d1b16" fill-opacity=".85"/>' +
      '<rect x="200" y="46" width="90" height="16" rx="8" fill="#1d1b16"/><rect x="200" y="74" width="70" height="10" rx="5" fill="#6f6a5f"/>' +
      '<rect x="200" y="92" width="80" height="10" rx="5" fill="#6f6a5f"/><rect x="200" y="130" width="60" height="24" rx="12" fill="#ff6a3d"/></svg>',
  )

// ---------- demo data ----------

export function seed(): State {
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
    dms: {},
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
        applicants: [
          {
            handle: '@zara',
            portfolio: 'https://soundcloud.com/zara-mixes',
            note: 'I mixed two afrobeats EPs this year, both charted on Apple Music NG. Happy to do a free test mix of 30 seconds.',
            amount: 350,
            at: ago(0.5),
          },
          {
            handle: '@kemi',
            portfolio: 'https://kemi.studio/audio',
            note: 'Mostly podcasts, but I have a treated room and I work fast.',
            at: ago(0.3),
          },
        ],
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
    dms: {},
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
    dms: {},
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
    msg({
      author: '@ada',
      kind: 'text',
      text: 'First look at the homepage hero. Swatches rotate every 4 seconds.',
      at: ago(12),
      attachments: [{ name: 'oja-hero-draft.svg', size: 612, mime: 'image/svg+xml', kind: 'image', url: DEMO_IMAGE }],
    }),
    msg({ author: 'system', kind: 'system', text: 'Louis approved “Homepage + catalogue design”. Vault paid Ada $280.', at: ago(8) }),
    msg({ author: 'system', kind: 'system', text: 'Tobi opened a dispute on “Site live on staging”. CrewPay review will rule.', at: ago(1) }),
  ]

  oja.dms[dmKey('@louis', '@ada')] = [
    msg({ author: '@ada', kind: 'text', text: 'Quick one: can I use the shop owner’s photos from Instagram for the hero?', at: ago(11) }),
    msg({ author: '@louis', kind: 'text', text: 'Yes, she said any of them. I’ll confirm in the group chat so it’s on record.', at: ago(10.9) }),
  ]

  const profiles: Record<Handle, Profile> = {
    '@louis': { handle: '@louis', name: 'Louis', bio: 'Product designer in Lagos. I start projects and build crews to ship them.', skills: ['Product design', 'Brand', 'Frontend'], portfolio: 'https://louis.design' },
    '@tobi': { handle: '@tobi', name: 'Tobi', bio: 'Producer and frontend developer. Afrobeats by night, React by day.', skills: ['Music production', 'React', 'Performance'] },
    '@ada': { handle: '@ada', name: 'Ada', bio: 'Vocalist, web and motion designer.', skills: ['Vocals', 'Web design', 'Motion'], portfolio: 'https://ada.works' },
    '@kemi': { handle: '@kemi', name: 'Kemi', bio: 'Copywriter and creative director. English and Yoruba.', skills: ['Copywriting', 'Creative direction'] },
    '@zara': { handle: '@zara', name: 'Zara', bio: 'Mix and mastering engineer.', skills: ['Mixing', 'Mastering'], portfolio: 'https://soundcloud.com/zara-mixes' },
    [REVIEWER]: { handle: REVIEWER, name: 'CrewPay review', bio: 'Neutral reviewers who rule on disputes.', skills: [] },
  }

  return { me: '@louis', projects: [oja, lagos, kora], profiles, seen: {}, clockOffset: 0 }
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
    case 'say': {
      // The picked file itself isn't kept in state; live mode uploads it separately.
      const attachments = a.attachments?.map(({ blob: _blob, ...x }) => x)
      const m: Message = { id: uid(), author: c.me, at: c.iso, kind: 'text', text: a.text, attachments, replyTo: a.replyTo }
      if (!a.to) return { ...p, messages: [...p.messages, m] }
      const key = dmKey(c.me, a.to)
      return { ...p, dms: { ...p.dms, [key]: [...(p.dms[key] ?? []), m] } }
    }
    case 'apply': {
      const role = p.roles.find((r) => r.id === a.roleId)
      if (!role || role.assignee || c.me === p.lead || role.applicants?.some((x) => x.handle === c.me)) return p
      const applicant = { handle: c.me, portfolio: a.portfolio, note: a.note, amount: a.amount, at: c.iso }
      return {
        ...p,
        roles: p.roles.map((r) => (r.id === role.id ? { ...r, applicants: [...(r.applicants ?? []), applicant] } : r)),
        messages: [
          ...p.messages,
          sys(c, `${name(c.me)} applied for ${role.title}${a.amount && a.amount !== role.pay ? `, asking ${money(a.amount)}` : ''}.`),
        ],
      }
    }
    case 'pick': {
      const role = p.roles.find((r) => r.id === a.roleId)
      const applicant = role?.applicants?.find((x) => x.handle === a.handle)
      if (!role || !applicant || c.me !== p.lead || role.assignee) return p
      // Picking someone at a different price changes the terms, so everyone signs again.
      const repriced = applicant.amount !== undefined && applicant.amount !== role.pay
      const version = repriced ? p.version + 1 : p.version
      const roles = p.roles.map((r) =>
        r.id === role.id
          ? { ...r, assignee: a.handle, pay: repriced ? applicant.amount! : r.pay, response: 'pending' as const, applicants: [] }
          : repriced && r.response !== 'declined'
            ? { ...r, response: 'pending' as const }
            : r,
      )
      const text = repriced
        ? `Draft v${version}: ${name(p.lead)} picked ${name(a.handle)} for ${role.title} at ${money(applicant.amount!)}. The budget changed, so everyone signs again.`
        : `${name(p.lead)} picked ${name(a.handle)} for ${role.title}. ${name(a.handle)} can now review and sign.`
      return withStatus({ ...p, version, roles, messages: [...p.messages, sys(c, text)] })
    }
    case 'editDraft': {
      if (c.me !== p.lead || (p.status !== 'signing' && p.status !== 'ready')) return p
      const version = p.version + 1
      const before = new Map(p.roles.map((r) => [r.id, r]))
      const changes: string[] = []
      if (a.draft.brief !== p.brief) changes.push('brief updated')
      if (a.draft.deadline !== p.deadline) changes.push('deadline moved')
      for (const r of a.draft.roles) {
        const old = before.get(r.id)
        if (!old) changes.push(`${r.title} added`)
        else {
          if (old.pay !== r.pay) changes.push(`${r.title} ${money(old.pay)} → ${money(r.pay)}`)
          if (old.depositPct !== r.depositPct) changes.push(`${r.title} deposit ${old.depositPct}% → ${r.depositPct}%`)
          if (old.assignee !== r.assignee) changes.push(`${r.title} now ${r.assignee ? name(r.assignee) : 'open'}`)
          if (JSON.stringify(old.milestones.map((m) => [m.title, m.doneWhen, m.pct, m.due, m.revisions])) !==
            JSON.stringify(r.milestones.map((m) => [m.title, m.doneWhen, m.pct, m.due, m.revisions])))
            changes.push(`${r.title} milestones changed`)
        }
      }
      for (const r of p.roles) if (!a.draft.roles.some((x) => x.id === r.id)) changes.push(`${r.title} removed`)
      if (changes.length === 0 && a.draft.name === p.name) return p
      const roles = a.draft.roles.map((r) => {
        const old = before.get(r.id)
        const samePerson = old && old.assignee === r.assignee
        return {
          ...r,
          response: samePerson && old.response === 'declined' ? old.response : ('pending' as const),
          signedVersion: samePerson ? old.signedVersion : undefined,
          payout: samePerson ? old.payout : undefined,
          applicants: r.assignee ? [] : (old?.applicants ?? []),
        }
      })
      // Open counter-offers were about the old terms; close them.
      const messages = p.messages.map((m) => (m.kind === 'counter' && !m.resolution ? { ...m, resolution: 'rejected' as const } : m))
      const text = `Draft v${version}: ${name(p.lead)} edited the draft (${changes.join(', ') || 'renamed'}). Everyone signs the new version.`
      return withStatus({ ...p, ...a.draft, version, roles, messages: [...messages, sys(c, text)] })
    }
    case 'cancelDraft': {
      // Before funding nothing is locked, so the Lead can call it off alone.
      if (c.me !== p.lead || (p.status !== 'signing' && p.status !== 'ready')) return p
      return {
        ...p,
        status: 'cancelled',
        messages: [...p.messages, sys(c, `${name(p.lead)} cancelled the project before funding.${a.reason ? ` “${a.reason}”` : ''} No money moved.`)],
      }
    }
    case 'proposeCancel': {
      if (p.status !== 'funded' || p.cancel || !parties(p).includes(c.me)) return p
      return {
        ...p,
        cancel: { proposedBy: c.me, reason: a.reason, at: c.iso, approvals: [c.me] },
        messages: [...p.messages, sys(c, `${name(c.me)} asked to cancel the project: “${a.reason}”. It needs everyone’s agreement.`)],
      }
    }
    case 'withdrawCancel': {
      if (!p.cancel || !parties(p).includes(c.me)) return p
      const text =
        c.me === p.cancel.proposedBy
          ? `${name(c.me)} withdrew the cancel request. Work continues.`
          : `${name(c.me)} said no to cancelling. Work continues.`
      return { ...p, cancel: undefined, messages: [...p.messages, sys(c, text)] }
    }
    case 'approveCancel': {
      if (!p.cancel || !parties(p).includes(c.me) || p.cancel.approvals.includes(c.me)) return p
      const approvals = [...p.cancel.approvals, c.me]
      if (!parties(p).every((h) => approvals.includes(h)))
        return {
          ...p,
          cancel: { ...p.cancel, approvals },
          messages: [...p.messages, sys(c, `${name(c.me)} agreed to cancel (${approvals.length} of ${parties(p).length}).`)],
        }
      // Everyone agreed: whatever is still in the vault goes back to the Lead. Money already paid stays paid.
      const held = vault(p).held
      const roles = p.roles.map((r) => ({
        ...r,
        milestones: r.milestones.map((m) => (isSettled(m) ? m : { ...m, status: 'cancelled' as const })),
      }))
      return {
        ...p,
        roles,
        status: 'cancelled',
        cancel: { ...p.cancel, approvals },
        payouts: held > 0 ? [...p.payouts, { id: uid(), at: c.iso, roleId: '', to: p.lead, amount: held, kind: 'refund' }] : p.payouts,
        messages: [...p.messages, sys(c, `Everyone agreed. The project is cancelled and ${money(held)} still in the vault went back to ${name(p.lead)}.`)],
      }
    }
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

export function reducer(state: State, a: Action): State {
  const now = Date.now() + state.clockOffset
  const c: Ctx = { now, iso: new Date(now).toISOString(), me: state.me }
  switch (a.type) {
    case 'switchUser':
      return { ...state, me: a.me }
    case 'reset':
      return seed()
    case 'create':
      return { ...state, projects: [a.project, ...state.projects] }
    case 'seen':
      return { ...state, seen: { ...state.seen, [`${a.projectId}:${a.channel}:${state.me}`]: c.iso } }
    case 'updateProfile':
      return { ...state, profiles: { ...state.profiles, [a.profile.handle]: a.profile } }
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

// Demo: everything in this browser, "Viewing as" to play every side.
// Live: Supabase sign-in, projects and chat (needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
export type Mode = 'demo' | 'live'

type Store = State & {
  dispatch: (a: Action) => void
  now: number
  mode: Mode
  setMode: (m: Mode) => void
  notice: string
  clearNotice: () => void
  signOut: () => void
  // Live: fetch a project you were sent a link to but aren't on yet. Demo: nothing to fetch.
  loadProject: (id: string) => Promise<void>
}

const StoreCtx = createContext<Store | null>(null)

const KEY = 'crewpay:v3'
const MODE_KEY = 'crewpay:mode'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not critical.
  }
}

function load(): State {
  try {
    const raw = read(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch {
    // Corrupt: fall back to demo data.
  }
  return seed()
}

// Wall clock ticks every 30s so countdowns stay live.
function useWallClock() {
  const [wall, setWall] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setWall(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return wall
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => (supabase && read(MODE_KEY) !== 'demo' ? 'live' : 'demo'))
  const setMode = useCallback((m: Mode) => {
    write(MODE_KEY, m)
    setLiveNames([])
    setModeState(m)
  }, [])
  return mode === 'live' ? (
    <LiveProvider setMode={setMode}>{children}</LiveProvider>
  ) : (
    <DemoProvider setMode={setMode}>{children}</DemoProvider>
  )
}

function DemoProvider({ children, setMode }: { children: ReactNode; setMode: (m: Mode) => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => write(KEY, JSON.stringify(state)), [state])
  const now = useWallClock() + state.clockOffset
  const value: Store = {
    ...state,
    dispatch,
    now,
    mode: 'demo',
    setMode,
    notice: '',
    clearNotice: () => {},
    signOut: () => {},
    loadProject: async () => {},
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

function LiveProvider({ children, setMode }: { children: ReactNode; setMode: (m: Mode) => void }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const sb = supabase!
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <Splash />
  if (!session) return <SignIn onDemo={() => setMode('demo')} />
  return (
    <LiveSession key={session.user.id} userId={session.user.id} setMode={setMode}>
      {children}
    </LiveSession>
  )
}

type LiveState = { me: Handle; projects: Project[]; profiles: Record<Handle, Profile>; seen: Record<string, string> }

const NOT_LIVE = 'Funding, milestone work and disputes go live with the vault. Try them in the demo for now.'

function LiveSession({ userId, children, setMode }: { userId: string; children: ReactNode; setMode: (m: Mode) => void }) {
  const [people] = useState(() => new People())
  const [state, setState] = useState<LiveState | undefined>()
  const [needsProfile, setNeedsProfile] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState('')
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  const publish = useCallback(
    (fn: (s: LiveState) => LiveState) =>
      setState((s) => {
        if (!s) return s
        setLiveNames([...people.byId.values()].map((p) => [`@${p.handle}`, p.name]))
        return { ...fn(s), profiles: people.profiles() }
      }),
    [people],
  )

  const loadAll = useCallback(async () => {
    try {
      const [mine] = await fetchProfiles([userId])
      if (!mine) return setNeedsProfile(true)
      people.add([mine])
      setNeedsProfile(false)
      const { projects, seen } = await fetchProjects(people)
      setLiveNames([...people.byId.values()].map((p) => [`@${p.handle}`, p.name]))
      // Keep invites opened from a link; they aren't in the list of projects you're on.
      setState((s) => ({
        me: `@${mine.handle}`,
        projects: [...projects, ...(s?.projects.filter((p) => p.guest && !projects.some((x) => x.id === p.id)) ?? [])],
        profiles: people.profiles(),
        seen,
      }))
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e))
    }
  }, [people, userId])

  const reload = useCallback(
    async (ids: string[]) => {
      try {
        const { projects, seen } = await fetchProjects(people, ids)
        const guests = await Promise.all(
          ids.filter((id) => !projects.some((p) => p.id === id)).map((id) => fetchInvite(people, id, userId)),
        )
        const fresh = [...projects, ...guests.filter((p): p is Project => !!p)]
        publish((s) => {
          const rest = s.projects.filter((p) => !ids.includes(p.id))
          return {
            ...s,
            projects: [...fresh, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            seen: { ...s.seen, ...seen },
          }
        })
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e))
      }
    },
    [people, publish, userId],
  )

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Live updates: the database only sends changes this person is allowed to see.
  useEffect(() => {
    const sb = supabase!
    const pending = new Set<string>()
    let everything = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      if (everything) loadAll()
      else if (pending.size) reload([...pending])
      pending.clear()
      everything = false
    }
    const channel = sb.channel(`crewpay:${userId}`)
    for (const table of ['messages', 'message_reads', 'projects', 'roles', 'milestones', 'submissions']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, string> | undefined
        const id = table === 'projects' ? row?.id : row?.project_id
        if (id) pending.add(id)
        else everything = true
        clearTimeout(timer)
        timer = setTimeout(flush, 250)
      })
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      sb.removeChannel(channel)
    }
  }, [loadAll, reload, userId])

  const dispatch = useCallback(
    (a: Action) => {
      const s = latest.current
      if (!s) return
      if (!LIVE_ACTIONS.has(a.type)) return setNotice(NOT_LIVE)
      const projectId = a.type === 'create' ? a.project.id : 'projectId' in a ? a.projectId : undefined
      const project = s.projects.find((p) => p.id === projectId)
      // Show the change straight away; the database's version replaces it a moment later.
      publish((cur) => {
        const next = reducer({ ...cur, clockOffset: 0 }, a)
        return { ...cur, projects: next.projects, seen: next.seen }
      })
      perform(a, { meId: userId, people, project })
        .then(() => {
          if (a.type === 'updateProfile') loadAll()
          else if (a.type !== 'seen' && projectId) reload([projectId])
        })
        .catch((e: unknown) => {
          setNotice(e instanceof Error ? e.message : String(e))
          if (projectId) reload([projectId])
        })
    },
    [loadAll, people, publish, reload, userId],
  )

  const loadProject = useCallback(
    async (id: string) => {
      if (!latest.current?.projects.some((p) => p.id === id)) await reload([id])
    },
    [reload],
  )

  const clearNotice = useCallback(() => setNotice(''), [])
  const now = useWallClock()
  if (needsProfile) return <Onboarding userId={userId} onDone={loadAll} />
  if (failed) return <Splash error={failed} onRetry={() => (setFailed(''), loadAll())} />
  if (!state) return <Splash />

  const value: Store = {
    ...state,
    clockOffset: 0,
    dispatch,
    now,
    mode: 'live',
    setMode,
    notice,
    clearNotice,
    signOut: () => supabase!.auth.signOut(),
    loadProject,
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

export { name as personName, lastSubmission, schedule }
