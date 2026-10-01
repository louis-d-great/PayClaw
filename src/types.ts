// A handle like "@tobi". In the MVP this stands in for a real account + wallet.
export type Handle = string

// The neutral reviewer who rules on disputes. In the MVP that's the CrewPay team.
export const REVIEWER: Handle = '@crewpay'

export type FileRef = {
  name: string
  size: number // bytes
  // Previews can be opened any time. Finals stay locked until the milestone is paid,
  // so a Lead can't take the work without paying for it.
  kind: 'preview' | 'final'
  mime?: string
  // Small files are kept inline as a data URL in the prototype, so a preview beat or
  // mockup can be played or viewed right on the milestone. Supabase Storage replaces this.
  url?: string
}

export type Review = {
  kind: 'approved' | 'changes' | 'auto-approved'
  note?: string
  at: string
}

export type Submission = {
  id: string
  at: string
  note: string
  files: FileRef[]
  review?: Review
}

export type Statement = { by: Handle; text: string; at: string }

export type Dispute = {
  openedBy: Handle
  at: string
  reason: string
  statements: Statement[]
  // Share of this milestone's money that goes to the collaborator; the rest returns to the Lead.
  ruling?: { collaboratorPct: number; note: string; at: string }
}

export type MilestoneStatus =
  | 'working' // nothing submitted yet, or changes requested
  | 'submitted' // waiting for the Lead
  | 'paid'
  | 'disputed'
  | 'resolved' // dispute ruled, money split
  | 'reclaimed' // deadline missed with nothing submitted, money back to the Lead
  | 'cancelled' // the whole crew agreed to cancel the project

export type Milestone = {
  id: string
  title: string
  doneWhen: string // definition of done, agreed at signing
  pct: number // share of the role's pay
  due?: string // YYYY-MM-DD
  revisions: number // rounds of changes the Lead may request before a dispute can open
  status: MilestoneStatus
  submissions: Submission[]
  dispute?: Dispute
}

export type PayoutMethod = 'wallet' | 'bank'

export type PayoutPreference = {
  method: PayoutMethod
  wallet?: string // 0x… address for USDC on Base
  bank?: { name: string; account: string; currency: string } // phase 2, through an offramp
  note?: string
}

export type Applicant = {
  handle: Handle
  portfolio: string // link to past work
  note: string
  amount?: number // asking price, if different from the offer
  at: string
}

export type RoleResponse = 'pending' | 'accepted' | 'countered' | 'declined'

export type Role = {
  id: string
  title: string // free text, e.g. "Mix engineer"
  assignee?: Handle // empty = open role, anyone with the link can respond
  pay: number // fixed amount in USDC
  depositPct: number // paid first, the moment the vault is funded
  milestones: Milestone[]
  response: RoleResponse
  // Version of the draft this person signed. A signature only counts
  // while it matches the project's current version.
  signedVersion?: number
  payout?: PayoutPreference
  applicants?: Applicant[] // open roles only
}

export type ProjectStatus = 'signing' | 'ready' | 'funded' | 'done' | 'cancelled'

export type MessageKind = 'text' | 'counter' | 'system'

export type Attachment = {
  name: string
  size: number
  mime: string
  kind: 'image' | 'audio' | 'video' | 'file'
  // Demo: small files inline as a data URL. Live: a short-lived signed link to Supabase Storage.
  url?: string
  path?: string // live: where the file sits in Storage
  blob?: Blob // the picked file, kept only until it's uploaded
}

export type Message = {
  id: string
  author: Handle | 'system'
  at: string // ISO timestamp
  kind: MessageKind
  text: string
  roleId?: string
  amount?: number // counter-offer: proposed pay
  depositPct?: number // counter-offer: proposed deposit
  resolution?: 'accepted' | 'rejected'
  attachments?: Attachment[]
  replyTo?: string // id of the message being replied to
}

export type PayoutKind = 'deposit' | 'milestone' | 'auto' | 'ruling' | 'refund'

export type Payout = {
  id: string
  at: string
  roleId: string
  milestoneId?: string
  to: Handle
  amount: number
  kind: PayoutKind
}

// A cancel needs every signer to agree once money is in the vault.
export type CancelRequest = {
  proposedBy: Handle
  reason: string
  at: string
  approvals: Handle[]
}

export type Profile = {
  handle: Handle
  name: string
  bio: string
  skills: string[]
  portfolio?: string
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
  messages: Message[] // group chat: the official record, and evidence in a dispute
  dms: Record<string, Message[]> // private 1:1 chats, keyed by dmKey(a, b). Never evidence.
  payouts: Payout[]
  cancel?: CancelRequest
  fundedAt?: string
  createdAt: string
  // Live: loaded from an invite link by someone who isn't on the crew yet (no chat, no money).
  guest?: boolean
}

export const dmKey = (a: Handle, b: Handle) => [a, b].sort().join('|')
