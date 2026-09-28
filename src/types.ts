// A handle like "@tobi". In the MVP this stands in for a real account + wallet.
export type Handle = string

export type Milestone = {
  id: string
  title: string
  due?: string // YYYY-MM-DD
}

export type RoleResponse = 'pending' | 'accepted' | 'countered' | 'declined'

export type Role = {
  id: string
  title: string // free text, e.g. "Mix engineer"
  assignee?: Handle // empty = open role, anyone with the link can respond
  pay: number // fixed amount in USDC
  milestones: Milestone[]
  response: RoleResponse
  // Version of the draft this person signed. A signature only counts
  // while it matches the project's current version.
  signedVersion?: number
}

export type ProjectStatus = 'signing' | 'ready' | 'funded' | 'done'

export type MessageKind = 'text' | 'counter' | 'system'

export type Message = {
  id: string
  author: Handle | 'system'
  at: string // ISO timestamp
  kind: MessageKind
  text: string
  roleId?: string
  amount?: number // for counter-offers
  resolution?: 'accepted' | 'rejected'
}

export type Project = {
  id: string
  name: string
  brief: string
  deadline?: string
  lead: Handle
  roles: Role[]
  version: number // bumps on every change to the draft
  status: ProjectStatus
  messages: Message[]
  createdAt: string
}
