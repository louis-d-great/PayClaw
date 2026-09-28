import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { uid } from './lib/format'
import type { Handle, Message, Project, Role } from './types'

// Front-end-only store for the MVP prototype. Everything lives in
// localStorage; Supabase (drafts, chat) and the Base vault replace it later.

export const PEOPLE: Handle[] = ['@louis', '@tobi', '@ada', '@kemi']

type State = { me: Handle; projects: Project[] }

type Action =
  | { type: 'switchUser'; me: Handle }
  | { type: 'create'; project: Project }
  | { type: 'accept'; projectId: string; roleId: string }
  | { type: 'counter'; projectId: string; roleId: string; amount: number; note: string }
  | { type: 'decline'; projectId: string; roleId: string; note: string }
  | { type: 'resolveCounter'; projectId: string; messageId: string; accept: boolean }
  | { type: 'say'; projectId: string; text: string }
  | { type: 'fund'; projectId: string }
  | { type: 'reset' }

const now = () => new Date().toISOString()
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()

const msg = (m: Omit<Message, 'id' | 'at'> & { at?: string }): Message => ({
  id: uid(),
  at: m.at ?? now(),
  ...m,
})

export const isSigned = (p: Project, r: Role) => r.signedVersion === p.version
export const budget = (p: Project) => p.roles.reduce((sum, r) => sum + r.pay, 0)
export const signedCount = (p: Project) => p.roles.filter((r) => isSigned(p, r)).length

function seed(): State {
  const lagos: Project = {
    id: 'lagos-nights',
    name: 'Lagos Nights EP',
    brief:
      'A 4-track afrobeats EP for release in March. I have the concept, two demos and the artwork direction. ' +
      'I need a producer to finish the beats, a vocalist for hooks and harmonies, and a mix engineer to bring it home.',
    deadline: '2026-11-30',
    lead: '@louis',
    version: 1,
    status: 'signing',
    createdAt: ago(60 * 26),
    roles: [
      {
        id: 'r-prod',
        title: 'Producer',
        assignee: '@tobi',
        pay: 600,
        response: 'accepted',
        signedVersion: 1,
        milestones: [
          { id: 'm1', title: 'Beats for all 4 tracks', due: '2026-10-20' },
          { id: 'm2', title: 'Stems delivered to mix', due: '2026-11-05' },
        ],
      },
      {
        id: 'r-vox',
        title: 'Vocalist',
        assignee: '@ada',
        pay: 450,
        response: 'countered',
        milestones: [{ id: 'm3', title: 'Hooks + harmonies recorded', due: '2026-11-01' }],
      },
      {
        id: 'r-mix',
        title: 'Mix engineer',
        pay: 300,
        response: 'pending',
        milestones: [{ id: 'm4', title: 'Final mix + master', due: '2026-11-25' }],
      },
    ],
    messages: [],
  }
  lagos.messages = [
    msg({ author: 'system', kind: 'system', text: 'Louis posted the brief and sent invites.', at: ago(60 * 26) }),
    msg({ author: '@tobi', kind: 'system', text: 'Tobi accepted and signed Producer for $600.', at: ago(60 * 20) }),
    msg({ author: '@tobi', kind: 'text', text: "Demos sound great. I'll start on track 2 first.", at: ago(60 * 19) }),
    msg({
      author: '@ada',
      kind: 'counter',
      roleId: 'r-vox',
      amount: 550,
      text: 'Love the brief. Hooks + stacked harmonies on 4 tracks is two extra sessions for me, so I’m asking $550.',
      at: ago(45),
    }),
  ]

  const kora: Project = {
    id: 'kora-identity',
    name: 'Kora — brand identity',
    brief:
      'Full identity for Kora, a Lagos coffee roaster: logo, packaging illustrations and a short motion loop for socials.',
    deadline: '2026-12-15',
    lead: '@kemi',
    version: 1,
    status: 'signing',
    createdAt: ago(60 * 5),
    roles: [
      {
        id: 'r-illus',
        title: 'Illustrator',
        assignee: '@louis',
        pay: 800,
        response: 'pending',
        milestones: [
          { id: 'k1', title: 'Three packaging directions', due: '2026-10-25' },
          { id: 'k2', title: 'Final illustrations', due: '2026-11-20' },
        ],
      },
      {
        id: 'r-motion',
        title: 'Motion designer',
        assignee: '@ada',
        pay: 500,
        response: 'accepted',
        signedVersion: 1,
        milestones: [{ id: 'k3', title: '15s social loop', due: '2026-12-05' }],
      },
    ],
    messages: [
      msg({ author: 'system', kind: 'system', text: 'Kemi posted the brief and sent invites.', at: ago(60 * 5) }),
      msg({ author: '@ada', kind: 'system', text: 'Ada accepted and signed Motion designer for $500.', at: ago(60 * 3) }),
    ],
  }

  return { me: '@louis', projects: [lagos, kora] }
}

function updateProject(state: State, id: string, fn: (p: Project) => Project): State {
  return { ...state, projects: state.projects.map((p) => (p.id === id ? fn(p) : p)) }
}

function withStatus(p: Project): Project {
  if (p.status !== 'signing' && p.status !== 'ready') return p
  const allSigned = p.roles.length > 0 && p.roles.every((r) => isSigned(p, r))
  return { ...p, status: allSigned ? 'ready' : 'signing' }
}

const name = (h: Handle) => h.replace(/^@/, '').replace(/^./, (c) => c.toUpperCase())

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'switchUser':
      return { ...state, me: a.me }
    case 'reset':
      return seed()
    case 'create':
      return { ...state, projects: [a.project, ...state.projects] }
    case 'accept':
      return updateProject(state, a.projectId, (p) => {
        const role = p.roles.find((r) => r.id === a.roleId)!
        const roles = p.roles.map((r) =>
          r.id === a.roleId
            ? { ...r, assignee: r.assignee ?? state.me, response: 'accepted' as const, signedVersion: p.version }
            : r,
        )
        const note = msg({
          author: state.me,
          kind: 'system',
          text: `${name(state.me)} accepted and signed ${role.title} for $${role.pay}.`,
        })
        return withStatus({ ...p, roles, messages: [...p.messages, note] })
      })
    case 'counter':
      return updateProject(state, a.projectId, (p) => ({
        ...p,
        roles: p.roles.map((r) =>
          r.id === a.roleId ? { ...r, assignee: r.assignee ?? state.me, response: 'countered' as const } : r,
        ),
        messages: [
          ...p.messages,
          msg({ author: state.me, kind: 'counter', roleId: a.roleId, amount: a.amount, text: a.note }),
        ],
      }))
    case 'decline':
      return updateProject(state, a.projectId, (p) => {
        const role = p.roles.find((r) => r.id === a.roleId)!
        // Declining frees the role up again so the Lead can invite someone else.
        const roles = p.roles.map((r) =>
          r.id === a.roleId ? { ...r, assignee: undefined, response: 'pending' as const, signedVersion: undefined } : r,
        )
        const text = `${name(state.me)} declined ${role.title}.${a.note ? ` “${a.note}”` : ''} The role is open again.`
        return withStatus({ ...p, roles, messages: [...p.messages, msg({ author: state.me, kind: 'system', text })] })
      })
    case 'resolveCounter':
      return updateProject(state, a.projectId, (p) => {
        const offer = p.messages.find((m) => m.id === a.messageId)
        if (!offer || offer.kind !== 'counter' || offer.resolution) return p
        const role = p.roles.find((r) => r.id === offer.roleId)!
        const messages = p.messages.map((m) =>
          m.id === a.messageId ? { ...m, resolution: a.accept ? ('accepted' as const) : ('rejected' as const) } : m,
        )
        if (!a.accept) {
          const roles = p.roles.map((r) => (r.id === role.id ? { ...r, response: 'pending' as const } : r))
          const text = `${name(p.lead)} kept ${role.title} at $${role.pay}. ${name(offer.author)} can accept or decline.`
          return { ...p, roles, messages: [...messages, msg({ author: 'system', kind: 'system', text })] }
        }
        // Any change to the draft bumps the version, which clears every signature.
        const version = p.version + 1
        const roles = p.roles.map((r) => ({
          ...r,
          pay: r.id === role.id ? offer.amount! : r.pay,
          response: r.response === 'declined' ? r.response : ('pending' as const),
        }))
        const text =
          `Draft v${version}: ${role.title} is now $${offer.amount}. ` +
          `Budget changed, so everyone signs the new version.`
        return withStatus({
          ...p,
          version,
          roles,
          messages: [...messages, msg({ author: 'system', kind: 'system', text })],
        })
      })
    case 'say':
      return updateProject(state, a.projectId, (p) => ({
        ...p,
        messages: [...p.messages, msg({ author: state.me, kind: 'text', text: a.text })],
      }))
    case 'fund':
      return updateProject(state, a.projectId, (p) =>
        p.status !== 'ready'
          ? p
          : {
              ...p,
              status: 'funded',
              messages: [
                ...p.messages,
                msg({
                  author: 'system',
                  kind: 'system',
                  text: `${name(p.lead)} funded the vault with $${budget(p)} USDC. Work can start.`,
                }),
              ],
            },
      )
  }
}

const KEY = 'crewpay:v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch {
    // Storage blocked or corrupt: fall back to demo data.
  }
  return seed()
}

type Store = State & { dispatch: (a: Action) => void }

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Not critical for a prototype.
    }
  }, [state])
  return <Ctx.Provider value={{ ...state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

export { name as personName }
